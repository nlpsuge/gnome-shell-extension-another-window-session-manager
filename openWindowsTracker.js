'use strict';

const { Shell, Meta, Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;
const FileUtils = Me.imports.utils.fileUtils;
const MetaWindowUtils = Me.imports.utils.metaWindowUtils;

const WindowTilingSupport = Me.imports.windowTilingSupport.WindowTilingSupport;

const EndSessionDialogIface = ByteArray.toString(
    Me.dir.get_child('dbus-interfaces').get_child('org.gnome.SessionManager.EndSessionDialog.xml').load_contents(null)[1]);
const EndSessionDialogProxy = Gio.DBusProxy.makeProxyWrapper(EndSessionDialogIface);

const sessionName = 'currentSession';
const sessionPath = `/tmp/another-window-session-manager/sessions/${sessionName}`;

var OpenWindowsTracker = class {

    constructor() {
        // Only track windows on X11
        if (Meta.is_wayland_compositor()) {
            return;
        }

        // For Guake, too many annoying saving triggered while toggling to hide or show.
        this._blacklist = new Set([
            'Guake',
        ]);

        this._windowInterestingSignalsWhileSave = [
            'notify::above',
            'notify::fullscreen',
            'notify::maximized-horizontally',
            'notify::maximized-vertically',
            'notify::minimized',
            'notify::on-all-workspaces',
            'notify::title',
            'position-changed',
            'size-changed',
            'workspace-changed'
        ];

        this._windowTracker = Shell.WindowTracker.get_default();
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._wm = global.workspace_manager;

        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this._saveSession = new SaveSession.SaveSession();
        this._restoringSession = false;
        this._runningSaveCancelableMap = new Map();

        this._confirmedLogoutId = 0;
        this._confirmedRebootId = 0;
        this._confirmedShutdownId = 0;
        this._closedId = 0;
        this._canceledId = 0;

        this._busWatchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            'org.gnome.Shell',
            Gio.BusNameWatcherFlags.NONE,
            this._onNameAppearedGnomeShell.bind(this),
            this._onNameVanishedGnomeShell.bind(this)
        );

        this._signals = [];
        this._display = global.display;

        const x11DisplayOpenedId = this._display.connect('x11-display-opened', () => {
            this._restoringSession = true;
            // `installed-changed` emits after `shell_app_system_init()` is called 
            // and all `window-created` of existing window emits.
            const installedChanged = this._defaultAppSystem.connect('installed-changed', () => {
                this._restoringSession = false;
            });
            this._signals.push([installedChanged, this._defaultAppSystem]);
        });

        const windowCreatedId = this._display.connect('window-created', (display, window, userData) => {
            this._onWindowCreatedSaveOrUpdateWindowsMapping(display, window, userData);

            this._restoreOrSaveWindowSession(window);
        });

        const runningApps = this._defaultAppSystem.get_running();
        if (runningApps.length) {
            for (const app of runningApps) {
                const windows = app.get_windows();
                for (const window of windows) {
                    this._connectWindowSignalsToSaveSession(window);
                }
            }
        }

        const windowTiledId = WindowTilingSupport.connect('window-tiled', (signals, w1, w2) => {
            // w2 will be saved in another 'window-tiled'
            this._saveSessionToTmpAsync(w1);
        });
        this._signals.push([windowTiledId, WindowTilingSupport]);
        
        const windowUntiledId = WindowTilingSupport.connect('window-untiled', (signals, w1, w2) => {
            this._saveSessionToTmpAsync(w1);
            this._saveSessionToTmpAsync(w2);
        });
        this._signals.push([windowUntiledId, WindowTilingSupport]);
        this._signals.push([windowCreatedId, this._display]);
        this._signals.push([x11DisplayOpenedId, this._display]);

    }

    async _restoreOrSaveWindowSession(window) {
        try {
            if (!window.get_workspace()) return;

            if (this._restoringSession) {
                const sessionFilePath = `${sessionPath}/${window.get_wm_class()}/${MetaWindowUtils.getStableWindowId(window)}.json`;
                // Apps in the `this._blacklist` does not save a session
                if (!GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) return;

                const sessionPathFile = Gio.File.new_for_path(sessionFilePath);
                let [success, contents] = sessionPathFile.load_contents(null);
                if (!success) {
                    return;
                }
        
                let sessionConfig = FileUtils.getJsonObj(contents);
                this._restoreWindowState(sessionConfig);
            }
            
            this._saveSessionToTmpAsync(window);
            this._connectWindowSignalsToSaveSession(window);
        } catch (e) {
            this._log.error(e);
        }
    }

    _connectWindowSignalsToSaveSession(window) {
        this._windowInterestingSignalsWhileSave.forEach(signal => {
            const windowSignalId = window.connect(signal, () => {
                const workspace = window.get_workspace();
                // workspace is nullish during gnome shell restarts
                if (!workspace) return;

                this._saveSessionToTmpAsync(window);
            });
            this._signals.push([windowSignalId, window]);
        })
    }

    _restoreWindowState(sessionContent) {
        this._log.debug(`Restoring window session according to ${sessionContent}`);
        const app = this._windowTracker.get_app_from_pid(sessionContent.pid);
        if (app && app.get_name() == sessionContent.app_name) {
            const restoringShellAppData = RestoreSession.restoringApps.get(app);
            if (restoringShellAppData) {
                restoringShellAppData.saved_window_sessions.push(sessionContent);
            } else {
                RestoreSession.restoringApps.set(app, {
                    saved_window_sessions: [sessionContent]
                });
            }
        }
    }

    async _saveSessionToTmpAsync(window) {
        try {
            if (!window) return;
            if (this._blacklist.has(window.get_wm_class())) return;

            // Cancel running save operation
            this._cancelRunningSave(window);
        
            const cancellable = new Gio.Cancellable();
            this._runningSaveCancelableMap.set(window, cancellable);

            await this._saveSession.saveWindowSessionAsync(
                window,
                `${MetaWindowUtils.getStableWindowId(window)}.json`,
                `${sessionPath}/${window.get_wm_class()}`,
                cancellable
            );
        } catch (error) {
            this._log.error(error);
        }
    }

    _onNameAppearedGnomeShell() {
        this._endSessionProxy = new EndSessionDialogProxy(Gio.DBus.session,
            'org.gnome.Shell',
            '/org/gnome/SessionManager/EndSessionDialog',
            (proxy, error) => {
                // If `error` is not `null` it will be an Error object indicating the
                // failure, and `proxy` will be `null` in this case.
                if (error !== null) {
                    this._log.error(new Error(error), 'Failed to create the EndSessionDialog dbus proxy!');
                    return;
                }

                this._confirmedLogoutId = this._endSessionProxy.connectSignal('ConfirmedLogout', this._onConfirmedLogout.bind(this));
                this._confirmedRebootId = this._endSessionProxy.connectSignal('ConfirmedReboot', this._onConfirmedReboot.bind(this));
                this._confirmedShutdownId = this._endSessionProxy.connectSignal('ConfirmedShutdown', this._onConfirmedShutdown.bind(this));
                this._closedId = this._endSessionProxy.connectSignal('Closed', this._onClose.bind(this));
                this._canceledId = this._endSessionProxy.connectSignal('Canceled', this._onCancel.bind(this));
            },
            null,
            Gio.DBusProxyFlags.NONE
        );
    }

    _onNameVanishedGnomeShell(connection, name) {
        this._log.debug(`Dbus name ${name} vanished`);
    }

    _onClose() {
        this._log.debug(`User closed endSessionDialog`);
    }

    _onCancel() {
        this._log.debug(`User cancel endSessionDialog`);
    }

    _onConfirmedLogout(proxy, sender) {
        this._log.debug(`Resetting windows-mapping before logout.`);
        this._settings.set_string('windows-mapping', '{}');
    }

    _onConfirmedReboot(proxy, sender) {
        this._log.debug(`Resetting windows-mapping before reboot.`);
        this._settings.set_string('windows-mapping', '{}');
    }

    _onConfirmedShutdown(proxy, sender) {
        this._log.debug(`Resetting windows-mapping before shutdown.`);
        this._settings.set_string('windows-mapping', '{}');
    }

    _onWindowCreatedSaveOrUpdateWindowsMapping(display, metaWindow, userData) {
        const shellApp = this._windowTracker.get_window_app(metaWindow);
        if (!shellApp) {
            return;
        }

        let key;
        const app_info = shellApp.get_app_info();
        if (app_info) {
            // .desktop file full path
            key = app_info.get_filename();
        } else {
            // window backed app
            key = shellApp.get_name();
        }

        const xid = metaWindow.get_description();
        const windowStableSequence = metaWindow.get_stable_sequence();
        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        let savedWindowsMapping;
        if (savedWindowsMappingJsonStr === '{}') {
            savedWindowsMapping = new Map();
        } else {
            savedWindowsMapping = new Map(JSON.parse(savedWindowsMappingJsonStr));
        }
        let xidObj = savedWindowsMapping.get(key);
        if (xidObj) {
            const windows = shellApp.get_windows();
            const removedXids = Object.keys(xidObj).filter(xid =>
                !windows.find(w => w.get_description() === xid));
            removedXids.forEach(xid => {
                delete xidObj[xid];
            });

            if (!xidObj[xid]) {
                xidObj[xid] = {
                    windowTitle: metaWindow.get_title(),
                    xid: xid,
                    windowStableSequence: windowStableSequence
                };
            }
        } else {
            if (!xidObj) {
                xidObj = {};
            }
            xidObj[xid] = {
                windowTitle: metaWindow.get_title(),
                xid: xid,
                windowStableSequence: windowStableSequence
            };
            savedWindowsMapping.set(key, xidObj);
        }

        const newSavedWindowsMappingJsonStr = JSON.stringify(Array.from(savedWindowsMapping.entries()));
        this._settings.set_string('windows-mapping', newSavedWindowsMappingJsonStr);
        Gio.Settings.sync();

    }

    _cancelRunningSave(window) {
        const cancellable = this._runningSaveCancelableMap.get(window);
        if (cancellable && !cancellable.is_cancelled()) {
            cancellable.cancel();
        }
    }

    _cancelAllRunningSave() {
        for (const cancellable of this._runningSaveCancelableMap.values()) {
            if (!cancellable.is_cancelled())
                cancellable.cancel();
        }
        this._runningSaveCancelableMap.clear();
    }    

    destroy() {
        this._cancelAllRunningSave();

        if (this._signals && this._signals.length) {
            this._signals.forEach(([id, obj]) => {
                if (id && obj) {
                    obj.disconnect(id);
                }
            });
            this._signals = null;
        }

        if (this._busWatchId) {
            Gio.bus_unwatch_name(this._busWatchId);
            this._busWatchId = 0;
        }

        if (this._confirmedLogoutId) {
            this._endSessionProxy?.disconnectSignal(this._confirmedLogoutId);
            this._confirmedLogoutId = 0;
        }
        if (this._confirmedRebootId) {
            this._endSessionProxy?.disconnectSignal(this._confirmedRebootId);
            this._confirmedRebootId = 0;
        }
        if (this._confirmedShutdownId) {
            this._endSessionProxy?.disconnectSignal(this._confirmedShutdownId);
            this._confirmedShutdownId = 0;
        }
        if (this._closedId) {
            this._endSessionProxy?.disconnectSignal(this._closedId);
            this._closedId = 0;
        }
        if (this._canceledId) {
            this._endSessionProxy?.disconnectSignal(this._canceledId);
            this._canceledId = 0;
        }
    }

}

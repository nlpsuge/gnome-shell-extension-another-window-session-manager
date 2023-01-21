'use strict';

const { Shell, Meta, Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const LoginManager = imports.misc.loginManager;

const EndSessionDialog = imports.ui.endSessionDialog;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const CloseSession = Me.imports.closeSession;
const RestoreSession = Me.imports.restoreSession;

const Autoclose = Me.imports.ui.autoclose;
const UiHelper = Me.imports.ui.uiHelper;

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;
const FileUtils = Me.imports.utils.fileUtils;
const MetaWindowUtils = Me.imports.utils.metaWindowUtils;

const WindowTilingSupport = Me.imports.windowTilingSupport.WindowTilingSupport;

const EndSessionDialogIface = ByteArray.toString(
    Me.dir.get_child('dbus-interfaces').get_child('org.gnome.SessionManager.EndSessionDialog.xml').load_contents(null)[1]);
const EndSessionDialogProxy = Gio.DBusProxy.makeProxyWrapper(EndSessionDialogIface);


var OpenWindowsTracker = class {

    constructor() {

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
            'notify::wm-class',
            'position-changed',
            'size-changed',
            'workspace-changed',
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
        this._windowsAboutToSaveSet = new Set();
        this._saveWindowSessionPeriodically();

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

        this._saveAllWindows();
        this._settings.connect('changed::stash-and-restore-states', this._saveAllWindows.bind(this));

        const windowTiledId = WindowTilingSupport.connect('window-tiled', (signals, w1, w2) => {
            // w2 will be saved in another 'window-tiled'
            this._prepareToSaveWindowSession(w1);
        });
        this._signals.push([windowTiledId, WindowTilingSupport]);

        const windowUntiledId = WindowTilingSupport.connect('window-untiled', (signals, w1, w2) => {
            this._prepareToSaveWindowSession(w1);
            this._prepareToSaveWindowSession(w2);
        });
        this._signals.push([windowUntiledId, WindowTilingSupport]);
        this._signals.push([windowCreatedId, this._display]);
        this._signals.push([x11DisplayOpenedId, this._display]);

    }

    _saveAllWindows() {
        const runningApps = this._defaultAppSystem.get_running();
        // runningApps.length is 0 when display opening
        // runningApps.length is greater than 0 when this extension enabled
        if (runningApps.length) {
            for (const app of runningApps) {
                const windows = app.get_windows();
                for (const window of windows) {
                    this._prepareToSaveWindowSession(window);
                    this._connectWindowSignalsToSaveSession(window);
                }
            }
        }
    }

    async _restoreOrSaveWindowSession(window) {
        try {
            this._restoreWindowState(window);

            this._prepareToSaveWindowSession(window);
            this._connectWindowSignalsToSaveSession(window);
        } catch (e) {
            this._log.error(e);
        }
    }

    _connectWindowSignalsToSaveSession(window) {
        this._windowInterestingSignalsWhileSave.forEach(signal => {
            const windowSignalId = window.connect(signal, () => {
                this._prepareToSaveWindowSession(window);
            });
            this._signals.push([windowSignalId, window]);
        })
    }

    _restoreWindowState(window) {
        if (!this._settings.get_boolean('stash-and-restore-states')) return;

        if (!this._restoringSession) return;

        const sessionFilePath = `${FileUtils.current_session_path}/${window.get_wm_class()}/${MetaWindowUtils.getStableWindowId(window)}.json`;
        // Apps in the `this._blacklist` does not save a session
        if (!GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) {
            if (!this._blacklist.has(window.get_wm_class()))
                this._log.warn(`${sessionFilePath} not found while restoring!`);
            return;
        }

        const sessionPathFile = Gio.File.new_for_path(sessionFilePath);
        let [success, contents] = sessionPathFile.load_contents(null);
        if (!success) {
            return;
        }

        const sessionContent = FileUtils.getJsonObj(contents);
        const app = this._windowTracker.get_app_from_pid(sessionContent.pid);

        this._log.debug(`Restoring window session from ${sessionFilePath}`);

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

    async _prepareToSaveWindowSession(window) {
        try {
            if (!this._settings.get_boolean('stash-and-restore-states') 
                && !this._settings.get_boolean('enable-restore-previous-session')) 
                return;

            if (!window) return;
            const workspace = window.get_workspace();
            // workspace is nullish during gnome shell restarts
            if (!workspace) return;
            if (this._blacklist.has(window.get_wm_class())) return;

            // this._log.debug(`Adding window ${window.get_title()} to queue (current size: ${this._windowsAboutToSaveSet.size}) to prepare to save window session`);
            this._windowsAboutToSaveSet.add(window);
        } catch (error) {
            this._log.error(error);
        }
    }

    _saveWindowSessionPeriodically() {
        // TODO Add an option: save session config delay
        this._saveSessionByBatchTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (this._windowsAboutToSaveSet.size) {
                const windows = [...this._windowsAboutToSaveSet];

                windows.forEach(window => {
                    this._windowsAboutToSaveSet.delete(window);

                    // Cancel running save operation
                    // this._cancelRunningSave(window);

                    // const cancellable = new Gio.Cancellable();
                    // this._runningSaveCancelableMap.set(window, cancellable);
                });
                
                this._saveSession.saveWindowsSessionAsync(
                    windows,
                    null
                ).then(sessionSaved => {
                    try {
                        if (sessionSaved) {
                            for (const [success, metaWindow, baseDir, sessionName] of sessionSaved) {
                                if (success) {
                                    this._connectSignalsToCleanUpSessionFile(metaWindow, baseDir, sessionName);
                                }
                            }
                        }
                    } catch (e) {
                        this._log.error(e);
                    }
                });
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _connectSignalsToCleanUpSessionFile(window, sessionDirectory, sessionName) {
        try {
            // Clean up while window is closing

            let unmanagingId = window.connect('unmanaging', () => {
                window.disconnect(unmanagingId);
                unmanagingId = 0;
                this._cleanUpSessionFileByWindow(window, sessionDirectory, sessionName);
            });
            this._signals.push([unmanagingId, window]);

            // Clean up while the app state becomes STOPPED, just in case the session file cannot be cleanup while the last window is closed.

            const app = this._windowTracker.get_window_app(window);
            if (app) {
                const appName = app.get_name();
                let appId = app.connect('notify::state', app => {
                    if (app.state === Shell.AppState.STOPPED) {
                        app.disconnect(appId);
                        appId = 0;
                        this._cleanUpSessionFileByApp(app, appName, window, sessionDirectory);
                    }
                });
                this._signals.push([appId, app]);
            }
        } catch (e) {
            this._log.error(e);
        }
    }

    _cleanUpSessionFileByWindow(window, sessionDirectory, sessionName) {
        if (!window || Autoclose.closeSessionByUser) return;

        const sessionFilePath = `${sessionDirectory}/${sessionName}`;
        if (!GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) return;

        const app = this._windowTracker.get_window_app(window);

        this._log.debug(`${window.get_title()}(${app?.get_name()}) was closed. Cleaning up its saved session files.`);

        FileUtils.removeFile(sessionFilePath);
        this._removeOrphanSessionConfigs(app, sessionDirectory);
    }

    _removeOrphanSessionConfigs(app, sessionDirectory) {
        try {
            if (!app) return;
            if (!GLib.file_test(sessionDirectory, GLib.FileTest.EXISTS)) return;

            this._log.debug(`Checking if ${app.get_name()} has orphan session configs`);

            const sessionNames = new Set();
            const windows = app.get_windows();
            for (const metaWindow of windows) {
                if (UiHelper.ignoreWindows(metaWindow)) continue;
                sessionNames.add(`${MetaWindowUtils.getStableWindowId(metaWindow)}.json`);
            }

            FileUtils.listAllSessions(sessionDirectory, false, (file, info) => {
                const filename = info.get_name();
                const path = file.get_path();
                if (!sessionNames.has(filename) && path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
                    FileUtils.removeFile(path);
                }
            });
        } catch (e) {
            this._log.error(e);
        }
    }

    _cleanUpSessionFileByApp(app, appName, window, sessionDirectory) {
        if (!app || Autoclose.closeSessionByUser) return;

        if (!GLib.file_test(sessionDirectory, GLib.FileTest.EXISTS)) return;

        // If this app is window-backed, app.get_name() will cause gnome-shell to bail out, so we get 
        // the app name outside this function. (See: shell-app.c -> shell_app_get_name -> window_backed_app_get_window: g_assert (app->running_state->windows))
        this._log.debug(`${appName} was closed. Cleaning up its saved session files.`);

        FileUtils.removeFile(sessionDirectory, true);

        const possibleOrphanFolder = `${FileUtils.current_session_path}/${window.get_wm_class_instance()}`;
        if (GLib.file_test(possibleOrphanFolder, GLib.FileTest.EXISTS)) {
            this._log.debug(`Removing orphan session folder ${possibleOrphanFolder}`)
            FileUtils.removeFile(possibleOrphanFolder, true);
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
        try {
            this._log.debug(`Resetting windows-mapping before logout.`);
            this._settings.set_string('windows-mapping', '{}');
        } catch (error) {
            this._log.error(error);
        }
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
        if (!this._runningSaveCancelableMap) {
            return;
        }

        const cancellable = this._runningSaveCancelableMap.get(window);
        if (cancellable && !cancellable.is_cancelled()) {
            cancellable.cancel();
        }

    }

    _cancelAllRunningSave() {
        if (!this._runningSaveCancelableMap) {
            return;
        }

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
        if (this._saveSessionByBatchTimeoutId) {
            GLib.Source.remove(this._saveSessionByBatchTimeoutId);
            this._saveSessionByBatchTimeoutId = 0;
        }
    }

}

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
        this._savingSession = false;
        this._sizeOrPositionChanged = false;
        this._restoringSession = false;
        this._currentFocusedWindow = null;

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

        this._windowsUserTimeNotifyIdMap = new Map();
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

            // const installedChanged = this._defaultAppSystem.connect('installed-changed', () => {
                // const runningApps = this._defaultAppSystem.get_running();
                // if (runningApps.length) {
                //     log('apps size ' + runningApps.length)

                //     for (const app of runningApps) {
                //         const windows = app.get_windows();
                //         for (const window of windows) {
                //             this._connectSignalsToSaveSession(window);
                //         }

                //     }
                // }
            // });
            // this._signals.push([installedChanged, this._defaultAppSystem]);

            // this._onX11DisplayOpened();
        });

        const windowCreatedId = this._display.connect('window-created', (display, window, userData) => {
            this._onWindowCreatedSaveOrUpdateWindowsMapping(display, window, userData);
            
            const app = this._windowTracker.get_window_app(window);
            log('windows created ' + app?.get_name());
            this._restoreOrSaveWindowSession(window);
        });

        const runningApps = this._defaultAppSystem.get_running();
        if (runningApps.length) {
            log('apps size ' + runningApps.length)

            for (const app of runningApps) {
                const windows = app.get_windows();
                for (const window of windows) {
                    this._connectWindowSignalsToSaveSession(window);
                }

            }
        }

        const windowTiledId = WindowTilingSupport.connect('window-tiled', (signals, w1, w2) => {
            log(`window-tiled emits ${w1} ${w2}`);
            // w2 will be saved in another 'window-tiled'
            this._saveSessionToTmpAsync(w1);
        });
        this._signals.push([windowTiledId, WindowTilingSupport]);
        
        const windowUntiledId = WindowTilingSupport.connect('window-untiled', (signals, w1, w2) => {
            log(`window-untiled emits ${w1} ${w2}`);
            this._saveSessionToTmpAsync(w1);
            this._saveSessionToTmpAsync(w2);
        });
        this._signals.push([windowUntiledId, WindowTilingSupport]);

        this._display.connect('notify::focus-window', () => {
            // Update session of the unfocused window
            const unfocusedWindow = this._currentFocusedWindow;
            if (unfocusedWindow) {
                this._saveSessionToTmpAsync(unfocusedWindow);
            }
            this._currentFocusedWindow = this._display.get_focus_window();
            this._saveSessionToTmpAsync(this._currentFocusedWindow);
        });

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

                // if (signal === 'size-changed' || signal === 'position-changed') {
                //     this._sizeOrPositionChanged = true;
                // } 
                // else {
                    log(signal + ' emitted ' + window.get_title());
                    // if (signal === 'position-changed') {
                    //     const windowTileFor = window.get_tile_match() ?? window._tile_match_awsm;
                    //     if (windowTileFor) {
                    //         windowTileFor._aboveToUntile = true;
                    //         this._saveSessionToTmpAsync(windowTileFor);
                    //     }
                    // }
                    this._saveSessionToTmpAsync(window);
                // }
            });
            // this._windowsUserTimeNotifyIdMap.set(w, userTimeNotifyId);
            this._signals.push([windowSignalId, window]);
        })
        
        // const grabOpEndId = this._display.connect('grab-op-end', (display, grabbedWindow, grabOp) => {
            // if (this._sizeOrPositionChanged) {
            //     this._saveSessionToTmpAsync(grabbedWindow);
            //     this._sizeOrPositionChanged = false;
            // }
            
        // });
        // this._signals.push([grabOpEndId, this._display]);
    }

    async _onX11DisplayOpened() {
        try {
            this._log.debug('x11 display opened');
            let sessionContents = [];
            await FileUtils.listAllSessions(sessionPath,
                true, this._prefsUtils.isDebug(),
                (file, info) => {
                    const file_type = info.get_file_type();
                    if (file_type !== Gio.FileType.REGULAR) {
                        this._log.debug(`${file.get_path()} (file type is ${file_type}) is not a regular file, skipping`);
                        return;
                    }
                    const content_type = info.get_content_type();
                    if (content_type !== 'application/json') {
                        this._log.debug(`${file.get_path()} (content type is ${content_type}) is not a json file, skipping`);
                        return;
                    }
    
                    let [success, contents] = file.load_contents(null);
                    if (!success) {
                        return;
                    }
    
                    let session_config = FileUtils.getJsonObj(contents);
                    sessionContents.push(session_config);
                }).catch(e => this._log.error(e));
    
            if (!sessionContents.length) {
                this._log.warn(`Window sessions does not exist: ${sessionPath}`);
                return;
            }
    
            // installed-changed emits when `shell_app_system_init()` is called
            const installedChanged = this._defaultAppSystem.connect('installed-changed', () => {
                this._runningAppsLoaded = true;
                // Restore session
                this._restoreWindowsStates(sessionContents);
            });
            this._signals.push([installedChanged, this._defaultAppSystem]);
        } catch (e) {
            this._log.error(e);
        }
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
            // if (this._savingSession) return;

            this._savingSession = true;

            await this._saveSession.saveWindowSessionAsync(
                window,
                `${MetaWindowUtils.getStableWindowId(window)}.json`,
                `${sessionPath}/${window.get_wm_class()}`
            );
        } catch (error) {
            this._log.error(error);
        } finally {
            this._savingSession = false;
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

    destroy() {
        if (this._windowsUserTimeNotifyIdMap && this._windowsUserTimeNotifyIdMap.size) {
            for (const [obj, id] of this._windowsUserTimeNotifyIdMap) {
                if (obj && id)
                    obj.disconnect(id);
            }
            this._windowsUserTimeNotifyIdMap.clear();
            this._windowsUserTimeNotifyIdMap = null;
        }
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

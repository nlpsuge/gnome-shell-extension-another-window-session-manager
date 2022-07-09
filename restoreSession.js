'use strict';

const { Shell, Gio, GLib } = imports.gi;
const Util = imports.misc.util;

const { ByteArray } = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;

// All launching apps by Shell.App#launch()
var restoringApps = new Map();

var RestoreSession = class {

    constructor() {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();   

        this._restore_session_interval = this._settings.get_int('restore-session-interval');

        // TODO Add to Preferences?
        // Launch apps using discrete graphics card might cause issues, like the white main window of superproductivity
        this._useDiscreteGraphicsCard = false;

        // All launched apps info by Shell.App#launch()
        this._restoredApps = new Map();

        this._display = global.display;

        this._connectIds = [];
    }

    restoreSession(sessionName) {
        if (!sessionName) {
            sessionName = this.sessionName;
        }
        
        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, sessionName]);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            logError(new Error(`Session file not found: ${session_file_path}`));
            return;
        }

        this._log.info(`Restoring saved session from ${session_file_path}`);
        try {
            this.restoreSessionFromFile(session_file_path);
        } catch (e) {
            logError(e, `Failed to restore ${session_file_path}`);
        }
    }

    restoreSessionFromFile(session_file_path) {
        const session_file = Gio.File.new_for_path(session_file_path);
        let [success, contents] = session_file.load_contents(null);
        if (!success) {
            return;
        }

        let session_config = FileUtils.getJsonObj(contents);
        let session_config_objects = session_config.x_session_config_objects;
        if (!session_config_objects) {
            logError(new Error(`Session details not found: ${session_file_path}`));
            return;
        }

        session_config_objects = session_config_objects.filter(session_config_object => {
            const desktop_file_id = session_config_object.desktop_file_id;
            if (!desktop_file_id) {
                return true;
            }
            const shellApp = this._defaultAppSystem.lookup_app(desktop_file_id)
            if (!shellApp) {
                return true;
            }

            if (this._appIsRunning(shellApp)) {
                this._log.debug(`${shellApp.get_name()} is already running`)
                return false;
            }

            return true;
        });
        if (session_config_objects.length === 0) return;

        this._restoreSessionOne(session_config_objects.shift());
        if (session_config_objects.length === 0) return;

        this._restoreSessionTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 
            // In milliseconds. 
            // Note that this timing might not be precise, see https://gjs-docs.gnome.org/glib20~2.66.1/glib.timeout_add
            this._restore_session_interval,
            () => {
                if (session_config_objects.length === 0) {
                    return GLib.SOURCE_REMOVE;
                }
                this._restoreSessionOne(session_config_objects.shift());
                return GLib.SOURCE_CONTINUE;
            }
        );  
    }

    _restoreSessionOne(session_config_object) {
        const app_name = session_config_object.app_name;
        let launched = false;
        let running = false;
        try {
            const desktop_file_id = session_config_object.desktop_file_id;
            if (desktop_file_id) {
                const shell_app = this._defaultAppSystem.lookup_app(desktop_file_id)
                if (shell_app) {
                    const restoringShellAppData = restoringApps.get(shell_app);
                    if (restoringShellAppData) {
                        restoringShellAppData.saved_window_sessions.push(session_config_object);
                    } else {
                        restoringApps.set(shell_app, {
                            saved_window_sessions: [session_config_object]
                        });
                    }
                    
                    [launched, running] = this.launch(shell_app);
                    if (launched) {
                        if (!running) {
                            this._log.info(`${app_name} launched!`);
                        }
                        const existingShellAppData = this._restoredApps.get(shell_app);
                        if (existingShellAppData) {
                            existingShellAppData.saved_window_sessions.push(session_config_object);
                        } else {
                            this._restoredApps.set(shell_app, {
                                saved_window_sessions: [session_config_object]
                            });
                        }
                    } else {
                        logError(new Error(`Failed to restore ${app_name}`, `Cannot find ${desktop_file_id}.`));
                        global.notify_error(`Failed to restore ${app_name}`, `Reason: Cannot find ${desktop_file_id}.`);
                    }
                } else {
                    logError(new Error(`Failed to restore ${app_name}. Reason: don't find Shell.App by ${desktop_file_id}, App is not installed or something is wrong in ${desktop_file_id}?`));
                    global.notify_error(`Failed to restore ${app_name}`, `Reason: don't find Shell.App by ${desktop_file_id}. App is not installed or something is wrong in ${desktop_file_id}?`);
                }
            } else {
                // TODO check running state to skip running apps

                const cmd = session_config_object.cmd;
                if (cmd && cmd.length !== 0) {
                    const cmdString = cmd.join(' ');
                    Util.trySpawnCommandLine(cmdString);
                    launched = true;
                    // Important log. Indicate that this app may has no .desktop file, need to be handled specially.
                    this._log.info(`${app_name} launched via command line ${cmdString}!`);
                } else {
                    // TODO try to launch via app_info by searching the app name?
                    let errorMsg = `Empty command line for ${app_name}`;
                    logError(new Error(errorMsg), `Invalid command line: ${cmd}`);
                    global.notify_error(errorMsg, `Invalid command line: ${cmd}`);
                }
            }

        } catch (e) {
            logError(e, `Failed to restore ${app_name}`);
            if (!launched) {
                global.notify_error(`Failed to restore ${app_name}`, e.message);
            }
        }
    }

    launch(shellApp) {
        if (this._restoredApps.has(shellApp)) {
            return [true, true];
        }

        if (this._appIsRunning(shellApp)) {
            this._log.debug(`${shellApp.get_name()} is running, skipping`)
            // Delete shellApp from restoringApps to prevent it move the same app when close and open it manually.
            restoringApps.delete(shellApp);
            return [true, true];
        }

        // -1 current workspace?
        let workspace = -1;
        const launched = shellApp.launch(
            // 0 for current event timestamp
            0, 
            workspace,
            this._getProperGpuPref(shellApp));
        return [launched, false];
    }

    _appIsRunning(app) {
        // Running apps can be empty even if there are apps running when gnome-shell starting
        const running_apps = this._defaultAppSystem.get_running();
        for (const running_app of running_apps) {
            if (running_app.get_id() === app.get_id() && 
                running_app.get_state() >= Shell.AppState.STARTING) {
                return true;
            }    
        }
        return false;
    }

    _getProperGpuPref(shell_app) {
        if (this._useDiscreteGraphicsCard) {
            const app_info = shell_app.get_app_info();
            if (app_info) {
                return app_info.get_boolean('PrefersNonDefaultGPU')
                    ? Shell.AppLaunchGpu.DEFAULT
                    : Shell.AppLaunchGpu.DISCRETE;
            }
        }
        return Shell.AppLaunchGpu.DEFAULT;
    }

    destroy() {
        if (restoringApps) {
            restoringApps.clear();
            restoringApps = null;
        }

        if (this._restoredApps) {
            this._restoredApps.clear();
            this._restoredApps = null;
        }

        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }

        if (this._windowTracker) {
            this._windowTracker = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }

        if (this._connectIds) {
            for (let [obj, id] of this._connectIds) {
                obj.disconnect(id);
            }
            this._connectIds = null;
        }

        if (this._restoreSessionTimeoutId) {
            this._restoreSessionTimeoutId = null;
        }
        
    }

}

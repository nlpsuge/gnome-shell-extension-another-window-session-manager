'use strict';

const { Shell, Gio, GLib, Meta } = imports.gi;
const Util = imports.misc.util;

const { ByteArray } = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const MoveSession = Me.imports.moveSession;

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;


var RestoreSession = class {

    constructor() {
        this._log = new Log.Log();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._restoredApps = new Map();
        this._moveSession = new MoveSession.MoveSession();
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

        this._log.debug(`Restoring saved session from ${session_file_path}`);
        try {
            this.restoreSessionFromPath(session_file_path);
        } catch (e) {
            logError(e, `Failed to restore ${session_file_path}`);
        }
    }

    restoreSessionFromPath(session_file_path) {
        const session_file = Gio.File.new_for_path(session_file_path);
        let [success, contents] = session_file.load_contents(null);
        if (success) {
            let session_config = FileUtils.getJsonObj(contents);
            
            const session_config_objects = session_config.x_session_config_objects;
            if (!session_config_objects) {
                logError(new Error(`Session details not found: ${session_file_path}`));
                return;
            }

            for (const session_config_object of session_config_objects) {
                const app_name = session_config_object.app_name;
                let launched = false;
                let running = false;
                try {
                    const desktop_file_id = session_config_object.desktop_file_id;
                    if (desktop_file_id) {
                        const shell_app = this._defaultAppSystem.lookup_app(desktop_file_id)
                        if (shell_app) {
                            [launched, running] = this.launch(shell_app, session_config_object.desktop_number);
                            if (launched) {
                                if (!running) {
                                    this._log.debug(`${app_name} launched!`);
                                }
                                const existingShellAppData = this._restoredApps.get(shell_app);
                                if (existingShellAppData) {
                                    existingShellAppData.saved_window_sessions.push(session_config_object);
                                } else {
                                    // TODO Better to listen Meta.Workspace::window-added(Meta.Window), so we can also know a window added by running the command line in the case of there is no desktop_file_id at all?
                                    const windows_change_id = shell_app.connect('windows-changed', this._autoMoveWindows.bind(this));
                                    this._restoredApps.set(shell_app, {
                                        windows_change_id: windows_change_id,
                                        saved_window_sessions: [session_config_object]
                                    });
                                }
                            } else {
                                logError(new Error(`Failed to restore ${app_name}`, `Cannot find ${desktop_file_id}.`));
                                global.notify_error(`Failed to restore ${app_name}`, `Reason: Cannot find ${desktop_file_id}.`);
                            }
                        } else {
                            logError(new Error(`Failed to restore ${app_name}. Reason: unknown.`));
                            global.notify_error(`Failed to restore ${app_name}`, 'Reason: unknown.');
                        }
                    } else {
                        // TODO check running state to skip running apps
    
                        const cmd = session_config_object.cmd;
                        if (cmd) {
                            const cmdString = cmd.join(' ');
                            Util.trySpawnCommandLine(cmdString);
                            launched = true;
                            // Important log. Indicate that this app may has no .desktop file, need to be handled specially.
                            log(`${app_name} launched via ${cmdString}!`);
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
        }

       
    }

    launch(shellApp, desktopNumber) {
        if (this._restoredApps.has(shellApp)) {
            return [true, true];
        }

        if (this._appIsRunning(shellApp)) {
            this._log.debug(`${shellApp.get_name()} is running, skipping`)
            return [true, true];
        }

        // There is a situation that on Wayland a window in the current workspace can't resize and move reliably, most time it failed.
        // I really don't know how to handle above situation, so I launch an app always in a different workspace. When its workspace is changed 
        // to desktopNumber in MoveSession, it should trigger some signals.
        let workspace = -1;
        if (Meta.is_wayland_compositor()) {
            let workspaceManager = global.workspace_manager;
            let activeWorkspaceNum = workspaceManager.get_active_workspace_index();
            if (activeWorkspaceNum === desktopNumber) {
                if (activeWorkspaceNum === 0) {
                    workspace = desktopNumber + 1;
                } else {
                    workspace = desktopNumber - 1;
                }
            } else {
                workspace = 0;
            }
        }
        const launched = shellApp.launch(
            // 0 for current event timestamp
            0, 
            workspace,
            this._getProperGpuPref(shellApp));
        return [launched, false];
    }

    _autoMoveWindows(shellApp) {
        // Debug
        // log(`windows-changed triggered for ${shellApp.get_name()}`);
        const shellAppData = this._restoredApps.get(shellApp);
        let saved_window_sessions = shellAppData.saved_window_sessions
        this._moveSession.moveWindowsByShellApp(shellApp, saved_window_sessions, true);
    }

    _appIsRunning(app) {
        // Running apps can be empty even if there are apps running when gnome-shell starting
        const running_apps = this._defaultAppSystem.get_running();
        for (const running_app of running_apps) {
            if (running_app.get_id() === app.get_id() && 
                    running_app.get_state() === Shell.AppState.RUNNING) {
                return true;
            }    
        }
        return false;
    }

    _getProperGpuPref(shell_app) {
        let gpuPref;
        const app_info = shell_app.get_app_info();
        if (app_info) {
            const appPrefersNonDefaultGPU = app_info.get_boolean('PrefersNonDefaultGPU');
            gpuPref = appPrefersNonDefaultGPU
                ? Shell.AppLaunchGpu.DEFAULT
                : Shell.AppLaunchGpu.DISCRETE;
        } else {
            gpuPref = Shell.AppLaunchGpu.DEFAULT;
        }
        return gpuPref;
    }

    destroy() {
        if (this._restoredApps) {
            for (const [app, v] of this._restoredApps) {
                app.disconnect(v.windows_change_id);
            }
            this._restoredApps.clear();
            this._restoredApps = null;
        }

        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }

        if (this._moveSession) {
            this._moveSession = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }
        
    }

}
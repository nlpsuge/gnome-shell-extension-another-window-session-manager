const { Shell, Gio, GLib } = imports.gi;
const Util = imports.misc.util;

const { ByteArray } = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;

var RestoreSession = class {

    constructor() {
        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._restoredApps = new Map();
    }

    restoreSession() {
        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, this.sessionName]);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            logError(`Session file not found: ${session_file_path}`);
            return;
        }

        log(`Restoring saved session located ${session_file_path}`);

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
            let session_config = this._getSessionConfigJsonObj(contents);
            
            const session_config_objects = session_config.x_session_config_objects;
            if (!session_config_objects) {
                log(`Session details not found: ${session_file_path}`);
                return;
            }

            // running_apps can be empty even if there are apps running when gnome-shell starting
            let running_apps = this._defaultAppSystem.get_running();
            let count = 0;
            for (const session_config_object of session_config_objects) {
                count ++;
                const app_name = session_config_object.app_name;
                let launched = false;
                let running = false;
                try {
                    const desktop_file_id = session_config_object.desktop_file_id;
                    if (desktop_file_id) {
                        const shell_app = this._defaultAppSystem.lookup_app(desktop_file_id)
                        if (shell_app) {
                            if (this._restoredApps.has(shell_app)) {
                                launched = true;
                                running = true;
                            }

                            if (!launched) {
                                // get latest running apps every 3 cycles
                                if (count % 3 === 0) {
                                    running_apps = this._defaultAppSystem.get_running();
                                }

                                if (this._appIsRunning(shell_app, running_apps)) {
                                    log(`${app_name} is running, skipping`)
                                    launched = true;
                                    running = true;
                                }
                            }

                            if (!launched) {
                                launched = shell_app.launch(
                                    // 0 for current event timestamp
                                    0, 
                                    -1,
                                    this._getProperGpuPref(shell_app));
                            }

                            if (launched) {
                                if (!running) {
                                    log(`${app_name} launched!`);
                                }
                                const existingShellAppData = this._restoredApps.get(shell_app);
                                if (existingShellAppData) {
                                    existingShellAppData.saved_window_sessions.push(session_config_object);
                                } else {
                                    const windows_change_id = shell_app.connect('windows-changed', this._autoMoveWindows.bind(this));
                                    this._restoredApps.set(shell_app, {
                                        windows_change_id: windows_change_id,
                                        saved_window_sessions: [session_config_object]
                                    });
                                }
                            } else {
                                logError(`Failed to restore ${app_name}. Reason: cannot find ${desktop_file_id}.`);
                                global.notify_error(`Failed to restore ${app_name}`, `Reason: cannot find ${desktop_file_id}.`);
                            }
                        } else {
                            logError(`Failed to restore ${app_name}. Reason: unknown.`);
                            global.notify_error(`Failed to restore ${app_name}`, 'Reason: unknown.');
                        }
                    } else {
    
                        const cmd = session_config_object.cmd;
                        if (cmd) {
                            Util.trySpawnCommandLine(cmd);
                            launched = true;
                            log(`${app_name} launched via ${cmd}!`);
                        } else {
                            // TODO try to launch via app_info be search the app name?
                            let errorMsg = `Empty command line for ${app_name}`;
                            logError(errorMsg);
                            global.notify_error(errorMsg, 'Empty command line');
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

    _autoMoveWindows(shellApp) {
        // Debug
        // log(`windows-changed triggered for ${shellApp.get_name()}`);
        const interestingWindows = this._getAutoMoveInterestingWindows(shellApp);

        if (!interestingWindows.length) {
            // Debug
            // log(`No interesting windows for ${shellApp.get_name()}`);
            return;
        }

        for (const interestingWindow of interestingWindows) {
            const open_window = interestingWindow.open_window;
            const saved_window_session = interestingWindow.saved_window_session;
            const title = open_window.get_title();
            const desktop_number = saved_window_session.desktop_number;

            log(`Auto move the window '${title}' to workspace ${desktop_number} for ${shellApp.get_name()}`);
            this._createEnoughWorkspace(desktop_number);
            open_window.change_workspace_by_index(desktop_number, false);
            
            // window state
            const window_state = saved_window_session.window_state;
            if (window_state.is_above) {
                open_window.make_above();
            }
            if (window_state.is_sticky) {
                open_window.stick();
            }
            // TODO window geometry
            const window_position = saved_window_session.window_position;
            const x = window_position.x_offset;
            const y = window_position.y_offset;
            const width = window_position.width;
            const height = window_position.height;
            if (window_position.provider == 'Meta') {
                open_window.move_resize_frame(true, x, y, width, height);
            }

            saved_window_session.moved = true;
        }
    }

    _getAutoMoveInterestingWindows(shellApp) {
        const shellAppData = this._restoredApps.get(shellApp);
        let saved_window_sessions = shellAppData.saved_window_sessions
        saved_window_sessions = saved_window_sessions.filter(saved_window_session => {
            return !saved_window_session.moved;
        });

        if (!saved_window_sessions.length) {
            return [];
        }

        let autoMoveInterestingWindows = [];
        const open_windows = shellApp.get_windows();
        saved_window_sessions.forEach(saved_window_session => {
            open_windows.forEach(open_window => {
                const title = open_window.get_title();
                const windows_count = saved_window_session.windows_count;
                const open_window_workspace_index = open_window.get_workspace().index();
                const desktop_number = saved_window_session.desktop_number;
                
                if (windows_count === 1 || title === saved_window_session.window_title) {
                    if (open_window_workspace_index === desktop_number) {
                        log(`The window '${title}' is already on workspace ${desktop_number} for ${shellApp.get_name()}`);
                        saved_window_session.moved = true;
                        return;
                    }
                    
                    autoMoveInterestingWindows.push({
                        open_window: open_window,
                        saved_window_session: saved_window_session
                    });    
                }
    
            });

        });

        return autoMoveInterestingWindows;
    }

    _getSessionConfigJsonObj(contents) {
        let session_config;
        // Fix Gnome 3 crash due to: Some code called array.toString() on a Uint8Array instance. Previously this would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, but please fix your code anyway to explicitly call ByteArray.toString(array).
        if (contents instanceof Uint8Array) {
            const contentsConverted = imports.byteArray.toString(contents);
            session_config = JSON.parse(contentsConverted);
        } else {
            // Unreachable code
            session_config = JSON.parse(contents);
        }
        return session_config;
    }

    _createEnoughWorkspace(workspaceNumber) {
        let workspaceManager = global.workspace_manager;
        for (let i = workspaceManager.n_workspaces; i <= workspaceNumber; i++) {
            workspaceManager.append_new_workspace(false, 0);
        }
    }

    _appIsRunning(app, running_apps) {
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
    }

}
const { Shell, Gio, GLib } = imports.gi;
const Util = imports.misc.util;

const { ByteArray } = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;

var RestoreSession = class {

    constructor() {
        this.session_name = 'defaultSession';
        this._defaultAppSystem = Shell.AppSystem.get_default();
    }

    restoreSession() {
        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, this.session_name]);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            logError(`Session file not found: ${session_file_path}`);
            return;
        }

        log(`Restoring saved session located ${session_file_path}`);

        try {
            this.restoreSessionForPath(session_file_path);
        } catch (e) {
            logError(e, `Failed to restore ${session_file_path}`);
        }
    }

    restoreSessionForPath (session_file_path) {
        const session_file = Gio.File.new_for_path(session_file_path);
        let [success, contents] = session_file.load_contents(null);
        if (success) {
            let session_config = this._getSessionConfigJsonObj(contents);
            
            const session_config_objects = session_config.x_session_config_objects;
            if (!session_config_objects) {
                log(`Session details not found: ${session_file_path}`);
                return;
            }

            let running_apps = this._defaultAppSystem.get_running();
            let count = 0;
            for (const session_config_object of session_config_objects) {
                count ++;
                const app_name = session_config_object.app_name;
                let launched = false;
                try {
                    const desktop_file_id = session_config_object.desktop_file_id;
                    if (desktop_file_id) {
                        const shell_app = this._defaultAppSystem.lookup_app(desktop_file_id)
                        if (shell_app) {
                            // get latest running apps every 3 cycles
                            if (count % 3 === 0) {
                                running_apps = this._defaultAppSystem.get_running();
                            }

                            if (this._app_is_running(shell_app, running_apps)) {
                                log(`${app_name} is running, skipping`)
                                launched = true;
                            }

                            if (!launched) {
                                launched = shell_app.launch(
                                    // 0 for current event timestamp
                                    0, 
                                    -1,
                                    this._getProperGpuPref(shell_app));
                                if (launched) {
                                    log(`${app_name} launched!`);
                                }
                            }
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
                            global.notify_error(errorMsg);
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

    _app_is_running(app, running_apps) {
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

    }

}
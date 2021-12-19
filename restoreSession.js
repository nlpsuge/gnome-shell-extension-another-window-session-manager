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
            let session_config;
            // Fix Gnome 3 crash due to: Some code called array.toString() on a Uint8Array instance. Previously this would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, but please fix your code anyway to explicitly call ByteArray.toString(array).
            if (contents instanceof Uint8Array) {
                const contentsConverted = imports.byteArray.toString(contents);
                session_config = JSON.parse(contentsConverted);
            } else {
                // Unreachable code
                session_config = JSON.parse(contents);
            }

            const session_config_objects = session_config.x_session_config_objects;
            for (const session_config_object of session_config_objects) {
                const app_name = session_config_object.app_name;
                let launched = false;
                try {
                    const desktop_file_id = session_config_object.desktop_file_id;
                    if (desktop_file_id) {
                        const shell_app = this._defaultAppSystem.lookup_app(desktop_file_id)
                        if (shell_app) {
                            launched = shell_app.launch(
                                global.get_current_time(), 
                                -1, 
                                this._getProperGpuPref(shell_app));
                        } 
                    } 

                    if (launched) {
                        continue;
                    }

                    const cmd = session_config_object.cmd;
                    if (cmd) {
                        Util.trySpawnCommandLine(cmd);
                        launched = true;
                    } else {
                        // TODO try to launch via app_info be search the app name?
                        let errorMsg = `Empty command line for ${app_name}`;
                        logError(errorMsg);
                        global.notify_error(errorMsg);
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
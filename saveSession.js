'use strict';

const { Shell, Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionConfig = Me.imports.model.sessionConfig;

const UiHelper = Me.imports.ui.uiHelper;

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;

// for make prototype affect
Me.imports.utils.string;


var SaveSession = class {

    constructor() {
        this._log = new Log.Log();

        this._windowTracker = Shell.WindowTracker.get_default();
        this._subprocessLauncher = new Gio.SubprocessLauncher({
            flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE)});
        this._defaultAppSystem = Shell.AppSystem.get_default();
    }

    async saveSession(sessionName) {
        this._log.info(`Generating session ${sessionName}`);

        const runningShellApps = this._defaultAppSystem.get_running();
        const sessionConfig = new SessionConfig.SessionConfig();
        sessionConfig.session_name = sessionName ? sessionName : FileUtils.default_sessionName;
        sessionConfig.session_create_time = new Date().toLocaleString();
        
        const psPromiseMap = new Map();
        this._promisePs(runningShellApps, psPromiseMap);

        for (const runningShellApp of runningShellApps) {
            const appName = runningShellApp.get_name();
            const desktopFileId = runningShellApp.get_id();
            const desktopAppInfo = runningShellApp.get_app_info();
            // const desktopAppInfoCommandline = desktopAppInfo?.get_commandline();
            // Debug
            // log(`Saving application ${appName} :  ${desktopAppInfoCommandline}`);

            const n_windows = runningShellApp.get_n_windows();

            const ignoredWindowsMap = new Map();
            ignoredWindowsMap.set(runningShellApp, []);

            let metaWindows = runningShellApp.get_windows();
            metaWindows = metaWindows.filter(metaWindow => {
                if (this._ignoreWindows(metaWindow)) {
                    ignoredWindowsMap.get(runningShellApp).push(metaWindow);
                    return false;
                }
                return true;
            });
            for (const metaWindow of metaWindows) {

                const pid = metaWindow.get_pid();
                try {
                    const sessionConfigObject = new SessionConfig.SessionConfigObject();

                    const psPromise = psPromiseMap.get(metaWindow.get_pid());
                    const [result, proc] = await psPromise;
                    this._setFieldsFromProcess(proc, result, sessionConfigObject);

                    const windowId = metaWindow.get_id();
                    sessionConfigObject.window_id_the_int_type = windowId;
                    if (metaWindow.is_always_on_all_workspaces()) {
                        sessionConfigObject.desktop_number = -1;
                    } else {
                        // If the window is on all workspaces, returns the currently active workspace.
                        const workspace = metaWindow.get_workspace();
                        sessionConfigObject.desktop_number = workspace.index();
                    }
                    sessionConfigObject.monitor_number = metaWindow.get_monitor();
                    sessionConfigObject.is_on_primary_monitor = metaWindow.is_on_primary_monitor();
                    sessionConfigObject.pid = pid;
                    sessionConfigObject.username = GLib.get_user_name();
                    const frameRect = metaWindow.get_frame_rect();
                    let window_position = sessionConfigObject.window_position;
                    window_position.provider = 'Meta';
                    window_position.x_offset = frameRect.x;
                    window_position.y_offset = frameRect.y;
                    window_position.width = frameRect.width;
                    window_position.height = frameRect.height;
                    sessionConfigObject.client_machine_name = GLib.get_host_name();
                    sessionConfigObject.window_title = metaWindow.get_title();
                    sessionConfigObject.app_name = appName;
                    sessionConfigObject.windows_count = n_windows - ignoredWindowsMap.get(runningShellApp).length;
                    if (desktopAppInfo) {
                        sessionConfigObject.desktop_file_id = desktopFileId;
                        // Save the .desktop full path, so we know which desktop is used by this app.
                        sessionConfigObject.desktop_file_id_full_path = desktopAppInfo.get_filename();
                    } else {
                        // No app info associated with this application, we just set an empty string
                        // Shell.App does have an id like window:22, but it's useless for restoring
                        // If desktop_file_id is '', launch this application via command line
                        sessionConfigObject.desktop_file_id = '';
                        sessionConfigObject.desktop_file_id_full_path = '';

                        // Generating a compatible desktop file for this app so that it can be recognized by `Shell.AppSystem.get_default().get_running()`
                        // And also use it to restore window state and move windows to their workspace etc
                        // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/4921
                        
                        // Note that the generated desktop file doesn't always work:
                        // 1) The commandLine or cmdStr might not be always right, such as 
                        // querying the process of Wire-x.x.x.AppImage to get the cmd 
                        // returns '/tmp/.mount_Wire-3xXxIGA/wire-desktop'.
                        // 2) ...
                        
                        this._log.info(`Generating a compatible desktop file for ${appName}`);
                        let cmdStr = sessionConfigObject.cmd ? sessionConfigObject.cmd.join(' ').trim() : '';
                        if (cmdStr.startsWith('./')) {
                            // Try to get the working directory to complete the command line
                            const proc = this._subprocessLauncher.spawnv(['pwdx', `${pid}`]);
                            // TODO Use async version in the future
                            const result = proc.communicate_utf8(null, null);
                            let [, stdout, stderr] = result;
                            let status = proc.get_exit_status();
                            if (status === 0 && stdout) {
                                cmdStr = `${stdout.split(':')[1].trim()}/${cmdStr}`
                            } else {
                                this._log.error(new Error(`Failed to query the working directory according to ${pid}, and the current command line is ${cmdStr}. stderr: ${stderr}`));
                            }

                        }
                        const iconString = runningShellApp.get_icon().to_string()
                        const argument = {
                            appName: appName,
                            commandLine: cmdStr,
                            icon: iconString ? iconString : '',
                            wmClass: metaWindow.get_wm_class(),
                            wmClassInstance: metaWindow.get_wm_class_instance(),
                        };

                        const desktopFileName = '__' + appName + '.desktop';
                        const desktopFileContent = FileUtils.loadDesktopTemplate().fill(argument);
                        if (!desktopFileContent) {
                            const errMsg = `Failed to generate a .desktop file ${desktopFileName} using ${JSON.stringify(argument)}`;
                            this._log.error(new Error(errMsg));
                        } else {
                            this._log.info(`Generated a .desktop file, you can use the below content to create a .desktop file and copy it to ${FileUtils.desktop_file_store_path_base} :`
                            + '\n\n'
                            + desktopFileContent
                            + '\n');
                        }

                    }
                    
                    let window_state = sessionConfigObject.window_state;
                    // See: ui/windowMenu.js:L80
                    window_state.is_sticky = metaWindow.is_on_all_workspaces();
                    window_state.is_above = metaWindow.is_above();
                    window_state.meta_maximized = metaWindow.get_maximized();

                    sessionConfig.x_session_config_objects.push(sessionConfigObject);    

                } catch (e) {
                    this._log.error(e, `Failed to generate session ${sessionName}`);
                    global.notify_error(`Failed to generate session ${sessionName}`, e.message);
                }
            }
        }

        // Save open windows to local file
        try {
            sessionConfig.x_session_config_objects = sessionConfig.sort();
            this.save2File(sessionConfig);
            // TODO saved Notification
        } catch (e) {
            this._log.error(e, `Failed to write session to disk`);
            global.notify_error(`Failed to write session to disk`, e.message);
            throw e;
        }

    }

    _promisePs(runningShellApps, psPromiseMap) {
        for (const runningShellApp of runningShellApps) {
            let metaWindows = runningShellApp.get_windows();
            for (const metaWindow of metaWindows) {
                const pid = metaWindow.get_pid();
                if (psPromiseMap.has(pid) || this._ignoreWindows(metaWindow)) {
                    continue;
                }

                const psPromise = new Promise((resolve, reject) => {
                    // TODO pid is 0 if not known 
                    // get_sandboxed_app_id() Gets an unique id for a sandboxed app (currently flatpaks and snaps are supported).
                    const psCmd = ['ps', '--no-headers', '-p', `${pid}`, '-o', 'lstart,%cpu,%mem,command'];
                    const proc = this._subprocessLauncher.spawnv(psCmd);
                    proc.communicate_utf8_async(null, null, ((proc, res) => {
                        try {
                            resolve([proc.communicate_utf8_finish(res), proc]);
                        } catch(e) {
                            reject(e);
                        }
                    }));

                })

                psPromiseMap.set(pid, psPromise);
            }
        }
    }

    _ignoreWindows(metaWindow) {
        if (UiHelper.isDialog(metaWindow)) {
            return true;
        }

        // The override-redirect windows is invisible to the users,
        // and the workspace index is -1 and don't have proper x, y, width, height.
        // See also:
        // https://gjs-docs.gnome.org/meta9~9_api/meta.window#method-is_override_redirect
        // https://wiki.tcl-lang.org/page/wm+overrideredirect
        // https://docs.oracle.com/cd/E36784_01/html/E36843/windowapi-3.html
        // https://stackoverflow.com/questions/38162932/what-does-overrideredirect-do
        // https://ml.cddddr.org/cl-windows/msg00166.html
        if (metaWindow.is_override_redirect()) {
            return true;
        }

        return false;
    }

    save2File(sessionConfig) {
        this._log.info(`Saving session ${sessionConfig.session_name} to local file`);

        const sessionConfigJson = JSON.stringify(sessionConfig, null, 4);

        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, sessionConfig.session_name]);
        const session_file = Gio.File.new_for_path(session_file_path);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            this._saveSessionConfigJson(session_file, sessionConfigJson);
            return;
        }

        const session_file_backup_path = FileUtils.get_sessions_backups_path();
        const session_file_backup = GLib.build_filenamev([session_file_backup_path, sessionConfig.session_name + '.backup-' + new Date().getTime()]);
        if (GLib.mkdir_with_parents(session_file_backup_path, 0o744) !== 0) {
            const errMsg = `Cannot save session: ${session_file_path}`;
            const reason = `Failed to create backups folder: ${session_file_backup_path}`;
            this._log.error(new Error(`${errMsg}`), `${reason}`);
            global.notify_error(`${errMsg}`, `${reason}`);
            return;
        }

        session_file.copy_async(
            Gio.File.new_for_path(session_file_backup),
            Gio.FileCopyFlags.OVERWRITE,
            GLib.PRIORITY_DEFAULT,
            null,
            null,
            (file, asyncResult) => {
                let success;
                try {
                    success = session_file.copy_finish(asyncResult);
                } catch (e) {
                    const errMsg = `Cannot save session: ${session_file_path}`;
                    const reason = `Failed to backup ${session_file_path} to ${session_file_backup}`;
                    this._log.error(e, `${reason}`);
                    global.notify_error(`${errMsg}`, `${reason}`);
                    return;
                }

                if (success) {
                    this._saveSessionConfigJson(session_file, sessionConfigJson);
                } else {
                    const errMsg = `Cannot save session: ${session_file_path}`;
                    const reason = `Failed to backup ${session_file_path} to ${session_file_backup}`;
                    this._log.error(new Error(`${errMsg}`), `${reason}`);
                    global.notify_error(`${errMsg}`, `${reason}`);
                }
            }
        );

    }

    _saveSessionConfigJson(sessionFile, sessionConfigJson) {
        // https://gjs.guide/guides/gio/file-operations.html#saving-content
        // https://github.com/ewlsh/unix-permissions-cheat-sheet/blob/master/README.md#octal-notation
        // https://askubuntu.com/questions/472812/why-is-777-assigned-to-chmod-to-permit-everything-on-a-file
        // 0o stands for octal 
        // 0o744 => rwx r-- r--
        const sessionFolder = sessionFile.get_parent().get_path();
        if (GLib.mkdir_with_parents(sessionFolder, 0o744) !== 0) {
            const errMsg = `Cannot save session: ${sessionFile.get_path()}`;
            const reason = `Failed to create session folder: ${sessionFolder}`;
            this._log.error(new Error(`${errMsg}`), `${reason}`);
            global.notify_error(`${errMsg}`, `${reason}`);
            return;
        }

        // Use replace_contents_bytes_async instead of replace_contents_async, see: 
        // https://gitlab.gnome.org/GNOME/gjs/-/blob/gnome-42/modules/core/overrides/Gio.js#L513
        // https://gitlab.gnome.org/GNOME/gjs/-/issues/192
        sessionFile.replace_contents_bytes_async(
            ByteArray.fromString(sessionConfigJson),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (file, asyncResult) => {
                try {
                    const success = sessionFile.replace_contents_finish(asyncResult);
                    if (success) {
                        this._log.info(`Saved session into ${sessionFile.get_path()}!`);
                        // TODO Notification
                    } else {
                        const errMsg = `Cannot save session: ${sessionFile.get_path()}`;
                        const reason = `Failed to save session into ${sessionFile.get_path()}!`;
                        this._log.error(new Error(`${errMsg}`), `${reason}`);
                        global.notify_error(`${errMsg}`, `${reason}`);
                    }
                } catch (e) {
                    const errMsg = `Cannot save session: ${sessionFile.get_path()}`;
                    const reason = `Failed to save session into ${sessionFile.get_path()}!`;
                    this._log.error(e, `${reason}`);
                    global.notify_error(`${errMsg}`, `${reason}`);
                }
            }
        );
    }

    _setFieldsFromProcess(proc, result, sessionConfigObject) {
        let [, stdout, stderr] = result;
        let status = proc.get_exit_status();
        if (status === 0 && stdout) {
            stdout = stdout.trim();
            const stdoutArr = stdout.split(' ').filter(a => a);
            sessionConfigObject.process_create_time = stdoutArr.slice(0, 5).join(' ');
            sessionConfigObject.cpu_percent = stdoutArr.slice(5, 6).join();
            sessionConfigObject.memory_percent = stdoutArr.slice(6, 7).join();
            sessionConfigObject.cmd = stdoutArr.slice(7);
        } else {
            this._log.error(new Error(`Failed to query process info. status: ${status}, stdout: ${stdout}, stderr: ${stderr}`));
            sessionConfigObject.process_create_time = null;
            sessionConfigObject.cpu_percent = null;
            sessionConfigObject.memory_percent = null;
            sessionConfigObject.cmd = null;
        }
    }

    destroy() {
        if (this._windowTracker) {
            this._windowTracker = null;
        }
        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }
        if (this._subprocessLauncher) {
            this._subprocessLauncher = null;
        }
        
    }

}
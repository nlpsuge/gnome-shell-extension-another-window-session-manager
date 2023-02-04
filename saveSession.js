'use strict';

const { Shell, Gio, GLib, Meta } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionConfig = Me.imports.model.sessionConfig;

const UiHelper = Me.imports.ui.uiHelper;

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;
const MetaWindowUtils = Me.imports.utils.metaWindowUtils;
const CommonError = Me.imports.utils.CommonError;
const SubprocessUtils = Me.imports.utils.subprocessUtils;


var SaveSession = class {

    constructor() {
        this._log = new Log.Log();

        this._windowTracker = Shell.WindowTracker.get_default();
        this._subprocessLauncher = new Gio.SubprocessLauncher({
            flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE)});
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._sourceIds = [];
    }

    async saveSessionAsync(sessionName, baseDir = null, backup = true) {
        try {
            this._log.debug(`Generating session ${sessionName}`);

            const sessionConfig = await this._buildSession(sessionName);
    
            sessionConfig.x_session_config_objects = sessionConfig.sort();
            
            if (backup) {
                await this.backupExistingSessionIfNecessary(sessionName, baseDir);
            }
    
            await this._saveSessionConfigAsync(sessionConfig, baseDir);
    
            // TODO saved Notification   
        } catch (error) {
            this._log.error(error);
        }
    }

    async saveWindowsSessionAsync(metaWindows, cancellableMap) {
        try {
            const apps = new Set();
            for (const metaWindow of metaWindows) {
                const cancellable = cancellableMap ? cancellableMap.get(metaWindow) : null;
                if (cancellable && cancellable.is_cancelled()) continue;
                const app = this._windowTracker.get_window_app(metaWindow);
                if (!app) continue;
                if (UiHelper.ignoreWindows(metaWindow)) continue;
                apps.add(app);
            }

            if (!apps.size) return;
    
            const processInfoPromise = SubprocessUtils.getProcessInfo(apps);

            const result = [];
            for (const metaWindow of metaWindows) {
                try {
                    const cancellable = cancellableMap ? cancellableMap.get(metaWindow) : null;
                    if (cancellable && cancellable.is_cancelled()) continue;
                    const app = this._windowTracker.get_window_app(metaWindow);
                    if (!app) continue;
                    if (UiHelper.ignoreWindows(metaWindow)) continue;

                    const sessionName = `${MetaWindowUtils.getStableWindowId(metaWindow)}.json`;
                    const baseDir = `${FileUtils.current_session_path}/${metaWindow.get_wm_class()}`;

                    this._log.debug(`Generating window session ${sessionName}`);
                
                    const [canContinue, sessionConfigObject] = this._builtSessionDetails(
                        app, 
                        metaWindow, 
                        cancellable);
                    if (!canContinue) return;
            
                    const processInfoMap = await processInfoPromise;
                    const processInfoArray = processInfoMap.get(metaWindow.get_pid());
                    this._setFieldsFromProcess(processInfoArray, sessionConfigObject);
            
                    const success = await this._saveSessionConfigAsync({
                        ...sessionConfigObject, 
                        session_name: sessionName
                    }, baseDir, cancellable);
                    result.push([success, metaWindow, baseDir, sessionName]);
                } catch (e) {
                    // Ignore cancelation errors
                    if (!e?.cause?.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        this._log.error(e);
                    }
                    result.push([false, metaWindow]);
                }
            }
            return result;
        } catch (e) {
            this._log.error(e);
        }
    }

    async saveWindowSessionAsync(metaWindow, sessionName, baseDir, cancellable = null) {
        try {
            if (cancellable && cancellable.is_cancelled()) {
                return;
            }
    
            const app = this._windowTracker.get_window_app(metaWindow);
            if (!app) return;
            if (UiHelper.ignoreWindows(metaWindow)) return;
    
            this._log.debug(`Generating window session ${sessionName}`);
            
            const _getProcessInfoPromise = this._getProcessInfo([app])
            
            const [canContinue, sessionConfigObject] = this._builtSessionDetails(
                app, 
                metaWindow, 
                cancellable);
            if (!canContinue) return;
    
            const processInfoMap = await _getProcessInfoPromise;
            const processInfoArray = processInfoMap.get(metaWindow.get_pid());
            this._setFieldsFromProcess(processInfoArray, sessionConfigObject);
    
            return await this._saveSessionConfigAsync({
                ...sessionConfigObject, 
                session_name: sessionName
            }, baseDir, cancellable);
        } catch (e) {
            this._log.error(e);
        }
    }
    
    async _buildSession(sessionName) {
        const runningShellApps = this._defaultAppSystem.get_running();
        const _getProcessInfoPromise = SubprocessUtils.getProcessInfo(runningShellApps, (metaWindow) => {
            return UiHelper.ignoreWindows(metaWindow);
        })

        const sessionConfig = new SessionConfig.SessionConfig();
        sessionConfig.session_name = sessionName ? sessionName : FileUtils.default_sessionName;
        sessionConfig.session_create_time = new Date().toLocaleString();
        sessionConfig.active_workspace_index = global.workspace_manager.get_active_workspace_index();
        
        for (const runningShellApp of runningShellApps) {
            var { metaWindows, ignoredWindowsMap } = this._doIgnoreWindows(runningShellApp);

            const processInfoMap = await _getProcessInfoPromise;

            for (const metaWindow of metaWindows) {
                try {
                    const [canContinue, sessionConfigObject] = this._builtSessionDetails(runningShellApp, metaWindow);
                    if (!canContinue) {
                        continue;
                    }
                    sessionConfigObject.windows_count = runningShellApp.get_n_windows() - ignoredWindowsMap.get(runningShellApp).length;
                    
                    const processInfoArray = processInfoMap.get(metaWindow.get_pid());
                    this._setFieldsFromProcess(processInfoArray, sessionConfigObject);

                    sessionConfig.x_session_config_objects.push(sessionConfigObject);    
                } catch (e) {
                    this._log.error(e, `Failed to generate session ${sessionName}`);
                    global.notify_error(`Failed to generate session ${sessionName}`, e.message);
                }
            }
        }
        return sessionConfig;
    }

    _doIgnoreWindows(runningShellApp) {
        const ignoredWindowsMap = new Map();
        ignoredWindowsMap.set(runningShellApp, []);

        let metaWindows = runningShellApp.get_windows();
        metaWindows = metaWindows.filter(metaWindow => {
            if (UiHelper.ignoreWindows(metaWindow)) {
                ignoredWindowsMap.get(runningShellApp).push(metaWindow);
                return false;
            }
            return true;
        });
        return { metaWindows, ignoredWindowsMap };
    }

    _builtSessionDetails(runningShellApp, metaWindow, cancellable = null) {
        const sessionConfigObject = new SessionConfig.SessionConfigObject();
        if (cancellable && cancellable.is_cancelled()) {
            return [false, sessionConfigObject];
        }

        const appName = runningShellApp.get_name();

        sessionConfigObject.window_id = MetaWindowUtils.getStableWindowId(metaWindow);
        if (metaWindow.is_always_on_all_workspaces()) {
            sessionConfigObject.desktop_number = -1;
        } else {
            // If the window is on all workspaces, returns the currently active workspace.
            const workspace = metaWindow.get_workspace();
            // While an app such as VirtualBox Manager is starting, it opens 
            // an phantom window (which is only existing a little while) at first,
            // then a second window opens. I don't know how to detect which window is phantom, 
            // so that I can ignore it. If the workspace of an window is null, it probably means that
            // the window has been closed, so this window can be ignored safely.
            if (!workspace) {
                this._log.warn(`No workspace associated with window "${metaWindow.get_title()}" was found, ignoring...`);
                return [false, sessionConfigObject];
            }
            sessionConfigObject.desktop_number = workspace.index();
        }
        sessionConfigObject.monitor_number = metaWindow.get_monitor();
        sessionConfigObject.is_on_primary_monitor = metaWindow.is_on_primary_monitor();
        sessionConfigObject.pid = metaWindow.get_pid();
        // TODO Since we can launch an app in the terminal after `su - username` or `su username`, we 
        // should get the user ID who creates/launches this process. In the future, we can restore
        // this kind of apps under the user ID
        sessionConfigObject.username = GLib.get_user_name();

        sessionConfigObject.client_machine_name = GLib.get_host_name();
        sessionConfigObject.window_title = metaWindow.get_title();
        sessionConfigObject.app_name = appName;
        sessionConfigObject.wm_class = metaWindow.get_wm_class();
        sessionConfigObject.wm_class_instance = metaWindow.get_wm_class_instance();
        sessionConfigObject.windows_count = runningShellApp.get_n_windows();
        sessionConfigObject.fullscreen = metaWindow.is_fullscreen();
        sessionConfigObject.minimized = metaWindow.minimized;
        sessionConfigObject.compositor_type = Meta.is_wayland_compositor() ? 'Wayland' : 'X11'

        const frameRect = metaWindow.get_frame_rect();
        let window_position = sessionConfigObject.window_position;
        window_position.provider = 'Meta';
        window_position.x_offset = frameRect.x;
        window_position.y_offset = frameRect.y;
        window_position.width = frameRect.width;
        window_position.height = frameRect.height;

        let window_state = sessionConfigObject.window_state;
        // See: ui/windowMenu.js:L80
        window_state.is_sticky = metaWindow.is_on_all_workspaces();
        window_state.is_above = metaWindow.is_above();
        window_state.meta_maximized = metaWindow.get_maximized();

        const windowTileFor = metaWindow.get_tile_match() ?? metaWindow._tile_match_awsm;
        if (windowTileFor) {
            const shellApp = this._windowTracker.get_window_app(windowTileFor);
            if (shellApp) {
                let window_tiling = {};
                window_tiling.window_tile_for = {
                    app_name: shellApp.get_name(),
                    desktop_file_id: shellApp.get_id(),
                    desktop_file_id_full_path: shellApp.get_app_info()?.get_filename(),
                    window_title: windowTileFor.get_title()
                };
                sessionConfigObject.window_tiling = window_tiling;
            }
        }            

        const desktopAppInfo = runningShellApp.get_app_info();
        if (desktopAppInfo) {
            sessionConfigObject.desktop_file_id = runningShellApp.get_id();
            // Save the .desktop full path, so we know which desktop is used by this app.
            sessionConfigObject.desktop_file_id_full_path = desktopAppInfo.get_filename();
        } else {
            // This app is backed by a window, which means that
            // no app info associated with this application, we just set an empty string
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
                const proc = this._subprocessLauncher.spawnv(['pwdx', `${metaWindow.get_pid()}`]);
                // TODO Use async version in the future
                const result = proc.communicate_utf8(null, cancellable);
                let [, stdout, stderr] = result;
                let status = proc.get_exit_status();
                if (status === 0 && stdout) {
                    cmdStr = `${stdout.split(':')[1].trim()}/${cmdStr}`
                } else {
                    this._log.error(new Error(`Failed to query the working directory according to ${metaWindow.get_pid()}, and the current command line is ${cmdStr}. stderr: ${stderr}`));
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
            const desktopFileContent = FileUtils.loadDesktopTemplate(cancellable).fill(argument);
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

        return [true, sessionConfigObject];
    }

    async backupExistingSessionIfNecessary(sessionName, baseDir) {

        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, sessionName]);
        const session_file = Gio.File.new_for_path(session_file_path);
        // Backup first if exists
        if (GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            this._log.debug(`Backing up existing session ${sessionName}`);

            const session_file_backup_path = FileUtils.get_sessions_backups_path();
            const session_file_backup = GLib.build_filenamev([session_file_backup_path, sessionName + '.backup-' + new Date().getTime()]);
            if (GLib.mkdir_with_parents(session_file_backup_path, 0o744) !== 0) {
                const errMsg = `Cannot save session: ${session_file_path}`;
                const reason = `Failed to create backups folder: ${session_file_backup_path}`;
                return Promise.reject(new CommonError.CommonError(errMsg, {desc: reason}));
            }
            
            return new Promise((resolve, reject) => {
                session_file.copy_async(
                    Gio.File.new_for_path(session_file_backup),
                    Gio.FileCopyFlags.OVERWRITE,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    null,
                    (file, asyncResult) => {
                        let success = false;
                        let causedBy = null;
                        try {
                            success = session_file.copy_finish(asyncResult);
                            if (success) {
                                resolve(success);
                                return;
                            }
                        } catch (e) {
                            causedBy = e;
                        }
                        const errMsg = `Cannot save session: ${session_file_path}`;
                        const reason = `Failed to backup ${session_file_path} to ${session_file_backup}`;
                        reject(new CommonError.CommonError(errMsg, {desc: reason, cause: causedBy}));
                    }
                );
            });
        }
    }

    _saveSessionConfigAsync(sessionConfig, baseDir = null, cancellable = null) {
        if (cancellable && cancellable.is_cancelled()) {
            return Promise.resolve(false);
        }

        const sessions_path = FileUtils.get_sessions_path(baseDir);
        const session_file_path = GLib.build_filenamev([sessions_path, sessionConfig.session_name]);
        const sessionFile = Gio.File.new_for_path(session_file_path);

        // https://gjs.guide/guides/gio/file-operations.html#saving-content
        // https://github.com/ewlsh/unix-permissions-cheat-sheet/blob/master/README.md#octal-notation
        // https://askubuntu.com/questions/472812/why-is-777-assigned-to-chmod-to-permit-everything-on-a-file
        // 0o stands for octal 
        // 0o744 => rwx r-- r--
        const sessionFolder = sessionFile.get_parent().get_path();
        if (GLib.mkdir_with_parents(sessionFolder, 0o744) !== 0) {
            const errMsg = `Cannot save session: ${sessionFile.get_path()}`;
            const reason = `Failed to create session folder: ${sessionFolder}`;
            return Promise.reject(new CommonError.CommonError(errMsg, {desc: reason}));
        }

        const sessionConfigJson = JSON.stringify(sessionConfig, null, 4);
        
        this._log.debug(`Saving session ${sessionConfig.session_name} to local file`);

        return new Promise((resolve, reject) => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                // Use replace_contents_bytes_async instead of replace_contents_async, see: 
                // https://gitlab.gnome.org/GNOME/gjs/-/blob/gnome-42/modules/core/overrides/Gio.js#L513
                // https://gitlab.gnome.org/GNOME/gjs/-/issues/192
                sessionFile.replace_contents_bytes_async(
                    ByteArray.fromString(sessionConfigJson),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    cancellable,
                    (file, asyncResult) => {
                        let success = false;
                        let causedBy = null;
                        try {
                            success = sessionFile.replace_contents_finish(asyncResult);
                            if (success) {
                                this._log.info(`Session saved to ${sessionFile.get_path()}!`);
                                resolve(success);
                                // TODO Notification
                                return;
                            }
                        } catch (e) {
                            causedBy = e;
                        }
                        const errMsg = `Cannot save session: ${sessionFile.get_path()}`;
                        const reason = `Failed to save session to ${sessionFile.get_path()}!`;
                        reject(new CommonError.CommonError(errMsg, {desc: reason, cause: causedBy}));
                    });
                });
                return GLib.SOURCE_REMOVE;
            });
    }

    _setFieldsFromProcess(processInfoArray, sessionConfigObject) {
        if (processInfoArray) {
            sessionConfigObject.process_create_time = processInfoArray.slice(0, 5).join(' ');
            sessionConfigObject.cpu_percent = processInfoArray.slice(5, 6).join();
            sessionConfigObject.memory_percent = processInfoArray.slice(6, 7).join();
            sessionConfigObject.cmd = processInfoArray.slice(8);
        } else {
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
        if (this._sourceIds) {
            this._sourceIds.forEach(sourceId => {
                GLib.Source.remove(sourceId);
            });
            this._sourceIds = null;
        }
        
    }

}
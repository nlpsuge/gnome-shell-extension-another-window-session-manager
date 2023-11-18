'use strict';

import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as FileUtils from './utils/fileUtils.js';
import * as Log from './utils/log.js';
import PrefsUtils from './utils/prefsUtils.js';
import * as SubprocessUtils from './utils/subprocessUtils.js';
import * as DateUtils from './utils/dateUtils.js';
import * as StringUtils from './utils/stringUtils.js';


export const restoreSessionObject = {
    // All launching apps by Shell.App#launch()
    restoringApps: new Map()
}

export const RestoreSession = class {

    constructor() {
        this._log = new Log.Log();
        this._settings = PrefsUtils.getSettings();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();   

        this._restore_session_interval = this._settings.get_int('restore-session-interval');

        // TODO Add to Preferences?
        // Launch apps using discrete graphics card might cause issues, like the white main window of superproductivity
        this._useDiscreteGraphicsCard = false;

        // All launched apps info by Shell.App#launch()
        this._restoredApps = new Map();

        // Tracking cmd and appId mapping
        this._cmdAppIdMap = new Map();

        this._display = global.display;

        this._connectIds = [];
    }

    /**
     * Restore workspaces and make them persistent, etc
     */
    static restoreFromSummary() {
        Log.Log.getDefault().debug(`Prepare to restore summary`);
        FileUtils.loadSummary().then(([summary, path]) => {
            Log.Log.getDefault().info(`Restoring summary from ${path}`);
            const savedNWorkspace = summary.n_workspace;
            const workspaceManager = global.workspace_manager;
            const currentNWorkspace = workspaceManager.n_workspaces;
            const moreWorkspace = savedNWorkspace - currentNWorkspace;
            if (moreWorkspace) {
                for (let i = currentNWorkspace; i <= savedNWorkspace; i++) {
                    workspaceManager.append_new_workspace(false, DateUtils.get_current_time());
                    workspaceManager.get_workspace_by_index(i)._keepAliveId = true;
                }
            }
        }).catch(e => Log.Log.getDefault().error(e));
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
        if (!(session_config_objects && session_config_objects.length)) {
            this._log.error(new Error(`Session details not found: ${session_file_path}`));
            global.notify_error(`No session to restore from ${session_file_path}`, `session config is empty.`);
            return;
        }

        session_config_objects = session_config_objects.filter(session_config_object => {
            const desktop_file_id = session_config_object.desktop_file_id;
            if (!desktop_file_id) {
                return true;
            }
            const shellApp = this._defaultAppSystem.lookup_app(desktop_file_id);
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

        this._restoreOneSession(session_config_objects.shift());
        if (session_config_objects.length === 0) return;

        this._restoreSessionTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 
            // In milliseconds. 
            // Note that this timing might not be precise, see https://gjs-docs.gnome.org/glib20~2.66.1/glib.timeout_add
            this._restore_session_interval,
            () => {
                if (!session_config_objects.length) {
                    return GLib.SOURCE_REMOVE;
                }
                this._restoreOneSession(session_config_objects.shift());
                return GLib.SOURCE_CONTINUE;
            }
        );  
    }

    async restorePreviousSession(removeAfterRestore) {
        try {
            this._log.info(`Restoring the previous session from ${FileUtils.current_session_path}`);

            const ignoringParentFolders = [
                GLib.build_filenamev([FileUtils.current_session_path, 'null']),
            ];
            const ignoringFilePaths = [
                GLib.build_filenamev([FileUtils.current_session_path, 'summary.json'])
            ];
            FileUtils.listAllSessions(FileUtils.current_session_path, true, (file, info) => {
                const contentType = info.get_content_type();
                if (contentType !== 'application/json') {
                    return;
                }
                if (ignoringParentFolders.includes(file.get_parent().get_path())) {
                    return;
                }
                if (ignoringFilePaths.includes(file.get_path())) {
                    return;
                }
                file.load_contents_async(
                    null,
                    (file, asyncResult) => {
                        const [success, contents, _] = file.load_contents_finish(asyncResult);
                        if (!success) {
                            return;
                        }
                        const sessionConfig = FileUtils.getJsonObj(contents);
                        sessionConfig._file_path = file.get_path();
                        this._restoreOneSession(sessionConfig).then(([launched, running]) => {
                            if (removeAfterRestore && launched && !running) {
                                const path = file.get_path();
                                this._log.debug(`Restored ${sessionConfig.window_title}(${sessionConfig.app_name}), cleaning ${path}`);
                                FileUtils.removeFile(path);
                            }
                        }).catch(e => this._log.error(e));
                    });

            });
        } catch (error) {
            this._log.error(error);
        }
    }

    async _restoreOneSession(session_config_object) {
        const app_name = session_config_object.app_name;
        let launched = false;
        let running = false;
        try {
            return await new Promise((resolve, reject) => {
                let desktop_file_id = session_config_object.desktop_file_id;
                const shell_app = desktop_file_id ? this._defaultAppSystem.lookup_app(desktop_file_id) : null;
                if (shell_app) {
                    const restoringShellAppData = restoreSessionObject.restoringApps.get(shell_app);
                    if (restoringShellAppData) {
                        restoringShellAppData.saved_window_sessions.push(session_config_object);
                    } else {
                        restoreSessionObject.restoringApps.set(shell_app, {
                            saved_window_sessions: [session_config_object]
                        });
                    }
                    
                    const desktopNumber = session_config_object.desktop_number;
                    [launched, running] = this.launch(shell_app, desktopNumber);
                    if (launched) {
                        if (!running) {
                            this._log.info(`${app_name} has been launched! Preparing to restore window ${session_config_object.window_title}(${app_name})!`);
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
                        this._log.error(`Failed to launch ${app_name}`, `Failed to launch ${app_name}`);
                        global.notify_error(`Failed to launch ${app_name}`, `Failed to launch ${app_name}`);
                    }
                    resolve([launched, running]);
                } else {
                    // https://gjs-docs.gnome.org/gio20~2.0/gio.subprocesslauncher#method-set_environ
                    // TODO Support snap apps
                    
                    const cmd = session_config_object.cmd;
                    if (cmd && cmd.length) {
                        const cmdString = cmd.join(' ');
                        const pid = this._cmdAppIdMap.get(cmdString);
                        if (pid) {
                            this._log.debug(`${app_name} might be running, preparing to restore window (${session_config_object.window_title}) states.`);
                            
                            // Here we use pid as the key, because the associated ShellApp might not be instantiated at this moment
                            const restoringShellAppData = restoreSessionObject.restoringApps.get(pid);
                            if (restoringShellAppData) {
                                restoringShellAppData.saved_window_sessions.push(session_config_object);
                            } else {
                                restoreSessionObject.restoringApps.set(pid, {
                                    saved_window_sessions: [session_config_object]
                                });
                            }
                        }

                        const launchAppTemplate = FileUtils.desktop_template_launch_app_shell_script;
                        const launchAppShellScript = StringUtils.format(FileUtils.loadTemplate(launchAppTemplate), {cmdString});
                        this._log.info(`Launching ${app_name} via command line ${cmdString}!`);
                        SubprocessUtils.trySpawnCmdstr(`bash -c '${launchAppShellScript}'`).then(
                            ([success, status, stdoutInputStream, stderrInputStream]) => {
                                if (success) {
                                    stdoutInputStream.read_line_async(
                                        GLib.PRIORITY_DEFAULT,
                                        null,
                                        (stream, res) => {
                                            try {
                                                let pid = stream.read_line_finish_utf8(res)[0];
                                                if (!pid) return;
    
                                                pid = Number(pid);
                                                this._cmdAppIdMap.set(cmdString, pid);
                                                const restoringShellAppData = restoreSessionObject.restoringApps.get(pid);
                                                if (restoringShellAppData) {
                                                    restoringShellAppData.saved_window_sessions.push(session_config_object);
                                                } else {
                                                    restoreSessionObject.restoringApps.set(pid, {
                                                        saved_window_sessions: [session_config_object]
                                                    });
                                                }
                                                launched = true;
                                                resolve([launched, running]);
                                            } catch (e) {
                                                this._log.error(e);
                                                reject(e);
                                            }
                                        }
                                    );
                                } else {
                                    if (status === 79) {
                                        launched = true;
                                        running = true;
                                        this._log.info(`${app_name} is running, skipping`)
                                    } else {
                                        const msg = `Failed to launch ${app_name} via command line`;
                                        let errorDetail = `Can't restore this app from ${session_config_object._file_path}: ${stderr}.`;
                                        this._log.error(`${msg}. output: ${errorDetail}`);
                                        global.notify_error(`${msg}`, errorDetail);
                                    }
                                    resolve([launched, running]);
                                }
                            }).catch(e => {
                                this._log.error(e)
                                reject(e);
                            });
                    } else {
                        // TODO try to launch via app_info by searching the app name?
                        let errorMsg = `Failed to launch ${app_name} via command line`;
                        let errorDetail = `Can't restore this app from ${session_config_object._file_path}: Invalid command line: ${cmd}.`;
                        this._log.error(errorMsg, errorDetail);
                        global.notify_error(errorMsg, errorDetail);
                        resolve([launched, running]);
                    }
                }
            });
        } catch (e) {
            logError(e, `Failed to restore ${app_name}`);
            if (!launched) {
                global.notify_error(`Failed to restore ${app_name}`, e.message);
            }
            return [launched, running];
        }
    }

    launch(shellApp, desktopNumber) {
        if (this._restoredApps.has(shellApp)) {
            this._log.info(`${shellApp.get_name()} is restored, skipping`);
            return [true, false];
        }

        if (this._appIsRunning(shellApp)) {
            this._log.info(`${shellApp.get_name()} is running, skipping`);
            // Delete shellApp from restoringApps to prevent it move the same app when close and open it manually.
            restoreSessionObject.restoringApps.delete(shellApp);
            return [true, true];
        }

        const launched = shellApp.launch(
            // 0 for current event timestamp
            0, 
            desktopNumber,
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
        if (restoreSessionObject.restoringApps) {
            restoreSessionObject.restoringApps.clear();
            restoreSessionObject.restoringApps = null;
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
            GLib.Source.remove(this._restoreSessionTimeoutId);
            this._restoreSessionTimeoutId = null;
        }
        
    }

}

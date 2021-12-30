'use strict';

const { Shell, Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;
const PrefsUtils = Me.imports.utils.prefsUtils;


var MoveSession = class {

    constructor() {
        this._prefsUtils = new PrefsUtils.PrefsUtils();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();

    }

    moveWindows(sessionName) {
        if (!sessionName) {
            sessionName = this.sessionName;
        }
        
        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, sessionName]);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            logError(new Error(`Session file not found: ${session_file_path}`));
            return;
        }

        if (this._prefsUtils.isDebug()) {
            log(`Moving windows by saved session located in ${session_file_path}`);
        }
        const session_file = Gio.File.new_for_path(session_file_path);
        let [success, contents] = session_file.load_contents(null);
        if (success) {
            let session_config = FileUtils.getJsonObj(contents);
            
            const session_config_objects = session_config.x_session_config_objects;
            if (!session_config_objects) {
                logError(new Error(`Session details not found: ${session_file_path}`));
                return;
            }

            const running_apps = this._defaultAppSystem.get_running();
            for (const shellApp of running_apps) {
                this.moveWindowsByShellApp(shellApp, session_config_objects);
            }
        }

    }

    moveWindowsByShellApp(shellApp, saved_window_sessions) {
        const interestingWindows = this._getAutoMoveInterestingWindows(shellApp, saved_window_sessions);

        if (!interestingWindows.length) {
            return;
        }

        for (const interestingWindow of interestingWindows) {
            const open_window = interestingWindow.open_window;
            const saved_window_session = interestingWindow.saved_window_session;
            const title = open_window.get_title();
            const desktop_number = saved_window_session.desktop_number;

            if (this._prefsUtils.isDebug()) {
                log(`Auto move the window '${title}' to workspace ${desktop_number} for ${shellApp.get_name()}`);
            }
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
            // Comment the three lines below since it does not work in case it causes unexpected issues.
            // if (window_position.provider == 'Meta') {
            //     open_window.move_resize_frame(true, x, y, width, height);
            // }

            saved_window_session.moved = true;
        }

    }

    _getAutoMoveInterestingWindows(shellApp, saved_window_sessions) {
        saved_window_sessions = saved_window_sessions.filter(saved_window_session => {
            return !saved_window_session.moved;
        });

        if (!saved_window_sessions.length) {
            return [];
        }

        const app_id = shellApp.get_id();

        let autoMoveInterestingWindows = [];
        const open_windows = shellApp.get_windows();
        saved_window_sessions.forEach(saved_window_session => {
            if (app_id !== saved_window_session.desktop_file_id) {
                return;
            }

            open_windows.forEach(open_window => {
                const title = open_window.get_title();
                const windows_count = saved_window_session.windows_count;
                const open_window_workspace_index = open_window.get_workspace().index();
                const desktop_number = saved_window_session.desktop_number;

                if (windows_count === 1 || title === saved_window_session.window_title) {
                    if (open_window_workspace_index === desktop_number) {
                        if (this._prefsUtils.isDebug()) {
                            log(`The window '${title}' is already on workspace ${desktop_number} for ${shellApp.get_name()}`);
                        }
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

    _createEnoughWorkspace(workspaceNumber) {
        let workspaceManager = global.workspace_manager;
        for (let i = workspaceManager.n_workspaces; i <= workspaceNumber; i++) {
            workspaceManager.append_new_workspace(false, 0);
        }
    }

    destroy() {
        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }

        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }
    }

}
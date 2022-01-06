'use strict';

const { Shell, Gio, GLib, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;


var MoveSession = class {

    constructor() {
        this._log = new Log.Log();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();

        this._sourceIds = [];

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

        this._log.info(`Moving windows by saved session located in ${session_file_path}`);
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

            this._log.debug(`Auto move the window '${title}' to workspace ${desktop_number} from ${open_window.get_workspace().index()} for ${shellApp.get_name()}`);
            
            try {                
                this._restoreWindowStateAndGeometry(open_window, saved_window_session);
                
                this._createEnoughWorkspace(desktop_number);
                open_window.change_workspace_by_index(desktop_number, false);
                
            } catch(e) {
                // I just don't want one failure breaks the loop 

                this._log.error(e, `Failed to move window ${title} for ${shellApp.get_name()} automatically`);
            }
            saved_window_session.moved = true;
        }

    }

    createEnoughWorkspaceAndMoveWindows(metaWindow, saved_window_sessions) {
        const saved_window_session = this._getOneMatchedSavedWindow(metaWindow, saved_window_sessions);
        if (!saved_window_session) {
            return null;
        }

        if (saved_window_session.moved) {
            this._restoreWindowStateAndGeometry(metaWindow, saved_window_session);
            return saved_window_session;
        }

        const desktop_number = saved_window_session.desktop_number;
        this._createEnoughWorkspace(desktop_number);
        if (this._log.isDebug()) {
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            this._log.debug(`CEWM: Moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to ${desktop_number}`);
        }
        metaWindow.change_workspace_by_index(desktop_number, false);
        return saved_window_session;
    }

    moveWindowsByMetaWindow(metaWindow, saved_window_sessions) {
        const saved_window_session = this._getOneMatchedSavedWindow(metaWindow, saved_window_sessions);
        if (!saved_window_session) {
            return;
        }

        if (saved_window_session.moved) {
            const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._restoreWindowStateAndGeometry(metaWindow, saved_window_session);
                return GLib.SOURCE_REMOVE;
            });
            this._sourceIds.push(sourceId);
        } else {
            const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._restoreWindowStateAndGeometry(metaWindow, saved_window_session);
                const desktop_number = saved_window_session.desktop_number;
                // It's necessary to move window again to ensure an app goes to its own workspace.
                // In a sort of situation, some apps probably just don't want to move when call createEnoughWorkspaceAndMoveWindows() from `Meta.Display::window-created` signal.
                this._createEnoughWorkspace(desktop_number);
                if (this._log.isDebug()) {
                    const shellApp = this._windowTracker.get_window_app(metaWindow);
                    this._log.debug(`MWMW: Moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to ${desktop_number}`);
                }
                metaWindow.change_workspace_by_index(desktop_number, false);

                saved_window_session.moved = true;
                return GLib.SOURCE_REMOVE;
            });
            this._sourceIds.push(sourceId);
        }
    }

    _getOneMatchedSavedWindow(metaWindow, saved_window_sessions) {
        saved_window_sessions = saved_window_sessions.filter(saved_window_session => {
            return !saved_window_session.moved;
        });

        for (const saved_window_session of saved_window_sessions) {
            const title = metaWindow.get_title();
            const windows_count = saved_window_session.windows_count;
            const open_window_workspace_index = metaWindow.get_workspace().index();
            const desktop_number = saved_window_session.desktop_number;

            if (windows_count === 1 || title === saved_window_session.window_title) {
                if (open_window_workspace_index === desktop_number) {
                    if (this._log.isDebug()) {
                        const shellApp = this._windowTracker.get_window_app(metaWindow);
                        this._log.debug(`The window '${title}' is already on workspace ${desktop_number} for ${shellApp?.get_name()}`);
                    }
                    saved_window_session.moved = true;
                }

                return saved_window_session;
            }
        }
        return null;
    }

    /**
     * @see https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en
     */
    _restoreWindowStateAndGeometry(metaWindow, saved_window_session) {
        // window state
        const window_state = saved_window_session.window_state;
        if (window_state.is_above) {
            metaWindow.make_above();
        }
        if (window_state.is_sticky) {
            metaWindow.stick();
        }

        const savedMetaMaximized = window_state.meta_maximized;
        // Maximize a window to take up all of the space
        if (savedMetaMaximized === Meta.MaximizeFlags.BOTH) {
            metaWindow.maximize(savedMetaMaximized);
        } else {
            // If current window is in maximum mode, it can't be resized.
            const currentMetaMaximized = metaWindow.get_maximized();
            if (currentMetaMaximized) {
                metaWindow.unmaximize(currentMetaMaximized);
            }

            // Also handle 'maximize windows vertically along the left and right sides of the screen'
            this._restoreWindowGeometry(metaWindow, saved_window_session);
        }
    }

    _restoreWindowGeometry(metaWindow, saved_window_session) {
        const window_position = saved_window_session.window_position;
        if (window_position.provider === 'Meta') {
            const to_x = window_position.x_offset;
            const to_y = window_position.y_offset;
            const to_width = window_position.width;
            const to_height = window_position.height;
        
            const frameRect = metaWindow.get_frame_rect();
            const current_x = frameRect.x;
            const current_y = frameRect.y;
            const current_width = frameRect.width;
            const current_height = frameRect.height;
            if (to_x !== current_x ||
                to_y !== current_y ||
                current_width !== to_width ||
                current_height !== to_height) 
            {
                metaWindow.move_resize_frame(true, to_x, to_y, to_width, to_height);
            }
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
                        this._log.debug(`The window '${title}' is already on workspace ${desktop_number} for ${shellApp.get_name()}`);
                        this._restoreWindowStateAndGeometry(open_window, saved_window_session);
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

        // We have enough workspace now, return
        if (workspaceManager.n_workspaces >= workspaceNumber + 1) {
            return;
        }

        // First, make all existing workspaces persistent
        for (let i = 0; i <= workspaceManager.n_workspaces - 1; i++) {
            let workspace = workspaceManager.get_workspace_by_index(i);
            if (!workspace._keepAliveId) {
                workspace._keepAliveId = true;
            }
        }

        // Second, make all newly added workspaces persistent, so they can not removed due to it does not contain any windows
        // And keep the last one non-persistent
        for (let i = workspaceManager.n_workspaces; i <= workspaceNumber; i++) {
            workspaceManager.append_new_workspace(false, 0);
            workspaceManager.get_workspace_by_index(i)._keepAliveId = true;
        }
    }

    destroy() {
        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }

        if (this._sourceIds) {
            this._sourceIds.forEach(sourceId => {
                log(`reming ${sourceId}`);
                GLib.Source.remove(sourceId);
            });
            this._sourceIds = null;
        }

        if (this._windowTracker) {
            this._windowTracker = null;
        }

    }

}
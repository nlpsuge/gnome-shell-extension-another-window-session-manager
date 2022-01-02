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

        this._connectIds = [];

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

        this._log.debug(`Moving windows by saved session located in ${session_file_path}`);
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
                this.moveWindowsByShellApp(shellApp, session_config_objects, false);
            }
        }

    }

    moveWindowsByShellApp(shellApp, saved_window_sessions, first) {
        const interestingWindows = this._getAutoMoveInterestingWindows(shellApp, saved_window_sessions);

        if (!interestingWindows.length) {
            return;
        }

        for (const interestingWindow of interestingWindows) {
            const open_window = interestingWindow.open_window;
            const saved_window_session = interestingWindow.saved_window_session;
            const title = open_window.get_title();
            const desktop_number = saved_window_session.desktop_number;

            this._log.debug(`Auto move the window '${title}' to workspace ${desktop_number} for ${shellApp.get_name()}`);
            
            try {
                this._createEnoughWorkspace(desktop_number);
                open_window.change_workspace_by_index(desktop_number, false);
                
                this._restoreWindowStateAndGeometry(open_window, saved_window_session, first);
            } catch(e) {
                // I just don't want one failure breaks the loop 

                this._log.error(e, `Failed to move window ${title} for ${shellApp.get_name()} automatically`);
            }
            saved_window_session.moved = true;
        }

    }

    _restoreWindowStateAndGeometry(open_window, saved_window_session, first) {
        // window state
        const window_state = saved_window_session.window_state;
        if (window_state.is_above) {
            open_window.make_above();
        }
        if (window_state.is_sticky) {
            open_window.stick();
        }

        if (Meta.is_wayland_compositor()) {
            // It makes no sense to connect the 'first-frame' if a window has existed already
            if (first) {
                let metaWindowActor = open_window.get_compositor_private();
                // See: https://github.com/paperwm/PaperWM/blob/10215f57e8b34a044e10b7407cac8fac4b93bbbc/tiling.js#L2120
                const firstFrameId = metaWindowActor.connect('first-frame', () => {
                    this._restoreWindowStateAndGeometryOnWayland(open_window, saved_window_session, () => {
                        metaWindowActor.disconnect(firstFrameId);
                    });
                });
                this._connectIds.push([metaWindowActor, firstFrameId]);
            }
            
            this._restoreWindowStateAndGeometryOnWayland(open_window, saved_window_session, null);
            
        } else {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._restoreWindowGeometry(open_window, saved_window_session);
                return GLib.SOURCE_REMOVE;
            });
        }

    }

    _restoreWindowStateAndGeometryOnWayland(open_window, saved_window_session, cbFunc) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            let frameRect = open_window.get_frame_rect();
            let current_x = frameRect.x;
            let current_y = frameRect.y;
            let current_width = frameRect.width;
            let current_height = frameRect.height;
            // if x, y width and height all 0, the window probably still not be full rendered, recheck
            if (current_x === 0 &&
                current_y === 0 &&
                current_width === 0 &&
                current_height === 0) 
            {
                return GLib.SOURCE_CONTINUE;
            }

            // In `journalctl /usr/bin/gnome-shell` still has the below error, looks harmless, ignore it:
            // meta_window_set_stack_position_no_sync: assertion 'window->stack_position >= 0' failed
            this._restoreWindowGeometry(open_window, saved_window_session);

            // The window can't be moved due to previous reason, change workspace if necessary.
            const desktop_number = saved_window_session.desktop_number;
            const current_workspace = open_window.get_workspace();
            if (desktop_number !== current_workspace.index()) {
                open_window.change_workspace_by_index(desktop_number, false);
            }

            if (cbFunc) {
                cbFunc();
            }
            return GLib.SOURCE_REMOVE;
        });
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
        for (let i = workspaceManager.n_workspaces; i <= workspaceNumber; i++) {
            workspaceManager.append_new_workspace(false, 0);
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

        if (this._connectIds) {
            this._connectIds.forEach((obj, id) => {
                obj.disconnect(id);
            });
            this._connectIds = null;
        }

    }

}
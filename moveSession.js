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

            try {
                this._restoreMonitor(open_window, saved_window_session);

                this._restoreWindowGeometry(open_window, saved_window_session);

                this._createEnoughWorkspace(desktop_number);

                // Sticky windows don't need moving, in fact moving would unstick them
                // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-41/js/ui/windowManager.js#L1070
                const is_sticky = saved_window_session.window_state.is_sticky;
                if (is_sticky && open_window.is_on_all_workspaces()) {
                    this._log.debug(`The window '${shellApp.get_name()} - ${title}' is already sticky on workspace ${desktop_number}`);
                } else {
                    this._log.debug(`Auto move ${shellApp.get_name()} - ${title} to workspace ${desktop_number} from ${open_window.get_workspace().index()}`);
                    open_window.change_workspace_by_index(desktop_number, false);
                }

                // restore window state if necessary due to moving windows could lost window state
                this._restoreWindowState(open_window, saved_window_session);

            } catch (e) {
                // I just don't want one failure breaks the loop 

                this._log.error(e, `Failed to move window ${title} for ${shellApp.get_name()} automatically`);
            }
            saved_window_session.moved = true;
        }

    }

    /**
     * We need to move the window before changing the workspace, because
     * the move itself could cause a workspace change if the window enters
     * the primary monitor
     * 
     * @see https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-41/js/ui/workspace.js#L1483
     */
    _restoreMonitor(metaWindow, saved_window_session) {
        const currentMonitorNumber = metaWindow.get_monitor();
        // -1 if the window has been recently unmanaged and does not have a monitor
        if (currentMonitorNumber === -1) {
            return;
        }

        const primaryMonitorIndex = global.display.get_primary_monitor()

        const toMonitorNumber = saved_window_session.monitor_number;
        if (toMonitorNumber === undefined) {
            if (currentMonitorNumber !== primaryMonitorIndex) {
                this._log.info(`${shellApp.get_name()} - ${metaWindow.get_title()} doesn't have the monitor number data, click the save open windows button to save it. Moving it to the primary monitor ${primaryMonitorIndex} from ${currentMonitorNumber}`);
                metaWindow.move_to_monitor(primaryMonitorIndex);
            }
            return;
        }

        const shellApp = this._windowTracker.get_window_app(metaWindow);

        // It's possible to save the unmanaged windows
        if (toMonitorNumber === -1) {
            if (currentMonitorNumber !== primaryMonitorIndex) {
                this._log.info(`${shellApp.get_name()} - ${metaWindow.get_title()} is unmanaged when saving, moving it to the primary monitor ${primaryMonitorIndex} from ${currentMonitorNumber}`);
                metaWindow.move_to_monitor(primaryMonitorIndex);
            }
            return;
        }

        const is_on_primary_monitor = saved_window_session.is_on_primary_monitor;
        if (is_on_primary_monitor) {
            if (currentMonitorNumber !== primaryMonitorIndex) {
                this._log.info(`Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to the primary monitor ${primaryMonitorIndex} from ${currentMonitorNumber}`);
                metaWindow.move_to_monitor(primaryMonitorIndex);
            }
            return;
        }
        
        // It causes Gnome shell to crash, if we move a monitor to a non-existing monitor on X11 and Wayland!
        // We move all windows on non-existing monitors to the primary monitor
        const totalMonitors = global.display.get_n_monitors()
        if (toMonitorNumber > totalMonitors - 1) {
            if (currentMonitorNumber !== primaryMonitorIndex) {
                this._log.info(`Monitor ${toMonitorNumber} doesn't exist. Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to the primary monitor ${primaryMonitorIndex} from ${currentMonitorNumber}`);
                metaWindow.move_to_monitor(primaryMonitorIndex);
            }
            return;
        }

        if (currentMonitorNumber !== toMonitorNumber) {
            this._log.debug(`Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to monitor ${toMonitorNumber} from ${currentMonitorNumber}`);
            // So, you don't want to unplug the monitor, which we are moving the window in to, at this moment. 🤣
            metaWindow.move_to_monitor(toMonitorNumber);
            return;
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

        this._restoreMonitor(metaWindow, saved_window_session);

        const desktop_number = saved_window_session.desktop_number;
        this._createEnoughWorkspace(desktop_number);
        if (this._log.isDebug()) {
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            this._log.debug(`CEWM: Moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to workspace ${desktop_number} from ${metaWindow.get_workspace().index()}`);
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
                this._restoreMonitor(metaWindow, saved_window_session);
                this._restoreWindowGeometry(metaWindow, saved_window_session);
                const desktop_number = saved_window_session.desktop_number;
                // It's necessary to move window again to ensure an app goes to its own workspace.
                // In a sort of situation, some apps probably just don't want to move when call createEnoughWorkspaceAndMoveWindows() from `Meta.Display::window-created` signal.
                this._createEnoughWorkspace(desktop_number);
                const shellApp = this._windowTracker.get_window_app(metaWindow);
                const is_sticky = saved_window_session.window_state.is_sticky;
                if (is_sticky && metaWindow.is_on_all_workspaces()) {
                    this._log.debug(`The window '${shellApp.get_name()} - ${metaWindow.get_title()}' is already sticky on workspace ${desktop_number}`);
                } else {
                    this._log.debug(`MWMW: Moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to workspace ${desktop_number} from ${metaWindow.get_workspace().index()}`);
                    metaWindow.change_workspace_by_index(desktop_number, false);
                }
                // The window state get lost during moving the window, and we need to restore window state again.
                this._restoreWindowState(metaWindow, saved_window_session);

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
                        this._log.debug(`The window '${shellApp?.get_name()} - ${title}' is already on workspace ${desktop_number}`);
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
        this._restoreWindowState(metaWindow, saved_window_session);
        this._restoreWindowGeometry(metaWindow, saved_window_session);
    }

    _restoreWindowState(metaWindow, saved_window_session) {
        // window state
        const window_state = saved_window_session.window_state;
        if (window_state.is_above) {
            if (!metaWindow.is_above()) {
                this._log.debug(`Making ${metaWindow.get_title()} above`);
                metaWindow.make_above();
            }
        }
        if (window_state.is_sticky) {
            if (!metaWindow.is_on_all_workspaces()) {
                this._log.debug(`Making ${metaWindow.get_title()} sticky`);
                metaWindow.stick();
            }
        }

        const savedMetaMaximized = window_state.meta_maximized;
        // Maximize a window to take up all of the space
        if (savedMetaMaximized === Meta.MaximizeFlags.BOTH) {
            const currentMetaMaximized = metaWindow.get_maximized();
            if (currentMetaMaximized !== Meta.MaximizeFlags.BOTH) {
                this._log.debug(`Maximizing ${metaWindow.get_title()}`);
                metaWindow.maximize(savedMetaMaximized);
            }
        }

    }

    /**
     * @see https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en
     */
    _restoreWindowGeometry(metaWindow, saved_window_session) {
        const window_state = saved_window_session.window_state;
        const savedMetaMaximized = window_state.meta_maximized;
        if (savedMetaMaximized !== Meta.MaximizeFlags.BOTH) {
            // It can't be resized if current window is in maximum mode, including vertically maximization along the left and right sides of the screen
            const currentMetaMaximized = metaWindow.get_maximized();
            if (currentMetaMaximized) {
                metaWindow.unmaximize(currentMetaMaximized);
            }
        }

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
                current_height !== to_height) {
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
                GLib.Source.remove(sourceId);
            });
            this._sourceIds = null;
        }

        if (this._windowTracker) {
            this._windowTracker = null;
        }

    }

}
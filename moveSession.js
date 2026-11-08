function __awsmIsWayland() {
    if (typeof Meta.is_wayland_compositor === 'function')
        return __awsmIsWayland();
    return global.context.get_wayland_compositor() !== null;
}
'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as UiHelper from './ui/uiHelper.js';

import * as FileUtils from './utils/fileUtils.js';
import * as Log from './utils/log.js';
import * as DateUtils from './utils/dateUtils.js';
import {PrefsUtils} from './utils/prefsUtils.js';
import { PREFS_SETTING_ALWAYS_PLACE_WINDOWS, PREFS_SETTING_AUTORESTORE_SESSIONS } from './constants.js';
import { shellVersion } from './shellVersion.js';
import {
    ALL_WORKSPACES_DESKTOP_NUMBER,
    resolvePlaceDelayMs,
    ruleMatchesApp,
    sessionPlaceDelayMs,
    titleMatchesRule,
} from './model/placeRule.js';

// Mutter applies unmaximize on a later frame. Restoring geometry in the same
// turn is ignored on Wayland. https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/25
const UNMAXIMIZE_BEFORE_GEOMETRY_RESTORE_MS = 500;

import {WindowTilingSupport} from './windowTilingSupport.js';


export const MoveSession = class {

    constructor() {
        this._log = new Log.Log();

        this.sessionName = FileUtils.default_sessionName;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();

        this._sourceIds = [];

        this._delayRestoreGeometryId = 0;

        this._placeRulesCache = null;
        this._loggedMissingPlaceSession = false;

    }

    async moveWindows(sessionName) {
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

            // TODO Use global.get_window_actors(); / Meta.get_window_actors() / display.list_all_windows() instead and then call this.moveWindowByMetaWindow() and then can remove this.moveWindowsByShellApp()?
            await this.moveApps(session_config_objects);
        }

    }

    async moveApps(session_config_objects) {
        try {
            const running_apps = this._defaultAppSystem.get_running();
            for (const shellApp of running_apps) {
                await this.moveWindowsByShellApp(shellApp, session_config_objects);
            }   
        } catch (error) {
            Log.Log.getDefault().error(error);
        }
    }

    async moveWindowsByShellApp(shellApp, saved_window_sessions) {
        try {
            const interestingWindows = this._getAutoMoveInterestingWindows(shellApp, saved_window_sessions);
        
            if (!interestingWindows.length) {
                return;
            }
        
            for (const interestingWindow of interestingWindows) {
                const metaWindow = interestingWindow.open_window;
                if (UiHelper.ignoreWindows(metaWindow)) continue;
    
                const saved_window_session = interestingWindow.saved_window_session;
                const title = metaWindow.get_title();
                const desktop_number = saved_window_session.desktop_number;
    
                try {
                    await this._restoreWindowStates(metaWindow, saved_window_session);
                    this._createEnoughWorkspace(desktop_number);
    
                    // Sticky windows don't need moving, in fact moving would unstick them
                    // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-41/js/ui/windowManager.js#L1070
                    const is_sticky = saved_window_session.window_state.is_sticky;
                    if (is_sticky && metaWindow.is_on_all_workspaces()) {
                        this._log.debug(`The window '${shellApp.get_name()} - ${title}' is already sticky on workspace ${desktop_number}`);
                    } else {
                        this._log.debug(`Auto move ${shellApp.get_name()} - ${title} to workspace ${desktop_number} from ${metaWindow.get_workspace().index()}`);
                        this._changeWorkspace(metaWindow, desktop_number);
                    }
    
                    // restore window state if necessary due to moving windows could lost window state
                    this._restoreWindowState(metaWindow, saved_window_session);
    
                } catch (e) {
                    // I just don't want one failure breaks the loop
    
                    this._log.error(e, `Failed to move window ${title} for ${shellApp.get_name()} automatically`);
                }
                saved_window_session.moved = true;
            }   
        } catch (error) {
            this._log.error(error, shellApp ? shellApp.get_name() : 'This app may be closed.');
        }
    }

    // Inspired by https://github.com/Leleat/Tiling-Assistant/blob/main/tiling-assistant%40leleat-on-github/src/extension/resizeHandler.js
    _restoreTiling(metaWindow, saved_window_session) {
        WindowTilingSupport.prepareToTile(metaWindow, saved_window_session.window_tiling);
    }

    /**
     * We need to move the window to the monitor it belongs before moving it to the workspace, because
     * the move itself could cause a workspace change if the window enters
     * the primary monitor
     * 
     * @see https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-41/js/ui/workspace.js#L1497
     */
    async _restoreMonitor(metaWindow, saved_window_session) {
        const currentMonitorIndex = metaWindow.get_monitor();
        // -1 if the window has been recently unmanaged and does not have a monitor
        if (currentMonitorIndex === -1) {
            return Promise.resolve(metaWindow);
        }

        const shellApp = this._windowTracker.get_window_app(metaWindow);
        const primaryMonitorIndex = global.display.get_primary_monitor()
        const savedMonitorIndex = saved_window_session.monitor_number;

        let toMonitorIndex = null;
        if (savedMonitorIndex === undefined) {
            if (currentMonitorIndex !== primaryMonitorIndex) {
                this._log.info(`${shellApp.get_name()} - ${metaWindow.get_title()} doesn't have the monitor number data, click the save open windows button to save it. Moving it to the primary monitor ${primaryMonitorIndex} from ${currentMonitorIndex}`);
                toMonitorIndex = primaryMonitorIndex;
            }
        }
        // It's possible to save the unmanaged windows
        else if (savedMonitorIndex === -1) {
            if (currentMonitorIndex !== primaryMonitorIndex) {
                this._log.info(`${shellApp.get_name()} - ${metaWindow.get_title()} is unmanaged when saving, moving it to the primary monitor ${primaryMonitorIndex} from ${currentMonitorIndex}`);
                toMonitorIndex = primaryMonitorIndex;
            }
        }
        else if (saved_window_session.is_on_primary_monitor) {
            if (currentMonitorIndex !== primaryMonitorIndex) {
                this._log.info(`Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to the primary monitor ${primaryMonitorIndex} from ${currentMonitorIndex}`);
                toMonitorIndex = primaryMonitorIndex;
            }
        }
        // It causes Gnome shell to crash, if we move a monitor to a non-existing monitor on X11 and Wayland!
        // We move all windows on non-existing monitors to the primary monitor
        else if (savedMonitorIndex > global.display.get_n_monitors() - 1) {
            if (currentMonitorIndex !== primaryMonitorIndex) {
                this._log.info(`Monitor ${savedMonitorIndex} doesn't exist. Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to the primary monitor ${primaryMonitorIndex} from ${currentMonitorIndex}`);
                toMonitorIndex = primaryMonitorIndex;
            }
        }
        else if (currentMonitorIndex !== savedMonitorIndex) {
            this._log.debug(`Moving ${shellApp.get_name()} - ${metaWindow.get_title()} to monitor ${savedMonitorIndex} from ${currentMonitorIndex}`);
            // So, you don't want to unplug the monitor, which we are moving the window in to, at this moment. 🤣
            toMonitorIndex = savedMonitorIndex;
        }

        if (toMonitorIndex != null) {
            return new Promise((resolve, reject) => {
                // MetaWindow.move_to_monitor() can no longer be assumed to have updated the monitor on return, as under wayland
                // Wait for the monitor change to take effect
                // See: https://gitlab.gnome.org/GNOME/gnome-shell/-/commit/1cb01ec5b139da136cac665fc705e4ddd1d926a1
                const id = global.display.connect('window-entered-monitor',
                    (dsp, num, w) => {
                        if (w === metaWindow)
                            global.display.disconnect(id);
                        resolve(metaWindow);
                    });
                metaWindow.move_to_monitor(toMonitorIndex);
            });
        }
        
        return Promise.resolve(metaWindow);
    }

    async createEnoughWorkspaceAndMoveWindows(metaWindow, saved_window_sessions) {
        try {
            if (UiHelper.ignoreWindows(metaWindow)) return null;

            const saved_window_session = this._getOneMatchedSavedWindow(metaWindow, saved_window_sessions);
            if (!saved_window_session) {
                return null;
            }
    
            if (saved_window_session.moved) {
                this._restoreWindowStates(metaWindow, saved_window_session);
                return saved_window_session;
            }
    
            await this._restoreMonitor(metaWindow, saved_window_session);
    
            const desktop_number = saved_window_session.desktop_number;
            this._createEnoughWorkspace(desktop_number);
            if (this._log.isDebug()) {
                const shellApp = this._windowTracker.get_window_app(metaWindow);
                this._log.debug(`CEWM: Moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to workspace ${desktop_number} from ${metaWindow.get_workspace().index()}`);
            }
            this._changeWorkspace(metaWindow, desktop_number);
            return saved_window_session;   
        } catch (error) {
            this._log.error(error, metaWindow ? metaWindow.get_title() : 'This window may be destroyed.');
        }
    }

    async moveWindowByMetaWindow(metaWindow, saved_window_sessions) {
        try {
            if (UiHelper.ignoreWindows(metaWindow)) return;

            const saved_window_session = this._getOneMatchedSavedWindow(metaWindow, saved_window_sessions);
            if (!saved_window_session) {
                return;
            }

            if (saved_window_session.moved) {
                await this._restoreWindowStates(metaWindow, saved_window_session);
            } else {
                await this._restoreWindowStates(metaWindow, saved_window_session);
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
                    this._changeWorkspace(metaWindow, desktop_number);
                }
                // The window state get lost during moving the window, and we need to restore window state again.
                this._restoreWindowState(metaWindow, saved_window_session);

                saved_window_session.moved = true;
            }
        } catch (error) {
            this._log.error(error, metaWindow ? metaWindow.get_title() : 'This window may be destroyed.');
        }
    }

    _changeWorkspace(metaWindow, desktop_number) {
        const currentFocusedWindow = global.display.get_focus_window();
        metaWindow.change_workspace_by_index(desktop_number, false);
        if (currentFocusedWindow === metaWindow && !Main.layoutManager._inOverview) {
            this._log.debug(`Following the previous focused window ${metaWindow.get_title()}`);
            Main.activateWindow(metaWindow, DateUtils.get_current_time());
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

            if (windows_count === 1 || titleMatchesRule(saved_window_session, title)) {
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
     * Restore varies window states, including:
     * * window states, such as Always on Top, Always on Visible Workspace
     * * window geometry
     * * window tiling
     * 
     * @see https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en
     */
    async _restoreWindowStates(metaWindow, saved_window_session, markToMoved = false) {
        try {
            if (UiHelper.ignoreWindows(metaWindow)) return;

            await this._restoreMonitor(metaWindow, saved_window_session);
            this._restoreWindowState(metaWindow, saved_window_session);
            this._restoreWindowGeometry(metaWindow, saved_window_session);
            this._restoreTiling(metaWindow, saved_window_session);
            if (markToMoved) {
                saved_window_session.moved = true;
            }
        } catch (error) {
            this._log.error(error, metaWindow ? metaWindow.get_title() : 'This window may be destroyed.');
        }
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
        if (shellVersion >= 49) {
            // Maximize a window to take up all of the space
            if (savedMetaMaximized) {
                const currentMetaMaximized = metaWindow.is_maximized();
                if (!currentMetaMaximized) {
                    this._log.debug(`Maximizing ${metaWindow.get_title()}`);
                    metaWindow.maximize();
                }
            }
        } else {
            // Maximize a window to take up all of the space
            if (savedMetaMaximized === Meta.MaximizeFlags.BOTH) {
                const currentMetaMaximized = metaWindow.get_maximized();
                if (currentMetaMaximized !== Meta.MaximizeFlags.BOTH) {
                    this._log.debug(`Maximizing ${metaWindow.get_title()}`);
                    metaWindow.maximize(savedMetaMaximized);
                }
            }
        }

    }

    /**
     * @see https://help.gnome.org/users/gnome-help/stable/shell-windows-maximize.html.en
     */
    _restoreWindowGeometry(metaWindow, saved_window_session) {
        let delay = false;
        const window_state = saved_window_session.window_state;
        const savedMetaMaximized = window_state.meta_maximized;
        if (shellVersion >= 49) {
            if (!savedMetaMaximized) {
                // It can't be resized if current window is in maximum mode, including vertically maximization along the left and right sides of the screen
                const currentMetaMaximized = metaWindow.is_maximized();
                if (currentMetaMaximized) {
                    metaWindow.set_unmaximize_flags(Meta.MaximizeFlags.BOTH);
                    metaWindow.unmaximize();
                    if (__awsmIsWayland() && !currentMetaMaximized) {
                        delay = true;
                    }
                }
            }
        } else {
            if (savedMetaMaximized !== Meta.MaximizeFlags.BOTH) {
                // It can't be resized if current window is in maximum mode, including vertically maximization along the left and right sides of the screen
                const currentMetaMaximized = metaWindow.get_maximized();
                if (currentMetaMaximized) {
                    metaWindow.unmaximize(currentMetaMaximized);
                    if (__awsmIsWayland() && currentMetaMaximized !== Meta.MaximizeFlags.BOTH) {
                        delay = true;
                    }
                }
            }
        }

        if (delay) {
            // Fix: https://github.com/nlpsuge/gnome-shell-extension-another-window-session-manager/issues/25
            // TODO Note that this is not a perfect solution to address the above issue.
            // Per-call id so two windows placing at once do not cancel each other.
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_BEFORE_GEOMETRY_RESTORE_MS, () => {
                this._moveResizeFrame(metaWindow, saved_window_session);
                return GLib.SOURCE_REMOVE;
            });
            this._sourceIds.push(id);
        } else {
            this._moveResizeFrame(metaWindow, saved_window_session);
        }
    }

    _moveResizeFrame(metaWindow, saved_window_session) {
        const window_position = saved_window_session.window_position;
        if (window_position.provider === 'Meta') {
            const to_x = window_position.x_offset;
            const to_y = window_position.y_offset;
            const to_width = window_position.width;
            const to_height = window_position.height;

            const currentMonitor = metaWindow.get_monitor();
            const rectWorkArea = metaWindow.get_work_area_for_monitor(currentMonitor);
            
            // For more info about the below issue see also: https://github.com/Leleat/Tiling-Assistant/blob/1e4176a9a7037ee5dd0612e4c9f9dbe45d4e67cf/tiling-assistant%40leleat-on-github/src/extension/tilingWindowManager.js#L186-L199
            
            // Move first. Just in case that some apps can only be resized but not moved after `metaWindow.move_resize_frame()`
            metaWindow.move_frame(true, to_x, to_y);
            metaWindow.move_resize_frame(
                // Set `user_op` to true to fix an issue that a window does not move to negative x (like -176),
                // in which case if `user_op` is false it will move to (0,Y,W,H).
                true, // user_op
                to_x,
                
                // Fix the below issue:
                // No rect to clip to found!
                // No rect whose size to clamp to found!

                // Window might flies outside of the screen when resizing due to 
                // the y axis of the saved window is less than the one of work area, see:
                // https://gitlab.gnome.org/GNOME/mutter/-/issues/1461
                // https://gitlab.gnome.org/GNOME/mutter/-/issues/1499

                Math.max(to_y, rectWorkArea.y),
                to_width,
                to_height);
        }
    }

    _getAutoMoveInterestingWindows(shellApp, saved_window_sessions) {
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
                if (open_window.get_wm_class() != saved_window_session.wm_class) {
                    return;
                }

                const title = open_window.get_title();
                const windows_count = saved_window_session.windows_count;
                const open_window_workspace_index = open_window.get_workspace().index();
                const desktop_number = saved_window_session.desktop_number;

                if (windows_count === 1 || titleMatchesRule(saved_window_session, title)) {
                    if (open_window_workspace_index === desktop_number) {
                        this._log.debug(`The window '${title}' is already on workspace ${desktop_number} for ${shellApp.get_name()}`);
                        this._restoreWindowStates(open_window, saved_window_session, true);
                    } else {
                        autoMoveInterestingWindows.push({
                            open_window: open_window,
                            saved_window_session: saved_window_session
                        });
                    }
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

    /**
     * Match a newly created window against the session named by
     * `autorestore-sessions`. Does not launch anything. Returns null when the
     * option is off, the app is not in the file, or several entries exist and
     * the title has not settled on one of them yet.
     */
    matchPlaceRule(metaWindow) {
        const loaded = this._loadAlwaysPlaceRules();
        if (!loaded) {
            return null;
        }
        if (UiHelper.ignoreWindows(metaWindow)) {
            // TEMP DEBUG: why a second window of the same app is skipped.
            UiHelper.logPlaceCandidate(metaWindow, 'match-skip ignored', this._windowTracker);
            return null;
        }

        const shellApp = this._windowTracker.get_window_app(metaWindow);
        if (!shellApp) {
            return null;
        }

        const appId = shellApp.get_id();
        const wmClass = metaWindow.get_wm_class();
        const title = metaWindow.get_title() || '';
        const indexed = [];
        loaded.rules.forEach((rule, index) => {
            if (ruleMatchesApp(rule, appId, wmClass)) {
                indexed.push({rule, index});
            }
        });
        if (!indexed.length) {
            return null;
        }

        const exactHits = indexed.filter(({rule}) => rule.window_title && rule.window_title === title);
        let chosen = null;
        let how = '';
        if (exactHits.length >= 1) {
            chosen = exactHits[0];
            how = `title-hit rule#${chosen.index}`;
        } else if (indexed.length === 1) {
            chosen = indexed[0];
            how = `single-rule rule#${chosen.index}`;
        } else {
            const patternHits = indexed.filter(({rule}) => titleMatchesRule(rule, title));
            if (patternHits.length >= 1) {
                chosen = patternHits[0];
                how = `pattern-hit rule#${chosen.index}`;
            } else {
                // TEMP DEBUG: several saved entries, title matches none yet.
                UiHelper.logPlaceCandidate(metaWindow, `match-pending ${indexed.length}-rules-no-title-hit`, this._windowTracker);
                return null;
            }
        }

        // TEMP DEBUG: which saved entry this window will be forced into.
        UiHelper.logPlaceCandidate(metaWindow, `match-chosen ${how}`, this._windowTracker);

        return {
            rule: chosen.rule,
            key: `${loaded.path}#${chosen.index}`,
            delayMs: resolvePlaceDelayMs(loaded.sessionDelayMs, chosen.rule),
        };
    }

    async placeWindowFromRule(metaWindow, savedRule, delayMs) {
        try {
            if (!metaWindow || UiHelper.ignoreWindows(metaWindow)) {
                // TEMP DEBUG: window became a child/override-redirect during the delay.
                UiHelper.logPlaceCandidate(metaWindow, 'place-skip ignored', this._windowTracker);
                return;
            }

            const rule = {
                ...savedRule,
                window_position: savedRule.window_position ? {...savedRule.window_position} : undefined,
                window_state: savedRule.window_state ? {...savedRule.window_state} : {},
            };
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            this._log.info(`Placing ${shellApp?.get_name()} - ${metaWindow.get_title()} from saved rule (delay ${delayMs}ms)`);

            await this._restoreWindowStates(metaWindow, rule);

            const desktopNumber = rule.desktop_number;
            if (typeof desktopNumber === 'number' && desktopNumber > ALL_WORKSPACES_DESKTOP_NUMBER) {
                this._createEnoughWorkspace(desktopNumber);
                const isSticky = rule.window_state?.is_sticky;
                if (isSticky && metaWindow.is_on_all_workspaces()) {
                    this._log.debug(`The window '${metaWindow.get_title()}' is already sticky`);
                } else if (metaWindow.get_workspace()) {
                    this._log.debug(`Always-place: moving ${shellApp?.get_name()} - ${metaWindow.get_title()} to workspace ${desktopNumber} from ${metaWindow.get_workspace().index()}`);
                    this._changeWorkspace(metaWindow, desktopNumber);
                }
                this._restoreWindowState(metaWindow, rule);
            }
        } catch (error) {
            this._log.error(error, metaWindow ? metaWindow.get_title() : 'This window may be destroyed.');
        }
    }

    _loadAlwaysPlaceRules() {
        const settings = PrefsUtils.getSettings();
        if (!settings || !settings.get_boolean(PREFS_SETTING_ALWAYS_PLACE_WINDOWS)) {
            return null;
        }

        const sessionName = settings.get_string(PREFS_SETTING_AUTORESTORE_SESSIONS);
        if (!sessionName) {
            return null;
        }

        const path = GLib.build_filenamev([FileUtils.get_sessions_path(), sessionName]);
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
            if (!this._loggedMissingPlaceSession) {
                this._log.warn(`Always place is on, but session file was not found: ${path}`);
                this._loggedMissingPlaceSession = true;
            }
            return null;
        }
        this._loggedMissingPlaceSession = false;

        let mtime = 0;
        try {
            const info = Gio.File.new_for_path(path).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
            const tv = info.get_modification_time();
            mtime = tv.tv_sec * GLib.USEC_PER_SEC + tv.tv_usec;
        } catch (e) {
            this._log.error(e);
        }

        if (this._placeRulesCache && mtime && this._placeRulesCache.path === path && this._placeRulesCache.mtime === mtime) {
            return this._placeRulesCache;
        }

        try {
            const [ok, contents] = Gio.File.new_for_path(path).load_contents(null);
            if (!ok) {
                return null;
            }
            const session = FileUtils.getJsonObj(contents);
            const rules = Array.isArray(session.x_session_config_objects) ? session.x_session_config_objects : [];
            const sessionDelayMs = sessionPlaceDelayMs(session);
            this._placeRulesCache = {path, mtime, rules, sessionDelayMs};
            this._log.debug(`Loaded ${rules.length} always-place rules from ${path}`);
            return this._placeRulesCache;
        } catch (e) {
            this._log.error(e);
            return null;
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

        if (this._delayRestoreGeometryId) {
            GLib.Source.remove(this._delayRestoreGeometryId);
            this._delayRestoreGeometryId = 0;
        }

    }

}
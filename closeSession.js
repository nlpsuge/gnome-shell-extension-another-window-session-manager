'use strict';

const { Meta, Shell, Gio, GLib } = imports.gi;

const Main = imports.ui.main;

const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;
const SubprocessUtils = Me.imports.utils.subprocessUtils;
const DateUtils = Me.imports.utils.dateUtils;

const Constants = Me.imports.constants;

const UiHelper = Me.imports.ui.uiHelper;


var CloseSession = class {
    constructor() {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this._skip_app_with_multiple_windows = true;
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._subprocessLauncher = new Gio.SubprocessLauncher({
            flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE)});

        // TODO Put into Settings
        // All apps in the whitelist should be closed safely, no worrying about lost data
        this.whitelist = ['org.gnome.Terminal.desktop', 'org.gnome.Nautilus.desktop', 'smplayer.desktop'];
    }

    /**
     * 
     * @param {boolean} workspacePersistent Whether to make the workspaces persistent or not
     * @param {int} workspace               The workspace index to close, starting from 0.
     *                                      Pass `-1` to close the current workspace, 
     *                                      `null` or `undefined` to close all windows on all workspaces.
     * @returns {hasRunningApps: the number of the current running apps}
     */
    async closeWindows(workspacePersistent, workspaceIndex) {
        try {
            let onWhichWorkspaceLog;
            if (workspaceIndex === -1) {
                onWhichWorkspaceLog = 'on current workspace';
            } else if (workspaceIndex) {
                onWhichWorkspaceLog = `on ${Meta.prefs_get_workspace_name(workspaceIndex)}`;
            } else {
                onWhichWorkspaceLog = 'on all workspace';
            }
            this._log.info(`Closing open windows ${onWhichWorkspaceLog}`);

            if (workspacePersistent) this._updateWorkspacePersistent(true);

            let [running_apps_closing_by_rules, new_running_apps] = this._getRunningAppsClosingByRules(workspaceIndex);
            for(const app of running_apps_closing_by_rules) {
                await this._tryCloseAppsByRules(app);
            }
            
            let promises = [];
            for (const app of new_running_apps) {
                const promise = new Promise((resolve, reject) => {
                    this._log.info(`Closing ${app.get_name()}`);
                    this._closeOneApp(app, workspaceIndex).then(([closed, reason]) => {
                        try {
                            if (closed) {
                                this._log.info(`Closed ${app.get_name()}`);
                            } else {
                                this._log.warn(`Can not close ${app.get_name()} because ${reason}`);
                                app._cannot_close_reason = reason;
                            }
                            resolve();   
                        } catch (error) {
                            this._log.error(error);
                            reject(error);
                        }
                    });
                });
                promises.push(promise);
            }

            await Promise.all(promises).catch(error => {
                this._log.error(error);
            });

            this._updateWorkspacePersistent(false);

            return {
                hasRunningApps: this._defaultAppSystem.get_running().length
            };
        } catch (error) {
            this._log.error(error);
        }
    }

    _updateWorkspacePersistent(allPersistent) {
        if (Meta.prefs_get_dynamic_workspaces()) {
            // Starting from the right
            let workspaceManager = global.workspace_manager;
            for (let i = workspaceManager.n_workspaces - 2; i >= 0; i--) {
                const workspace = workspaceManager.get_workspace_by_index(i);
                if (allPersistent) {
                    // Before closing windows, make all workspace persistent.
                    workspace._keepAliveId = true;
                } else if (!workspace.n_windows) {
                    // If there is no window on it, make the workspace non-persistent, and the workspace will be removed automatically
                    workspace._keepAliveId = false;
                } else {
                    // Until find the workspace with windows. This keeps the workspace index of unclosed windows unchanged.
                    break;
                }
            }
        }
    }

    /**
     * * If the `app` has multiple windows, only delete those windows that their type are dialog (See UiHelper.isDialog(window))
     *   * If the `app` is in the whitelist, which means the app can close safely, delete all its windows.
     * * If a window can not close, leave it open.
     * 
     * @param {Shell.App} app 
     * @returns true if this `app` is closed, otherwise return false which means it still has unclosed windows
     */
    async _closeOneApp(app, workspaceIndex) {
        app._is_closing = true;
        let closed = true;
        let reason;
        try {
            if (app.get_n_windows() > 1) {
                const appInWhitelist = this.whitelist.includes(app.get_id());
                let windows = this._sortWindows(app);
                
                const windowsOnWorkspace = this._listWindowsOnWorkspace(workspaceIndex);
                if (windowsOnWorkspace) {
                    windows = windows.filter(w => windowsOnWorkspace.includes(w));
                }

                for (let i = windows.length - 1; i >= 0; i--) {
                    let window = windows[i];
                    if (!window.can_close()) {
                        closed = false;
                        reason = 'it has unclosable window(s)';
                        continue;
                    }
    
                    if (UiHelper.isDialog(window) 
                        || appInWhitelist 
                        || !this._skip_app_with_multiple_windows)
                    {
                        closed = await this._deleteWindow(app, window);
                        if (!closed) {
                            reason = 'it has at least one window still opening';
                        }
                    } else {
                        closed = false;
                        reason = 'it has multiple normal windows and does not in the whitelist';
                    }
                }
            }
                
            if (app.get_n_windows() === 1) {
                const window = app.get_windows()[0];
                closed = await this._quitApp(app, window);
                if (!closed) {
                    reason = 'it has at least one window still opening, maybe it is not closable or still closing';
                }
            }
        } catch (e) {
            closed = false;
            reason = `Error raised while closing app: ${e.message}`;
            this._log.error(e);
        } finally {
            app._is_closing = false;
        }

        return [closed, reason];
    }

    _deleteWindow(app, metaWindow) {
        return new Promise((resolve, reject) => {
            // We use 'windows-changed' here because a confirm window could be popped up
            const windowsChangedId = app.connect('windows-changed', () => {
                app.disconnect(windowsChangedId);
                resolve(app.get_n_windows() === 0);
            });
            metaWindow._aboutToClose = true;
            metaWindow.delete(DateUtils.get_current_time());
        });
    }

    // See the implement of `shell_app_request_quit` of gnome-shell
    _quitApp(app, metaWindow) {
        if (!metaWindow) {
            return Promise.resolve(true);
        }

        return new Promise((resolve, reject) => {
            // We use 'windows-changed' here because a confirm window might be popped up
            let windowsChangedId = app.connect('windows-changed', () => {
                app.disconnect(windowsChangedId);
                windowsChangedId = null;
                resolve(app.get_n_windows() === 0);
            });

            const quitAction = 'app.quit';
            if (app.action_group.has_action(quitAction)
                && !app.action_group.get_action_parameter_type(quitAction)) {
                metaWindow._aboutToClose = true;
                // Some apps have `app.quit` action, check them in `lg` via: Shell.AppSystem.get_default().get_running().forEach(a => log(a.get_name() + ': ' + a.action_group.has_action('app.quit')))
                app.action_group.activate_action(quitAction, null);
            } else if (metaWindow.can_close()) {
                metaWindow._aboutToClose = true;
                metaWindow.delete(DateUtils.get_current_time());
            }
            
            if (!metaWindow._aboutToClose) {
                if (windowsChangedId) app.disconnect(windowsChangedId);
                resolve(false);
            }
        });
    }

    async _tryCloseAppsByRules(app) {
        // TODO emit is-closing?
        app._is_closing = true;
        try {
            // Help close dialogs.
            // Or even might help close the app without sending keys further, for example if the apps
            // has one normal window and some attached dialogs. 
            this._log.info(`Closing ${app.get_name()}`);
            const [closed, reason] = await this._closeOneApp(app);
            if (closed) {
                this._log.warn(`${app.get_name()} has been closed`);
                return;
            }

            const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
            const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
            const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];

            if (rules?.type === 'shortcut') {
                let keycodesSegments = [];
                let shortcutsOriginal = [];
                for (const order in rules.value) {
                    const rule = rules.value[order];
                    let shortcut = rule.shortcut;
                    const linuxKeycodes = this._convertToLinuxKeycodes(rule);
                    const translatedLinuxKeycodes = linuxKeycodes.slice()
                                // Press keys
                                .map(k => k + ':1')
                                .concat(linuxKeycodes.slice()
                                    // Release keys
                                    .reverse().map(k => k + ':0'))
                    keycodesSegments.push(translatedLinuxKeycodes);
                    shortcutsOriginal.push(shortcut);
                }

                // Leave the overview first, so the keys can be sent to the activated windows
                if (Main.overview.visible) {
                    this._log.debug('Leaving Overview before applying rules to close windows');
                    await this._leaveOverview();
                }
                
                for (const linuxKeyCodes of keycodesSegments) {
                    await this._activateAndCloseWindows(app, linuxKeyCodes, shortcutsOriginal);
                }
            }
        } catch (e) {
            this._log.error(e);
        } finally {
            app._is_closing = false;
        }
    }

    _leaveOverview() {
        return new Promise((resolve, reject) => {
            const hiddenId = Main.overview.connect('hidden', () => {
                try {
                    Main.overview.disconnect(hiddenId);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
            Main.overview.hide();
        });
    }

    _convertToLinuxKeycodes(rule) {
        const state = rule.state;
        const keycode = rule.keycode;
        const controlRightPressed = rule.controlRightPressed;
        const shiftRightPressed = rule.shiftRightPressed;

        let keycodes = [];
        // Convert to key codes defined in /usr/include/linux/input-event-codes.h
        if (state & Constants.GDK_SHIFT_MASK) {
            if (shiftRightPressed) {
                // KEY_RIGHTSHIFT
                keycodes.push(54);
            } else {
                // KEY_LEFTSHIFT
                keycodes.push(42);
            }
        } 
        if (state & Constants.GDK_CONTROL_MASK) {
            if (controlRightPressed) {
                // KEY_RIGHTCTRL
                keycodes.push(97);
            } else {
                // KEY_LEFTCTRL
                keycodes.push(29);
            }
        } 
        if (state & Constants.GDK_ALT_MASK) {
            // KEY_LEFTALT
            keycodes.push(56);
        } 
        if (state & Constants.GDK_META_MASK) {
            // KEY_LEFTMETA
            keycodes.push(125);
        }
        // The Xorg keycodes are 8 larger than the Linux keycodes.
        // See https://wiki.archlinux.org/title/Keyboard_input#Identifying_keycodes_in_Xorg
        keycodes.push(keycode - 8);
        return keycodes;
    }

    async _activateAndCloseWindows(app, linuxKeyCodes, shortcutsOriginal) {
        try {
            const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
            const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
            const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];
            const keyDelay = rules?.keyDelay;
            const cmd = ['ydotool', 'key', '--key-delay', !keyDelay ? '0' : keyDelay + ''].concat(linuxKeyCodes);
            const cmdStr = cmd.join(' ');
            
            this._log.info(`Closing ${app.get_name()} by sending: ${cmdStr} (${shortcutsOriginal.join(' ')})`);
            
            this._activateAndFocusWindow(app);
            await SubprocessUtils.trySpawn(cmd, 
                (output) => {
                    this._log.info(`Succeed to send keys to close the windows of the previous app ${app.get_name()}. output: ${output}`);
                }, (output) => {
                    // TODO ydotool.service might be inactive due to any reason, we can try to start the service first and send the shortcuts again before notifying the the below failure to users
                    // In Fedora, start it via systemctl --user status ydotool.service
                    const msg = `Failed to send keys to close ${app.get_name()} via ydotool`;
                    this._log.error(new Error(`${msg}. output: ${output}`));
                    global.notify_error(`${msg}`, `${output}.`);
                }
            );
        } catch (e) {
            this._log.error(e);
        }
        
    }

    _getRunningAppsClosingByRules(workspaceIndex) {
        const running_apps = this._listRunningAppsOnWorkspace(workspaceIndex);
        if (!this._settings.get_boolean('enable-close-by-rules')) {
            return [[], running_apps];
        }

        let running_apps_closing_by_rules = [];
        let new_running_apps = [];
        for (const app of running_apps) {
            const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
            const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
            const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];
            if (!rules || !rules.enabled || !rules.value) {
                new_running_apps.push(app);
            } else {
                running_apps_closing_by_rules.push(app);
            }
        }

        return [running_apps_closing_by_rules, new_running_apps];
    }

    _listRunningAppsOnWorkspace(workspaceIndex) {
        let running_apps = [];

        const windows = this._listWindowsOnWorkspace(workspaceIndex);
        if (windows) {
            windows.forEach(w => {
                const app = Shell.WindowTracker.get_default().get_window_app(w);
                if (app) running_apps.push(app);
            });
        } else {
            running_apps = this._defaultAppSystem.get_running();
        }

        return running_apps;
    }

    _listWindowsOnWorkspace(workspaceIndex) {
        if (workspaceIndex === -1) {
            workspaceIndex = global.workspace_manager.get_active_workspace_index();
        }

        if (workspaceIndex) {
            const workspace = global.workspace_manager.get_workspace_by_index(workspaceIndex);
            return workspace.list_windows();
        }

        return null;
    }

    _activateAndFocusWindow(app) {
        let windows = this._sortWindows(app);
        const topLevelWindow = windows[windows.length - 1];
        if (topLevelWindow) {
            this._log.info(`Activating the running window ${topLevelWindow.get_title()} of ${app.get_name()}`);
            Main.activateWindow(topLevelWindow, DateUtils.get_current_time());
        }
    }

    _sortWindows(app) {
        if (app.get_n_windows() === 1) {
            return app.get_windows();
        }

        let windows;
        if (Meta.is_wayland_compositor()) {
            windows = this._sortWindowsOnWayland(app);
        } else {
            windows = this._sortWindowsOnX11(app);
        }
        return windows;
    }

    _sortWindowsOnWayland(app) {
        const windows = app.get_windows();
        windows.sort((w1, w2) => {
            const windowStableSequence1 = w1.get_stable_sequence();
            const windowStableSequence2 = w2.get_stable_sequence();
            return this._compareWindowStableSequence(windowStableSequence1, windowStableSequence2);
        });
        return windows;
    }

    _sortWindowsOnX11(app) {
        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        const savedWindowsMapping = savedWindowsMappingJsonStr === '{}' ? new Map() : new Map(JSON.parse(savedWindowsMappingJsonStr));

        const app_info = app.get_app_info();
        const key = app_info ? app_info.get_filename() : app.get_name();
        const xidObj = savedWindowsMapping.get(key);
        const windows = app.get_windows();
        windows.sort((w1, w2) => {

            // This happens when clicking the logout button but the system doesn't respond at all,
            // and in this case the endSessionDialog still emits the 'ConfirmedLogout' signal so the windows-mapping will be wiped out. 
            // I'm not sure why the system doesn't respond at all but still emits 'ConfirmedLogout' signal.
            // FYI: The logout progress could be delayed or blocked due to some reasons like maybe a application are still writing data to the disk etc. 
            if (!xidObj) {
                const windowStableSequence1 = w1.get_stable_sequence();
                const windowStableSequence2 = w2.get_stable_sequence();
                return this._compareWindowStableSequence(windowStableSequence1, windowStableSequence2);
            }
            
            const xid1 = w1.get_description();
            const value1 = xidObj[xid1];
            let windowStableSequence1;
            if (value1) {
                windowStableSequence1 = value1.windowStableSequence;
            } else {
                windowStableSequence1 = w1.get_stable_sequence();
                this._log.warn(`Mapping for this xid ${xid1} and stable sequence does not exist, use sequence ${windowStableSequence1} instead. app name: ${app.get_name()}, window title: ${w1.get_title()}`);
            }

            const xid2 = w2.get_description();
            const value2 = xidObj[xid2];
            let windowStableSequence2;
            if (value2) {
                windowStableSequence2 = value2.windowStableSequence;
            } else {
                windowStableSequence2 = w2.get_stable_sequence();
                this._log.warn(`Mapping for this xid ${xid2} and stable sequence does not exist, use sequence ${windowStableSequence2} instead. app name: ${app.get_name()}, window title: ${w2.get_title()}`);
            }

            return this._compareWindowStableSequence(windowStableSequence1, windowStableSequence2);
        });
        return windows;
    }

    _compareWindowStableSequence(windowStableSequence1, windowStableSequence2) {
        const diff = windowStableSequence1 - windowStableSequence2;
        if (diff === 0) {
            return 0;
        }

        if (diff > 0) {
            return 1;
        }

        if (diff < 0) {
            return -1;
        }
    }

    _skip_multiple_windows(shellApp) {
        if (shellApp.get_n_windows() > 1 && this._skip_app_with_multiple_windows) {
            const app_id = shellApp.get_id();
            if (this.whitelist.includes(app_id)) {
                this._log.debug(`${shellApp.get_name()} (${app_id}) in the whitelist. Closing it anyway.`);
                return false;
            }
            return true;
        }
        return false;
    }

    destroy() {
        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }
    }
    
}

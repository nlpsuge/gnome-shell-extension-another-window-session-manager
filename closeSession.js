'use strict';

const { Shell, Gio, GLib } = imports.gi;

const Main = imports.ui.main;
const Scripting = imports.ui.scripting;

const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;
const SubprocessUtils = Me.imports.utils.subprocessUtils;

const Constants = Me.imports.constants;


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

    closeWindows() {
        this._log.debug('Closing open windows');
        
        let workspaceManager = global.workspace_manager;
        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            // Make workspaces non-persistent, so they can be removed if no windows in it
            workspaceManager.get_workspace_by_index(i)._keepAliveId = false;
        }

        let [running_apps_closing_by_rules, new_running_apps] = this._getRunningAppsClosingByRules();
        this._tryCloseAppsByRules(running_apps_closing_by_rules);

        for (const app of new_running_apps) {
            this._closeOneApp(app);
        }

    }

    _closeOneApp(app) {
        if (this._skip_multiple_windows(app)) {
            this._log.debug(`Skipping ${app.get_name()} because it has more than one windows`);
        } else {
            this._log.debug(`Closing ${app.get_name()}`);
            app.request_quit();    
        }
    }

    _tryCloseAppsByRules(running_apps_closing_by_rules) {
        if (!running_apps_closing_by_rules || running_apps_closing_by_rules.length === 0) {
            return;
        } 

        const app = running_apps_closing_by_rules.shift();

        const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
        const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
        const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];

        if (rules.type === 'shortcut') {
            let shortcutsMixedWithKeycode = [];
            let shortcutsOriginal = [];
            for (const order in rules.value) {
                const rule = rules.value[order];
                let shortcut = rule.shortcut;
                if (rule.state === 0) {
                    shortcutsMixedWithKeycode.push(rule.keycode + '');
                } else {
                    // The shift key is not pressed, so convert the last key to the lowercase
                    // xdotool won't recognize it if the last key is uppercase
                    if (!(rule.state & Constants.GDK_SHIFT_MASK)) {
                        const keys = shortcut.split('+');
                        const lastKey = keys[keys.length - 1];
                        // Only handle letters which the length is 1, ignoring keys like Return, Escape etc.
                        if (lastKey.length === 1) {
                            keys[keys.length - 1] = lastKey.toLowerCase();
                            shortcut = keys.join('+');
                        }
                    }
                    
                    shortcutsMixedWithKeycode.push(shortcut);
                }
                shortcutsOriginal.push(shortcut);
            }

            // Leave the overview first, so the keys can be sent to the activated windows
            if (Main.overview.visible) {
                Main.overview.hide();
                const hiddenId = Main.overview.connect('hidden', 
                    () => {
                        Main.overview.disconnect(hiddenId);
                        this._activateAndCloseWindows(app, shortcutsMixedWithKeycode, shortcutsOriginal, running_apps_closing_by_rules);
                    });
            } else {
                this._activateAndCloseWindows(app, shortcutsMixedWithKeycode, shortcutsOriginal, running_apps_closing_by_rules);
            }
            
        }

    }

    _activateAndCloseWindows(app, shortcutsMixedWithKeycode, shortcutsOriginal, running_apps_closing_by_rules) {
        this._activateAndFocusWindow(app);
        const cmd = ['xdotool', 'key'].concat(shortcutsMixedWithKeycode);
        const cmdStr = cmd.join(' ');
        this._log.info(`Closing the app ${app.get_name()} by sending a shortcut ${shortcutsMixedWithKeycode.join(' ')}: ${cmdStr} (${shortcutsOriginal.join(' ')})`);

        SubprocessUtils.trySpawnAsync(cmd, (output) => {
            this._log.info(`Succeed to send keys to close the windows of the previous app ${app.get_name()}. output: ${output}`);
            this._tryCloseAppsByRules(running_apps_closing_by_rules);
        }, (output) => {
            this._log.info(`Failed to send keys to close the windows of the previous app ${app.get_name()}. output: ${output}`);
            // Fallback to close it again in the normal way
            this._closeOneApp(app);
            this._tryCloseAppsByRules(running_apps_closing_by_rules);
        });
    }

    _getRunningAppsClosingByRules() {
        if (!this._settings.get_boolean('enable-close-by-rules')) {
            return [[], this._defaultAppSystem.get_running()];
        }

        let running_apps_closing_by_rules = [];
        let new_running_apps = [];
        let running_apps = this._defaultAppSystem.get_running();
        for (const app of running_apps) {
            const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
            const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
            const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];
            if (!rules || !rules.enabled) {
                new_running_apps.push(app);
            } else {
                running_apps_closing_by_rules.push(app);
            }
        }

        return [running_apps_closing_by_rules, new_running_apps];
    }

    _activateAndFocusWindow(app) {
        this._log.info(`Activate the app ${app.get_name()}`);
        const windows = app.get_windows();
        Main.activateWindow(windows[0]);
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
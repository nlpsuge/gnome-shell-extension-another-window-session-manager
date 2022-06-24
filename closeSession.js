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

const OpenWindowsInfoTracker = Me.imports.openWindowsInfoTracker;

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
            app.get_windows().forEach(w => w._aboutToClose = true);
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

        if (rules?.type === 'shortcut') {
            let keycodesSegments = [];
            let shortcutsOriginal = [];
            let keycodes = [];
            for (const order in rules.value) {
                const rule = rules.value[order];
                let shortcut = rule.shortcut;
                let state = rule.state;
                let keycode = rule.keycode;
                const linuxKeycodes = this._convertToLinuxKeycodes(state, keycode);
                const translatedLinuxKeycodes = linuxKeycodes.slice()
                            // Press keys
                            .map(k => k + ':1')
                            .concat(linuxKeycodes.slice()
                                // Release keys
                                .reverse().map(k => k + ':0'))
                // keycodes = keycodes.concat(translatedLinuxKeycodes);
                keycodesSegments.push(translatedLinuxKeycodes);
                shortcutsOriginal.push(shortcut);
            }

            // Leave the overview first, so the keys can be sent to the activated windows
            if (Main.overview.visible) {
                Main.overview.hide();
                const hiddenId = Main.overview.connect('hidden', 
                    () => {
                        Main.overview.disconnect(hiddenId);
                        this._activateAndCloseWindows(app, keycodesSegments, shortcutsOriginal, running_apps_closing_by_rules);
                    });
            } else {
                this._activateAndCloseWindows(app, keycodesSegments, shortcutsOriginal, running_apps_closing_by_rules);
            }
            
        }

    }

    _convertToLinuxKeycodes(state, keycode) {
        let keycodes = [];
        // Convert to key codes defined in /usr/include/linux/input-event-codes.h
        if (state & Constants.GDK_SHIFT_MASK) {
            // KEY_LEFTSHIFT
            keycodes.push(42);
        } 
        if (state & Constants.GDK_CONTROL_MASK) {
            // KEY_LEFTCTRL
            keycodes.push(29);
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

    _activateAndCloseWindows(app, linuxKeyCodesSegments, shortcutsOriginal, running_apps_closing_by_rules) {
        if (!linuxKeyCodesSegments || linuxKeyCodesSegments.length === 0) {
            // Proceed the next rule
            this._tryCloseAppsByRules(running_apps_closing_by_rules);
            return;
        }
        const linuxKeyCodes = linuxKeyCodesSegments.shift();  
        const closeWindowsRules = this._prefsUtils.getSettingString('close-windows-rules');
        const closeWindowsRulesObj = JSON.parse(closeWindowsRules);
        const rules = closeWindowsRulesObj[app.get_app_info()?.get_filename()];
        const keyDelay = rules?.keyDelay;
        const cmd = ['ydotool', 'key', '--key-delay', !keyDelay ? '0' : keyDelay + ''].concat(linuxKeyCodes);
        const cmdStr = cmd.join(' ');
        
        this._log.info(`Closing the app ${app.get_name()} by sending: ${cmdStr} (${shortcutsOriginal.join(' ')})`);
        
        this._activateAndFocusWindow(app);
        SubprocessUtils.trySpawnAsync(cmd, (output) => {
            this._log.info(`Succeed to send keys to close the windows of the previous app ${app.get_name()}. output: ${output}`);
            this._activateAndCloseWindows(app, linuxKeyCodesSegments, shortcutsOriginal, running_apps_closing_by_rules);
        }, (output) => {
            this._log.info(`Failed to send keys to close the windows of the previous app ${app.get_name()}. output: ${output}`);
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
            if (!rules || !rules.enabled || !rules.value) {
                new_running_apps.push(app);
            } else {
                running_apps_closing_by_rules.push(app);
            }
        }

        return [running_apps_closing_by_rules, new_running_apps];
    }

    _activateAndFocusWindow(app) {
        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        const savedWindowsMapping = new Map(JSON.parse(savedWindowsMappingJsonStr));

        const app_info = app.get_app_info();
        const desktopFullPath = app_info.get_filename();
        const xidObj = savedWindowsMapping.get(desktopFullPath);
        const windows = app.get_windows();
        windows.sort((w1, w2) => {
            const xid1 = w1.get_description();
            const value1 = xidObj[xid1];
            const windowStableSequence1 = value1.windowStableSequence;

            const xid2 = w2.get_description();
            const value2 = xidObj[xid2];
            const windowStableSequence2 = value2.windowStableSequence;

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

        });

        const topLevelWindow = windows[windows.length - 1];
        this._log.info(`Activating the running window ${topLevelWindow.get_title()} of ${app.get_name()}`);
        Main.activateWindow(topLevelWindow);
        
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

'use strict';

const { Shell } = imports.gi;

const Main = imports.ui.main;

const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;

var enable_close_by_rules = true;

var CloseSession = class {
    constructor() {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();

        this._skip_app_with_multiple_windows = true;
        this._defaultAppSystem = Shell.AppSystem.get_default();
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

        let running_apps = this._defaultAppSystem.get_running();
        for (const app of running_apps) {
            if (this._tryCloseByRules(app)) {
                continue;
            }
            
            if (this._skip_multiple_windows(app)) {
                this._log.debug(`Skipping ${app.get_name()} because it has more than one windows`);
                continue;
            }
            this._log.debug(`Closing ${app.get_name()}`);
            app.request_quit();
        }

    }

    _tryCloseByRules(app) {
        if (!enable_close_by_rules) {
            return false;
        }

        const _rules = this._prefsUtils.getSettingString('close-windows-rules');
        const _rulesMap = new Map(JSON.parse(_rules));
        const shortCut = _rulesMap.get(`${app.get_id()}:${app.get_name()}`);
        if (shortCut) {
            const windows = app.get_windows();
            if (windows.length) {
                Main.activateWindow(windows[0]);
            } else {
                app.activate(global.get_current_time());
            }
            const cmd = `ydotool key ${shortCut}`
            this._log.info(`Closing the app ${app.get_name()} by sending a shortcut ${shortCut}: ${cmd}`);
            Util.trySpawnCommandLine(`${cmd}`);
            return true;
        }

        return false;
    }

    _skip_multiple_windows(shellApp) {
        if (shellApp.get_n_windows() > 1 && this._skip_app_with_multiple_windows) {
            const app_id = shellApp.get_id();
            if (this.whitelist.includes(app_id)) {
                this._log.debug(`${shellApp.get_name()} / ${app_id} in the whitelist.`);
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
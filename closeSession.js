'use strict';

const { Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const PrefsUtils = Me.imports.utils.prefsUtils;

var CloseSession = class {
    constructor() {
        this._prefsUtils = new PrefsUtils.PrefsUtils();

        this._skip_app_with_multiple_windows = true;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        // TODO Put into Settings
        // All apps in the whitelist should be closed safely, no worrying about lost data
        this.whitelist = ['org.gnome.Terminal.desktop', 'org.gnome.Nautilus.desktop', 'smplayer.desktop'];
    }

    closeWindows() {
        if (this._prefsUtils.isDebug()) {
            log('Closing open windows');
        }
        let running_apps = this._defaultAppSystem.get_running();
        for (const app of running_apps) {
            const app_name = app.get_name();
            if (this._skip_multiple_windows(app)) {
                if (this._prefsUtils.isDebug()) {
                    log(`Skipping ${app.get_name()} because it has more than one windows`);
                }
                continue;
            }
            if (this._prefsUtils.isDebug()) {
                log(`Closing ${app_name}`);
            }
            app.request_quit();
        }
    }

    _skip_multiple_windows(shellApp) {
        if (shellApp.get_n_windows() > 1 && this._skip_app_with_multiple_windows) {
            const app_id = shellApp.get_id();
            if (this.whitelist.includes(app_id)) {
                if (this._prefsUtils.isDebug()) {
                    log(`${shellApp.get_name()} / ${app_id} in the whitelist.`);
                }
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

        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }
    }
    
}
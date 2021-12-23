'use strict';

const { Shell } = imports.gi;

var CloseSession = class {
    constructor() {
        this._skip_app_with_multiple_windows = true;
        this._defaultAppSystem = Shell.AppSystem.get_default();
        this.whitelist = ['org.gnome.Terminal.desktop'];
    }

    closeWindows() {
        log('Closing open windows');
        let running_apps = this._defaultAppSystem.get_running();
        for (const app of running_apps) {
            const app_name = app.get_name();
            if (this._skip_multiple_windows(app)) {
                log(`Skipping ${app.get_name()} because it has more than one windows`);
                continue;
            }
            log(`Closing ${app_name}`);
            app.request_quit();
        }
    }

    _skip_multiple_windows(shellApp) {
        if (shellApp.get_n_windows() > 1 && this._skip_app_with_multiple_windows) {
            const app_id = shellApp.get_id();
            if (this.whitelist.includes(app_id)) {
                log(`${shellApp.get_name()} / ${app_id} in the whitelist.`);
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
    }
    
}
const { Shell } = imports.gi;

var CloseSession = class {
    constructor() {
        this._skip_app_with_multiple_windows = true;
        this._defaultAppSystem = Shell.AppSystem.get_default();
    }

    closeWindows() {
        log('Closing open windows');
        let running_apps = this._defaultAppSystem.get_running();
        for (const app of running_apps) {
            const app_name = app.get_name();
            if (this._skip_app_with_multiple_windows && app.get_n_windows() > 1) {
                log(`Skipping ${app.get_name()} because it has more than one windows`);
                continue;
            }
            log(`Closing ${app_name}`);
            app.request_quit();
        }
    }

    destroy() {
        if (this._defaultAppSystem) {
            this._defaultAppSystem = null;
        }
    }
    
}
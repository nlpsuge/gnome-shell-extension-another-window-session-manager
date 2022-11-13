'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsUtils = Me.imports.utils.prefsUtils;


var Log = class {

    constructor() {
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        
    }

    isDebug() {
        return this._prefsUtils.isDebug();
    }

    debug(logContent) {
        if (this.isDebug()) {
            log(`[DEBUG  ][Another window session manager] ${logContent}`);
        }
    }

    error(e, logContent) {
        if (!(e instanceof Error)) {
            e = new Error(e);
        }
        logError(e, `[ERROR  ][Another window session manager] ${logContent}`);
    }

    info(logContent) {
        log(`[INFO   ][Another window session manager] ${logContent}`);
    }

    warn(logContent) {
        log(`[WARNING][Another window session manager] ${logContent}`);
    }

    destroy() {
        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }

    }

}

'use strict';

import * as PrefsUtils from './prefsUtils.js';


export const Log = class {

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

    // Return a singleton instance
    static getDefault() {
        if (!Log._default) {
            Log._default = new Log();
        }
        return Log._default;
    }
    
    static destroyDefault() {
        if (Log._default) {
            Log._default.destroy();
            delete Log._default;
        }
    }

}

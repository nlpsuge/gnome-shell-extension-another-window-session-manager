'use strict';

import {PrefsUtils} from './prefsUtils.js';


export const Log = class {

    constructor() {
    }
    
    isDebug() {
        return PrefsUtils.isDebug();
    }

    isVerboseLogging() {
        return PrefsUtils.isVerboseLogging();
    }

    debug(logContent) {
        if (this.isDebug()) {
            log(`[DEBUG  ][Yet Another Window Session Manager] ${logContent}`);
        }
    }

    error(e, logContent) {
        if (!(e instanceof Error)) {
            e = new Error(e);
        }
        logError(e, `[ERROR  ][Yet Another Window Session Manager] ${logContent}`);
    }

    info(logContent) {
        if (this.isVerboseLogging()) {
            log(`[INFO   ][Yet Another Window Session Manager] ${logContent}`);
        }
    }

    warn(logContent) {
        log(`[WARNING][Yet Another Window Session Manager] ${logContent}`);
    }

    destroy() {

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

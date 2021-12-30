'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsUtils = Me.imports.utils.prefsUtils;


var Log = class {

    constructor() {
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        
    }

    debug(logContent) {
        if (this._prefsUtils.isDebug()) {
            log(`[Another window session manager] ${logContent}`);
        }
    }

    destroy() {
        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }

    }

}

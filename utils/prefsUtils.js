'use strict';


/**
 * This util has to be initialized via `_init()` from extension.js before be able to use.
 */
export const PrefsUtils = class {

    constructor() {
    }

    _init(extensionObject, settings) {
        this.extensionObject = extensionObject;
        this.settings = settings;
    }

    getSettingString(settingName) {
        return this.settings.get_string(settingName);
    }

    getSettings() {
        return this.settings;
    }

    getExtensionPath() {
        return this.extensionObject.path;
    }

    isDebug() {
        return this.settings.get_boolean('debugging-mode');
    }

    destroy() {
        this.settings = null;
        this.extensionObject = null;
    }
}

const prefsUtils = new PrefsUtils();
export default prefsUtils;

'use strict';

export let PrefsUtils = null;

export function prefsUtilsInit(extensionObject, settings) {
    const prefsUtils = new PrefsUtilsClass();
    prefsUtils._init(extensionObject, settings);
    PrefsUtils = prefsUtils;
}

/**
 * This util has to be initialized via `_init()` from extension.js before be able to use.
 */
const PrefsUtilsClass = class {

    constructor() {
    }

    _init(extensionObject, settings) {
        this.extensionObject = extensionObject;
        this.settings = settings;
        PrefsUtils = this;
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


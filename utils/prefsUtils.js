'use strict';

/**
 * The instance of the PrefsUtilsClass
 */
export let PrefsUtils = null;

/**
 * Initialize the PrefsUtilsClass from extension.js or prefs.js so that it can be used.
 * 
 * @param {*} extensionObject 
 * @param {*} settings 
 */
export function prefsUtilsInit(extensionObject, settings) {
    if (PrefsUtils) {
        return;
    }

    const prefsUtilsClass = new PrefsUtilsClass();
    prefsUtilsClass._init(extensionObject, settings);
    PrefsUtils = prefsUtilsClass;
}

/**
 * This class must be initialized using `prefsUtilsInit()` from extension.js or prefs.js before it can be used.
 */
const PrefsUtilsClass = class {

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


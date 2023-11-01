'use strict';

// import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

let Extension;
let _;
try {
    let extensionObj = await import('resource:///org/gnome/shell/extensions/extension.js');
    Extension = extensionObj.Extension;
    _ = extensionObj.gettext;
} catch (e) {
    let extensionPrefsObj = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
    Extension = extensionPrefsObj.ExtensionPreferences;
    _ = extensionPrefsObj.gettext;
}

export const SETTINGS_AUTORESTORE_SESSIONS = 'autorestore-sessions';


export const PrefsUtils = class {

    constructor() {
        this.extensionObject = Extension.lookupByUUID('another-window-session-manager@gmail.com');
        this.settings = this.extensionObject.getSettings('org.gnome.shell.extensions.another-window-session-manager');
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
        if (this.settings) {
            // GObject.Object.run_dispose(): Releases all references to other objects.
            this.settings.run_dispose();
            this.settings = null;
        }
        
    }
}

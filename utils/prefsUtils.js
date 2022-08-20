'use strict';

const ExtensionUtils = imports.misc.extensionUtils;

var SETTINGS_AUTORESTORE_SESSIONS = 'autorestore-sessions';

var PrefsUtils = class {

    constructor() {
        this.settings = ExtensionUtils.getSettings(
            'org.gnome.shell.extensions.another-window-session-manager');
    }

    getSettingString(settingName) {
        return this.settings.get_string(settingName);
    }

    getSettings() {
        return this.settings;
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

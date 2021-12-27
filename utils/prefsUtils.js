const ExtensionUtils = imports.misc.extensionUtils;

var PrefsUtils = class {

    constructor() {
        this.settings = this._getSettings();
    }

    _getSettings() {
        const _settings = ExtensionUtils.getSettings(
            'org.gnome.shell.extensions.another-window-session-manager');
        return _settings;
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
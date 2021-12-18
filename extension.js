const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;

let _saveSession;

function enable() {
    _saveSession = new SaveSession.SaveSession();
    _saveSession.saveSession();

}

function disable() {
    if (_saveSession) {
        _saveSession.destroy();
        _saveSession = null;
    }

}

function init() {

}

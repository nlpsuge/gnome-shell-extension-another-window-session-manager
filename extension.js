const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;

let _saveSession;
let _restoreSession;

function enable() {
    _saveSession = new SaveSession.SaveSession();
    // _saveSession.saveSession();

    _restoreSession = new RestoreSession.RestoreSession();
    _restoreSession.restoreSession();

}

function disable() {
    if (_saveSession) {
        _saveSession.destroy();
        _saveSession = null;
    }

    if (_restoreSession) {
        _restoreSession.destroy();
        _restoreSession = null;
    }
}

function init() {

}

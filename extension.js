const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const CloseSession = Me.imports.closeSession;

let _saveSession;
let _restoreSession;
let _closeSession;

function enable() {
    _saveSession = new SaveSession.SaveSession();
    // _saveSession.saveSession();

    _restoreSession = new RestoreSession.RestoreSession();
    // _restoreSession.restoreSession();
    
    _closeSession = new CloseSession.CloseSession();
    _closeSession.closeWindows();

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

    if (_closeSession) {
        _closeSession.destroy();
        _closeSession = null;
    }
}

function init() {

}

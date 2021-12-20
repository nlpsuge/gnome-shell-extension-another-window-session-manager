const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const CloseSession = Me.imports.closeSession;
const Indicator = Me.imports.indicator;

let _saveSession;
let _restoreSession;
let _closeSession;
let _indicator;

function enable() {
    _saveSession = new SaveSession.SaveSession();
    // _saveSession.saveSession();

    _restoreSession = new RestoreSession.RestoreSession();
    // _restoreSession.restoreSession();
    
    _closeSession = new CloseSession.CloseSession();
    // _closeSession.closeWindows();

    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

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

    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }
    
}

function init() {

}

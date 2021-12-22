const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const CloseSession = Me.imports.closeSession;
const Indicator = Me.imports.indicator;

let _indicator;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

}

function disable() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }
    
}

function init() {

}

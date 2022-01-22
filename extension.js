'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const Indicator = Me.imports.indicator;
const Autostart = Me.imports.ui.autostart;


let _indicator;
let _autostart;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

    _autostart = new Autostart.Autostart();
    _autostart.start();
    
}

function disable() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }

    if (_autostart) {
        _autostart.destroy();
        _autostart = null;
    }
    
}

function init() {

}

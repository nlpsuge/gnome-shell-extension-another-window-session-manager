'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const Indicator = Me.imports.indicator;

let _indicator;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

}

function disable() {
    if (_indicator) {
        _indicator._onDestroy();
        _indicator = null;
    }
    
}

function init() {

}

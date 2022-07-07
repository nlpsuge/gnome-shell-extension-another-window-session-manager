'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const OpenWindowsInfoTracker = Me.imports.openWindowsInfoTracker;

const Indicator = Me.imports.indicator;
const Autostart = Me.imports.ui.autostart;


let _indicator;
let _autostartServiceProvider;
let _openWindowsInfoTracker;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

    _autostartServiceProvider = new Autostart.AutostartServiceProvider();
    
    _openWindowsInfoTracker = new OpenWindowsInfoTracker.OpenWindowsInfoTracker();
    
}

function disable() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }

    if (_autostartServiceProvider) {
        _autostartServiceProvider.disable();
        _autostartServiceProvider = null;
    }

    if (_openWindowsInfoTracker) {
        _openWindowsInfoTracker.destroy();
        _openWindowsInfoTracker = null;
    }
    
}

function init() {

}

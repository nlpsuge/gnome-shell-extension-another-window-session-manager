'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const OpenWindowsTracker = Me.imports.openWindowsTracker;

const Indicator = Me.imports.indicator;
const Autostart = Me.imports.ui.autostart;
const WindowTilingSupport = Me.imports.windowTilingSupport.WindowTilingSupport;

let _indicator;
let _autostartServiceProvider;
let _openWindowsTracker;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

    _autostartServiceProvider = new Autostart.AutostartServiceProvider();
    
    WindowTilingSupport.initialize();

    _openWindowsTracker = new OpenWindowsTracker.OpenWindowsTracker();
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

    if (_openWindowsTracker) {
        _openWindowsTracker.destroy();
        _openWindowsTracker = null;
    }
    
}

function init() {

}

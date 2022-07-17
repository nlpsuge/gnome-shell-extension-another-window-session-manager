'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const OpenWindowsInfoTracker = Me.imports.openWindowsInfoTracker;

const Indicator = Me.imports.indicator;
const Autostart = Me.imports.ui.autostart;
const WindowTilingSupport = Me.imports.windowTilingSupport;

let _indicator;
let _autostartServiceProvider;
let _openWindowsInfoTracker;
let _windowTilingSupport;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

    _autostartServiceProvider = new Autostart.AutostartServiceProvider();
    _openWindowsInfoTracker = new OpenWindowsInfoTracker.OpenWindowsInfoTracker();
    _windowTilingSupport = new WindowTilingSupport.WindowTilingSupport();

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
    
    if (_windowTilingSupport) {
        _windowTilingSupport.destroy();
        _windowTilingSupport = null;
    }
}

function init() {

}

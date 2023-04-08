'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

const OpenWindowsTracker = Me.imports.openWindowsTracker;

const Indicator = Me.imports.indicator;
const Autostart = Me.imports.ui.autostart;
const Autoclose = Me.imports.ui.autoclose;
const WindowTilingSupport = Me.imports.windowTilingSupport.WindowTilingSupport;
const WindowPicker = Me.imports.utils.WindowPicker;

Me.imports.utils.string;

const Log = Me.imports.utils.log;

let _indicator;
let _autostartServiceProvider;
let _openWindowsTracker;
let _autoclose;
let _windowPickerServiceProvider;

function enable() {
    _indicator = new Indicator.AwsIndicator();
    Main.panel.addToStatusArea('Another Window Session Manager', _indicator);

    _autostartServiceProvider = new Autostart.AutostartServiceProvider();
    
    WindowTilingSupport.initialize();

    _openWindowsTracker = new OpenWindowsTracker.OpenWindowsTracker();
    _autoclose = new Autoclose.Autoclose();

    _windowPickerServiceProvider = new WindowPicker.WindowPickerServiceProvider();
    _windowPickerServiceProvider.enable();
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

    WindowTilingSupport.destroy();
    
    if (_autoclose) {
        _autoclose.destroy();
        _autoclose = null;
    }

    Log.Log.destroyDefault();

    if (_windowPickerServiceProvider) {
        _windowPickerServiceProvider.destroy();
        _windowPickerServiceProvider = null;
    }

}

function init() {

}

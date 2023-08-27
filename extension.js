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
const PrefsUtils = Me.imports.utils.prefsUtils;


Me.imports.utils.string;

const Log = Me.imports.utils.log;

let _indicator;
let _autostartServiceProvider;
let _openWindowsTracker;
let _autoclose;
let _windowPickerServiceProvider;
let _settingUtils;

function enable() {
    _settingUtils = new PrefsUtils.PrefsUtils();

    _settingUtils.getSettings().connect('changed::show-indicator', () => showOrHideIndicator());
    showOrHideIndicator();

    _autostartServiceProvider = new Autostart.AutostartServiceProvider();
    
    WindowTilingSupport.initialize();

    _openWindowsTracker = new OpenWindowsTracker.OpenWindowsTracker();
    _autoclose = new Autoclose.Autoclose();

    _windowPickerServiceProvider = new WindowPicker.WindowPickerServiceProvider();
    _windowPickerServiceProvider.enable();
}

function showOrHideIndicator() {
    if (_settingUtils.getSettings().get_boolean('show-indicator')) {
        if (!_indicator) {
            _indicator = new Indicator.AwsIndicator();
            Main.panel.addToStatusArea('Another Window Session Manager', _indicator);
        }
    } else {
        hideIndicator();
    }
}

function hideIndicator() {
    if (_indicator) {
        _indicator.destroy();
        _indicator = null;
    }
}

function disable() {
    if (_settingUtils) {
        _settingUtils.destroy();
        _settingUtils = null;
    }

    hideIndicator();

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

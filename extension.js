'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as OpenWindowsTracker from './openWindowsTracker.js';

import * as Indicator from './indicator.js';
import * as Autostart from './ui/autostart.js';
import * as Autoclose from './ui/autoclose.js';
import {WindowTilingSupport} from './windowTilingSupport.js';
import * as WindowPicker from './utils/WindowPicker.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as string from './utils/string.js';

import * as Log from './utils/log.js';
import * as FileUtils from './utils/fileUtils.js';


let _indicator;
let _autostartServiceProvider;
let _openWindowsTracker;
let _autoclose;
let _windowPickerServiceProvider;

export default class AnotherWindowSessionManagerExtension extends Extension {

    constructor(metadata) {
        super(metadata);
        this._settings = this.getSettings('org.gnome.shell.extensions.another-window-session-manager');
    }

    enable() {
        
        this._settings.connect('changed::show-indicator', () => this.showOrHideIndicator());
        this.showOrHideIndicator();

        FileUtils.init(this);
    
        _autostartServiceProvider = new Autostart.AutostartServiceProvider();
        
        WindowTilingSupport.initialize();
    
        _openWindowsTracker = new OpenWindowsTracker.OpenWindowsTracker();
        _autoclose = new Autoclose.Autoclose();
    
        _windowPickerServiceProvider = new WindowPicker.WindowPickerServiceProvider();
        _windowPickerServiceProvider.enable();
    }
    
    showOrHideIndicator() {
        if (this._settings.get_boolean('show-indicator')) {
            if (!_indicator) {
                _indicator = new Indicator.AwsIndicator();
                Main.panel.addToStatusArea('Another Window Session Manager', _indicator);
            }
        } else {
            this.hideIndicator();
        }
    }
    
    hideIndicator() {
        if (_indicator) {
            _indicator.destroy();
            _indicator = null;
        }
    }
    
    disable() {
    
        this.hideIndicator();
    
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
    
}

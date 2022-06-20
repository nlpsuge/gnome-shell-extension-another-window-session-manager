'use strict';

const { Shell, Meta, Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;

var OpenWindowsInfoTracker = class {

    constructor() {
        this._windowTracker = Shell.WindowTracker.get_default();
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this._appSystem = Shell.AppSystem.get_default();
        this._appSystem.connect('app-state-changed', this._cleanUp.bind(this));

        this._display = global.display;
        this._displayId = this._display.connect('window-created', this._windowCreated.bind(this));
    }
    
    _windowCreated(display, metaWindow, userData) {
        const shellApp = this._windowTracker.get_window_app(metaWindow);
        if (!shellApp) {
            return;
        }

        const app_info = shellApp.get_app_info();
        if (!app_info) {
            return;
        }
        
        const xid = metaWindow.get_description();
        const windowStableSequence = metaWindow.get_stable_sequence();
        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        let savedWindowsMapping;
        if (savedWindowsMappingJsonStr === '{}') {
            savedWindowsMapping = new Map();
        } else {
            savedWindowsMapping = new Map(JSON.parse(savedWindowsMappingJsonStr));
        }
        const desktopFullPath = app_info.get_filename();
        let xidObj = savedWindowsMapping.get(desktopFullPath);
        if (xidObj) {
            const windows = shellApp.get_windows();
            const removedXids = Object.keys(xidObj).filter(xid => 
                !windows.find(w => w.get_description() === xid));
            removedXids.forEach(xid => {
                delete xidObj[xid];
            });

            if (!xidObj[xid]){
                xidObj[xid] = {
                    windowTitle: metaWindow.get_title(),
                    xid: xid,
                    windowStableSequence: windowStableSequence
                };
            }
        } else {
            if (!xidObj) {
                xidObj = {};
            }
            xidObj[xid] = {
                windowTitle: metaWindow.get_title(),
                xid: xid,
                windowStableSequence: windowStableSequence
            };
            savedWindowsMapping.set(desktopFullPath, xidObj);
        }

        const newSavedWindowsMappingJsonStr = JSON.stringify(Array.from(savedWindowsMapping.entries()));
        this._settings.set_string('windows-mapping', newSavedWindowsMappingJsonStr);
        Gio.Settings.sync();
        
    }

    _cleanUp(appSys, app) {
        let state = app.state;
        if (state != Shell.AppState.STOPPED) {
            return;
        }
        
        const app_info = app.get_app_info();
        if (!app_info) {
            return;
        }

        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        if (savedWindowsMappingJsonStr === '{}') {
            return;
        } 
        
        let savedWindowsMapping = new Map(JSON.parse(savedWindowsMappingJsonStr));
        const desktopFullPath = app_info.get_filename();
        savedWindowsMapping.delete(desktopFullPath);
        const newSavedWindowsMappingJsonStr = JSON.stringify(Array.from(savedWindowsMapping.entries()));
        this._settings.set_string('windows-mapping', newSavedWindowsMappingJsonStr);
        Gio.Settings.sync();
    }

    destroy() {
        if (this._displayId) {
            this._display.disconnect(this._displayId);
            this._displayId = 0;
        }
        
        if (this._metaRestartId) {
            this._display.disconnect(this._metaRestartId);
            this._metaRestartId = 0;
        }

    }

}

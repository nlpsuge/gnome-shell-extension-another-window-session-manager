'use strict';

const { Shell, Meta, Gio, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;


// Singleton class, all methods are `static`
var WindowTilingSupport = class {

    static initialize() {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._signals = new WindowTilingSupportSignals();

        // Used for getting another raised signal id to prevent 'too much recursion' due to raising each other.
        this._signalsConnectedMap = new Map();

        this._grabbedWindowsAboutToUntileMap = new Map();

        this._grabOpBeginId = global.display.connect('grab-op-begin', this._grabOpBegin.bind(this));
        this._grabOpEndId = global.display.connect('grab-op-end', this._grabOpEnd.bind(this));

    }

    static prepareToTile(metaWindow, window_tiling) {
        if (!window_tiling) return;
        if (!this._settings.get_boolean('restore-window-tiling')) return;
        const windowAboutToResize = this._getWindowAboutToResize(window_tiling);
        if (!windowAboutToResize) return;

        metaWindow._tile_match_awsm = windowAboutToResize;
        windowAboutToResize._tile_match_awsm = metaWindow;
        this._signals.emit('window-tiled', metaWindow, windowAboutToResize);
        const raisedId = metaWindow.connect('raised', () => {
            // TOTO Add to Settings
            const raisedTogether = true;
            if (raisedTogether) {
                const anotherWindowRaisedId = this._signalsConnectedMap.get(windowAboutToResize);
                windowAboutToResize.block_signal_handler(anotherWindowRaisedId);
                windowAboutToResize.raise();
                windowAboutToResize.unblock_signal_handler(anotherWindowRaisedId);
            }
        });
        this._signalsConnectedMap.set(metaWindow, raisedId);
    }

    static _grabOpBegin(display, grabbedWindow, grabOp) {
        // Fix `JS ERROR: TypeError: grabbedWindow is null` while `grab-op-begin` by `dash to panel`,
        // who emits nullish grabbedWindow.
        if (!grabbedWindow) return;

        // Check if the grabbed window has been in a tiling state with another window
        const windowAboutToResize = grabbedWindow._tile_match_awsm;
        if (!windowAboutToResize || windowAboutToResize._tile_match_awsm !== grabbedWindow) 
            return;
            
        // When position changed
        if (grabOp === Meta.GrabOp.MOVING) {
            const oldGrabbedWindowRect = grabbedWindow.get_frame_rect().copy();
            this._grabbedWindowsAboutToUntileMap.set(grabbedWindow, oldGrabbedWindowRect);
            return;
        }
        
        if (!this._settings.get_boolean('restore-window-tiling')) return;

        this._sizeChangedId = grabbedWindow.connect('size-changed', () => {
            const grabbedWindowRect = grabbedWindow.get_frame_rect();
            const windowAboutToResizeRect = windowAboutToResize.get_frame_rect();
            const grabbedWindowOnLeftSide = grabbedWindowRect.x < windowAboutToResizeRect.x;
            let xywh = null;
            if (grabbedWindowOnLeftSide) {
                xywh = [
                    grabbedWindowRect.width,
                    windowAboutToResizeRect.y,
                    windowAboutToResizeRect.width - (grabbedWindowRect.width - windowAboutToResizeRect.x),
                    windowAboutToResizeRect.height];
            } else {
                xywh = [
                    windowAboutToResizeRect.x,
                    windowAboutToResizeRect.y,
                    grabbedWindowRect.x,
                    windowAboutToResizeRect.height];
            }

            if (xywh) {
                windowAboutToResize.move_resize_frame(false, ...xywh);
            }

        });
    }

    static _grabOpEnd(display, grabbedWindow, grabOp) {
        const oldGrabbedWindowRect = this._grabbedWindowsAboutToUntileMap.get(grabbedWindow);
        const currentRect = grabbedWindow.get_frame_rect();
        // Untile if any of x, y, width and height changed
        if (oldGrabbedWindowRect && 
            (oldGrabbedWindowRect.x !== currentRect.x 
            || oldGrabbedWindowRect.y !== currentRect.y
            || oldGrabbedWindowRect.width !== currentRect.width
            || oldGrabbedWindowRect.height !== currentRect.height)) 
        {
            const anotherTilingWindow = grabbedWindow._tile_match_awsm;

            this._log.debug(`Untiling ${grabbedWindow.get_title()}`);
            this._log.debug('grabbedWindow get_tile_match' + grabbedWindow.get_tile_match());
            this._log.debug('anotherTilingWindow get_tile_match' + anotherTilingWindow.get_tile_match());
            delete grabbedWindow._tile_match_awsm;

            if (anotherTilingWindow) {
                this._log.debug(`Untiling ${anotherTilingWindow.get_title()}`);
                delete anotherTilingWindow._tile_match_awsm;
            }

            this._grabbedWindowsAboutToUntileMap.delete(grabbedWindow);

            this._signals.emit('window-untiled', grabbedWindow, anotherTilingWindow);
        }

        if (this._sizeChangedId) {
            grabbedWindow.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }

    }

    static _getWindowAboutToResize(window_tiling) {
        if (!window_tiling) return null; 
        const window_tile_for = window_tiling.window_tile_for;
        const shellApp = this._defaultAppSystem.lookup_app(window_tile_for.desktop_file_id);
        if (!shellApp) return null;
        const windows = shellApp.get_windows();
        if (!windows || !windows.length) return null;

        let windowAboutToResize = null;
        if (windows.length === 1) {
            windowAboutToResize = windows[0];
        } else {
            // Get one window by matching title
            for (const win of windows) {
                if (win.get_title() === window_tile_for.window_title) {
                    windowAboutToResize = win;
                    break;
                }
            }
        }

        return windowAboutToResize;
    }

    static connect(signal, func) {
        this._signals.connect(signal, func);
    }

    static disconnect(id) {
        this._signals.disconnect(id);
    }

    static destroy() {

        if (this._grabbedWindowsAboutToUntileMap) {
            this._grabbedWindowsAboutToUntileMap.clear();
            this._grabbedWindowsAboutToUntileMap = null;
        }

        if (this._signalsConnectedMap) {
            this._signalsConnectedMap.forEach((id, obj) => {
                obj.disconnect(id);
            });
            this._signalsConnectedMap.clear();
            this._signalsConnectedMap = null;
        }

        if (this._grabOpBeginId) {
            global.display.disconnect(this._grabOpBeginId);
            this._grabOpBeginId = 0;
        }

        if (this._grabOpEndId) {
            global.display.disconnect(this._grabOpEndId);
            this._grabOpEndId = 0;
        }
    }


}

var WindowTilingSupportSignals = GObject.registerClass({
    Signals: {
        'window-tiled': {
            param_types: [Meta.Window.$gtype, Meta.Window.$gtype],
            flags: GObject.SignalFlags.RUN_LAST,
        },
        'window-untiled': {
            param_types: [Meta.Window.$gtype, Meta.Window.$gtype],
            flags: GObject.SignalFlags.RUN_LAST,
        },
    }
}, class WindowTilingSupportSignals extends GObject.Object{

    _init() {
        super._init();
    }


});
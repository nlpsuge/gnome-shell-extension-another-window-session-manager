'use strict';

const { Shell, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;


var windowsAboutToTileMap = null;

var WindowTilingSupport = class {

    constructor() {
        windowsAboutToTileMap = new Map();

        this.resizing = new Resizing();
    }

    destroy() {
        this.resizing.destroy();
        this.resizing = null;
    }
}

class Resizing {

    constructor() {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this._defaultAppSystem = Shell.AppSystem.get_default();

        // Store Meta.Window currently grabbed that can be untiled
        this._grabbedWindowsAboutToUntileMap = new Map();

        this._grabOpBeginId = global.display.connect('grab-op-begin', this._grabOpBegin.bind(this));
        this._grabOpEndId = global.display.connect('grab-op-end', this._grabOpEnd.bind(this));
    }

    _grabOpBegin(display, grabbedWindow, grabOp) {
        if (!windowsAboutToTileMap) return;
        const window_tiling = windowsAboutToTileMap.get(grabbedWindow);
        if (!window_tiling) return;

        if (grabOp === Meta.GrabOp.MOVING) {
            const oldGrabbedWindowRect = grabbedWindow.get_frame_rect().copy();
            this._grabbedWindowsAboutToUntileMap.set(grabbedWindow, oldGrabbedWindowRect);
            return;
        }
        
        if (!this._settings.get_boolean('restore-window-tiling')) return;

        const windowAboutToResize = this._getWindowAboutToResize(window_tiling);
        if (!windowAboutToResize) return;

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

    _grabOpEnd(display, grabbedWindow, grabOp) {
        const oldGrabbedWindowRect = this._grabbedWindowsAboutToUntileMap.get(grabbedWindow);
        const currentRect = grabbedWindow.get_frame_rect();
        // Untile if any of x, y, width and height changed
        if (oldGrabbedWindowRect && 
            (oldGrabbedWindowRect.x !== currentRect.x 
            || oldGrabbedWindowRect.y !== currentRect.y
            || oldGrabbedWindowRect.width !== currentRect.width
            || oldGrabbedWindowRect.height !== currentRect.height)) 
        {
            const window_tiling = windowsAboutToTileMap.get(grabbedWindow);
            const anotherTilingWindow = this._getWindowAboutToResize(window_tiling);

            this._log.debug(`Untiling ${grabbedWindow.get_title()}`);
            windowsAboutToTileMap.delete(grabbedWindow);

            if (anotherTilingWindow) {
                this._log.debug(`Untiling ${anotherTilingWindow.get_title()}`);
                windowsAboutToTileMap.delete(anotherTilingWindow);
            }

            this._grabbedWindowsAboutToUntileMap.delete(grabbedWindow);
        }

        if (this._sizeChangedId) {
            grabbedWindow.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }

    }

    _getWindowAboutToResize(window_tiling) {
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

    destroy() {
        if (windowsAboutToTileMap) {
            windowsAboutToTileMap.clear();
            windowsAboutToTileMap = null;
        }

        if (this._grabbedWindowsAboutToUntileMap) {
            this._grabbedWindowsAboutToUntileMap.clear();
            this._grabbedWindowsAboutToUntileMap = null;
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

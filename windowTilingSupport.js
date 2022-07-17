'use strict';

const { Shell, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;

var windowsAboutToTileMap = new Map();

var WindowTilingSupport = class {

    constructor() {
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
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._grabOpBeginId = global.display.connect('grab-op-begin', this._grabOpBegin.bind(this));
        this._grabOpEndId = global.display.connect('grab-op-end', this._grabOpEnd.bind(this));
    }

    _grabOpBegin(display, grabbedWindow, grabOp) {
        log(windowsAboutToTileMap.size)
        const window_tiling = windowsAboutToTileMap.get(grabbedWindow);
        if (!window_tiling) return;

        const window_tile_for = window_tiling.window_tile_for;
        const shellApp = this._defaultAppSystem.lookup_app(window_tile_for.desktop_file_id);
        if (!shellApp) return;
        const windows = shellApp.get_windows();
        if (!windows || !windows.length) return;
        log('_restore Tiling ' + grabbedWindow.get_title())
        let windowAboutToResize;
        if (windows.length === 1) {
            windowAboutToResize = windows[0];
        } else {
            windowAboutToResize = windows[0];
        }

        log('windowAboutToResize ' + windowAboutToResize.get_title())

        if (Meta.GrabOp.RESIZING_E === grabOp || Meta.GrabOp.RESIZING_W === grabOp) {
            log('grab Op Begin ' + grabbedWindow.get_title())
            this._sizeChangedId = grabbedWindow.connect('size-changed', () => {
                const grabbedWindowRect = grabbedWindow.get_frame_rect();
                const windowAboutToResizeRect = windowAboutToResize.get_frame_rect();
                const grabbedWindowOnLeftSide = grabbedWindowRect.x < windowAboutToResizeRect.x;
                log('_size Changed ' + grabbedWindow.get_title() + ' ' + grabOp + ' ' + grabbedWindowOnLeftSide)
                let xywh = null;
                if (grabbedWindowOnLeftSide) {
                    xywh = [grabbedWindowRect.width,
                            windowAboutToResizeRect.y,
                            windowAboutToResizeRect.width - (grabbedWindowRect.width - windowAboutToResizeRect.x),
                            windowAboutToResizeRect.height];
                } else
                    xywh = [windowAboutToResizeRect.x,
                            windowAboutToResizeRect.y,
                            grabbedWindowRect.x,
                            windowAboutToResizeRect.height];
                if (xywh) {
                    windowAboutToResize.move_resize_frame(false, ...xywh);
                }

            });
        }
    }

    _grabOpEnd(display, grabbedWindow, grabOp) {
        const window_tiling = windowsAboutToTileMap.get(grabbedWindow);
        if (!window_tiling) return;

        if (this._sizeChangedId) {
            grabbedWindow.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }


    }

    destroy() {
        if (windowsAboutToTileMap) {
            windowsAboutToTileMap.clear();
            windowsAboutToTileMap = null;
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

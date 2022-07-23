'use strict';

const { Shell, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;
const MetaWindowUtils = Me.imports.utils.metaWindowUtils;
const SaveSession = Me.imports.saveSession;


// var windowsAboutToTileMap = null;

var WindowTilingSupport = class {

    constructor() {
        // windowsAboutToTileMap = new Map();

        this.resizing = new Resizing();
    }

    /**
     * Update the window tiling state of two windows so they can resize together.
     * And also save their tiling relation to the GSettings, so the relation can be restored after 
     * a gnome shell restart on X11.
     * 
     * @param {Meta.Window} metaWindow 
     * @param {SessionConfig.WindowTiling} window_tiling 
     */
     updateTile(metaWindow, window_tiling) {
        if (metaWindow._tile_match_for_awsm) return;
        
        if (!window_tiling) return;
        
        const tilingWindow = this.resizing._getTilingWindow(window_tiling);
        if (!tilingWindow) return;

        metaWindow._tile_match_for_awsm = tilingWindow;
        tilingWindow._tile_match_for_awsm = metaWindow;

        if (!Meta.is_wayland_compositor()) {
            const windowId1 = MetaWindowUtils.getStableWindowId(metaWindow);
            const windowId2 = MetaWindowUtils.getStableWindowId(tilingWindow);
            
            // Save window tiling state
            const windowTilingMapping = this._settings.get_string('window-tiling-mapping');
            const windowTilingMappingMap = new Map(JSON.parse(windowTilingMapping));
            windowTilingMappingMap.set(windowId1, {
                ...window_tiling.window_tile_for,
                windowId: windowId2
            });
            const newWindowTilingMapping = JSON.stringify(windowTilingMappingMap);
            this._settings.set_string(newWindowTilingMapping);
            Gio.Settings.sync();
        }
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
        this._saveSession = new SaveSession.SaveSession();

        this._defaultAppSystem = Shell.AppSystem.get_default();

        // Store Meta.Window currently grabbed that can be untiled
        this._grabbedWindowsAboutToUntileMap = new Map();

        this._grabOpBeginId = global.display.connect('grab-op-begin', this._grabOpBegin.bind(this));
        this._grabOpEndId = global.display.connect('grab-op-end', this._grabOpEnd.bind(this));

        this._displayId = global.display.connect('window-created', this._windowCreated.bind(this));
        global.display.connect('x11-display-opened', () => {
            log('x11-display-opened...');
        });
        global.display.connect('x11-display-closing', () => {
            if (Meta.is_wayland_compositor()) return;

            log('x11 display closing...');
            const runningShellApps = Shell.AppSystem.get_default().get_running();
            this._log.debug(`There are ${runningShellApps.length} apps`);
            try {
                this._saveSession.saveSession('test-save-after-x11-display-closing');
            } catch (e) {
                logError(e, `Failed to save session`);
                global.notify_error(`Failed to save session`, e.message);
                this._displayMessage(e.message);
                return;
            }
        });
        
    }

    _windowCreated(display, metaWindow, userData) {
        if (Meta.is_wayland_compositor()) return;

        const windowTilingMapping = this._settings.get_string('window-tiling-mapping');
        const windowTilingMappingMap = new Map(JSON.parse(windowTilingMapping));
        const windowId = MetaWindowUtils.getStableWindowId(metaWindow);
        const windowTileFor = windowTilingMappingMap.get(windowId);
        if (!windowTileFor) return;

        const anotherApp = this._defaultAppSystem.lookup_app(windowTileFor.desktop_file_id);
        for (const anotherWindow of anotherApp.get_windows()) {
            const anotherWindowId = MetaWindowUtils.getStableWindowId(anotherWindow);
            if (anotherWindowId === windowTileFor.windowId) {
                metaWindow._tile_match_for_awsm = anotherWindow;
                anotherWindow._tile_match_for_awsm = metaWindow;               
                break;
            }
        }
    }

    _grabOpBegin(display, grabbedWindow, grabOp) {
        // grabbedWindow could be null, I'm not sure why...
        if (!grabbedWindow) return;
        // if (!windowsAboutToTileMap) return;
        // const windowId = MetaWindowUtils.getStableWindowId(grabbedWindow);
        // const window_tiling = windowsAboutToTileMap.get(windowId);
        // if (!window_tiling) return;

        const windowAboutToResize = grabbedWindow._tile_match_for_awsm;
        if (!windowAboutToResize) return;

        if (grabOp === Meta.GrabOp.MOVING) {
            const oldGrabbedWindowRect = grabbedWindow.get_frame_rect().copy();
            this._grabbedWindowsAboutToUntileMap.set(grabbedWindow, oldGrabbedWindowRect);
            return;
        }
        
        if (!this._settings.get_boolean('restore-window-tiling')) return;

        // const windowAboutToResize = this._getTilingWindow(window_tiling);
        // if (!windowAboutToResize) return;

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
            // const windowId = MetaWindowUtils.getStableWindowId(grabbedWindow);
            // const window_tiling = windowsAboutToTileMap.get(windowId);
            // const anotherTilingWindow = this._getTilingWindow(window_tiling);

            const anotherTilingWindow = grabbedWindow._tile_match_for_awsm;
            this._log.debug(`Untiling ${grabbedWindow.get_title()}`);
            // windowsAboutToTileMap.delete(windowId);
            delete grabbedWindow._tile_match_for_awsm;

            if (anotherTilingWindow) {
                this._log.debug(`Untiling ${anotherTilingWindow.get_title()}`);
                // const windowId = MetaWindowUtils.getStableWindowId(anotherTilingWindow);
                // windowsAboutToTileMap.delete(windowId);
                delete anotherTilingWindow._tile_match_for_awsm;
            }

            this._grabbedWindowsAboutToUntileMap.delete(grabbedWindow);
        }

        if (this._sizeChangedId) {
            grabbedWindow.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }

    }

    _getTilingWindow(window_tiling) {
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
        // if (windowsAboutToTileMap) {
        //     windowsAboutToTileMap.clear();
        //     windowsAboutToTileMap = null;
        // }

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

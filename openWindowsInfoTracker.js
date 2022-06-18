'use strict';

const { Shell, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;


var openWindows = new Map();

var OpenWindowsInfoTracker = class {

    constructor() {
        this._windowTracker = Shell.WindowTracker.get_default();

        this._log = new Log.Log();

        this._display = global.display;
        this._displayId = this._display.connect('window-created', this._windowCreated.bind(this));
    }

    _windowCreated(display, metaWindow, userData) {
        if (!metaWindow.createdTimeAwsm) {
            metaWindow.createdTimeAwsm = new Date().getTime();
        }
        
        // let metaWindowActor = metaWindow.get_compositor_private();
        // https://github.com/paperwm/PaperWM/blob/10215f57e8b34a044e10b7407cac8fac4b93bbbc/tiling.js#L2120
        // https://gjs-docs.gnome.org/meta8~8_api/meta.windowactor#signal-first-frame
        // let firstFrameId = metaWindowActor.connect('first-frame', () => {
            // if (firstFrameId) {
                // metaWindowActor.disconnect(firstFrameId);
                // firstFrameId = 0
            // }
            
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }

            const currentTime = new Date().getTime();

            const shellAppWindows = openWindows.get(shellApp);
            if (shellAppWindows) {
                const savedMetaWindow = shellAppWindows.windows.find(w => w.metaWindow === metaWindow);
                if (!savedMetaWindow) {
                    shellAppWindows.windows.push({
                        metaWindow: metaWindow,
                        title: metaWindow.get_title(),
                        createdTime: currentTime
                    });
                }
            } else {
                const windows = [];
                windows.push({
                    metaWindow: metaWindow,
                    title: metaWindow.get_title(),
                    createdTime: currentTime
                });
                // desktopAppInfo could be null if the shellApp is window backed
                const desktopAppInfo = shellApp.get_app_info();
                openWindows.set(shellApp, {
                    shellApp: shellApp,
                    desktopId: desktopAppInfo?.get_id(),
                    appName: shellApp.get_name(),
                    desktopFullPath: desktopAppInfo?.get_filename(),
                    windows: windows
                });
            }

            const windows = shellApp.get_windows();
            for (const window of windows) {
                this._log.debug(window.get_title() + ' ' + window.createdTime);
            }

            // if (this._log.isDebug()) {
            //     for (const [key, value] of openWindows) {
            //         this._log.debug(`Tracking ${key}: ${JSON.stringify(value)}`);
            //     }
            //     this._log.debug(`Tracking window ${metaWindow}(${metaWindow.get_title()}) of ${shellApp.get_name()}. openWindows: ${JSON.stringify(Array.from(openWindows.entries()))}`);
            // }
        // });
        
    }

    destroy() {
        if (this._displayId) {
            this._display.disconnect(this._displayId);
            this._displayId = 0;
        }
    }

}
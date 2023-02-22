'use strict';

const { GObject, St, Gio, GLib, Clutter, Shell, Meta } = imports.gi;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const LookingGlass = imports.ui.lookingGlass;

const MoveSession = Me.imports.moveSession;
const RestoreSession = Me.imports.restoreSession;

const FileUtils = Me.imports.utils.fileUtils;
const SessionItem = Me.imports.ui.sessionItem;
const SearchSessionItem = Me.imports.ui.searchSessionItem;
const PopupMenuButtonItems = Me.imports.ui.popupMenuButtonItems;
const Notebook = Me.imports.ui.notebook;
const SearchableList = Me.imports.ui.searchableList;
const RunningSubMenuMenuItem = Me.imports.ui.runningSubMenuMenuItem;

const IconFinder = Me.imports.utils.iconFinder;
const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;
const Signal = Me.imports.utils.signal;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");

        this._windowTracker = Shell.WindowTracker.get_default();
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();
        this._log = new Log.Log();

        this._signal = new Signal.Signal();
        
        this._itemIndex = 0;

        this._sessions_path = FileUtils.sessions_path;

        this.monitors = [];

        // TODO backup path

        // Add an icon
        let icon = new St.Icon({
            gicon: IconFinder.find('restore-symbolic.svg'),
            style_class: 'popup-menu-icon'
        });
        this.add_child(icon);

        this._createMenu();

        this.menu.connect('open-state-changed', this._onOpenStateChanged.bind(this));

        // Open menu
        // this.menu.open(true);
        // Toggle menu
        // this.menu.toggle();

        // Remove all activate signals on all menu items, so the panel menu can always stay open
        // See: PopupMenu#itemActivated() => this.menu._getTopMenu().close
        this.menu.itemActivated = function(animate) {};

        this._moveSession = new MoveSession.MoveSession();

        this._metaWindowConnectIds = [];
        this._display = global.display;
        this._displayId = this._display.connect('window-created', this._windowCreated.bind(this));

        this._isDestroyed = false;
        
    }

    // TODO Move this method and related code to a single .js file
    async _windowCreated(display, metaWindow, userData) {
        if (!Meta.is_wayland_compositor()) {
            // We call createEnoughWorkspaceAndMoveWindows() if and only if all conditions checked.
            
            // But we give some windows (such as the OS running in VirtualBox) a chance to connect `first-frame` and `shown` signals.
            // The reason I do this is that 
            // `Shell.AppSystem.get_default().lookup_app('a-VirtualBox-machine-name.desktop')`
            // and `Shell.WindowTracker.get_default().get_window_app(metaWindow_of_VirtualBoxMachine)`
            // are not the same instance. 
            
            // My best guess is:
            // Looks like if launch a VirtualBox machine via `/usr/lib64/virtualbox/VirtualBoxVM --comment "test" --startvm "{xxxxxxx-xxxxxxx-xxxxxxx-xxxxxxx-xxxxxxxxxxxxxx}"`,
            // it will open two process: the first process open another process, which is running a machine, and then the first process stops to run and the associated Shell.App is also destroyed.
            // And
            // the two processes all have window, window of the first process will be destroyed before/after the second process open a new window, which is running the virtual OS.
            // Install https://extensions.gnome.org/extension/4679/burn-my-windows/ to watch this process.

            const shellApp = this._windowTracker.get_window_app(metaWindow);
            let shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                shellAppData = RestoreSession.restoringApps.get(metaWindow.get_pid());
            }

            if (shellAppData) {
                const saved_window_sessions = shellAppData.saved_window_sessions;

                // On X11, we have to create enough workspace and move windows before receive the first-frame signal.
                // If not, all windows will be shown in current workspace when stay in Overview, which is not pretty.
                let matchedSavedWindowSession = await this._moveSession.createEnoughWorkspaceAndMoveWindows(metaWindow, saved_window_sessions);
                
                if (matchedSavedWindowSession) {
                    // We try to restore window state here if necessary.
                    // Below are possible reasons:
                    // 1) In current implement there is no guarantee that the first-frame and shown signals can be triggered immediately. You have to click a window to trigger them.
                    // 2) The restored window state could be lost
                    this._log.debug(`Restoring window state of ${shellApp.get_name()} - ${metaWindow.get_title()} if necessary`);
                    this._moveSession._restoreWindowState(metaWindow, matchedSavedWindowSession);


                    // Fix window geometry later on in first-frame signal
                    // TODO The side-effect is when a window is already in the current workspace there will be two same logs (The window 'Clocks' is already on workspace 0 for Clocks) in the journalctl, which is not pretty.
                    // TODO Maybe it's better to use another state to indicator whether a window has been restored geometry.
                    matchedSavedWindowSession.moved = false;
                }
            }
        }
        
        let metaWindowActor = metaWindow.get_compositor_private();
        // https://github.com/paperwm/PaperWM/blob/10215f57e8b34a044e10b7407cac8fac4b93bbbc/tiling.js#L2120
        // https://gjs-docs.gnome.org/meta8~8_api/meta.windowactor#signal-first-frame
        let firstFrameId = metaWindowActor.connect('first-frame', () => {
            if (this._isDestroyed) {
                metaWindowActor.disconnect(firstFrameId);
                return;
            }

            if (metaWindow._aboutToClose) {
                return;
            }

            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> first-frame: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            let shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                shellAppData = RestoreSession.restoringApps.get(metaWindow.get_pid());
            }
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowByMetaWindow(metaWindow, saved_window_sessions);
        
            metaWindowActor.disconnect(firstFrameId);
            firstFrameId = 0;
        })
        
        let shownId = metaWindow.connect('shown', () => {
            if (this._isDestroyed) {
                metaWindow.disconnect(shownId);
                return;
            }

            if (metaWindow._aboutToClose) {
                return;
            }

            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> shown: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            let shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                shellAppData = RestoreSession.restoringApps.get(metaWindow.get_pid());
            }
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowByMetaWindow(metaWindow, saved_window_sessions);
        
            metaWindow.disconnect(shownId);
            shownId = 0;
        });


        /*
        We have to disconnect firstFrameId within the unmanaging signal of metaWindow.
        
        If we do this in `destroy()`, the metaWindowActor instance has been disposed, disconnecting signals from 
        metaWindowActor gets many errors when disable extension: Object .MetaWindowActorWayland (0x55fae658e3d0), has been already disposed — impossible to access it. This might be caused by the object having been destroyed from C code using something such as destroy(), dispose(), or remove() vfuncs.
        I don't know why 😢. TODO

        But metaWindow is not disposed in `destroy()`, so we can disconnect signals from it there.
        */
        let unmanagingId = metaWindow.connect('unmanaging', () => {
            // Fix ../gobject/gsignal.c:2732: instance '0x55629xxxxxx' has no handler with id '11000' when disable this extension right after restore apps
            this._signal.disconnectSafely(metaWindowActor, firstFrameId);
        });

        // Restore states once the window title is changed while the app is launching. 
        // This works for some apps, such as Visual Studio Code. When vs code launches, the first title is `Visual Studio Code`,
        // the second could be `indicator.js - gnome-shell-extension-another-window-session-manager - Visual Studio Code`.
        // Here `notify::title` catches the second.
        let titleChangedId = metaWindow.connect('notify::title', () => {
            if (this._isDestroyed) {
                metaWindow.disconnect(titleChangedId);
                return;
            }

            if (metaWindow._aboutToClose) {
                return;
            }

            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> title changed: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            let shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                shellAppData = RestoreSession.restoringApps.get(metaWindow.get_pid());
            }
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowsByMetaWindow(metaWindow, saved_window_sessions);
        
            metaWindow.disconnect(titleChangedId);
            titleChangedId = 0;
        });

        this._metaWindowConnectIds.push([metaWindow, shownId]);
        this._metaWindowConnectIds.push([metaWindow, unmanagingId]);
        this._metaWindowConnectIds.push([metaWindow, titleChangedId]);
    }

    _onOpenStateChanged(menu, state) {
        if (state) {
            this._setWindowAppearance();
        }
    }

    _setWindowAppearance() {
        const display = global.display;
        const monitorGeometry /*Meta.Rectangle*/ =
                display.get_monitor_geometry(display.get_primary_monitor());
        const screen_width = monitorGeometry.width;
        const windowWidth = this._settings.get_int('window-width');
        // Just a guess
        const margin = 8;
        this.menu.actor.natural_width = screen_width * windowWidth / 100 - margin;
    }

    _createMenu() {
        this._addButtonItems();
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), this._itemIndex++);

        this._sessionListSection = new SearchableList.SearchableList(true);
        this._runningSection = new SearchableList.SearchableList(false);
        this._recentlyClosedSection = new SearchableList.SearchableList(false);

        this.notebook = new Notebook.Notebook();
        this.notebook._notebookBoxLayout.x_align = this._settings.get_int('tabs-position-on-popmenu');
        this._settings.connect('changed::tabs-position-on-popmenu', () => {
            this.notebook._notebookBoxLayout.x_align = this._settings.get_int('tabs-position-on-popmenu');
        });
        this.notebook.appendPage('Session List', this._sessionListSection);
        this.notebook.appendPage('Recently Closed', this._recentlyClosedSection, this._buildRecentlyClosedSection.bind(this));
        this.notebook.appendPage('Running Apps/Windows', this._runningSection, this._buildRunningSection.bind(this));

        this.menu.addMenuItem(this.notebook, this._itemIndex++);

        this._buildSessionListSection();
        // this._buildRunningSection();
        // this._buildRecentlyClosedSection();


        // this._sessionListButton.set_style('border-style: none none solid none; border-color: blue;');

        // this._runningButton.connect('notify::hover', (widget) => {
        //     if (widget.get_hover()) {
        //         this._showRunningSection()
        //     }
        // });

        // this._recentlyClosedButton.connect('notify::hover', (label) => {
        //     if (label.get_hover()) {
        //         this._showRecentlyClosedSection(label);
        //     }
        // });


        // TODO
        // this._sessionListSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), this._sessionListItemIndex++);

    }

    _buildRunningSection(runningSection) {
        const runningApps = this._defaultAppSystem.get_running();
        const sortedRunningApps = this._sortRunningApps(runningApps);
        // const runningAppsMap = new Map();
        // const runningAppsStatisticMap = new Map();
        for (const runningApp of sortedRunningApps) {
            const name = runningApp.get_app_info()?.get_filename()
                            ?? runningApp.get_name()
                            ?? runningApp.get_windows()[0]?.get_wm_class()
                            ?? runningApp.get_windows()[0].get_wm_class_instance()
                            ?? "Unknown app";
            // const existingApps = runningAppsMap.get(name);
            // if (existingApps) {
            //     existingApps.push(runningApp);
            // } else {
            //     runningAppsMap.set(name, [runningApp]);
            // }

            // const windowsCount = runningAppsStatisticMap.get(name);

            const appGroupItem = new RunningSubMenuMenuItem.RunningSubMenuMenuItem(
                `${name}(${runningApp.get_n_windows()} windows)`,
                runningApp);

            const windows = runningApp._windows_sorted;
            windows.forEach(window => {
                const windowItem = new RunningSubMenuMenuItem.RunningItem(window, {
                    hover: false,
                });

                appGroupItem.menu.addMenuItem(windowItem);
            });

            runningSection.add(appGroupItem);
        }

    }

    _sortRunningApps(runningApps) {
        for (const runningApp of runningApps) {
            const windows = runningApp.get_windows();
            windows.sort((window1, window2) => {
                return window2.get_user_time() - window1.get_user_time();
            });
            runningApp._windows_sorted = windows;
        }

        runningApps.sort((app1, app2) => {
            const windows1 = app1.get_windows();
            if (!windows1 || !windows1.length) {
                return -1;
            }

            const windows2 = app2.get_windows();
            if (!windows2 || !windows2.length) {
                return -1;
            }

            return windows2[0].get_user_time() - windows1[0].get_user_time();
        });

        return runningApps;
    }

    _buildRecentlyClosedSection(recentlyClosedSection) {
        const runningApps = this._defaultAppSystem.get_running();
        // const runningAppsMap = new Map();
        // const runningAppsStatisticMap = new Map();
        for (const runningApp of runningApps) {
            if (!runningApp.get_name().includes('Code')) {
                continue;
            }
            const name = runningApp.get_app_info()?.get_filename()
                            ?? runningApp.get_name()
                            ?? runningApp.get_windows()[0]?.get_wm_class()
                            ?? runningApp.get_windows()[0].get_wm_class_instance()
                            ?? "Unknown app";
            // const existingApps = runningAppsMap.get(name);
            // if (existingApps) {
            //     existingApps.push(runningApp);
            // } else {
            //     runningAppsMap.set(name, [runningApp]);
            // }

            // const windowsCount = runningAppsStatisticMap.get(name);

            const appGroupItem = new PopupMenu.PopupSubMenuMenuItem(`${name}(${runningApp.get_n_windows()} windows)`, true);
            appGroupItem.icon.gicon = runningApp.get_icon();
            const windows = runningApp.get_windows();
            windows.forEach(window => {
                const windowItem = new PopupMenu.PopupMenuItem(window.get_title());

                appGroupItem.menu.addMenuItem(windowItem);
            });

            recentlyClosedSection.add(appGroupItem);
        }
    }

    _buildSessionListSection() {
        this._addSessionItems().catch((error => {
            this._log.error(error, 'Error adding session items while creating indicator menu');
        }));

        this._addSessionFolderMonitor();
    }

    _createNotebookButton(label) {
        return new St.Button({
            label: label,
            style_class: 'notebook tabs',
            reactive: true,
            track_hover: true,
            can_focus: true,
        });
    }

    _showRecentlyClosedSection(label) {
        this._switchSection(label, null);


    }

    _switchSection(widget, section) {
        const tabs = this._sessionListTab.get_children();
        for (const tab of tabs) {
            log(tab)
            if (tab !== widget) {
                tab.set_style('box-shadow: none');
            }
        }

        // hover white #f6f5f4
        // https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
        // https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius
        widget.set_style('box-shadow: inset 0 -4px purple;');

        // section.actor.hide();
    }

    _addButtonItems() {
        this._popupMenuButtonItems = new PopupMenuButtonItems.PopupMenuButtonItems();
        const buttonItems = this._popupMenuButtonItems.buttonItems;
        buttonItems.forEach(item => {
            const oldStyleClassName = item.actor.get_style_class_name();
            item.actor.set_style_class_name(`${oldStyleClassName} font`);
            this.menu.addMenuItem(item, this._itemIndex++);
        });

    }

    async _addSessionItems() {
        if (!GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            // TODO Empty session
            this._log.info(`${this._sessions_path} not found! It's harmless, please save some windows in the panel menu to create it automatically.`);
            this._sessionListSection.removeAll();
            return;
        }

        this._log.debug('List all sessions to add session items');
        
        let sessionFileInfos = [];
        await FileUtils.listAllSessions(null, false, (file, info) => {
            // We have an interest in regular and text files

            const file_type = info.get_file_type();
            if (file_type !== Gio.FileType.REGULAR) {
                this._log.debug(`${file.get_path()} (file type is ${file_type}) is not a regular file, skipping`);
                return;
            }
            const content_type = info.get_content_type();
            if (content_type !== 'text/plain') {
                this._log.debug(`${file.get_path()} (content type is ${content_type}) is not a text file, skipping`);
                return;
            }

            // Skip the `Recently Closed Session` file since it has been added to the session list already.
            if (file.equal(FileUtils.recently_closed_session_file)) {
                return;
            }
            
            this._log.debug(`Processing ${file.get_path()}`);
            sessionFileInfos.push({
                info: info,
                file: file
            });

        }).catch(e => {
            this._log.error(e, 'Error listing all sessions')
        });

        // Sort by modification time: https://gjs-docs.gnome.org/gio20~2.0/gio.fileenumerator
        // The latest on the top, if a file has no modification time put it on the bottom
        sessionFileInfos.sort((sessionFileInfo1, sessionFileInfo2) => {
            const info1 = sessionFileInfo1.info;
            let modification_date_time1 = info1.get_modification_date_time();
            const info2 = sessionFileInfo2.info;
            let modification_date_time2 = info2.get_modification_date_time();

            if (!modification_date_time1 && !modification_date_time2) {
                return 0;
            }

            if (!modification_date_time1 && modification_date_time2) {
                return 1;
            }

            if (modification_date_time1 && !modification_date_time2) {
                return -1;
            }

            // https://gjs-docs.gnome.org/glib20~2.66.1/glib.datetime#function-compare
            // -1, 0 or 1 if dt1 is less than, equal to or greater than dt2.
            return modification_date_time2.compare(modification_date_time1);
        });

        this._sessionListSection.removeAll();

        let info = null;
        try {
            info = FileUtils.recently_closed_session_file.query_info(
                [Gio.FILE_ATTRIBUTE_STANDARD_NAME, 
                    Gio.FILE_ATTRIBUTE_TIME_MODIFIED].join(','),
                Gio.FileQueryInfoFlags.NONE,
                null);
        } catch (ignored) {}
        
        // Recently Closed Session always on the top
        let item = new SessionItem.SessionItem(info, FileUtils.recently_closed_session_file, this);
        this._sessionListSection.add(item);

        for (const sessionFileInfo of sessionFileInfos) {
            const info = sessionFileInfo.info;
            const file = sessionFileInfo.file;
            let item = new SessionItem.SessionItem(info, file, this);
            this._sessionListSection.add(item);
        }
        
    }

    /**
     * monitor files changes, recreate items when necessary.
     * 
     */
    _addSessionFolderMonitor() {
        const sessionPathFile = Gio.File.new_for_path(this._sessions_path);
        this._monitor_directory(sessionPathFile);

        // Moving a directory on the same filesystem doesn’t move its contents, so we
        // monitor each parent directory because I want to receive the `changed` when they are moved
        let parent = sessionPathFile.get_parent();
        // If parent is null, then it represents the root directory of the file system
        while (parent) {
            if (parent.get_path() === `${FileUtils.user_config}`) {
                break;
            }
            this._monitor_directory(parent);
            parent = parent.get_parent();
        }

    }

    _monitor_directory(directory) {
        const monitor = directory.monitor_directory(
            Gio.FileMonitorFlags.WATCH_MOUNTS |
            Gio.FileMonitorFlags.WATCH_MOVES, null);
        monitor.connect('changed', this._sessionChanged.bind(this));
        this.monitors.push(monitor);
    }

    // https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor#signal-changed
    // Looks like the document is wrong ...
    // https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitorevent
    _sessionChanged(monitor, fileMonitored, otherFile, eventType) {
        const pathMonitored = fileMonitored.get_path();
        this._log.debug(`Session changed, readd all session items from ${this._sessions_path}. ${pathMonitored} changed. otherFile: ${otherFile?.get_path()}. Event type: ${eventType}`);

        // Ignore CHANGED and CREATED events, since in both cases
        // we'll get a CHANGES_DONE_HINT event when done.
        if (eventType === Gio.FileMonitorEvent.CHANGED || // 0
            eventType === Gio.FileMonitorEvent.CREATED) // 3
            return;

        // The eventType is Gio.FileMonitorEvent.RENAMED while modify the content of a text file,
        // so otherFile is the correct file we need to read.
        // The doc said:
        // If using Gio.FileMonitorFlags.WATCH_MOVES on a directory monitor, and
        // the information is available (and if supported by the backend),
        // event_type may be Gio.FileMonitorEvent.RENAMED,
        // Gio.FileMonitorEvent.MOVED_IN or Gio.FileMonitorEvent.MOVED_OUT.
        if (eventType === Gio.FileMonitorEvent.RENAMED) {
            fileMonitored = otherFile;
        }

        // Ignore temporary files generated by Gio
        if (eventType !== Gio.FileMonitorEvent.RENAMED // 8
                && fileMonitored.get_basename().startsWith('.goutputstream-')) {
            return;
        }

        let info = null;
        try {
            info = fileMonitored.query_info(
                [Gio.FILE_ATTRIBUTE_STANDARD_TYPE, 
                    Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE].join(','),
                Gio.FileQueryInfoFlags.NONE,
                null);
        } catch (ignored) {}

        // Ignore none regular and text files
        if (info) {
            const file_type = info.get_file_type();
            const content_type = info.get_content_type();
            if (!(file_type === Gio.FileType.REGULAR &&
                  content_type === 'text/plain') && 
                    // Parent folders could be changed
                    !this._sessions_path.startsWith(pathMonitored)) {
                return;
            }
        }

        // It probably is a problem when there are large amount session files,
        // say thousands of them, but who creates that much?
        // 
        // Can use Gio.FileMonitorEvent to modify the results 
        // of this._sessionListSection.getAll() when the performance
        // is a problem to be resolved, it's a more complex implement.
        this._addSessionItems().catch((error => {
            this._log.error(error, 'Error adding session items while session was changed');
        }));
    }

    destroy() {
        if (this.monitors) {
            this.monitors.forEach ((monitor) => {
                monitor.cancel();
                monitor = null;
            });
            this.monitors = [];
        }

        if (this._sessions_path) {
            this._sessions_path = null;
        }

        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }

        if (this._metaWindowConnectIds) {
            for (let [obj, signalId] of this._metaWindowConnectIds) {
                // Fix ../gobject/gsignal.c:2732: instance '0x55629xxxxxx' has no handler with id '11000' when disable this extension right after restore apps
                this._signal.disconnectSafely(obj, signalId);
            }
            this._metaWindowConnectIds = null;
        }
        
        if (this._displayId) {
            this._display.disconnect(this._displayId);
            this._displayId = 0;
        }

        if (this.notebook) {
            this.notebook.destroy();
            this.notebook = null;
        }

        if (this._sessionListSection) {
            this._sessionListSection.destroy();
            this._sessionListSection = null;
        }

        if (this._runningSection) {
            this._runningSection.destroy();
            this._runningSection = null;
        }

        if (this._recentlyClosedSection) {
            this._recentlyClosedSection.destroy();
            this._recentlyClosedSection = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }

        super.destroy();

        this._isDestroyed = true;
        
    }

});

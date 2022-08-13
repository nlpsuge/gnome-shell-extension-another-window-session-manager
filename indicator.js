'use strict';

const { GObject, St, Gio, GLib, Clutter, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;

const MoveSession = Me.imports.moveSession;
const RestoreSession = Me.imports.restoreSession;

const FileUtils = Me.imports.utils.fileUtils;
const SessionItem = Me.imports.ui.sessionItem;
const SearchSessionItem = Me.imports.ui.searchSessionItem;
const PopupMenuButtonItems = Me.imports.ui.popupMenuButtonItems;
const IconFinder = Me.imports.utils.iconFinder;
const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;
const Signal = Me.imports.utils.signal;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");

        this._windowTracker = Shell.WindowTracker.get_default();

        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();
        this._log = new Log.Log();

        this._signal = new Signal.Signal();
        
        this._itemIndex = 0;

        this._sessions_path = FileUtils.sessions_path;

        this.monitor = null;

        this._sessionsMenuSection = null;

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
    _windowCreated(display, metaWindow, userData) {
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
            if (shellApp) {
            
                const shellAppData = RestoreSession.restoringApps.get(shellApp);
                if (shellAppData) {
                    const saved_window_sessions = shellAppData.saved_window_sessions;

                    // On X11, we have to create enough workspace and move windows before receive the first-frame signal.
                    // If not, all windows will be shown in current workspace when stay in Overview, which is not pretty.
                    let matchedSavedWindowSession = this._moveSession.createEnoughWorkspaceAndMoveWindows(metaWindow, saved_window_sessions);
                    
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

            // To prevent the below error when disable this extension after restore apps:
            // JS ERROR: TypeError: this._log is null 
            if (!this._log) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> first-frame: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            const shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowsByMetaWindow(metaWindow, saved_window_sessions);
        
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

            // To prevent the below error when disable this extension after restore apps:
            // JS ERROR: TypeError: this._log is null
            if (!this._log) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> shown: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            const shellAppData = RestoreSession.restoringApps.get(shellApp);
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowsByMetaWindow(metaWindow, saved_window_sessions);
        
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

        this._metaWindowConnectIds.push([metaWindow, shownId]);
        this._metaWindowConnectIds.push([metaWindow, unmanagingId]);
        
    }

    _onOpenStateChanged(menu, state) {
        if (state) {
            this._searchSessionItem.reset();
            this._searchSessionItem._clearIcon.hide();
            Mainloop.idle_add(() => this._searchSessionItem._entry.grab_key_focus());
        }
        super._onOpenStateChanged(menu, state);
    }

    _createMenu() {
        this._addButtonItems();
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), this._itemIndex++);

        this._searchSessionItem = new SearchSessionItem.SearchSessionItem();
        const searchEntryText = this._searchSessionItem._entry.get_clutter_text()
        searchEntryText.connect('text-changed', this._onSearch.bind(this));
        this._searchSessionItem._filterAutoRestoreSwitch.connect('notify::state', this._onAutoRestoreSwitchChanged.bind(this));

        this.menu.addMenuItem(this._searchSessionItem, this._itemIndex++);
                
        this._addScrollableSessionsMenuSection();
        this._addSessionItems().catch((error => {
            this._log.error(error, 'Error adding session items while creating indicator menu');
        }));

        this._addSessionFolderMonitor();
    }

    _addScrollableSessionsMenuSection() {
        this._sessionsMenuSection = new PopupMenu.PopupMenuSection();
        this._scrollableSessionsMenuSection = new PopupMenu.PopupMenuSection();
        let scrollView = new St.ScrollView({
            style_class: 'session-menu-section',
            overlay_scrollbars: true
        });
        scrollView.add_actor(this._sessionsMenuSection.actor);
        this._scrollableSessionsMenuSection.actor.add_actor(scrollView);

        this.menu.addMenuItem(this._scrollableSessionsMenuSection);
    }

    _addButtonItems() {
        this._popupMenuButtonItems = new PopupMenuButtonItems.PopupMenuButtonItems();
        const buttonItems = this._popupMenuButtonItems.buttonItems;
        buttonItems.forEach(item => {
            this.menu.addMenuItem(item, this._itemIndex++);
        });

    }

    async _addSessionItems() {
        if (!GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            // TODO Empty session
            this._log.info(`${this._sessions_path} not found! It's harmless, please save some windows in the panel menu to create it automatically.`);
            return;
        }

        this._log.debug('List all sessions to add session items');
        
        let sessionFileInfos = [];
        await FileUtils.listAllSessions(null, false, this._prefsUtils.isDebug(),(file, info) => {
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

        }).catch(e => {this._log.error(e, 'Error listing all sessions')});

        // Sort by modification time: https://gjs-docs.gnome.org/gio20~2.66p/gio.fileenumerator
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

        this._sessionsMenuSection.removeAll();

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
        this._sessionsMenuSection.addMenuItem(item, this._itemIndex++);

        for (const sessionFileInfo of sessionFileInfos) {
            const info = sessionFileInfo.info;
            const file = sessionFileInfo.file;
            let item = new SessionItem.SessionItem(info, file, this);
            this._sessionsMenuSection.addMenuItem(item, this._itemIndex++);
        }
        
    }

    /**
     * monitor files changes, recreate items when necessary.
     * 
     */
    _addSessionFolderMonitor() {
        const sessionPathFile = Gio.File.new_for_path(this._sessions_path);
        // Ok, it's the directory we are monitoring :)
        // TODO If the parent of this._sessions_path was deleted, this.monitor don't get the 'changed' signal, so the panel menu items not removed.
        this.monitor = sessionPathFile.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this.monitor.connect('changed', this._sessionChanged.bind(this));
    }

    // https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor#signal-changed
    // Looks like the document is wrong ...
    _sessionChanged(monitor, file, other_file, eventType) {
        this._log.debug(`Session changed, readd all session items from ${this._sessions_path}. ${file.get_path()} changed. Event type: ${eventType}`);

        // Ignore CHANGED and CREATED events, since in both cases
        // we'll get a CHANGES_DONE_HINT event when done.
        if (eventType === Gio.FileMonitorEvent.CHANGED ||
            eventType === Gio.FileMonitorEvent.CREATED) 
            return;
                
        // Ignore temporary files generated by Gio
        if (file.get_basename().startsWith('.goutputstream-')) {
            return;
        }

        let info = null;
        try {
            info = file.query_info(
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
                  content_type === 'text/plain')) {
                return;
            }
        }

        // It probably is a problem when there are large amount session files,
        // say thousands of them, but who creates that much?
        // 
        // Can use Gio.FileMonitorEvent to modify the results 
        // of this._sessionsMenuSection._getMenuItems() when the performance
        // is a problem to be resolved, it's a more complex implement.
        this._addSessionItems().catch((error => {
            this._log.error(error, 'Error adding session items while session was changed');
        }));
    }

    _onAutoRestoreSwitchChanged() {
        this._search();
        this._filterAutoRestore();
    }

    _filterAutoRestore() {
        const switchState = this._searchSessionItem._filterAutoRestoreSwitch.state;
        if (switchState) {
            const menuItems = this._sessionsMenuSection._getMenuItems();
            for (const menuItem of menuItems) {
                const sessionName = menuItem._filename;
                if (menuItem.actor.visible) {
                    const visible = sessionName == this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
                    menuItem.actor.visible = visible;
                }
            }
        }
    }

    _onSearch() {
        this._search();
        this._filterAutoRestore();
    }

    _search() {
        this._searchSessionItem._clearIcon.show();

        let searchText = this._searchSessionItem._entry.text;
        if (!(searchText && searchText.trim())) {
            // when search entry is empty, hide clear button
            if (!searchText) {
                this._searchSessionItem._clearIcon.hide();
            }
            const menuItems = this._sessionsMenuSection._getMenuItems();
            for (const menuItem of menuItems) {
                menuItem.actor.visible = true;
            }
        } else {
            const menuItems = this._sessionsMenuSection._getMenuItems();
            searchText = searchText.toLowerCase().trim();
            for (const menuItem of menuItems) {
                const sessionName = menuItem._filename.toLowerCase();
                menuItem.actor.visible = new RegExp(searchText).test(sessionName);
            }
        }
    }

    destroy() {
        if (this.monitor) {
            this.monitor.cancel();
            this.monitor = null;
        }

        if (this._sessions_path) {
            this._sessions_path = null;
        }

        if (this._prefsUtils) {
            this._prefsUtils.destroy();
            this._prefsUtils = null;
        }

        if (this._log) {
            this._log.destroy();
            this._log = null;
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

        super.destroy();

        this._isDestroyed = true;
        
    }

});
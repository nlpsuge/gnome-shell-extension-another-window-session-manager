'use strict';

const { GObject, St, Gio, GLib, Clutter, Shell, Meta } = imports.gi;

const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;

const MoveSession = Me.imports.moveSession;

const FileUtils = Me.imports.utils.fileUtils;
const SessionItem = Me.imports.ui.sessionItem;
const SearchSessionItem = Me.imports.ui.searchSessionItem;
const PopupMenuButtonItems = Me.imports.ui.popupMenuButtonItems;
const IconFinder = Me.imports.utils.iconFinder;
const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");

        this._windowTracker = Shell.WindowTracker.get_default();

        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._log = new Log.Log();
        
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

        this.connect('destroy', this._onDestroy.bind(this));
        // Open menu
        // this.menu.open(true);
        // Toggle menu
        // this.menu.toggle();

        // Remove all activate signals on all menu items, so the panel menu can always stay open
        // See: PopupMenu#itemActivated() => this.menu._getTopMenu().close
        this.menu.itemActivated = function(animate) {};

        // Set a initial value to prevent error in `journalctl` when starting gnome-shell
        this._restoringApps = new Map();
        this._moveSession = new MoveSession.MoveSession();

        // this._connectIds = [];
        this._display = global.display;
        this._displayId = this._display.connect('window-created', this._windowCreated.bind(this));
        
    }

    _windowCreated(display, metaWindow, userData) {
        if (!Meta.is_wayland_compositor()) {
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }
            
            const shellAppData = this._restoringApps.get(shellApp);
            if (!shellAppData) {
                return;
            }
    
            const saved_window_sessions = shellAppData.saved_window_sessions;
    
            // On X11, we have to create enough workspace and move windows before receive the first-frame signal.
            // If not, all windows will be shown in current workspace when stay in Overview, which is not pretty.
            let matchedSavedWindowSession = this._moveSession.createEnoughWorkspaceAndMoveWindows(metaWindow, saved_window_sessions);
            
            if (matchedSavedWindowSession) {
                // Fix window geometry later on in first-frame or shown signal
                // TODO The side-effect is when a window is already in the current workspace there will be two same logs (The window 'Clocks' is already on workspace 0 for Clocks) in the journalctl, which is not pretty. 
                // TODO Maybe it's better to use another state to indicator whether a window has been restored geometry.
                matchedSavedWindowSession.moved = false;
            }
        }
        
        let metaWindowActor = metaWindow.get_compositor_private();
        // https://github.com/paperwm/PaperWM/blob/10215f57e8b34a044e10b7407cac8fac4b93bbbc/tiling.js#L2120
        // https://gjs-docs.gnome.org/meta8~8_api/meta.windowactor#signal-first-frame
        let firstFrameId = metaWindowActor.connect('first-frame', () => {
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }

            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> first-frame: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            const shellAppData = this._restoringApps.get(shellApp);
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowsByMetaWindow(metaWindow, saved_window_sessions);
        
            metaWindowActor.disconnect(firstFrameId);
            firstFrameId = 0;
        })
        let shownId = metaWindow.connect('shown', () => {
            const shellApp = this._windowTracker.get_window_app(metaWindow);
            if (!shellApp) {
                return;
            }
            
            // NOTE: The title of a dialog (for example a close warning dialog, like gnome-terminal) attached to a window is ''
            this._log.debug(`window-created -> shown: ${shellApp.get_name()} -> ${metaWindow.get_title()}`);

            const shellAppData = this._restoringApps.get(shellApp);
            if (!shellAppData) {
                return;
            }
            
            const saved_window_sessions = shellAppData.saved_window_sessions;
            
            this._moveSession.moveWindowsByMetaWindow(metaWindow, saved_window_sessions);
        
            metaWindow.disconnect(shownId);
            shownId = 0;
        });

        // TODO disconnect? Comment it due to too many errors when disable extension.
        // this._connectIds.push([metaWindowActor, firstFrameId]);
        
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
        this.menu.addMenuItem(this._searchSessionItem, this._itemIndex++);
                
        this._addScrollableSessionsMenuSection();
        this._addSessionItems();

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

    _addSessionItems() {
        if (!GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            // TOTO Empty session
            log(`${this._sessions_path} not found! It's harmless, please save some windows in the panel menu to create it automatically.`);
            return;
        }

        this._log.debug('List all sessions to add session items');

        let sessionFileInfos = [];
        FileUtils.listAllSessions(null, false, this._prefsUtils.isDebug(),(file, info) => {
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

            
            let parent = file.get_parent();
            let parentPath;
            // https://gjs-docs.gnome.org/gio20~2.66p/gio.file#method-get_parent
            // If the this represents the root directory of the file system, then null will be returned.
            if (parent === null) {
                // Impossible, who puts sessions under the /?
                parentPath = '/';
            } else {
                parentPath = parent.get_path();
            }
            this._log.debug(`Processing ${file.get_path()} under ${parentPath}`);
            sessionFileInfos.push({
                info: info,
                file: file
            });

        });

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
        this.monitor = sessionPathFile.monitor_directory(Gio.FileMonitorFlags.WATCH_MOUNTS | Gio.FileMonitorFlags.WATCH_MOVES, null);
        this.monitor.connect('changed', this._sessionPathChanged.bind(this));
    }

    // https://gjs-docs.gnome.org/gio20~2.66p/gio.filemonitor#signal-changed
    // Looks like the document is wrong ...
    _sessionPathChanged(monitor, srcFile, descFile) {
        this._log.debug(`Session path changed, readd all session items from ${this._sessions_path}. ${srcFile.get_path()} was changed.`);
        this._sessionsMenuSection.removeAll();
        // It probably is a problem when there is large amount session files,
        // say thousands of them, but who creates that much?
        // 
        // Can use Gio.FileMonitorEvent to modify the results 
        // of this._sessionsMenuSection._getMenuItems() when the performance
        // is a problem to be resolved, it's a more complex implement.
        this._addSessionItems();
    }

    _onSearch() {
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

    _onDestroy() {
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

        // if (this._connectIds) {
        //     for (let [obj, id] of this._connectIds) {
        //         if (id) {
        //             obj.disconnect(id);
        //         }
        //     }
        //     this._connectIds = null;
        // }
        
        if (this._displayId) {
            this._display.disconnect(this._displayId);
            this._displayId = 0;
        }

        this.destroy();
        
    }

});
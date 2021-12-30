'use strict';

const { GObject, St, Gio, GLib, Clutter } = imports.gi;

const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;

const FileUtils = Me.imports.utils.fileUtils;
const SessionItem = Me.imports.ui.sessionItem;
const SearchSessionItem = Me.imports.ui.searchSessionItem;
const PopupMenuButtonItems = Me.imports.ui.popupMenuButtonItems;
const IconFinder = Me.imports.utils.iconFinder;
const Log = Me.imports.utils.log;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");
        
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

        Log.debug('List all sessions to add session items');

        let sessionFileInfos = [];
        FileUtils.listAllSessions(null, false, (file, info) => {
            // We have an interest in regular and text files

            const file_type = info.get_file_type();
            if (file_type !== Gio.FileType.REGULAR) {
                Log.debug(`${file.get_path()} (file type is ${file_type}) is not a regular file, skipping`);
                return;
            }
            const content_type = info.get_content_type();
            if (content_type !== 'text/plain') {
                Log.debug(`${file.get_path()} (content type is ${content_type}) is not a text file, skipping`);
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
            Log.debug(`Processing ${file.get_path()} under ${parentPath}`);
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
            let item = new SessionItem.SessionItem(info, file);
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
        Log.debug(`Session path changed, readd all session items from ${this._sessions_path}. ${srcFile.get_path()} was changed.`);
        
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

        this.destroy();
        
    }

});
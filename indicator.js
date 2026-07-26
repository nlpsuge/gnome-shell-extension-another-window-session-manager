'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';


import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Constants from './constants.js';

import * as FileUtils from './utils/fileUtils.js';
import * as SessionItem from './ui/sessionItem.js';
import * as SearchSessionItem from './ui/searchSessionItem.js';
import * as PopupMenuButtonItems from './ui/popupMenuButtonItems.js';
import * as IconFinder from './utils/iconFinder.js';
import {PrefsUtils} from './utils/prefsUtils.js';
import * as Log from './utils/log.js';


export const AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, _('Yet Another Window Session Manager'));

        this._windowTracker = Shell.WindowTracker.get_default();

        this._settings = PrefsUtils.getSettings();
        this._log = new Log.Log();
        
        this._itemIndex = 0;

        this._sessions_path = FileUtils.sessions_path;

        this.monitors = [];

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

        // Remove all activate signals on all menu items, so the panel menu can always stay open
        // See: PopupMenu#itemActivated() => this.menu._getTopMenu().close
        this.menu.itemActivated = function(animate) {};

        this._isDestroyed = false;
        
    }

    _onOpenStateChanged(menu, state) {
        if (state) {
            this._searchSessionItem.reset();
            this._searchSessionItem._clearIcon.hide();
            this._searchSessionItem._entry.grab_key_focus();
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
        this._addSessionItems().catch(error => {
            this._log.error(error, 'Error adding session items while creating indicator menu');
        });

        this._addSessionFolderMonitor();
        this._settings.connect('changed::debugging-mode', () => {
            this._addSessionItems().catch(error => {
                this._log.error(error, 'Error reloading session items while debugging-mode was changed');
            });
        });
    }

    _addScrollableSessionsMenuSection() {
        this._sessionsMenuSection = new PopupMenu.PopupMenuSection();
        this._scrollableSessionsMenuSection = new PopupMenu.PopupMenuSection();
        let scrollView = new St.ScrollView({
            style_class: 'session-menu-section',
            overlay_scrollbars: true
        });

        // Clutter.Container was removed from Gnome 46, see:
        // https://gjs.guide/extensions/upgrading/gnome-shell-46.html
        scrollView[Clutter.Container ? 'add_actor' : 'set_child'](this._sessionsMenuSection.actor);
        this._scrollableSessionsMenuSection.actor.add_child(scrollView);

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
            this._sessionsMenuSection.removeAll();
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
    _sessionChanged(monitor, fileMonitored, otherFile, eventType) {
        const pathMonitored = fileMonitored.get_path();
        const otherFilePath = otherFile?.get_path();
        this._log.debug(`Session changed, readd all session items from ${this._sessions_path}. ${pathMonitored} changed. other_file: ${otherFilePath}. Event type: ${eventType}`);

        // Ignore CHANGED and CREATED events, since in both cases
        // we'll get a CHANGES_DONE_HINT event when done.
        if (eventType === Gio.FileMonitorEvent.CHANGED ||
            eventType === Gio.FileMonitorEvent.CREATED) {
                return;
        }
        
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
        if (fileMonitored.get_basename().startsWith('.goutputstream-')) {
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
        // of this._sessionsMenuSection._getMenuItems() when the performance
        // is a problem to be resolved, it's a more complex implement.
        this._addSessionItems().catch(error => {
            this._log.error(error, 'Error adding session items while session was changed');
        });
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
                    const visible = sessionName == this._settings.get_string(Constants.PREFS_SETTING_AUTORESTORE_SESSIONS);
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

        if (this._log) {
            this._log.destroy();
            this._log = null;
        }

        if (this._popupMenuButtonItems) {
            this._popupMenuButtonItems.destroy();
            this._popupMenuButtonItems = null;
        }

        super.destroy();

        this._isDestroyed = true;
        
    }

});

'use strict';

const { GObject, St, Gio, GLib, Clutter } = imports.gi;

const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;

const FileUtils = Me.imports.utils.fileUtils;
const SessionItem = Me.imports.ui.sessionItem;
const SearchSession = Me.imports.ui.searchSession;
const PopupMenuButtonItems = Me.imports.ui.popupMenuButtonItems;
const IconFinder = Me.imports.utils.iconFinder;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");
        
        this._itemIndex = 0;

        this._sessions_path = FileUtils.sessions_path;
        // TODO backup path

        // Add an icon
        let icon = new St.Icon({
            gicon: IconFinder.find('restore-symbolic.svg'),
            style_class: 'popup-menu-icon'
        });
        this.add_child(icon);
        this.buttonText = new St.Label({
            text: _("Loading..."),
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this.buttonText);

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
            this._searchSession.reset();
            Mainloop.idle_add(() => this._searchSession._entry.grab_key_focus());
        }
        super._onOpenStateChanged(menu, state);
    }

    _createMenu() {
        this._addButtonItems();
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), this._itemIndex++);

        this._searchSession = new SearchSession.SearchSession();
        this.menu.addMenuItem(this._searchSession, this._itemIndex++);
        
        this._addSessionItems();
    }

    _addButtonItems() {
        this._popupMenuButtonItems = new PopupMenuButtonItems.PopupMenuButtonItems();
        const buttonItems = this._popupMenuButtonItems.buttonItems;
        buttonItems.forEach(item => {
            this.menu.addMenuItem(item, this._itemIndex++);
        });

    }

    // TODO monitor files changes? Refresh items when open menu? 
    _addSessionItems() {
        if (!GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            // TOTO Empty session
            log(`${this._sessions_path} not found!`);
            return;
        }

        this._sessionsMenuSection = new PopupMenu.PopupMenuSection();
        this._scrollableSessionsMenuSection = new PopupMenu.PopupMenuSection();
        let scrollView = new St.ScrollView({
            style_class: 'session-menu-section',
            overlay_scrollbars: true
        });
        scrollView.actor.add_actor(this._sessionsMenuSection.actor);
        this._scrollableSessionsMenuSection.actor.add_actor(scrollView);

        this.menu.addMenuItem(this._scrollableSessionsMenuSection);

        // Debug
        log('List all sessions to add session items');
        // TODO Sort by modification time: https://gjs-docs.gnome.org/gio20~2.66p/gio.fileenumerator
        FileUtils.listAllSessions(null, false, (file, info) => {
            if (info.get_file_type() === Gio.FileType.REGULAR) {
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
                // Debug
                log(`Processing ${file.get_path()} under ${parentPath}`);
                let item = new SessionItem.SessionItem(info, file);
                this._sessionsMenuSection.addMenuItem(item, this._itemIndex++);
            }
        });
        
    }

    _onDestroy() {
        log('Destroying...');
        
    }

});
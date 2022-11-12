'use strict';

const { Clutter, GObject, St, Shell, GLib } = imports.gi;

const Main = imports.ui.main;

const Mainloop = imports.mainloop;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SearchSessionItem = Me.imports.ui.searchSessionItem;
const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;

var SearchableList = class SearchableList extends PopupMenu.PopupMenuSection {

    constructor(wantFilter) {
        super();

        this._wantFilter = wantFilter;

        this.listSection = new PopupMenu.PopupMenuSection();

        // Get rid of 'JS ERROR: Exception in callback for signal: open-state-changed: TypeError: this._getTopMenu()._setOpenedSubMenu is not a function'
        this.listSection._setOpenedSubMenu = function(submenu) {
            if (this._openedSubMenu)
                this._openedSubMenu.close(true);
            this._openedSubMenu = submenu;
        }

        this._sessionListItemIndex = 0;

        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();
        this._log = new Log.Log();

        // Search entry
        this.searchItem = new SearchSessionItem.SearchSessionItem(wantFilter);
        const searchEntryText = this.searchItem._entry.get_clutter_text();
        searchEntryText.connect('text-changed', this._onSearch.bind(this));
        if (this._wantFilter) {
            this.searchItem._filterAutoRestoreSwitch.connect('notify::state', this._onSearch.bind(this));
        }
        this.addMenuItem(this.searchItem, this._sessionListItemIndex++);

        // List
        const scrollableSessionsMenuSection = this._getScrollableSessionsMenuSection();
        this.addMenuItem(scrollableSessionsMenuSection, this._sessionListItemIndex++);


    }

    initSearchEntry() {
        this._resetSearchEntry();

        this._focusIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            global.stage.set_key_focus(this.searchItem._entry); 
            this._focusIdleId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _resetSearchEntry() {
        this.searchItem.reset();
        this.searchItem._clearIcon.hide();
    }

    add(item) {
        this.listSection.addMenuItem(item, this._sessionListItemIndex++);
    }

    getAll() {
        this.listSection._getMenuItems();
    }

    removeAll() {
        this.listSection.removeAll();
    }

    _getScrollableSessionsMenuSection() {
        const oldStyleClassName = this.listSection.actor.get_style_class_name();
        this.listSection.actor.set_style_class_name(`${oldStyleClassName} font`);
        // Works
        // this.listSection.actor.set_style('font-size: 30px;');
        const scrollableSessionsMenuSection = new PopupMenu.PopupMenuSection();
        let scrollView = new St.ScrollView({
            style_class: 'session-menu-section',
            overlay_scrollbars: true
        });
        scrollView.add_actor(this.listSection.actor);
        scrollableSessionsMenuSection.actor.add_actor(scrollView);

        return scrollableSessionsMenuSection;
    }

    _filterAutoRestore() {
        if (!this._wantFilter) return;

        const switchState = this.searchItem._filterAutoRestoreSwitch.state;
        if (switchState) {
            const menuItems = this.listSection._getMenuItems();
            for (const menuItem of menuItems) {
                const text = menuItem.label.clutter_text.get_text();
                if (menuItem.actor.visible) {
                    const visible = text == this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
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
        this.searchItem._clearIcon.show();

        let keyword = this.searchItem._entry.text;
        if (!(keyword && keyword.trim())) {
            // when search entry is empty, hide clear button
            if (!keyword) {
                this.searchItem._clearIcon.hide();
            }
            const menuItems = this.listSection._getMenuItems();
            for (const menuItem of menuItems) {
                menuItem.actor.visible = true;
            }
        } else {
            const menuItems = this.listSection._getMenuItems();
            keyword = keyword.toLowerCase().trim();
            for (const menuItem of menuItems) {
                const text = menuItem.label.clutter_text.get_text().toLowerCase();
                menuItem.actor.visible = new RegExp(keyword).test(text);
            }
        }
    }

    destroy() {
        if (this._focusIdleId) {
            GLib.Source.remove(this._focusIdleId);
        }
    }


}
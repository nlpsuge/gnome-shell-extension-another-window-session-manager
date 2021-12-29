'use strict';

const { GObject, St, Clutter } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionItemButtons = Me.imports.ui.sessionItemButtons;
const { PopupMenuButtonItem } = Me.imports.ui.popupMenuButtonItem;

var SessionItem = GObject.registerClass(
class SessionItem extends PopupMenuButtonItem {
    
    _init(fileInfo, file) {
        // Initialize this component, so we can use this.label etc
        super._init("");

        this._filename = fileInfo.get_name();
        this._filepath = file.get_path();
        this._modification_time = 'Unknown';
        const modification_date_time = fileInfo.get_modification_date_time();
        if (modification_date_time) {
            this._modification_time = modification_date_time.to_local().format('%Y-%m-%d %T');
        }

        this.label.set_x_expand(true);
        this.label.clutter_text.set_text(this._filename);

        this._sessionItemButtons = new SessionItemButtons.SessionItemButtons(this);
        this._sessionItemButtons.addButtons();

        this.createYesAndNoButtons();

    }

   
    
});

var EmptySessionItem = GObject.registerClass(
class EmptySessionItem extends PopupMenu.PopupMenuItem {
    
    _init() {
        super._init("(Empty, please save open windows first)");
        this.setSensitive(false);
    }

});


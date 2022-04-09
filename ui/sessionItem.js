'use strict';

const { GObject, St, Clutter, GLib } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionItemButtons = Me.imports.ui.sessionItemButtons;

var SessionItem = GObject.registerClass(
class SessionItem extends PopupMenu.PopupMenuItem {
    
    _init(fileInfo, file, indicator) {
        // Initialize this component, so we can use this.label etc
        super._init("");

        this._indicator = indicator;

        this._modification_time = 'Unknown';
        this._filepath = file.get_path();
        if(fileInfo != null) {
            this._filename = fileInfo.get_name(); 
            const modification_date_time = fileInfo.get_modification_date_time();
            if (modification_date_time) {
                this._modification_time = modification_date_time.to_local().format('%Y-%m-%d %T');
            }
        } else {
            this._filename = file.get_basename();
        }

        this.label.set_x_expand(true);
        this.label.clutter_text.set_text(this._filename);

        this._sessionItemButtons = new SessionItemButtons.SessionItemButtons(this);
        this._sessionItemButtons.addButtons();

    }

   
    
});

var EmptySessionItem = GObject.registerClass(
class EmptySessionItem extends PopupMenu.PopupMenuItem {
    
    _init() {
        super._init("(Empty, please save open windows first)");
        this.setSensitive(false);
    }

});


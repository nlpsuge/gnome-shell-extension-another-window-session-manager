'use strict';

const { GObject, St, Clutter, GLib, Pango } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


var RunningSubMenuMenuItem = GObject.registerClass(
class RunningSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    
    _init(text, icon) {
        if (icon) {
            super._init(text, true);
            this.icon.gicon = icon;
        } else {
            super._init(text, false);
        }
        
        // To prevent from the focus stolen from the session save entry
        this.can_focus = false;

    }

    
});

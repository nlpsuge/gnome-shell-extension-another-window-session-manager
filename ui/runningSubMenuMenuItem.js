'use strict';

const { GObject, St, Clutter, GLib, Pango } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const DateUtils = Me.imports.utils.dateUtils;

var RunningSubMenuMenuItem = GObject.registerClass(
class RunningSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    
    _init(text, app) {
        const icon = app.get_icon();
        if (icon) {
            super._init(text, true);
            this.icon.gicon = icon;
        } else {
            super._init(text, false);
        }

        // To prevent from the focus stolen from the session save entry
        this.can_focus = false;


        const windows = app.get_windows();
        this._userTime = DateUtils.getRealTime(windows[0]);
        this.userTimeLabel = new St.Label({
            text: this._userTime,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.insert_child_below(this.userTimeLabel, this._triangleBin);

        this.menu.connect('open-state-changed', (state) => {
            if (state) {
                this.actor.add_style_class_name('popup-sub-menu-aws');
                this.menu.box.add_style_class_name('popup-sub-menu-box-aws');
            } else {
                this.actor.remove_style_class_name('popup-sub-menu-aws');
                this.menu.box.remove_style_class_name('popup-sub-menu-box-aws');
            }
        });



    }

    
});


var RunningItem = GObject.registerClass(
    class RunningItem extends PopupMenu.PopupMenuItem {
        
    _init(window) {
        super._init("", {
            hover: false,
        });

        this.window = window;
        this.label.set_x_expand(true);
        const clutter_text = this.label.clutter_text;
        clutter_text.set_text(this.window.get_title());

        this._userTime = DateUtils.getRealTime(this.window);
        const userTimeLabel = new St.Label({
            text: this._userTime
        });
        this.actor.add_child(userTimeLabel);

    }
});
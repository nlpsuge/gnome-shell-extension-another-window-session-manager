'use strict';

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const St = imports.gi.St;

const Main = imports.ui.main;

/**
 * Note: Adapted from: https://github.com/GSConnect/gnome-shell-extension-gsconnect/blob/master/src/shell/tooltip.js
 * 
 * I may or may not modify it to fit the needs of this project.
 */

/**
 * An StTooltip for ClutterActors
 *
 * Adapted from: https://github.com/RaphaelRochet/applications-overview-tooltip
 * See also: https://github.com/GNOME/gtk/blob/master/gtk/gtktooltip.c
 */
var POPUP_DIALOG_POSITION_TOP = 'TOP';
var POPUP_DIALOG_POSITION_BOTTOM = 'BOTTOM';


var PopupDialog = class PopupDialog {

    constructor(params, custom) {
        Object.assign(this, params);

        this._bin = null;
        this._label = null;
        this._showing = false;
        this._position = POPUP_DIALOG_POSITION_TOP;

        this._createDialog(custom);

        this._destroyId = this.parent.connect(
            'destroy',
            this.destroy.bind(this)
        );

        this._buttonPressEventId = this.parent.connect(
            'button-press-event',
            this._showOrHide.bind(this)
        );
    }

    get x_offset() {
        if (this._x_offset === undefined)
            this._x_offset = 0;

        return this._x_offset;
    }

    set x_offset(offset) {
        this._x_offset = (Number.isInteger(offset)) ? offset : 0;
    }

    get y_offset() {
        if (this._y_offset === undefined)
            this._y_offset = 0;

        return this._y_offset;
    }

    set y_offset(offset) {
        this._y_offset = (Number.isInteger(offset)) ? offset : 0;
    }

    /**
     * 
     * POPUP_DIALOG_POSITION_TOP by default
     * 
     * @param {string} position 
     */
    set position(position) {
        if (position !== POPUP_DIALOG_POSITION_TOP && position !== POPUP_DIALOG_POSITION_BOTTOM) {
            throw new Error(`Wrong position, only supports TOP and BOTTOM: ${position}`);
        }
        this._position = position;
    }

    setContent(content, makeup) {  
        if (makeup) {
            this._label.clutter_text.set_markup(content)     
        } else {
            this._label.clutter_text.set_text(content);
        }

    }

    addIcon(gicon) {
        this._bin.child.icon = new St.Icon({
            gicon: gicon,
            y_align: St.Align.START,
        });
        this._bin.child.icon.set_y_align(Clutter.ActorAlign.START);
        this._bin.child.add_child(this._bin.child.icon);
    }

    _createDialog(custom) {
        this._bin = new St.Bin({
            style_class: 'osd-window awsm-tooltip',
            opacity: 232,
        });

        if (custom) {
            this._bin.child = custom;
        } else {
            this._bin.child = new St.BoxLayout({vertical: false});
            this._label = new St.Label();
            this._label.clutter_text.line_wrap = true;
            this._label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
            this._label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._bin.child.add_child(this._label);
        }

        Main.layoutManager.uiGroup.add_child(this._bin);
        Main.layoutManager.uiGroup.set_child_above_sibling(this._bin, null);

    }

    _showOrHide() {
        log(`showing ${this._showing}`)
        if (this._showing) {
            this._hide();
        } else {
            this._show();
        }
    }

    _show() {
        // Position tooltip
        let [x, y] = this.parent.get_transformed_position();
        x = (x + (this.parent.width / 2)) - Math.round(this._bin.width / 2);

        x += this.x_offset;

        if (this._position === POPUP_DIALOG_POSITION_TOP) {
            y -= this.y_offset + this.parent.height + this._bin.height / 2;
        } else {
            y += this.y_offset;
        }

        // Show tooltip
        if (this._showing) {
            this._bin.ease({
                x: x,
                y: y,
                time: 0.15,
                transition: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._bin.set_position(x, y);
            this._bin.ease({
                opacity: 232,
                time: 0.15,
                transition: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            this._showing = true;
        }
    }

    _hide() {
        if (this._bin) {
            this._bin.ease({
                opacity: 0,
                time: 0.10,
                transition: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    // just hide
                    this._bin.hide();
                },
            });
        }

        this._showing = false;
    }

    destroy() {
        this.parent.disconnect(this._destroyId);
        this.parent.disconnect(this._buttonPressEventId);

        if (this._bin) {
            Main.layoutManager.uiGroup.remove_actor(this._bin);
            this._bin.destroy();
        }

    }
};


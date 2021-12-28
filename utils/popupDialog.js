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
var TOOLTIP_BROWSE_ID = 0;
var TOOLTIP_BROWSE_MODE = false;
var POPUP_DIALOG_POSITION_TOP = 'TOP';
var POPUP_DIALOG_POSITION_BOTTOM = 'BOTTOM';


var PopupDialog = class PopupDialog {

    constructor(params) {
        Object.assign(this, params);

        this._bin = null;
        this._showing = false;

        this._destroyId = this.parent.connect(
            'destroy',
            this.destroy.bind(this)
        );

        this._buttonPressEventId = this.parent.connect(
            'button-press-event',
            this._show.bind(this)
        );
    }

    get custom() {
        if (this._custom === undefined)
            this._custom = null;

        return this._custom;
    }

    set custom(actor) {
        this._custom = actor;
        this._markup = null;
        this._text = null;

        if (this._showing)
            this._show();
    }

    get gicon() {
        if (this._gicon === undefined)
            this._gicon = null;

        return this._gicon;
    }

    set gicon(gicon) {
        this._gicon = gicon;

        if (this._showing)
            this._show();
    }

    get icon() {
        return (this.gicon) ? this.gicon.name : null;
    }

    set icon(icon_name) {
        if (!icon_name)
            this.gicon = null;
        else
            this.gicon = new Gio.ThemedIcon({name: icon_name});
    }

    get markup() {
        if (this._markup === undefined)
            this._markup = null;

        return this._markup;
    }

    set markup(text) {
        this._markup = text;
        this._text = null;

        if (this._showing)
            this._show();
    }

    get text() {
        if (this._text === undefined)
            this._text = null;

        return this._text;
    }

    set text(text) {
        this._markup = null;
        this._text = text;

        if (this._showing)
            this._show();
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

    set_position(position) {
        if (position !== POPUP_DIALOG_POSITION_TOP && position !== POPUP_DIALOG_POSITION_BOTTOM) {
            throw new Error(`Wrong position, only supports TOP and BOTTOM: ${position}`);
        }
        this._position = position;
    }

    _show() {
        if (this.text === null && this.markup === null)
            return this._hide();

        if (this._bin === null) {
            this._bin = new St.Bin({
                style_class: 'osd-window awsm-tooltip',
                opacity: 232,
            });

            if (this.custom) {
                this._bin.child = this.custom;
            } else {
                this._bin.child = new St.BoxLayout({vertical: false});

                if (this.gicon) {
                    this._bin.child.icon = new St.Icon({
                        gicon: this.gicon,
                        y_align: St.Align.START,
                    });
                    this._bin.child.icon.set_y_align(Clutter.ActorAlign.START);
                    this._bin.child.add_child(this._bin.child.icon);
                }

                this.label = new St.Label({text: this.markup || this.text});
                this.label.clutter_text.line_wrap = true;
                this.label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
                this.label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                this.label.clutter_text.use_markup = (this.markup);
                this._bin.child.add_child(this.label);
            }

            Main.layoutManager.uiGroup.add_child(this._bin);
            Main.layoutManager.uiGroup.set_child_above_sibling(this._bin, null);
        } else if (this.custom) {
            this._bin.child = this.custom;
        } else {
            if (this._bin.child.icon)
                this._bin.child.icon.destroy();

            if (this.gicon) {
                this._bin.child.icon = new St.Icon({gicon: this.gicon});
                this._bin.child.insert_child_at_index(this._bin.child.icon, 0);
            }

            this.label.clutter_text.text = this.markup || this.text;
            this.label.clutter_text.use_markup = (this.markup);
        }

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

        // Enable browse mode
        TOOLTIP_BROWSE_MODE = true;

        if (TOOLTIP_BROWSE_ID) {
            GLib.source_remove(TOOLTIP_BROWSE_ID);
            TOOLTIP_BROWSE_ID = 0;
        }

    }

    _hide() {
        if (this._bin) {
            this._bin.ease({
                opacity: 0,
                time: 0.10,
                transition: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    Main.layoutManager.uiGroup.remove_actor(this._bin);

                    if (this.custom)
                        this._bin.remove_child(this.custom);

                    this._bin.destroy();
                    this._bin = null;
                },
            });
        }

        this._showing = false;
    }

    destroy() {
        this.parent.disconnect(this._destroyId);
        this.parent.disconnect(this._buttonPressEventId);

        if (this.custom)
            this.custom.destroy();

        if (this._bin) {
            Main.layoutManager.uiGroup.remove_actor(this._bin);
            this._bin.destroy();
        }

    }
};

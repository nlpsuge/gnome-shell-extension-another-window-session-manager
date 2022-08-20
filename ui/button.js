'use strict';

const { GObject, St, Clutter } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const IconFinder = Me.imports.utils.iconFinder;

var Button = GObject.registerClass(
class Button extends GObject.Object {

    _init(properties) {
        super._init();

        this.button_style_class = null;
        this.icon_symbolic = null;

        Object.assign(this, properties);

        this.button = this._createButton(this.icon_symbolic);
        
    }

    _createButton(iconSymbolic) {
        let icon = new St.Icon({
            gicon: IconFinder.find(iconSymbolic),
            style_class: 'system-status-icon'
        });

        let button = new St.Button({
            style_class: this.button_style_class ? this.button_style_class : 'aws-item-button',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true
        });

        return button;
    }

    destroy() {
        if (this.button) {
            this.button = null;
        }

    }

});

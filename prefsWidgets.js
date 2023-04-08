'use strict';

const { Gtk, GLib, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const GnomeVersion = Me.imports.utils.gnomeVersion;


var boxProperties = {
    spacing: 0,
    margin_start: 6,
    margin_end: 6,
    hexpand: true,
    halign: Gtk.Align.START,
    margin_top: 0,
    margin_bottom: 0,
};

var newColumnViewColumn = function(title, factorySetupFunc, factoryBindFunc) {
    const factory = new Gtk.SignalListItemFactory();
    const columnViewColumn = new Gtk.ColumnViewColumn({
        title,
        factory
    });

    if (factorySetupFunc) {
        factory.connect('setup', (factory, listItem) => {
            factorySetupFunc(factory, listItem);
        });
    }
    
    if (factoryBindFunc) {
        factory.connect('bind', (factory, listItem) => {
            factoryBindFunc(factory, listItem);
        });
    }
    return columnViewColumn;
}

var newRemoveButton = function() {
    return new BoxRemoveButton();
}

var newLabelSwitch = function(text, tooltipText, active) {
    return new LabelSwitch(text, tooltipText, active);
}

var updateStyle = function(widget, css) {
    const cssProvider = new Gtk.CssProvider();
    if (GnomeVersion.isLessThan44()) {
        cssProvider.load_from_data(css);
    } else {
        cssProvider.load_from_data(css, -1);
    }
    widget.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

var _newBox = function(properties) {
    const box = new Gtk.Box({
        spacing: 6,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 6,
        margin_end: 6,
    })
    Object.assign(box, properties);
    return box;
}

var _newDropDown = function(values, activeValue) {
    const dropDownValues = values.map(cv => cv[1]);
    const dropDown = Gtk.DropDown.new_from_strings(dropDownValues);
    dropDown.set_valign(Gtk.Align.BASELINE);
    for (let i = 0; i < dropDownValues.length; i++) {
        if (dropDownValues[i] === activeValue)
            dropDown.set_selected(i);
    }
    const factory = dropDown.get_factory();
    factory.connect('bind', (factory, listItem) => {
        const box = listItem.get_child();
        const label = box.get_first_child();
        const widthChars = Math.max(...dropDownValues.map(
            // GLib.utf8_strlen(v, -1) causes right margin between the label and box is too large, so -2 to reduce this margin
            v => GLib.utf8_strlen(v, -1) - 2));
        label.set_width_chars(widthChars);
    });
    return dropDown;
}

var LabelSwitch = GObject.registerClass({
    Signals: {
        'active': {
            param_types: [GObject.TYPE_BOOLEAN, Gtk.Switch]
        }
    }
}, class LabelSwitch extends Gtk.Box {

    _init(text, tooltipText, active) {
        super._init(boxProperties);
        this.tooltip_text = tooltipText;

        const [button, switcherBox, switcher] = this._initSwitch(text, tooltipText);
        switcher.active = active ? active : false;

        this.append(button);
        this.append(switcherBox);

        switcher.connect('notify::active', (switcher) => {
            this.emit('active', switcher.get_active(), switcher);
        });
    }

    _initSwitch(text, tooltipText) {
        const button = new Gtk.Button({
            label: text,
            can_target: false
        });
        // Imitate a button
        // Here we don't use Gtk.Button with a Gtk.Switch. Because I don't want to get into the trouble that
        // the click event can't be propagated down to the Gtk.Switch.
        const switcherBox = new Gtk.Box({css_name: 'button'});
        const switcher = new Gtk.Switch({valign: Gtk.Align.CENTER});
    
        updateStyle(button, 
            // Use .text-button if the button displays a label; Use .image-button if it displays an image
            `.text-button {
                padding-right: 0px;
                padding-left: 6px;
                border-top-right-radius: 0px;
                border-bottom-right-radius: 0px;
            }`);
    
        updateStyle(switcherBox, 
            `button {
                padding-right: 6px;
                padding-left: 6px;
                border-top-left-radius: 0px;
                border-bottom-left-radius: 0px;
            }`);
    
        switcherBox.append(switcher);

        return [button, switcherBox, switcher];
    }

});

var BoxRemoveButton = GObject.registerClass({
    Signals: {'clicked': {}}
}, class BoxRemoveButton extends Gtk.Box {

    _init() {
        super._init(boxProperties);
        Object.assign(this, {
            hexpand: true,
            halign: Gtk.Align.START
        });

        const boxRemoveButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
        });

        this.append(boxRemoveButton);

        boxRemoveButton.connect('clicked', () => {
            this.emit('clicked');
        });
    }

});


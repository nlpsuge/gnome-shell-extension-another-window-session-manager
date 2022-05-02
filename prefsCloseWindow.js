
const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// const _ = ExtensionUtils.gettext;

var UICloseWindows = GObject.registerClass(
class UICloseWindows extends GObject.Object {
    _init() {
        super._init({
        });

        this._builder = new Gtk.Builder();
        this._builder.add_from_file(Me.path + '/ui/prefs-gtk4.ui');
    }

    build() {
        this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');
        this.close_by_rules_switch.connect('notify::active', (widget) => {
            const active = widget.active;
    
        });
    
    

    }

    
});


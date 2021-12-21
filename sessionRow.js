const { GObject, St, Gtk, GLib } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

var SessionRow = GObject.registerClass(
class SessionRow extends Gtk.ListBoxRow {
    
    _init(fileInfo, file) {
        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        // Initialize this component, so we can use this.label etc
        super._init({
            activatable: false,
            child: box,
        });

        this._filename = fileInfo.get_name();
        this._modification_time = 'Unknown';
        const modification_date_time = fileInfo.get_modification_date_time();
        if (modification_date_time) {
            this._modification_time = modification_date_time.format('%Y-%m-%d %T');
        }

        this._filepath = file.get_path();

        const fileLabel = new Gtk.Label({
            label: this._filename,
            halign: Gtk.Align.START,
            hexpand: true,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        box.append(fileLabel);

        const modificationTimeLabel = new Gtk.Label({
            label: this._modification_time,
            halign: Gtk.Align.START,
            hexpand: true,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        box.append(modificationTimeLabel);

        const saveButton = new Gtk.Button({
            // action_name: 'restore',
            // action_target: new GLib.Variant('s', this.id),
            icon_name: 'face-laugh-symbolic',
        });
        box.append(saveButton);

        const restoreButton = new Gtk.Button({
            // action_name: 'restore',
            // action_target: new GLib.Variant('s', this.id),
            icon_name: 'face-laugh-symbolic',
        });
        box.append(restoreButton);


        const closeButton = new Gtk.Button({
            // action_name: 'restore',
            // action_target: new GLib.Variant('s', this.id),
            icon_name: 'face-laugh-symbolic',
        });
        box.append(closeButton);
    }

    
});

var EmptySessionItem = GObject.registerClass(
class EmptySessionItem extends PopupMenu.PopupMenuItem {
    
    _init() {
        super._init("(Empty, please save open windows first)");
        this.setSensitive(false);
    }

});


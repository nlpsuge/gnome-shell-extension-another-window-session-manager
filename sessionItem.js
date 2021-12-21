const { GObject, St } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

var SessionItem = GObject.registerClass(
class SessionItem extends PopupMenu.PopupMenuItem {
    
    _init(fileInfo, file) {
        // Initialize this component, so we can use this.label etc
        super._init("");

        this._filename = fileInfo.get_name();
        this._filepath = file.get_path();
        this._modification_time = 'Unknown';
        const modification_date_time = fileInfo.get_modification_date_time();
        if (modification_date_time) {
            this._modification_time = modification_date_time.format('%Y-%m-%d %T');
        }

        this.label.set_x_expand(true);
        this.label.clutter_text.set_text(this._filename);

        this.add_child(new St.Bin({
            x_align: St.Align.END,

        }));
    }

    
});

var EmptySessionItem = GObject.registerClass(
class EmptySessionItem extends PopupMenu.PopupMenuItem {
    
    _init() {
        super._init("(Empty, please save open windows first)");
        this.setSensitive(false);
    }

});


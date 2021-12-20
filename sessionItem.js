const { GObject } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

var SessionItem = GObject.registerClass(
class SessionItem extends PopupMenu.PopupMenuItem {
    
    _init(filename, filepath, index) {
        this._filename = filename;
        this._filepath = filepath;
        this._index =  index;

        
        this.setIndex(index);
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


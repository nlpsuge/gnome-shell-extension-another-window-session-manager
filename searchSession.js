const { GObject, St } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const Mainloop = imports.mainloop;

var SearchSession = GObject.registerClass(
class SearchSession extends PopupMenu.PopupBaseMenuItem {

    _init() {
        super._init({
            activate: false,
            reactive: true,
            hover: false,
            can_focus: false
        });

        this._entry = new St.Entry({
            name: 'searchEntry',
            style_class: 'search-entry',
            can_focus: true,
            track_hover: true,
            x_expand: true,
            y_expand: true
        });

        this._entry.set_primary_icon(new St.Icon({
            style_class:'search-entry-icon',
            icon_name:'edit-find-symbolic'
        }));

        this._entry.get_clutter_text().connect(
            'text-changed',
            this._onTextChanged.bind(this)
        );

        this.add_child(this._entry);

        this._clearIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-clear-symbolic'
        });

    }

    reset() {
        this._entry.grab_key_focus();
        this._entry.set_text('');
        let text = this._entry.get_clutter_text();
        text.set_cursor_visible(true);
    }
    
    _onTextChanged() {
        this._entry.set_secondary_icon(this._clearIcon);
        this._entry.connect('secondary-icon-clicked', this.reset.bind(this));

    }
});
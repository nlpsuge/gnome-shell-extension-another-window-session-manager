const { GObject, St, Atk } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

/**
 * Based on `popupMenu.Switch` in Gnome shell
 */
var AwsmSwitch = GObject.registerClass({
    Properties: {
        'state': GObject.ParamSpec.boolean(
            'state', 'state', 'state',
            GObject.ParamFlags.READWRITE,
            false),
    },
}, class AwsmSwitch extends St.Bin {
    _init(state) {
        this._state = false;

        super._init({
            style_class: 'toggle-switch awsm-toggle-switch',
            accessible_role: Atk.Role.CHECK_BOX,
            state,
        });
    }

    get state() {
        return this._state;
    }

    set state(state) {
        if (this._state === state)
            return;

        if (state)
            this.add_style_pseudo_class('checked');
        else
            this.remove_style_pseudo_class('checked');

        this._state = state;
        this.notify('state');
    }

    toggle() {
        this.state = !this.state;
    }
});


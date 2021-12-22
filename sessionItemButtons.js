const { GObject, St, Clutter } = imports.gi;

var SessionItemButtons = GObject.registerClass(
class SessionItemButtons extends GObject.Object {

    _init() {
        super._init();

    }

    addButtons(sessionItem) {
        let icon = new St.Icon({
            icon_name: 'preview-close-symbolic',
            style_class: 'system-status-icon'
        });

        let deleteButton = new St.Button({
            style_class: 'window-close-dup',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true
        });

        sessionItem.actor.add_child(deleteButton);

        deleteButton.connect('clicked', this._onClickDelete.bind(this));
    }

    _onClickDelete(menuItem, event) {
        log('Deleting');
        log(menuItem);
        log(event);
    }
});
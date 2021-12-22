const { GObject, St, Clutter } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const IconFinder = Me.imports.iconFinder;


var SessionItemButtons = GObject.registerClass(
class SessionItemButtons extends GObject.Object {

    _init() {
        super._init();

    }

    addButtons(sessionItem) {
        let icon = new St.Icon({
            gicon: IconFinder.find('close-symbolic.svg'),
            style_class: 'system-status-icon'
        });

        let deleteButton = new St.Button({
            style_class: 'aws-item-button',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true
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
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
        const saveButton = this._addButton(sessionItem, 'save-symbolic.svg');
        saveButton.connect('clicked', this._onClickSave.bind(this));

        const restoreButton = this._addButton(sessionItem, 'restore-symbolic.svg');
        restoreButton.connect('clicked', this._onClickRestore.bind(this));

        const moveButton = this._addButton(sessionItem, 'move-symbolic.svg');
        moveButton.connect('clicked', this._onClickMove.bind(this));

        const closeButton = this._addButton(sessionItem, 'close-symbolic.svg');
        closeButton.connect('clicked', this._onClickClose.bind(this));
    }

    _addButton(sessionItem, iconSymbolic) {
        let icon = new St.Icon({
            gicon: IconFinder.find(iconSymbolic),
            style_class: 'system-status-icon'
        });

        let button = new St.Button({
            style_class: 'aws-item-button',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true
        });

        sessionItem.actor.add_child(button);
        return button;
    }

    _onClickSave(menuItem, event) {
        log('Closing');
        log(menuItem);
        log(event);
    }
    
    _onClickRestore(menuItem, event) {
        log('Restoring');
        log(menuItem);
        log(event);
    }
    
    _onClickMove(menuItem, event) {
        log('Moving');
        log(menuItem);
        log(event);
    }

    _onClickClose(menuItem, event) {
        log('Closing');
        log(menuItem);
        log(event);
    }
});
'use strict';

const { GObject, St, Clutter } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const IconFinder = Me.imports.iconFinder;

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const MoveSession = Me.imports.moveSession;
const CloseSession = Me.imports.closeSession;


var SessionItemButtons = GObject.registerClass(
class SessionItemButtons extends GObject.Object {

    _init(sessionItem) {
        super._init();

        this.sessionItem = sessionItem;

        // TODO Nullify created object?
        this._saveSession = new SaveSession.SaveSession();
        this._moveSession = new MoveSession.MoveSession();
        this._closeSession = new CloseSession.CloseSession();
    }

    addButtons() {
        this._addTags();
        
        this._addSeparator();

        const saveButton = this._addButton('save-symbolic.svg');
        saveButton.connect('clicked', this._onClickSave.bind(this));

        const restoreButton = this._addButton('restore-symbolic.svg');
        restoreButton.connect('clicked', this._onClickRestore.bind(this));

        const moveButton = this._addButton('move-symbolic.svg');
        moveButton.connect('clicked', this._onClickMove.bind(this));

        this._addSeparator();

        const closeButton = this._addButton('close-symbolic.svg');
        closeButton.connect('clicked', this._onClickClose.bind(this));
    }

    _addTags() {
        let button = new St.Button({
            x_align: Clutter.ActorAlign.END,
        });

        button.set_label(this.sessionItem._modification_time);
        this.sessionItem.actor.add_child(button);

    }

    _addSeparator() {
        let icon = new St.Icon({
            gicon: IconFinder.find('separator-symbolic.svg'),
            style_class: 'system-status-icon'
        });

        let button = new St.Button({
            style_class: 'aws-item-separator',
            can_focus: false,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: false,
            track_hover: false
        });

        this.sessionItem.actor.add_child(button);
    }

    _addButton(iconSymbolic) {
        let icon = new St.Icon({
            gicon: IconFinder.find(iconSymbolic),
            style_class: 'system-status-icon'
        });

        // TODO Remove cycle in the background in case everyone think this separator is a clickable button, actually it's just a view-only separator.
        let button = new St.Button({
            style_class: 'aws-item-button',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true
        });

        this.sessionItem.actor.add_child(button);
        return button;
    }

    _onClickSave(button, event) {
        this._saveSession.saveSession(this.sessionItem._filename);
    }
    
    _onClickRestore(button, event) {
        // Using _restoredApps to hold restored apps so we create new instance every time for now
        const _restoreSession = new RestoreSession.RestoreSession();
        _restoreSession.restoreSession(this.sessionItem._filename);
    }
    
    _onClickMove(button, event) {
        log(menuItem);
        this._moveSession.moveWindows(this.sessionItem._filename);
    }

    _onClickClose(button, event) {
        // TODO Close specified windows in the session?
        this._closeSession.closeWindows();
    }
});
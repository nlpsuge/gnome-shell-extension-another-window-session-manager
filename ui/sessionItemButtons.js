'use strict';

const { GObject, St, Clutter } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const IconFinder = Me.imports.utils.iconFinder;
const FileUtils = Me.imports.utils.fileUtils;
const Tooltip = Me.imports.utils.tooltip;

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const MoveSession = Me.imports.moveSession;
const CloseSession = Me.imports.closeSession;

const { Button } = Me.imports.ui.button;


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
        new Tooltip.Tooltip({
            parent: saveButton,
            markup: 'Save open windows using the current session name',
        });
        saveButton.connect('clicked', this._onClickSave.bind(this));

        const restoreButton = this._addButton('restore-symbolic.svg');
        new Tooltip.Tooltip({
            parent: restoreButton,
            markup: 'Restore windows from the saved session',
        });
        restoreButton.connect('clicked', this._onClickRestore.bind(this));

        const moveButton = this._addButton('move-symbolic.svg');
        new Tooltip.Tooltip({
            parent: moveButton,
            markup: 'Move windows to their workspace by the saved session',
        });
        moveButton.connect('clicked', this._onClickMove.bind(this));

        // this._addSeparator();

        // const closeButton = this._addButton('close-symbolic.svg');
        // closeButton.connect('clicked', this._onClickClose.bind(this));

        this._addSeparator();
        const deleteButton = this._addDeleteButton();
        new Tooltip.Tooltip({
            parent: deleteButton,
            markup: 'Move to Trash',
        });
        deleteButton.connect('clicked', () => {
            // We just trash file to trash scan instead of delete in case still need it.
            FileUtils.trashSession(this.sessionItem._filename);
        });

    }

    _addDeleteButton() {
        let button = new St.Button({
            style_class: 'button',
            can_focus: true,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true,
        });
        button.set_label('Delete');
        this.sessionItem.actor.add_child(button);
        return button;
    }

    _addTags() {
        // TODO Make the modification time align left

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

        // TODO Remove cycle in the background in case everyone think this separator is a clickable button, actually it's just a view-only separator.
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
        const button = new Button({
            icon_symbolic: iconSymbolic,
        }).button;
        this.sessionItem.actor.add_child(button);
        return button;
    }

    _onClickSave(button, event) {
        this._saveSession.saveSession(this.sessionItem._filename);
    }
    
    _onClickRestore(button, event) {
        this.sessionItem._indicator._restoringApps = [];
        // Using _restoredApps to hold restored apps so we create new instance every time for now
        const _restoreSession = new RestoreSession.RestoreSession(this);
        _restoreSession.restoreSession(this.sessionItem._filename);
    }
    
    _onClickMove(button, event) {
        this._moveSession.moveWindows(this.sessionItem._filename);
    }

    _onClickClose(button, event) {
        // TODO Close specified windows in the session?
        this._closeSession.closeWindows();
    }
});
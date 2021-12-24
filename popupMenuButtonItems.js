'use strict';

const { GObject, St, Clutter } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const IconFinder = Me.imports.iconFinder;
const FileUtils = Me.imports.utils.fileUtils;

var PopupMenuButtonItems = GObject.registerClass(
class PopupMenuButtonItems extends GObject.Object {

    _init() {
        super._init();
        this.buttonItems = [];
        this.addButtonItems();
    }

    addButtonItems() {
        const popupMenuButtonItemClose = new PopupMenuButtonItemClose('close-symbolic.svg');
        const popupMenuButtonItemSave = new PopupMenuButtonItemSave('save-symbolic.svg');
        
        this.buttonItems.push(popupMenuButtonItemClose);
        this.buttonItems.push(popupMenuButtonItemSave);
    }

});


var PopupMenuButtonItem = GObject.registerClass(
class PopupMenuButtonItem extends PopupMenu.PopupMenuItem {

    _init() {
        super._init('');
    }

    createButton(iconSymbolic) {
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

        return button;
    }

});


var PopupMenuButtonItemClose = GObject.registerClass(
class PopupMenuButtonItemClose extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.confirmLabel;
        this.yesButton;
        this.noButton;

        this._createButton(iconSymbolic);
        this._addConfirm();
        this._addYesOrNoButtons();

        this.confirmLabel.hide();
        this.yesButton.hide();
        this.noButton.hide();

    }

    _addYesOrNoButtons() {
        this.yesButton = super.createButton('emblem-ok-symbolic');
        this.noButton = super.createButton('edit-undo-symbolic');
        this.yesButton.add_style_class_name('confirm-before-operate');
        this.noButton.add_style_class_name('confirm-before-operate');
        this.actor.add_child(this.yesButton);
        this.actor.add_child(this.noButton);

    }

    _createButton(iconSymbolic) {
        const closeButton = super.createButton(iconSymbolic);
        this.actor.add_child(closeButton);
        closeButton.connect('clicked', (button, event) => {
            this.confirmLabel.show();
            this.yesButton.show();
            this.noButton.show();
        });
    }

    _addConfirm() {
        this.confirmLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: 'Are you sure to close all open windows?',
            x_expand: true
        });
        this.actor.add_child(this.confirmLabel);
    }

});


var PopupMenuButtonItemSave = GObject.registerClass(
class PopupMenuButtonItemSave extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.saveCurrentSessionEntry;
        this._createButton(iconSymbolic);
        this._addEntry();
        // Hide this St.Entry, only shown when user click saveButton.
        this.saveCurrentSessionEntry.hide();

        this._saveSession = new SaveSession.SaveSession();

    }

    _createButton(iconSymbolic) {
        const saveButton = super.createButton(iconSymbolic);
        this.actor.add_child(saveButton);
        saveButton.connect('clicked', (button, event) => {
            this.saveCurrentSessionEntry.show();
            this.saveCurrentSessionEntry.grab_key_focus();
        });
    }

    _addEntry() {
        this.saveCurrentSessionEntry = new St.Entry({
            name: 'saveCurrentSession',
            hint_text: "Type name to save current session, default is defaultSession",
            track_hover: true,
            can_focus: true
        });
        const clutterText = this.saveCurrentSessionEntry.clutter_text
        clutterText.connect('key-press-event', (entry, event) => {
            const symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_Return || symbol == Clutter.KEY_KP_Enter || symbol == Clutter.KEY_ISO_Enter) {
                let sessionName = entry.get_text();
                if (sessionName) {
                    // '  ' is truthy
                    if (!sessionName.trim()) {
                        sessionName = FileUtils.default_sessionName;
                    }
                } else {
                    sessionName = FileUtils.default_sessionName;
                }

                this._saveSession.saveSession(sessionName);

                // clear entry
                entry.set_text('');

                this.saveCurrentSessionEntry.hide();
            }
        });
        this.actor.add_child(this.saveCurrentSessionEntry);

    }

});
'use strict';

const { GObject, St, Clutter } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const CloseSession = Me.imports.closeSession;

const IconFinder = Me.imports.utils.iconFinder;
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

        this.yesButton = null;
        this.noButton = null;
    }

    /**
     * Hide both Yes and No buttons by default
     */
    createYesAndNoButtons() {
        this.yesButton = this.createButton('emblem-ok-symbolic');
        this.noButton = this.createButton('edit-undo-symbolic');
        this.yesButton.add_style_class_name('confirm-before-operate');
        this.noButton.add_style_class_name('confirm-before-operate');
        this.yesButton.hide();
        this.noButton.hide();
    }

    showYesAndNoButtons() {
        this.yesButton.show();
        this.noButton.show();
    }

    hideYesAndNoButtons() {
        this.yesButton.hide();
        this.noButton.hide();
    }

    createButton(iconSymbolic) {
        let icon = new St.Icon({
            gicon: IconFinder.find(iconSymbolic),
            style_class: 'system-status-icon'
        });

        let button = new St.Button({
            style_class: 'button-item',
            can_focus: true,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true
        });

        return button;
    }

    createTimeLine() {
        // Set actor when using
        const timeline = new Clutter.Timeline({
            // 1.5s
            duration: 1500,
            repeat_count: 0,
        });
        return timeline;
    }

    // Add the icon description. Only once icon may be too weird?
    addIconDescription(iconDescription) {
        this.iconDescriptionLabel = new St.Label({
            text: iconDescription
        });
        this.actor.add_child(this.iconDescriptionLabel);
    }

});


var PopupMenuButtonItemClose = GObject.registerClass(
class PopupMenuButtonItemClose extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.confirmLabel;
        
        this.closingLabel;

        this.closeSession = new CloseSession.CloseSession();

        this._createButton(iconSymbolic);
        this.addIconDescription('Close open windows');
        this._addConfirm();
        this._addYesAndNoButtons();
        this._addClosingPrompt();

        this._hideConfirm();

        this._timeline = this.createTimeLine();

        // Respond to menu item's 'activate' signal so user don't need to click the icon whose size is too small to find to click
        this.connect('activate', this._onActivate.bind(this));

    }

    _onActivate() {
        this._onClicked();
    }

    _hideConfirm() {
        this.confirmLabel.hide();
        this.yesButton.hide();
        this.noButton.hide();
        this.closingLabel.hide();
    }

    _addYesAndNoButtons() {
        super.createYesAndNoButtons();
        
        this.yesButton.connect('clicked', () => {
            this.closeSession.closeWindows();
            this._hideConfirm();

            // Set the actor the timeline is associated with to make sure Clutter.Timeline works normally.
            // Set the actor in new Clutter.Timeline don't work
            this._timeline.set_actor(this.closingLabel);
            this._timeline.connect('new-frame', (_timeline, _frame) => {
                this.closingLabel.show();
            });
            this._timeline.start();
            this._timeline.connect('completed', () => {
                this._timeline.stop();
                this.closingLabel.hide();
            });

        });

        this.noButton.connect('clicked', () => {
            this._hideConfirm();
        });

        this.actor.add_child(this.yesButton);
        this.actor.add_child(this.noButton);

    }

    _addClosingPrompt() {
        this.closingLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: 'Closing open windows ...',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this.closingLabel);
    }

    _createButton(iconSymbolic) {
        const closeButton = super.createButton(iconSymbolic);
        this.actor.add_child(closeButton);
        closeButton.connect('clicked', this._onClicked.bind(this));
    }

    _onClicked(button, event) {
        // In case someone hide close button again when this.closingLabel is still showing
        this._timeline.stop();
        this.closingLabel.hide();

        this.confirmLabel.show();
        this.yesButton.show();
        this.noButton.show();
    }

    _addConfirm() {
        this.confirmLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: 'Are you sure to close open windows?',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this.confirmLabel);
    }

    destroy() {
        // TODO　Nullify others created objects?

        // TODO Also disconnect new-frame and completed?
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }

    }

});


var PopupMenuButtonItemSave = GObject.registerClass(
class PopupMenuButtonItemSave extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.saveCurrentSessionEntry = null;
        this._createButton(iconSymbolic);
        this.addIconDescription('Save open windows');
        this._addEntry();
        // Hide this St.Entry, only shown when user click saveButton.
        this.saveCurrentSessionEntry.hide();
        this._addYesAndNoButtons();

        this._saveSession = new SaveSession.SaveSession();

        this._timeline = this.createTimeLine();

        this.savingLabel = null;
        
        this._addSavingPrompt();

        // Respond to menu item's 'activate' signal so user don't need to click the icon whose size is too small to find to click
        this.connect('activate', this._onActivate.bind(this));

    }

    _addYesAndNoButtons() {
        super.createYesAndNoButtons();
        
        this.yesButton.connect('clicked', this._onClickedYes.bind(this));
        this.noButton.connect('clicked', () => {
            // clear entry
            this.saveCurrentSessionEntry.set_text('');
            this.saveCurrentSessionEntry.hide();
            super.hideYesAndNoButtons();
        });

        this.actor.add_child(this.yesButton);
        this.actor.add_child(this.noButton);

    }

    _onClickedYes(button, event) {
        this._gotoSaveSession();
    }

    _onActivate() {
        this._onClickedBeginSave();
    }

    _addSavingPrompt() {
        this.savingLabel = new St.Label({
            style_class: 'confirm-before-operate',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this.savingLabel);
    }

    _createButton(iconSymbolic) {
        const saveButton = super.createButton(iconSymbolic);
        this.actor.add_child(saveButton);
        saveButton.connect('clicked', this._onClickedBeginSave.bind(this));
    }

    _onClickedBeginSave(button, event) {
        this._timeline.stop();
        this.savingLabel.hide();

        this.saveCurrentSessionEntry.show();
        this.saveCurrentSessionEntry.grab_key_focus();
        super.showYesAndNoButtons();
    }

    _addEntry() {
        this.saveCurrentSessionEntry = new St.Entry({
            name: 'saveCurrentSession',
            hint_text: "Type a session name, default is defaultSession",
            track_hover: true,
            can_focus: true
        });
        const clutterText = this.saveCurrentSessionEntry.clutter_text
        clutterText.connect('key-press-event', this._onKeyPressEvent.bind(this));
        this.actor.add_child(this.saveCurrentSessionEntry);

    }

    _onKeyPressEvent(entry, event) {
        const symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Return || symbol == Clutter.KEY_KP_Enter || symbol == Clutter.KEY_ISO_Enter) {
            this._gotoSaveSession();
        }
    }

    _gotoSaveSession() {
        let sessionName = this.saveCurrentSessionEntry.get_text();
        if (sessionName) {
            // '  ' is truthy
            if (!sessionName.trim()) {
                sessionName = FileUtils.default_sessionName;
            }
        } else {
            sessionName = FileUtils.default_sessionName;
        }

        if (!this._canSave(sessionName)) {
            this.savingLabel.set_text(`ERROR: Can't save windows using '${sessionName}', it's an existing directory!`);
            this._timeline.set_actor(this.savingLabel);
            this._timeline.connect('new-frame', (_timeline, _frame) => {
                super.hideYesAndNoButtons();
                this.savingLabel.show();
            });
            this._timeline.start();
            this._timeline.connect('completed', () => {
                this._timeline.stop();
                this.savingLabel.hide();
            });

            return;
        }

        this._saveSession.saveSession(sessionName);

        // clear entry
        this.saveCurrentSessionEntry.set_text('');

        this.saveCurrentSessionEntry.hide();

        this.savingLabel.set_text(`Saving open windows as '${sessionName}' ...`);
        this._timeline.set_actor(this.savingLabel);
        this._timeline.connect('new-frame', (_timeline, _frame) => {
            super.hideYesAndNoButtons();
            this.savingLabel.show();
        });
        this._timeline.start();
        this._timeline.connect('completed', () => {
            this._timeline.stop();
            this.savingLabel.hide();
        });
    }

    _canSave(sessionName) {
        if (FileUtils.isDirectory(sessionName)) {
            return false;
        }
        return true;
    }

    destroy() {
        // TODO　Nullify others created objects?

        // TODO Also disconnect new-frame and completed?
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }

    }
    

});
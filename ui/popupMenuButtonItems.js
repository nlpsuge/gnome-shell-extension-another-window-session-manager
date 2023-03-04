'use strict';

const { GObject, St, Clutter } = imports.gi;

const Main = imports.ui.main;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SaveSession = Me.imports.saveSession;
const CloseSession = Me.imports.closeSession;
const RestoreSession = Me.imports.restoreSession;

const IconFinder = Me.imports.utils.iconFinder;
const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;

const { Button } = Me.imports.ui.button;

var PopupMenuButtonItems = GObject.registerClass(
class PopupMenuButtonItems extends GObject.Object {

    _init() {
        super._init();
        this._signals = [];
        this.buttonItems = [];
        this.addButtonItems();
    }

    addButtonItems() {
        const itemCloseOpenWindows = new PopupMenuButtonItemClose('close-symbolic.svg', 'Close open windows', 'Closing open windows ...');
        const closeOpenWindowsConfirmedId = itemCloseOpenWindows.connect('confirmed', () => {
            if (Main.overview.visible) {
                Main.overview.toggle();
            }

            RestoreSession.restoringApps.clear();
            new CloseSession.CloseSession().closeWindows();
        });
        const itemCloseCurrentWorkspace = new PopupMenuButtonItemClose('empty-symbolic.svg', 'Close current workspace', 'Closing current workspace ...');
        const closeCurrentWorkspaceConfirmedId = itemCloseCurrentWorkspace.connect('confirmed', () => {
            if (Main.overview.visible) {
                Main.overview.toggle();
            }
            new CloseSession.CloseSession().closeWindows(false, -1);
        });
        const popupMenuButtonItemSave = new PopupMenuButtonItemSave('save-symbolic.svg');
        
        this.buttonItems.push(itemCloseOpenWindows);
        this.buttonItems.push(itemCloseCurrentWorkspace);
        this.buttonItems.push(popupMenuButtonItemSave);

        this._signals.push([itemCloseOpenWindows, closeOpenWindowsConfirmedId]);
        this._signals.push([itemCloseOpenWindows, closeCurrentWorkspaceConfirmedId]);
    }

    destroy() {
        if (this._signals && this._signals.length) {
            this._signals.forEach(([obj, id]) => {
                obj.disconnect(id);
            });
            this._signals = null;
        }
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
        this.hideYesAndNoButtons();
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
        const button = new Button({
            icon_symbolic: iconSymbolic,
            button_style_class: 'button-item',
        }).button;
        if (iconSymbolic === 'empty-symbolic.svg') {
            button.set_style('border: none;');
        }
        return button;
    }

    createTimeLine() {
        // Set actor when using
        const timeline = new Clutter.Timeline({
            // 2s
            duration: 2000,
            repeat_count: 0,
        });
        return timeline;
    }

    // Add the icon description
    addIconDescription(iconDescription) {
        this.iconDescriptionLabel = new St.Label({
            text: iconDescription
        });
        this.actor.add_child(this.iconDescriptionLabel);
    }

});


var PopupMenuButtonItemClose = GObject.registerClass({
    Signals: {
        'confirmed': {},
    }
},
class PopupMenuButtonItemClose extends PopupMenuButtonItem {

    _init(iconSymbolic, itemDescription, prompt) {
        super._init();
        this._prompt = prompt;

        this.confirmLabel;
        
        this.closingLabel;

        this._closeButton = this._createButton(iconSymbolic);
        this.addIconDescription(itemDescription);
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
        this.hideYesAndNoButtons();
        this.closingLabel.hide();
    }

    _addYesAndNoButtons() {
        super.createYesAndNoButtons();
        
        this.yesButton.connect('clicked', () => {
            // TODO Do this when enable_close_by_rules is true? 
            this._parent.close();
            this.emit('confirmed');
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
            text: this._prompt,
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this.closingLabel);
    }

    _createButton(iconSymbolic) {
        const closeButton = super.createButton(iconSymbolic);
        this.actor.add_child(closeButton);
        closeButton.connect('clicked', this._onClicked.bind(this));
        return closeButton;
    }

    _onClicked(button, event) {
        // In case someone hide close button again when this.closingLabel is still showing
        this._timeline.stop();
        this.closingLabel.hide();

        this.confirmLabel.show();
        this.showYesAndNoButtons();
    }

    _addConfirm() {
        this.confirmLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: 'Confirm?',
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this.confirmLabel);
    }

    destroy() {
        // TODO Nullify others created objects?

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

        this._log = new Log.Log();
        this._saveSession = new SaveSession.SaveSession(true);

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
            x_expand: false,
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
        const clutterText = this.saveCurrentSessionEntry.clutter_text;
        clutterText.connect('activate', this._onTextActivate.bind(this));
        this.actor.add_child(this.saveCurrentSessionEntry);

    }

    _onTextActivate(entry, event) {
        this._gotoSaveSession();
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

        const [canSave, reason] = this._canSave(sessionName);
        if (!canSave) {
            this._displayMessage(reason);
            return;
        }

        // clear entry
        this.saveCurrentSessionEntry.set_text('');
        
        this.saveCurrentSessionEntry.hide();
        super.hideYesAndNoButtons();

        this.savingLabel.set_text(`Saving open windows as '${sessionName}' ...`);
        this.savingLabel.show();

        this._saveSession.saveSessionAsync(sessionName).then(() => {
            this.savingLabel.hide();
        }).catch(e => {
            let message = `Failed to save session`;
            this._log.error(e, e.desc ?? message);
            global.notify_error(message, e.cause?.message ?? e.desc ?? message);
            this._displayMessage(e.cause?.message ?? e.message);
        });

    }

    _displayMessage(message) {
        // To prevent saving session many times by holding and not releasing Enter
        this.saveCurrentSessionEntry.hide();
        this.savingLabel.set_text(message);
        this._timeline.set_actor(this.savingLabel);
        const newFrameId = this._timeline.connect('new-frame', (_timeline, _frame) => {
            this._timeline.disconnect(newFrameId);
            this.savingLabel.show();
            this.hideYesAndNoButtons();
        });
        this._timeline.start();
        const completedId = this._timeline.connect('completed', () => {
            this._timeline.disconnect(completedId);
            this._timeline.stop();
            this.savingLabel.hide();
            this.saveCurrentSessionEntry.show();
            this.showYesAndNoButtons();
        });
    }

    _canSave(sessionName) {
        if (sessionName === FileUtils.sessions_backup_folder_name) {
            return [false, `ERROR: ${sessionName} is a reserved word, can't be used.`];
        }

        if (FileUtils.isDirectory(sessionName)) {
            return [false, `ERROR: Can't save windows using '${sessionName}', it's an existing directory!`];
        }

        if (sessionName.indexOf('/') != -1) {
            return [false, `ERROR: Session names cannot contain '/'`];
        }
        return [true, ''];
    }

    destroy() {
        // TODO Nullify others created objects?

        // TODO Also disconnect new-frame and completed?
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }

    }
    

});
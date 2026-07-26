'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as SaveSession from '../saveSession.js';
import * as CloseSession from '../closeSession.js';
import * as RestoreSession from '../restoreSession.js';

import * as FileUtils from '../utils/fileUtils.js';
import * as Log from '../utils/log.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Button} from './button.js';


export const PopupMenuButtonItems = GObject.registerClass(
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

    destroy() {
        this.buttonItems.forEach(item => item.destroy());
        this.buttonItems = [];
    }

});


const PopupMenuButtonItem = GObject.registerClass(
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
        this.yesButton = this.createButton('object-select-symbolic');
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
            text: iconDescription,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.actor.add_child(this.iconDescriptionLabel);
    }

});


const PopupMenuButtonItemClose = GObject.registerClass(
class PopupMenuButtonItemClose extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.add_style_class_name('popup-close-menu-item');
        this.confirmLabel;
        
        this.closingLabel;

        this.closeSession = new CloseSession.CloseSession(CloseSession.flags.closeWindows);

        this._createButton(iconSymbolic);
        this.addIconDescription(_('Close open windows'));
        this._addConfirm();
        this._addYesAndNoButtons();
        this._addClosingPrompt();

        this._hideConfirm();

        this._timeline = this.createTimeLine();

        // Respond to menu item's 'activate' signal so user don't need to click the icon whose size is too small to find to click
        this.connectObject('activate', this._onActivate.bind(this), this);

    }

    _onActivate() {
        this._onClicked();
    }

    _hideConfirm(restoreDescription = true) {
        this.confirmLabel.hide();
        this.hideYesAndNoButtons();
        this.closingLabel.hide();
        if (restoreDescription)
            this.iconDescriptionLabel.show();
    }

    _addYesAndNoButtons() {
        super.createYesAndNoButtons();
        
        this.yesButton.connectObject('clicked', () => {
            // TODO Do this when enable_close_by_rules is true? 
            this._parent.close();
            if (Main.overview.visible) {
                Main.overview.toggle();
            }

            RestoreSession.restoreSessionObject.restoringApps.clear();
            this.closeSession.closeWindows();
            this._hideConfirm(false);

            // Set the actor the timeline is associated with to make sure Clutter.Timeline works normally.
            // Set the actor in new Clutter.Timeline don't work
            this._timeline.set_actor(this.closingLabel);
            this._timeline.disconnectObject(this);
            this._timeline.connectObject(
                'new-frame', (_timeline, _frame) => {
                    this.closingLabel.show();
                },
                'completed', () => {
                    this._timeline.stop();
                    this.closingLabel.hide();
                    this.iconDescriptionLabel.show();
                },
                this);
            this._timeline.start();
        }, this);

        this.noButton.connectObject('clicked', () => {
            this._hideConfirm();
        }, this);

        this.actor.add_child(this.yesButton);
        this.actor.add_child(this.noButton);

    }

    _addClosingPrompt() {
        this.closingLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: _('Closing open windows …'),
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.actor.add_child(this.closingLabel);
    }

    _createButton(iconSymbolic) {
        this._closeButton = super.createButton(iconSymbolic);
        this.actor.add_child(this._closeButton);
        this._closeButton.connectObject('clicked', this._onClicked.bind(this), this);
    }

    _onClicked(button, event) {
        // In case someone hide close button again when this.closingLabel is still showing
        this._timeline.stop();
        this.closingLabel.hide();

        this.iconDescriptionLabel.hide();
        this.confirmLabel.show();
        this.showYesAndNoButtons();
    }

    _addConfirm() {
        this.confirmLabel = new St.Label({
            style_class: 'confirm-before-operate',
            text: _('Confirm?'),
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.actor.add_child(this.confirmLabel);
    }

    destroy() {
        this.disconnectObject(this);
        this.yesButton?.disconnectObject(this);
        this.noButton?.disconnectObject(this);
        this._closeButton?.disconnectObject(this);
        this._timeline?.disconnectObject(this);
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
    }

});


const PopupMenuButtonItemSave = GObject.registerClass(
class PopupMenuButtonItemSave extends PopupMenuButtonItem {

    _init(iconSymbolic) {
        super._init();
        this.saveCurrentSessionEntry = null;
        this._createButton(iconSymbolic);
        this.addIconDescription(_('Save open windows'));
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
        this.connectObject('activate', this._onActivate.bind(this), this);

    }

    _addYesAndNoButtons() {
        super.createYesAndNoButtons();
        
        this.yesButton.connectObject('clicked', this._onClickedYes.bind(this), this);
        this.noButton.connectObject('clicked', () => {
            // clear entry
            this.saveCurrentSessionEntry.set_text('');
            this.saveCurrentSessionEntry.hide();
            this.iconDescriptionLabel.show();
            super.hideYesAndNoButtons();
        }, this);

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
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.actor.add_child(this.savingLabel);
    }

    _createButton(iconSymbolic) {
        this._saveButton = super.createButton(iconSymbolic);
        this.actor.add_child(this._saveButton);
        this._saveButton.connectObject('clicked', this._onClickedBeginSave.bind(this), this);
    }

    _onClickedBeginSave(button, event) {
        this._timeline.stop();
        this.savingLabel.hide();

        this.iconDescriptionLabel.hide();
        this.saveCurrentSessionEntry.show();
        this.saveCurrentSessionEntry.grab_key_focus();
        super.showYesAndNoButtons();
    }

    _addEntry() {
        this.saveCurrentSessionEntry = new St.Entry({
            name: 'saveCurrentSession',
            hint_text: _('Type a session name, default is Default Session'),
            track_hover: true,
            can_focus: true,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.saveCurrentSessionEntry.clutter_text.connectObject(
            'activate', this._onTextActivate.bind(this), this);
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

        this.savingLabel.set_text(_('Saving open windows as \'%s\' …').format(sessionName));
        this.savingLabel.show();

        this._saveSession.saveSessionAsync(sessionName).then(() => {
            this.savingLabel.hide();
            this.iconDescriptionLabel.show();
        }).catch(e => {
            let message = _('Failed to save session');
            this._log.error(e, e.desc ?? message);
            global.notify_error(message, e.cause?.message ?? e.desc ?? message);
            this._displayMessage(e.cause?.message ?? e.message);
        });

    }

    _displayMessage(message) {
        // To prevent saving session many times by holding and not releasing Enter
        this.saveCurrentSessionEntry.hide();
        this.iconDescriptionLabel.hide();
        this.savingLabel.set_text(message);
        this._timeline.set_actor(this.savingLabel);
        this._timeline.disconnectObject(this);
        this._timeline.connectObject(
            'new-frame', (_timeline, _frame) => {
                this.savingLabel.show();
                this.hideYesAndNoButtons();
            },
            'completed', () => {
                this._timeline.disconnectObject(this);
                this._timeline.stop();
                this.savingLabel.hide();
                this.saveCurrentSessionEntry.show();
                this.showYesAndNoButtons();
            },
            this);
        this._timeline.start();
    }

    _canSave(sessionName) {
        if (sessionName === FileUtils.sessions_backup_folder_name) {
            return [false, _('ERROR: %s is a reserved word, can\'t be used.').format(sessionName)];
        }

        if (FileUtils.isDirectory(sessionName)) {
            return [false, _('ERROR: Can\'t save windows using \'%s\', it\'s an existing directory!').format(sessionName)];
        }

        if (sessionName.indexOf('/') != -1) {
            return [false, _('ERROR: Session names cannot contain \'/\'')];
        }
        return [true, ''];
    }

    destroy() {
        this.disconnectObject(this);
        this.yesButton?.disconnectObject(this);
        this.noButton?.disconnectObject(this);
        this._saveButton?.disconnectObject(this);
        this.saveCurrentSessionEntry?.clutter_text.disconnectObject(this);
        this._timeline?.disconnectObject(this);
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
    }
    

});
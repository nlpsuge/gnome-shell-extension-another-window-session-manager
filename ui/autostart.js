'use strict';

/* exported Autostart, AutostartDialog */

const { Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;

const Gettext = imports.gettext;

const Main = imports.ui.main;
const CheckBox = imports.ui.checkBox;
const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;


var Autostart = GObject.registerClass(
class Autostart extends GObject {

    _init() {
        super._init();

    }

    start() {
        
    }

    destroy() {

    }


});

var AutostartDialog = GObject.registerClass(
class AutostartDialog extends ModalDialog.ModalDialog {

    _init() {
        super._init({ styleClass: 'restore-session-dialog',
                      destroyOnClose: false });

        this.connect('opened', this._onOpened.bind(this));

        this._confirmDialogContent = new Dialog.MessageDialogContent();
        this._messageDialogContent.title = 'Restore session ${xx}';
        
        this._checkBox = new CheckBox.CheckBox();
        this._checkBox.connect('clicked', this._sync.bind(this));
        this._confirmDialogContent.add_child(this._checkBox);

        this.contentLayout.add_child(this._confirmDialogContent);




    }

    _refreshTimer() {
        
        const desc = Gettext.ngettext("The session ${} will be restored in %d second", 
                         "The session ${} will be restored in %d seconds", seconds).format(seconds)
        this._messageDialogContent.description = desc;

    }


});
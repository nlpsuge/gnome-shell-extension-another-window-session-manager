'use strict';

/* exported Autostart, AutostartDialog */

const { Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext;

const Main = imports.ui.main;
const CheckBox = imports.ui.checkBox;
const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;

const Log = Me.imports.utils.log;

const autostartDbusXml = ByteArray.toString(
    Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.Autostart.xml').load_contents(null)[1]
);

var Autostart = GObject.registerClass(
    class Autostart extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            this._autostartDialog = null;

            this._autostartDbusImpl = Gio.DBusExportedObject.wrapJSObject(autostartDbusXml, this);
            this._autostartDbusImpl.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/awsm');
            Gio.DBus.session.own_name(
                'org.gnome.Shell.Extensions.awsm',
                Gio.BusNameOwnerFlags.REPLACE,
                null,
                null
            );
        }

        RestoreSessionAsync() {

            this._log.info(`Restoring from session ${'session name'} automatically`);
            // TODO Read settings from Preferences
            // 1. Enable if restore when starts
            // 2. Restore which session
            this._autostartDialog = new AutostartDialog();
            // this._autostartDialog.open();
        }

    });

var AutostartDialog = GObject.registerClass(
    class AutostartDialog extends ModalDialog.ModalDialog {

        _init() {
            super._init({
                styleClass: 'restore-session-dialog',
                destroyOnClose: false
            });

            this.connect('opened', this._onOpened.bind(this));

            this._confirmDialogContent = new Dialog.MessageDialogContent();
            this._confirmDialogContent.title = 'Restore session ${xx}';

            this._checkBox = new CheckBox.CheckBox();
            // this._checkBox.connect('clicked', this._sync.bind(this));
            this._confirmDialogContent.add_child(this._checkBox);

            this.contentLayout.add_child(this._confirmDialogContent);


        }

        _onOpened() {
            this._sync();
        }

        _sync() {
            let open = this.state == ModalDialog.State.OPENING || this.state == ModalDialog.State.OPENED;
            if (!open)
                return;

            const desc = Gettext.ngettext("The session ${} will be restored in %d second",
                "The session ${} will be restored in %d seconds", 15).format(15)
            this._confirmDialogContent.description = desc;

        }

        destroy() {

        }


    });
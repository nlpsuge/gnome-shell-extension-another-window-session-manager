'use strict';

/* exported AutostartServiceProvider, AutostartService, AutostartDialog */

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

const RestoreSession = Me.imports.restoreSession;

const autostartDbusXml = ByteArray.toString(
    Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.Autostart.xml').load_contents(null)[1]
);

var AutostartServiceProvider = GObject.registerClass(
    class AutostartServiceProvider extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            
            this._autostartService = null;
            this._autostartDbusImpl = null;

            // https://gjs.guide/guides/gio/dbus.html#exporting-interfaces
            this._dbusNameOwnerId = Gio.bus_own_name(
                Gio.BusType.SESSION,
                'org.gnome.Shell.Extensions.awsm',
                Gio.BusNameOwnerFlags.NONE,
                this.onBusAcquired.bind(this),
                this.onNameAcquired.bind(this),
                this.onNameLost.bind(this),
            );
            

        }

        onBusAcquired(connection, name) {
            this._log.debug(`DBus bus with name ${name} acquired!`);

            this._autostartService = new AutostartService();

            // Gio.DBusExportedObject.wrapJSObject(interfaceInfo, jsObj) is a private method of gjs
            // See: https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js#L391
            this._autostartDbusImpl = Gio.DBusExportedObject.wrapJSObject(autostartDbusXml, this._autostartService);
            this._autostartDbusImpl.export(connection, '/org/gnome/Shell/Extensions/awsm');

        }
    
        onNameAcquired(connection, name) {
            this._log.debug(`DBus name ${name} acquired!`);
        }
    
        onNameLost(_connection, name) {
            this._log.debug(`Dbus name ${name} lost`);
        }

        disable() {
            // To avoid the below error
            // JS ERROR: Gio.IOErrorEnum: An object is already exported for the interface org.gnome.Shell.Extensions.awsm.Autostart at /org/gnome/Shell/Extensions/awsm
            // when disable and enable this extension
            this._autostartDbusImpl.flush();
            this._autostartDbusImpl.unexport();
        }
    });

var AutostartService = GObject.registerClass(
    class AutostartService extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            this._autostartDialog = null;

        }

        // Call this method synchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.awsm --object-path /org/gnome/Shell/Extensions/awsm --method org.gnome.Shell.Extensions.awsm.Autostart.RestoreSession` 
        RestoreSession() {

            this._log.info(`Restoring from session ${'session name'} automatically`);
            // TODO Read settings from Preferences
            // 1. Enable if restore when starts
            // 2. Restore which session
            this._autostartDialog = new AutostartDialog();
            this._autostartDialog.open();
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

            this.addButton({
                action: this.cancel.bind(this),
                label: _('Cancel'),
                key: Clutter.KEY_Escape,
            });

            this.addButton({
                action: this.confirm.bind(this),
                label: _('Confirm'),
                key: Clutter.KEY_Escape,
            });

            // this._checkBox.connect('clicked', this._sync.bind(this));

            this.contentLayout.add_child(this._confirmDialogContent);


        }

        confirm() {
            // const _restoreSession = new RestoreSession.RestoreSession(this);
            // _restoreSession.restoreSession(this.sessionItem._filename);
        }

        cancel() {
            this.close();
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
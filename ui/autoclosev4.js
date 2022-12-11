
'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Shell, St, Atk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseSession = Me.imports.closeSession;

const EndSessionDialog = imports.ui.endSessionDialog;

const Gettext = imports.gettext;

const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;
const Layout = imports.ui.layout;
const Main = imports.ui.main;

const Log = Me.imports.utils.log;

const PrefsUtils = Me.imports.utils.prefsUtils;


var closeSessionByUser = false;

let __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;
let __init = EndSessionDialog.EndSessionDialog.prototype._init;

var State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
};

var Autoclose = GObject.registerClass(
class Autoclose extends GObject.Object {
    _init() {

        this._log = new Log.Log();
        const that = this;

        this._enhanceEndSessionDialog(that);
        

    }

    _enhanceEndSessionDialog(that) {

        // const _autostartDbusXml = ByteArray.toString(
        //     Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.EndSessionDialogExtended.xml').load_contents(null)[1]);

        // EndSessionDialog.EndSessionDialog.prototype.Confirm = function(signal) {
        //     log('Confirm ' + signal + '   ' + __confirm);
        //     // __confirm(signal);
        // }

        // EndSessionDialog.EndSessionDialog.prototype._init = function() {
        //     __init.call(this);
        //     log('export xxxx')
        //     const dbusImpl = Gio.DBusExportedObject.wrapJSObject(_autostartDbusXml, this);
        //     dbusImpl.export(Gio.DBus.session, '/org/gnome/SessionManager/EndSessionDialog');

        // }

        EndSessionDialog.EndSessionDialog.prototype._confirm = function(signal) {
            try {
                closeSessionByUser = true;
                const closeSession = new CloseSession.CloseSession();
                // closeSession.closeWindows()
                //     .then((result) => {
                        try {
                            // const {hasRunningApps} = result;
                            const hasRunningApps = true;
                            log('ddddd2w2d ' + hasRunningApps)
                            if (hasRunningApps) {
                                that._log.debug('One or more apps cannot be closed, please close them manually.');
                                this._fadeOutDialog();
                                this._stopTimer();
                                this._stopAltCapture();
                                // call gtkdialog via dbus
                                new RunningApplicationListWindow(this, signal).open();

                                // connect signal
                                

                                // call __confirm.call(this, signal);
                            } else {
                                // __confirm.call(this, signal);
                            }   
                        } catch (error) {
                            that._log.error(error);
                        }
                    // }).catch(error => {
                    //     that._log.error(error);
                    // });
            } catch (error) {
                that.error(error);
            }
            
        }
    }

    _restoreEndSessionDialog() {
        if (__confirm) {
            EndSessionDialog.EndSessionDialog.prototype._confirm = __confirm;
            __confirm = null;
        }

        if (__init) {
            EndSessionDialog.EndSessionDialog.prototype._init = __init;
            __init = null;
        }
    }

    destroy() {
        this._restoreEndSessionDialog();


    }
});

var CloseServiceProvider = GObject.registerClass(
class CloseServiceProvider extends GObject.Object {

    _init() {
        super._init();

        this._log = new Log.Log();
        
        this._autocloseDbusXml = ByteArray.toString(
            Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.Autoclose.xml').load_contents(null)[1]);

        this._autoclosetService = null;
        this._autocloseDbusImpl = null;

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

        this._autoclosetService = new AutostartService();

        // Gio.DBusExportedObject.wrapJSObject(interfaceInfo, jsObj) is a private method of gjs
        // See: https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js#L391
        this._autocloseDbusImpl = Gio.DBusExportedObject.wrapJSObject(this._autocloseDbusXml, this._autoclosetService);
        this._autocloseDbusImpl.export(connection, '/org/gnome/Shell/Extensions/awsm');

    }

    onNameAcquired(connection, name) {
        this._log.debug(`DBus name ${name} acquired!`);
    }

    onNameLost(connection, name) {
        this._log.debug(`Dbus name ${name} lost`);
    }

    disable() {
        this._autocloseDbusImpl.flush();
        this._autocloseDbusImpl.unexport();

        if (this._autoclosetService) {
            this._autoclosetService._disable();
            this._autoclosetService = null;
        }
    }
});

var AutostartService = GObject.registerClass(
class AutostartService extends GObject.Object {

    _init() {
        super._init();

        this._log = new Log.Log();
        this._autocloseDialog = null;

        this._settings = new PrefsUtils.PrefsUtils().getSettings();
        this._sessionName = this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
    }

    // Call this method asynchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.awsm --object-path /org/gnome/Shell/Extensions/awsm --method org.gnome.Shell.Extensions.awsm.Autostart.RestoreSession` 
    Confirm(signal) {

        if (!this._settings.get_boolean('enable-autorestore-sessions')) {
            return "ERROR: This function is disabled, please enable it through 'Preferences -> Restore sessions -> Restore at startup'";
        }

        this._log.info(`Opening dialog to restore session '${this._sessionName}'`);
        
        this._autocloseDialog = new AutostartDialog();
        if (this._settings.get_boolean('restore-at-startup-without-asking')) {
            this._autocloseDialog._confirm();
            return `Restore session '${this._sessionName}' without asking ...`;
        } else {
            this._autocloseDialog.open();
            return 'Opening dialog to restore ...';
        }

    }

    _disable() {
        if (this._autocloseDialog) {
            this._autocloseDialog.destroy();
            this._autocloseDialog = null;
        }
    }

});




var RunningApplicationListWindow = GObject.registerClass(
class RunningApplicationListWindow extends St.BoxLayout {

    _init(endSessionDialog, signal) {
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const currentMonitorIndex = global.display.get_current_monitor();
        const workArea = activeWorkspace.get_work_area_for_monitor(currentMonitorIndex);
        const width = workArea.width;
        const height = workArea.height;
        log('width ' + (width/2));
        log('height ' + (height/2));

        super._init({
            
            // TODO
            // style: 'width: 150em;',
            // shellReactive: true,
            // destroyOnClose: true
            style_class: 'modal-dialog',
            can_focus: true,
            visible: true,
            reactive: true,
            // x: 470,
            // y: 250,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            vertical: true,
            accessible_role: Atk.Role.DIALOG,
        //     // x_expand: true,
        //     // y_expand: true
        });

        this._initialKeyFocus = null;

        // super._hasModal = true;

        this._log = new Log.Log();

        let label = 'Continue anyway';
        if (signal === 'ConfirmedLogout') {
            label = 'Logout anyway';
        } else if (signal === 'ConfirmedShutdown') {
            label = 'Shutdown anyway';
        } else if (signal == 'ConfirmedReboot') {
            label = 'Reboot anyway';
        }
        this._signal = signal;
        this._endSessionDialog = endSessionDialog;

        this._defaultAppSystem = Shell.AppSystem.get_default();
        this._settings = new PrefsUtils.PrefsUtils().getSettings();

        // this.request_mode = Clutter.RequestMode.HEIGHT_FOR_WIDTH;
        // this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
        Main.layoutManager.modalDialogGroup.add_actor(this);
        // Main.layoutManager.uiGroup.add_actor(this);
        // Main.layoutManager.addChrome(this);

        this._confirmDialogContent = new Dialog.MessageDialogContent();
        this._confirmDialogContent.title = `Running applications`;

        this.backgroundStack = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this._backgroundBin = new St.Bin({ child: this.backgroundStack });
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._backgroundBin.add_constraint(this._monitorConstraint);
        this.add_actor(this._backgroundBin);

        this.backgroundStack.add_child(this);
        

        // this.dialogLayout = new Dialog.Dialog(this.backgroundStack, null);
        // this.contentLayout = this.dialogLayout.contentLayout;
        // this.buttonLayout = this.dialogLayout.buttonLayout;
        this.contentLayout = new St.BoxLayout({
            vertical: true,
            style_class: 'modal-dialog-content-box',
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this.add_child(this.contentLayout);
        
        this.buttonLayout = new St.Widget({
            layout_manager: new Clutter.BoxLayout({ homogeneous: true }),
        });
        this.add_child(this.buttonLayout);

        this.addButton({
            action: this._cancel.bind(this),
            label: _('Cancel'),
            key: Clutter.KEY_Escape,
        });

        this._confirmButton = this.addButton({
            action: () => {
                this.close();
                let signalId = this.connect('closed', () => {
                    this.disconnect(signalId);
                    this._confirm();
                });
            },
            label: _(label),
        });

        this.contentLayout.add_child(this._confirmDialogContent);

        this._applicationSection = new Dialog.ListSection({
            title: _('Please close running apps before proceeding'),
        });
        this.contentLayout.add_child(this._applicationSection);

        this._defaultAppSystem.connect('app-state-changed', this._appStateChanged.bind(this));
        this._showRunningApps(this._defaultAppSystem.get_running());

        this._overViewShowingId = Main.overview.connect('showing', () => {
            // Main.overview.disconnect(this._overViewShowingId);
            this.hide();
        });
        this._overViewHidingId = Main.overview.connect('hiding', () => {
            // Main.overview.disconnect(this._overViewHidingId);
            this.show(); 
        });

    }

    addButton(buttonInfo) {
        let { label, action, key } = buttonInfo;
        let isDefault = buttonInfo['default'];
        let keys;

        if (key)
            keys = [key];
        else if (isDefault)
            keys = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter];
        else
            keys = [];

        let button = new St.Button({
            style_class: 'modal-dialog-linked-button',
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true,
            label,
        });
        button.connect('clicked', () => action());

        buttonInfo['button'] = button;

        if (isDefault)
            button.add_style_pseudo_class('default');

        if (this._initialKeyFocus == null || isDefault)
            this._setInitialKeyFocus(button);

        // for (let i in keys)
        //     this._buttonKeys[keys[i]] = buttonInfo;

        this.buttonLayout.add_actor(button);

        return button;
    }

    _setInitialKeyFocus(actor) {
        this._initialKeyFocus?.disconnectObject(this);

        this._initialKeyFocus = actor;

        actor.connectObject('destroy',
            () => (this._initialKeyFocus = null), this);
    }

    open() {
        log('open111...')
        if (this.state == State.OPENED || this.state == State.OPENING)
            return true;

        this._monitorConstraint.index = global.display.get_current_monitor();
        log('open22... x ' + this.x + ' y ' + this.y + ' get_allocation_box ' + this.get_allocation_box())
        log('x_aglin ' + this.x_align + ' y_align ' + this.y_align)
        this.show();
        this._state = State.OPENED;
        return true;
    }

    destroy() {
        log('destroying...')
    }

    close() {
        log('closing...')
        if (this.state == State.CLOSED || this.state == State.CLOSING)
            return;

        this.hide();
        // this.destroy();
    }
    
    vfunc_key_press_event() {
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_captured_event(event) {
        return Clutter.EVENT_PROPAGATE;
    }

    // popModal(timestamp) {
    //     return;
    // }

    // pushModal(timestamp) {
    //     return true;
    // }

    _appStateChanged(appSystem, app) {
        if (app.get_state() === Shell.AppState.STARTING) {
            return;
        }

        this._showRunningApps(this._defaultAppSystem.get_running());
    }

    _showRunningApps(apps) {
        const nChildren = this._applicationSection.list.get_n_children();
        if (nChildren) {
            this._applicationSection.list.remove_all_children();
        }
        apps.forEach(app => {
            let listItem = new Dialog.ListSectionItem({
                icon_actor: app.create_icon_texture(64),
                title: app.get_name(),
                description: '',
            });
            this._applicationSection.list.add_child(listItem); 
        });
    }

    _confirm() {
        // __confirm.call(this._endSessionDialog, this._signal);
    }

    _cancel() {
        this.close();
    }

    destroy() {

    }


});
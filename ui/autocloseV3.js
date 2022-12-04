
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

const __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;

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
        EndSessionDialog.EndSessionDialog.prototype._confirm = function (signal) {
            try {
                closeSessionByUser = true;
                const closeSession = new CloseSession.CloseSession();
                closeSession.closeWindows()
                    .then((result) => {
                        try {
                            const {hasRunningApps} = result;
                            log('ddddd2w2d ' + hasRunningApps)
                            if (hasRunningApps) {
                                that._log.debug('One or more apps cannot be closed, please close them manually.');
                                new RunningApplicationListWindow(this, signal).open();
                            } else {
                                // __confirm.call(this, signal);
                            }   
                        } catch (error) {
                            that._log.error(error);
                        }
                    }).catch(error => {
                        that._log.error(error);
                    });
            } catch (error) {
                that.error(error);
            }
            
        }

    }

    destroy() {
        if (__confirm) {
            EndSessionDialog.EndSessionDialog.prototype._confirm = __confirm;
            __confirm = null;            
        }
    }


});


var RunningApplicationListWindow = GObject.registerClass(
class RunningApplicationListWindow extends St.BoxLayout {

    _init(endSessionDialog, signal) {
        super._init({
            // TODO
            // style: 'width: 150em;',
            // shellReactive: true,
            // destroyOnClose: true
            style_class: 'modal-dialog',
            can_focus: true,
            visible: true,
            reactive: true,
            // x: 770,
            // y: 500,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            vertical: true,
            accessible_role: Atk.Role.DIALOG,
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

        // Main.layoutManager.modalDialogGroup.add_actor(this);
        // Main.layoutManager.uiGroup.add_actor(this);
        Main.layoutManager.addChrome(this);

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
        log('open22...')
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
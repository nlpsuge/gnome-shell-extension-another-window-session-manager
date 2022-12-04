
'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseSession = Me.imports.closeSession;

const EndSessionDialog = imports.ui.endSessionDialog;

const Gettext = imports.gettext;

const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;

const Log = Me.imports.utils.log;

const PrefsUtils = Me.imports.utils.prefsUtils;


var closeSessionByUser = false;

const __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;

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
                                new RunningApplicationListDialog(this, signal).open();
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


var RunningApplicationListDialog = GObject.registerClass(
class RunningApplicationListDialog extends ModalDialog.ModalDialog {

    _init(endSessionDialog, signal) {
        super._init({
            // TODO
            // style: 'width: 150em;',
            shellReactive: true,
            destroyOnClose: true
        });

        super._hasModal = true;

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

        this._confirmDialogContent = new Dialog.MessageDialogContent();
        this._confirmDialogContent.title = `Running applications`;

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
    }

    vfunc_key_press_event() {
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_captured_event(event) {
        return Clutter.EVENT_PROPAGATE;
    }

    popModal(timestamp) {
        return;
    }

    pushModal(timestamp) {
        return true;
    }

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
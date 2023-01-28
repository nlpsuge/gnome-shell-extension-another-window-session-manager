'use strict';

/* exported AutostartServiceProvider, AutostartService, AutostartDialog */

const { Clutter, Gio, GLib, GObject, Meta, Shell, St } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const EndSessionDialog = imports.ui.endSessionDialog;

const Gettext = imports.gettext;

const Main = imports.ui.main;
const CheckBox = imports.ui.checkBox;
const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;

const Autoclose = Me.imports.ui.autoclose;

const Log = Me.imports.utils.log;

const RestoreSession = Me.imports.restoreSession;

const PrefsUtils = Me.imports.utils.prefsUtils;
const FileUtils = Me.imports.utils.fileUtils;

const OpenWindowsTracker = Me.imports.openWindowsTracker;

let _requiredToRestorePrevious = false;


var AutostartServiceProvider = GObject.registerClass(
    class AutostartServiceProvider extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            
            this._autostartDbusXml = ByteArray.toString(
                Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.Autostart.xml').load_contents(null)[1]);

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
            this._autostartDbusImpl = Gio.DBusExportedObject.wrapJSObject(this._autostartDbusXml, this._autostartService);
            this._autostartDbusImpl.export(connection, '/org/gnome/Shell/Extensions/awsm');

        }
    
        onNameAcquired(connection, name) {
            this._log.debug(`DBus name ${name} acquired!`);
        }
    
        onNameLost(connection, name) {
            this._log.debug(`Dbus name ${name} lost`);
        }

        disable() {
            // To avoid the below error
            // JS ERROR: Gio.IOErrorEnum: An object is already exported for the interface org.gnome.Shell.Extensions.awsm.Autostart at /org/gnome/Shell/Extensions/awsm
            // when disable and enable this extension
            this._autostartDbusImpl.flush();
            this._autostartDbusImpl.unexport();

            if (this._autostartService) {
                this._autostartService._disable();
                this._autostartService = null;
            }
        }
    });

var AutostartService = GObject.registerClass(
    class AutostartService extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            this._autostartDialog = null;
            this._restorePreviousSourceId = 0;
            this._idleIdOpenRestoreSessionDialog = 0;

            this._settings = new PrefsUtils.PrefsUtils().getSettings();
            this._sessionName = this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
        }

        // Call this method asynchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.awsm --object-path /org/gnome/Shell/Extensions/awsm --method org.gnome.Shell.Extensions.awsm.Autostart.RestoreSession` 
        RestoreSession() {
            const enableRestoreSelectedSession = this._settings.get_boolean('enable-autorestore-sessions');
            if (!enableRestoreSelectedSession) {
                const enableRestorePreviousSession = this._settings.get_boolean('enable-restore-previous-session');
                if (enableRestorePreviousSession) {
                    return "Ignoring this operation. RestoreSession is disabled, but RestorePreviousSession is enabled";
                } 
                const disabledFeatureMsg = "ERROR: RestoreSession is disabled, please enable it through 'Preferences -> Restore sessions -> Restore selected session at startup'";
                Main.notify('Another Window Session Manager', disabledFeatureMsg);
                return disabledFeatureMsg;
            }

            const restoringMsg = `Restoring selected session '${this._sessionName}'`;
            this._log.info(restoringMsg);
            Main.notify('Another Window Session Manager', restoringMsg);
            
            this._autostartDialog = new AutostartDialog();
            if (this._settings.get_boolean('restore-at-startup-without-asking')) {
                this._autostartDialog._confirm();
                return `Restore session '${this._sessionName}' without asking ...`;
            } else {
                // Since this._autostartDialog.open() is idempotent (it will check the dialog state),
                // it's ok to call it twice.
                // Before the startup-complete emits, `Main.pushModal(this, params).get_seat_state()`
                // returns CLUTTER_GRAB_STATE_NONE (0), which causes the dialog can't open. See: modalDialog.open() -> modalDialog.pushModal()
                Main.layoutManager.connect('startup-complete', () => {
                    this._idleIdOpenRestoreSessionDialog =GLib.idle_add(GLib.PRIORITY_LOW, () => {
                        this._autostartDialog.open();
                        return GLib.SOURCE_REMOVE;
                    });
                });
                this._autostartDialog.open();
                return 'Opening dialog to restore ...';
            }

        }

        // TODO Press some hotkey (like Ctrl) so this time will not restore the previous session?
        // Call this method asynchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.awsm --object-path /org/gnome/Shell/Extensions/awsm --method org.gnome.Shell.Extensions.awsm.Autostart.RestorePreviousSession` 
        RestorePreviousSession() {
            this._restorePreviousSession(true);
        }

        // Call this method asynchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.awsm --object-path /org/gnome/Shell/Extensions/awsm --method org.gnome.Shell.Extensions.awsm.Autostart.RestorePreviousSession false` 
        RestorePreviousSessionWithArgs(removeAfterRestore) {
            this._restorePreviousSession(removeAfterRestore);
        }

        _restorePreviousSession(removeAfterRestore) {
            const enableRestorePreviousSession = this._settings.get_boolean('enable-restore-previous-session');
            if (!enableRestorePreviousSession) {
                const enableRestoreSelectedSession = this._settings.get_boolean('enable-autorestore-sessions');
                if (enableRestoreSelectedSession) {
                    return "Ignoring this operation. RestorePreviousSession is disabled, but RestoreSession is enabled";
                }
                const disabledFeatureMsg = "ERROR: RestorePreviousSession is disabled, please enable it through 'Preferences -> Restore sessions -> Restore previous apps and windows at startup'";
                Main.notify('Another Window Session Manager', disabledFeatureMsg);
                return disabledFeatureMsg;
            }

            if (!Main.layoutManager._startingUp) {
                const msg = 'Restoring the previous apps and windows';
                this._log.info(`${msg}, gnome shell layoutManager has been started up.`);
                Main.notify('Another Window Session Manager', msg);

                this._restorePreviousWithDelay(removeAfterRestore);
                return msg;
            } else {
                if (_requiredToRestorePrevious) return;

                _requiredToRestorePrevious = true;
                const msg = 'Required to restore the previous apps and windows';
                Main.notify('Another Window Session Manager', msg);
                Main.layoutManager.connect('startup-complete', () => {
                    const msg = 'Restoring the previous apps and windows';
                    this._log.info(`${msg} after startup-complete`);
                    Main.notify('Another Window Session Manager', msg);
                    this._restorePreviousWithDelay(removeAfterRestore);
                });
                return msg;
            }

        }

        _restorePreviousWithDelay(removeAfterRestore) {
            const restorePreviousDelay = this._settings.get_int('restore-previous-delay');
            this._restorePreviousSourceId = GLib.timeout_add(GLib.PRIORITY_LOW, restorePreviousDelay,
                () => {
                    const restoreSession = new RestoreSession.RestoreSession();
                    restoreSession.restorePreviousSession(removeAfterRestore);
                    return GLib.SOURCE_REMOVE;
                });
        }

        _disable() {
            if (this._autostartDialog) {
                this._autostartDialog.destroy();
                this._autostartDialog = null;
            }
            if (this._restorePreviousSourceId) {
                GLib.Source.remove(this._restorePreviousSourceId);
                this._restorePreviousSourceId = null;
            }
            if (this._idleIdOpenRestoreSessionDialog) {
                GLib.Source.remove(this._idleIdOpenRestoreSessionDialog);
                this._idleIdOpenRestoreSessionDialog = null;
            }
        }

    });

// Based on endSessionDialog in Gnome shell
var AutostartDialog = GObject.registerClass(
    class AutostartDialog extends ModalDialog.ModalDialog {

        _init() {
            super._init({
                styleClass: 'restore-session-dialog',
                destroyOnClose: true
            });

            this._settings = new PrefsUtils.PrefsUtils().getSettings();

            this._sessionName = this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);

            this._totalSecondsToStayOpen = this._settings.get_int('autorestore-sessions-timer');
            this._secondsLeft = 0;

            this.connect('opened', this._onOpened.bind(this));

            this._confirmDialogContent = new Dialog.MessageDialogContent();
            this._confirmDialogContent.title = `Restore session '${this._sessionName}'`;

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
                label: _('Confirm'),
            });

            this.contentLayout.add_child(this._confirmDialogContent);

        }

        _confirm() {
            Autoclose.sessionClosedByUser = false;
            const _restoreSession = new RestoreSession.RestoreSession();
            _restoreSession.restoreSession(this._sessionName);
        }

        _cancel() {
            this.close();
        }

        _onOpened() {
            let open = this.state == ModalDialog.State.OPENING || this.state == ModalDialog.State.OPENED;
            if (!open)
                return;
                
            if (this._sessionName) {
                const [exists, sessionFilePath] = FileUtils.sessionExists(this._sessionName);
                if (exists) {
                    this._startTimer();
                    this._sync();
                } else {
                    this._confirmDialogContent.description = `ERROR: Session '${this._sessionName}' does not exist`;
                    this._confirmDialogContent._description.set_style('color:red;');
                    this._confirmButton.set_reactive(false);
                }
            } else {
                this._confirmDialogContent.description = "ERROR: You don't select any session to restore";
                this._confirmDialogContent._description.set_style('color:red;');
                this._confirmButton.set_reactive(false);
            }
        }

        _sync() {

            const displayTime = EndSessionDialog._roundSecondsToInterval(this._totalSecondsToStayOpen,
                                                                         this._secondsLeft,
                                                                         1);
            const desc = Gettext.ngettext('\'' + this._sessionName + '\' will be restored in %d second',
                '\'' + this._sessionName + '\' will be restored in %d seconds', displayTime).format(displayTime);
            this._confirmDialogContent.description = desc;

        }

        _startTimer() {
            let startTime = GLib.get_monotonic_time();
            this._secondsLeft = this._totalSecondsToStayOpen;
    
            this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                let currentTime = GLib.get_monotonic_time();
                let secondsElapsed = (currentTime - startTime) / 1000000;
    
                this._secondsLeft = this._totalSecondsToStayOpen - secondsElapsed;
                if (this._secondsLeft > 0) {
                    this._sync();
                    return GLib.SOURCE_CONTINUE;
                }
    
                this._confirm();
                this.close();
                this._timerId = 0;
    
                return GLib.SOURCE_REMOVE;
            });
            GLib.Source.set_name_by_id(this._timerId, '[gnome-shell-extension-another-window-session-manager] this._confirm');
        }

        destroy() {
            if (this._timerId > 0) {
                GLib.source_remove(this._timerId);
                this._timerId = 0;
            }
            this._secondsLeft = 0;
        }


    });
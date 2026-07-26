'use strict';

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as EndSessionDialog from 'resource:///org/gnome/shell/ui/endSessionDialog.js';

import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {sessionEndState} from '../openWindowsTracker.js';
import * as RestoreSession from '../restoreSession.js';
import * as MoveSession from '../moveSession.js';
import * as Constants from '../constants.js';

import * as Log from '../utils/log.js';
import {PrefsUtils} from '../utils/prefsUtils.js';
import * as FileUtils from '../utils/fileUtils.js';


let _requiredToRestorePrevious = false;

export const AutostartServiceProvider = GObject.registerClass(
    class AutostartServiceProvider extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();

            this._autostartDbusXml = null;
            this._autostartService = null;
            this._autostartDbusImpl = null;
            this._dbusNameOwnerId = 0;

            const ifaceFile = FileUtils.current_extension_dir
                .get_child('dbus-interfaces')
                .get_child('org.gnome.Shell.Extensions.yawsm.Autostart.xml');
            ifaceFile.load_contents_async(null, (file, asyncResult) => {
                try {
                    const [, contents] = file.load_contents_finish(asyncResult);
                    this._autostartDbusXml = new TextDecoder().decode(contents);

                    // https://gjs.guide/guides/gio/dbus.html#exporting-interfaces
                    this._dbusNameOwnerId = Gio.bus_own_name(
                        Gio.BusType.SESSION,
                        'org.gnome.Shell.Extensions.yawsm',
                        Gio.BusNameOwnerFlags.NONE,
                        this.onBusAcquired.bind(this),
                        this.onNameAcquired.bind(this),
                        this.onNameLost.bind(this),
                    );
                } catch (e) {
                    this._log.error(e, 'Failed to load Autostart dbus interface!');
                }
            });
        }

        onBusAcquired(connection, name) {
            this._log.debug(`DBus bus with name ${name} acquired!`);

            this._autostartService = new AutostartService();

            // Gio.DBusExportedObject.wrapJSObject(interfaceInfo, jsObj) is a private method of gjs
            // See: https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js#L391
            this._autostartDbusImpl = Gio.DBusExportedObject.wrapJSObject(this._autostartDbusXml, this._autostartService);
            this._autostartDbusImpl.export(connection, '/org/gnome/Shell/Extensions/yawsm');

        }
    
        onNameAcquired(connection, name) {
            this._log.debug(`DBus name ${name} acquired!`);
        }
    
        onNameLost(connection, name) {
            this._log.debug(`Dbus name ${name} lost`);
        }

        disable() {
            // Unexport the D-Bus interface to avoid:
            //   Gio.IOErrorEnum: An object is already exported for the interface
            //   org.gnome.Shell.Extensions.yawsm.Autostart at /org/gnome/Shell/Extensions/yawsm
            // when the extension is disabled and re-enabled (e.g. suspend/resume cycle).
            //
            // _autostartDbusImpl may be null if onBusAcquired() hasn't been called yet
            // (race condition during rapid disable after enable).
            if (this._autostartDbusImpl) {
                this._autostartDbusImpl.flush();
                this._autostartDbusImpl.unexport();
                this._autostartDbusImpl = null;
            }

            // Release the D-Bus name so the next enable() can re-acquire it cleanly
            if (this._dbusNameOwnerId) {
                Gio.bus_unown_name(this._dbusNameOwnerId);
                this._dbusNameOwnerId = 0;
            }

            if (this._autostartService) {
                this._autostartService._disable();
                this._autostartService = null;
            }
        }
    });

const AutostartService = GObject.registerClass(
    class AutostartService extends GObject.Object {

        _init() {
            super._init();

            this._log = new Log.Log();
            this._autostartDialog = null;
            this._restorePreviousSourceId = 0;
            this._idleIdOpenRestoreSessionDialog = 0;

            this._settings = PrefsUtils.getSettings();
            this._sessionName = this._settings.get_string(Constants.PREFS_SETTING_AUTORESTORE_SESSIONS);
        }

        // Call this method asynchronously through `gdbus call --session --dest org.gnome.Shell.Extensions.yawsm --object-path /org/gnome/Shell/Extensions/yawsm --method org.gnome.Shell.Extensions.yawsm.Autostart.RestoreSession` 
        RestoreSession() {
            const enableRestoreSelectedSession = this._settings.get_boolean('enable-autorestore-sessions');
            if (!enableRestoreSelectedSession) {
                const enableRestorePreviousSession = this._settings.get_boolean('enable-restore-previous-session');
                if (enableRestorePreviousSession) {
                    return _('Ignoring this operation. RestoreSession is disabled, but RestorePreviousSession is enabled');
                } 
                const disabledFeatureMsg = _('ERROR: RestoreSession is disabled, please enable it through \'Preferences → Restore sessions → Restore selected session at startup\'');
                Main.notify(_('Yet Another Window Session Manager'), disabledFeatureMsg);
                return disabledFeatureMsg;
            }

            if (!Main.layoutManager._startingUp) {
                return this._startRestoreSelectedSession();
            }

            Main.layoutManager.connect('startup-complete', () => {
                this._startRestoreSelectedSession();
            });
            return _('Waiting for startup to restore session \'%s\' …').format(this._sessionName);
        }

        _startRestoreSelectedSession() {
            const restoringMsg = _('Restoring selected session \'%s\'').format(this._sessionName);
            this._log.info(restoringMsg);
            Main.notify(_('Yet Another Window Session Manager'), restoringMsg);

            this._autostartDialog = new AutostartDialog();
            if (this._settings.get_boolean('restore-at-startup-without-asking')) {
                this._autostartDialog._confirm();
                return _('Restore session \'%s\' without asking …').format(this._sessionName);
            }

            this._idleIdOpenRestoreSessionDialog = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._autostartDialog.open();
                this._idleIdOpenRestoreSessionDialog = null;
                return GLib.SOURCE_REMOVE;
            });
            return _('Opening dialog to restore …');
        }

        // TODO Press some hotkey (like Ctrl) so this time will not restore the previous session?
        // Call this method asynchronously through, for example: 
        // `gdbus call --session --dest org.gnome.Shell.Extensions.yawsm --object-path /org/gnome/Shell/Extensions/yawsm --method org.gnome.Shell.Extensions.yawsm.Autostart.RestorePreviousSession "{'removeAfterRestore': <false>}"`
        // `gdbus call --session --dest org.gnome.Shell.Extensions.yawsm --object-path /org/gnome/Shell/Extensions/yawsm --method org.gnome.Shell.Extensions.yawsm.Autostart.RestorePreviousSession "{}"`
        RestorePreviousSession(args) {
            let removeAfterRestore = args.removeAfterRestore;
            if (removeAfterRestore) {
                removeAfterRestore = removeAfterRestore.get_boolean();
            } else {
                removeAfterRestore = true;
            }
            return this._restorePreviousSession(removeAfterRestore);
        }

        _restorePreviousSession(removeAfterRestore) {
            const enableRestorePreviousSession = this._settings.get_boolean('enable-restore-previous-session');
            if (!enableRestorePreviousSession) {
                const enableRestoreSelectedSession = this._settings.get_boolean('enable-autorestore-sessions');
                if (enableRestoreSelectedSession) {
                    return _('Ignoring this operation. RestorePreviousSession is disabled, but RestoreSession is enabled');
                }
                const disabledFeatureMsg = _('ERROR: RestorePreviousSession is disabled, please enable it through \'Preferences → Restore sessions → Restore previous apps and windows at startup\'');
                Main.notify(_('Yet Another Window Session Manager'), disabledFeatureMsg);
                return disabledFeatureMsg;
            }

            if (!Main.layoutManager._startingUp) {
                const msg = _('Restoring the previous apps and windows');
                this._log.info(`${msg}, gnome shell layoutManager has been started up.`);
                Main.notify(_('Yet Another Window Session Manager'), msg);

                this._restorePreviousWithDelay(removeAfterRestore);
                return msg;
            } else {
                if (_requiredToRestorePrevious) return;

                _requiredToRestorePrevious = true;
                const msg = _('Required to restore the previous apps and windows');
                Main.notify(_('Yet Another Window Session Manager'), msg);
                Main.layoutManager.connect('startup-complete', () => {
                    const msg = _('Restoring the previous apps and windows');
                    this._log.info(`${msg} after startup-complete`);
                    Main.notify(_('Yet Another Window Session Manager'), msg);
                    this._restorePreviousWithDelay(removeAfterRestore);
                });
                return msg;
            }

        }

        _restorePreviousWithDelay(removeAfterRestore) {
            const restorePreviousDelay = this._settings.get_int('restore-previous-delay');
            this._restorePreviousSourceId = GLib.timeout_add(
                GLib.PRIORITY_LOW,
                restorePreviousDelay * 1000,
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
const AutostartDialog = GObject.registerClass(
    class AutostartDialog extends ModalDialog.ModalDialog {

        _init() {
            super._init({
                styleClass: 'restore-session-dialog',
                destroyOnClose: true
            });

            this._settings = PrefsUtils.getSettings();

            this._sessionName = this._settings.get_string(Constants.PREFS_SETTING_AUTORESTORE_SESSIONS);

            this._totalSecondsToStayOpen = this._settings.get_int('autorestore-sessions-timer');
            this._secondsLeft = 0;
            this._moveWindowsFallbackSourceId = 0;

            this.connect('opened', this._onOpened.bind(this));

            this._confirmDialogContent = new Dialog.MessageDialogContent();
            this._confirmDialogContent.title = _('Restore session \'%s\'').format(this._sessionName);

            this.addButton({
                action: this._cancel.bind(this),
                label: _('Cancel'),
                key: Clutter.KEY_Escape,
            });

            this._confirmButton = this.addButton({
                action: () => {
                    let signalId = this.connect('closed', () => {
                        this.disconnect(signalId);
                        this._confirm();
                    });
                    this.close();
                },
                label: _('Confirm'),
            });

            this.contentLayout.add_child(this._confirmDialogContent);

        }

        _confirm() {
            sessionEndState.sessionClosedByUser = false;
            RestoreSession.restoreSessionObject.restoringApps = new Map();
            const _restoreSession = new RestoreSession.RestoreSession();
            _restoreSession.restoreSession(this._sessionName);
            this._scheduleMoveWindowsFallback();
        }

        _scheduleMoveWindowsFallback() {
            if (this._moveWindowsFallbackSourceId) {
                GLib.Source.remove(this._moveWindowsFallbackSourceId);
                this._moveWindowsFallbackSourceId = null;
            }

            const restorePreviousDelay = this._settings.get_int('restore-previous-delay');
            this._moveWindowsFallbackSourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                restorePreviousDelay * 1000,
                () => {
                    this._moveWindowsFallbackSourceId = null;
                    new MoveSession.MoveSession().moveWindows(this._sessionName);
                    return GLib.SOURCE_REMOVE;
                });
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
                    this._confirmDialogContent.description = _('ERROR: Session \'%s\' does not exist').format(this._sessionName);
                    this._confirmDialogContent._description.set_style('color:red;');
                    this._confirmButton.set_reactive(false);
                }
            } else {
                this._confirmDialogContent.description = _('ERROR: You don\'t select any session to restore');
                this._confirmDialogContent._description.set_style('color:red;');
                this._confirmButton.set_reactive(false);
            }
        }

        _sync() {

            let displayTime;
            if (EndSessionDialog && typeof EndSessionDialog._roundSecondsToInterval === 'function') {
                displayTime = EndSessionDialog._roundSecondsToInterval(this._totalSecondsToStayOpen,
                                                                         this._secondsLeft,
                                                                         1);
            } else {
                displayTime = Math.max(0, Math.ceil(this._secondsLeft));
            }

            const desc = ngettext('\'%s\' will be restored in %d second',
                '\'%s\' will be restored in %d seconds', displayTime).format(this._sessionName, displayTime);
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
            GLib.Source.set_name_by_id(this._timerId, '[gnome-shell-extension-yet-another-window-session-manager] this._confirm');
        }

        destroy() {
            if (this._timerId > 0) {
                GLib.source_remove(this._timerId);
                this._timerId = 0;
            }
            if (this._moveWindowsFallbackSourceId) {
                GLib.Source.remove(this._moveWindowsFallbackSourceId);
                this._moveWindowsFallbackSourceId = 0;
            }
            this._secondsLeft = 0;
        }


    });
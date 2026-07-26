
'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Atk from 'gi://Atk';
import Pango from 'gi://Pango';

import * as CloseSession from '../closeSession.js';

import * as EndSessionDialog from 'resource:///org/gnome/shell/ui/endSessionDialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';

import * as Log from '../utils/log.js';
import * as Function from '../utils/function.js';

import {PrefsUtils} from '../utils/prefsUtils.js';
import {sessionEndState} from '../openWindowsTracker.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

let __confirm = null;
let __init = null;
let _OpenAsync = null;

const State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    CANCELING: 4,
    CANCELLED: 5,
    CONFIRMING: 6,
    CONFIRMED: 7
};

// /proc/<pid>/stat state field (same mapping libgtop uses).
const ProcState = {
    RUNNING: 'R',
    SLEEPING: 'S',
    UNINTERRUPTIBLE: 'D',
    ZOMBIE: 'Z',
    STOPPED: 'T',
};

export const Autoclose = GObject.registerClass(
    class Autoclose extends GObject.Object {
        _init() {

            this._log = new Log.Log();
            this._settings = PrefsUtils.getSettings();
            this._defaultAppSystem = Shell.AppSystem.get_default();

            this._runningApplicationListWindow = null;
            
            this._retryIdleId = null;

            // org.gnome.SessionManager logout-prompt=false skips EndSessionDialog;
            // session preservation is handled via SystemActions in openWindowsTracker.js.
            const logoutPrompt = new Gio.Settings({schema_id: 'org.gnome.SessionManager'})
                .get_boolean('logout-prompt');
            if (logoutPrompt)
                this._overrideEndSessionDialog();
        }

        _overrideEndSessionDialog() {
            // Gnome 45.0 does not export EndSessionDialog.EndSessionDialog
            if (!EndSessionDialog.EndSessionDialog) {
                return;
            }
            __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;
            __init = EndSessionDialog.EndSessionDialog.prototype._init;
            _OpenAsync = EndSessionDialog.EndSessionDialog.prototype.OpenAsync;

            this._log.debug('Overriding some functions in EndSessionDialog');

            const that = this;

            // OpenAsync is promised and does not have a `try..catch...` surrounding the entire function, 
            // so here we catch the error to avoid `Unhandled promise rejection` possibly caused by this extension.
            EndSessionDialog.EndSessionDialog.prototype.OpenAsync = function (parameters, invocation) {
                try {
                    if (this._openingByYAWSM) {
                        that._log.debug(`EndSessionDialog is already opening by YAWSM, ignore...`);
                        return;
                    }
    
                    _OpenAsync.call(this, parameters, invocation)
                        .catch(e => {
                            that._log.error(e);
                        });
                } catch (e) {
                    that._log.error(e);
                }
            }

            EndSessionDialog.EndSessionDialog.prototype._confirm = async function (signal) {
                try {
                    sessionEndState.sessionClosedByUser = true;

                    const enableAutocloseSession = that._settings.get_boolean('enable-autoclose-session');
                    if (!enableAutocloseSession) {
                        Function.callFunc(this, __confirm, signal);
                        return;
                    }

                    let confirmButtOnLabel = _('Continue');
                    if (signal === 'ConfirmedLogout') {
                        confirmButtOnLabel = _('Log out');
                    } else if (signal === 'ConfirmedShutdown') {
                        confirmButtOnLabel = _('Power off');
                    } else if (signal == 'ConfirmedReboot') {
                        confirmButtOnLabel = _('Restart');
                    }

                    if (!that._runningApplicationListWindow) {
                        that._runningApplicationListWindow = new RunningApplicationListWindow(
                            confirmButtOnLabel,
                            () => {
                                this._openingByYAWSM = true;
                            },
                            (opt) => {
                                this._openingByYAWSM = false;

                                if (opt === 'Confirm') {
                                    // this.close();
                                    Function.callFunc(this, __confirm, signal);
                                }

                                if (opt == 'Cancel') {
                                    this.cancel();
                                }
                            },
                            () => {
                                that._retryIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                                    const closeSession = new CloseSession.CloseSession(CloseSession.flags.logoff);
                                    closeSession.closeWindows(true);
                                    that._retryIdleId = null;
                                    return GLib.SOURCE_REMOVE;
                                });
                            },
                        );
                    }

                    // Close the EndSessionDialog. Underlying, `this.close()` emits a `Closed` 
                    // dbus signal to gnome-session, so this should prevent the installation of inhibitions
                    // when users play videos via players or copy files in Nautilus. In this case, 
                    // once an inhibition is installed, an EndSessionDialog opens.
                    this.close();

                    this._stopTimer();
                    this._stopAltCapture();

                    that._runningApplicationListWindow.open();

                    that._runningApplicationListWindow.updateRunningPids()
                    const closeSession = new CloseSession.CloseSession(CloseSession.flags.logoff);
                    closeSession.closeWindows(true)
                        .then((result) => {
                            try {
                                const { hasRunningApps } = result;
                                if (hasRunningApps) {
                                    that._log.debug('One or more apps cannot be closed, please close them manually.');
                                    that._runningApplicationListWindow._applicationSection.title = _('These apps can\'t be closed, please close them manually');
                                    that._runningApplicationListWindow.showRunningApps();
                                    that._runningApplicationListWindow.showToUser();
                                    that._runningApplicationListWindow._retryButton.reactive = true;
                                } else {
                                    that._runningApplicationListWindow._prepareToConfirm();
                                }
                            } catch (error) {
                                that._log.error(error);
                            }
                        }).catch(error => {
                            that._log.error(error);
                        });
                } catch (error) {
                    that._log.error(error);
                }

            };
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

            if (_OpenAsync) {
                EndSessionDialog.EndSessionDialog.prototype.OpenAsync = _OpenAsync;
                _OpenAsync = null;
            }
        }

        disable() {
            if (this._disabled)
                return;
            this._disabled = true;

            this._restoreEndSessionDialog();
            if (this._runningApplicationListWindow) {
                this._runningApplicationListWindow.disable();
                this._runningApplicationListWindow = null;
            }
            if (this._retryIdleId) {
                GLib.source_remove(this._retryIdleId);
                this._retryIdleId = null;
            }
        }

        destroy() {
            this.disable();
        }

    });


// Based on dialog.js of gnome-shell
const RunningApplicationListWindow = GObject.registerClass({
    Signals: { 'opened': {}, 'closed': {} }
},
    class RunningApplicationListWindow extends St.BoxLayout {

        _init(confirmButtOnLabel, onOpen, onComplete, onRetry) {
            this._visibleToUser = false;
            super._init({
                // TODO
                // style: 'width: 150em;',
                // shellReactive: true,
                // destroyOnClose: true
                style_class: 'modal-dialog',
                can_focus: true,
                visible: false,
                reactive: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                vertical: true,
                accessible_role: Atk.Role.DIALOG,
            });

            this._confirmButtOnLabel = confirmButtOnLabel;
            this._onOpen = onOpen;
            this._onComplete = onComplete;
            this._onRetry = onRetry;

            this._confirmIdleId = null;
            this._checkProcessStateId = null;
            this._updatePositionIdleId = null;

            this._apps_recheck_process_state = new Set(['Microsoft-edge']);

            this._initialKeyFocus = null;

            this._log = new Log.Log();

            this._defaultAppSystem = Shell.AppSystem.get_default();
            
            this._pidsMap = new Map();

            Main.layoutManager.addChrome(this);

            this._confirmDialogContent = new Dialog.MessageDialogContent();
            this._confirmDialogContent.title = _('Running applications');

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

            this._cancelButton = this.addButton({
                action: this._cancel.bind(this),
                label: _('Cancel'),
                key: Clutter.KEY_Escape, // TODO not working
            });

            this._retryButton = this.addButton({
                action: () => {
                    this._onRetry()
                },
                label: _('Retry'),
                reactive: false
            });

            this._confirmButton = this.addButton({
                action: () => {
                    this._confirmNow();
                },
                label: _('%s now').format(this._confirmButtOnLabel),
            });

            this.contentLayout.add_child(this._confirmDialogContent);

            // TODO The color is not $warning_color
            this._applicationSection = new Dialog.ListSection({
                title: _('Closing running apps, please wait a moment…'),
            });
            this.contentLayout.add_child(this._applicationSection);

            this._defaultAppSystem.connectObject(
                'app-state-changed', this._appStateChanged.bind(this),
                this);
            this.showRunningApps();

            Main.overview.connectObject(
                'showing', () => {
                    if (this._visibleToUser)
                        this.hide();
                },
                'hidden', () => {
                    if (this._visibleToUser) {
                        this.show();
                        this._scheduleUpdatePosition();
                    }
                },
                this);

        }

        updateRunningPids() {
            this._defaultAppSystem.get_running()
                .filter(ra => {
                    return ra.get_windows()
                             .find(w => this._apps_recheck_process_state.has(w.get_wm_class()));
                })
                .forEach(app => {
                    app.get_pids().forEach(pid => {
                        this._pidsMap.set(pid, app);
                    });
                });
        }

        addButton(buttonInfo) {
            let { label, action, key, reactive } = buttonInfo;
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
                reactive: reactive === undefined ? true: reactive,
                can_focus: true,
                x_expand: true,
                y_expand: true,
                label,
            });
            button.connectObject('clicked', () => action(), this);

            buttonInfo['button'] = button;

            if (isDefault)
                button.add_style_pseudo_class('default');

            if (this._initialKeyFocus == null || isDefault)
                this._setInitialKeyFocus(button);

            this.buttonLayout.add_child(button);

            return button;
        }

        _setInitialKeyFocus(actor) {
            if (this._initialKeyFocus)
                this._initialKeyFocus.disconnectObject(this);

            this._initialKeyFocus = actor;

            actor.connectObject('destroy', () => {
                this._initialKeyFocus = null;
            }, this);
        }

        showToUser() {
            if (this._visibleToUser)
                return;

            this._visibleToUser = true;
            this.show();
            this._scheduleUpdatePosition();
        }

        _scheduleUpdatePosition() {
            if (this._updatePositionIdleId)
                return;

            this._updatePositionIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._updatePositionIdleId = null;
                if (!this._visibleToUser || !this.visible)
                    return GLib.SOURCE_REMOVE;

                this._updatePosition();
                return GLib.SOURCE_REMOVE;
            });
        }

        open() {
            if (this.state == State.OPENED || this.state == State.OPENING)
                return true;

            this._updateState(State.OPENING);
            if (this._onOpen)
                this._onOpen();
            this.emit('opened');
            this._updateState(State.OPENED);
            return true;
        }

        _updatePosition() {
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            const currentMonitorIndex = global.display.get_current_monitor();
            const workArea = activeWorkspace.get_work_area_for_monitor(currentMonitorIndex);
            const x = workArea.x + (workArea.width - this.width) / 2;
            const y = workArea.y + (workArea.height - this.height) / 2;
            this.set_position(Math.round(x), Math.round(y));
        }

        close() {
            if (this.state == State.OPENING || this.state == State.OPENED) {
                this._updateState(State.CLOSING);
                this.hide();

                this.emit('closed');

                this._updateState(State.CLOSED);
            }
        }

        showAndUpdateState() {
            if (!this._visibleToUser)
                return;

            const aboutToShow = this.state == State.CLOSING || this.state == State.CLOSED;
            this._log.debug(`Showing RunningApplicationListWindow with state ${this.state}: ${aboutToShow}`)
            if (aboutToShow) {
                this._updateState(State.OPENING);
                this.show();
                this._scheduleUpdatePosition();
                this._updateState(State.OPENED);
            }
        }

        _appStateChanged(appSystem, stateChangedApp) {
            if (stateChangedApp.get_state() === Shell.AppState.STARTING) {
                return;
            }

            const apps = this._defaultAppSystem.get_running();
            if (!apps.length) {
                if (this._onComplete) {
                    const nChildren = this._applicationSection.list.get_n_children();
                    if (nChildren) {
                        this._applicationSection.list.remove_all_children();
                    }
                    this._prepareToConfirm();
                }
            } else {
                this.showRunningApps();
            }
        }

        _prepareToConfirm() {
            if (this._checkProcessStateId) return;

            this._applicationSection.title = _('Waiting below processes to exit, this may take a while…');
            this._log.info(`Waiting processes to exit`);
            this._checkProcessStateId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this.updateRunningPids();
                const pidStateMap = this._checkRunningPidState();
                if (this._pidsMap.size) {
                    this._showProcesses(pidStateMap);
                } else {
                    // this._log.info(`All processes of running apps have exited, ${this._confirmButtOnLabel} ...`);
                    const nChildren = this._applicationSection.list.get_n_children();
                    if (nChildren) {
                        this._applicationSection.list.remove_all_children();
                    }

                    this._applicationSection.title = _('%s now, this may take a while, please wait…').format(this._confirmButtOnLabel);
                    this._confirmIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                        this._confirm();
                        this._confirmIdleId = null;
                        return GLib.SOURCE_REMOVE;
                    });
                    this._checkProcessStateId = null;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        }

        /**
         * Read the process state from /proc/<pid>/stat.
         * Returns the state character, or null if the process no longer exists.
         * See proc(5): field 3 after "pid (comm)".
         */
        _readProcState(pid) {
            try {
                const [ok, bytes] = GLib.file_get_contents(`/proc/${pid}/stat`);
                if (!ok)
                    return null;
                const stat = new TextDecoder().decode(bytes);
                // comm may contain spaces and parentheses; state follows the last ')'
                const closeParen = stat.lastIndexOf(')');
                if (closeParen === -1 || closeParen + 2 >= stat.length)
                    return null;
                return stat[closeParen + 2];
            } catch (e) {
                // ENOENT etc. — process has exited
                return null;
            }
        }

        _checkRunningPidState() {
            const pidStateMap = new Map();
            for (const [pid, app] of this._pidsMap) {
                const state = this._readProcState(pid);
                const appName = app.get_name();
                // A zombie process is in terminated state and it has completed execution.
                // The underlying program is no longer executing, but the process remains
                // in the process table as a zombie process until its parent process calls
                // the wait system call to read its exit status, at which point the process
                // is removed from the process table, finally ending the process's lifetime.
                // See: https://en.wikipedia.org/wiki/Zombie_process and https://en.wikipedia.org/wiki/Process_state#Terminated
                if (state && state !== ProcState.ZOMBIE) {
                    // this._log.debug(`Process ${pid} (${appName}) is still running with state ${state}, waiting it to exit`)
                    pidStateMap.set(pid, state);
                } else {
                    this._log.info(`Process ${pid} (${appName}) is exited with process state ${state} (${this._formatProcessState(state)})`);
                    this._pidsMap.delete(pid);
                }
            }
            return pidStateMap;
        }

        _showProcesses(pidStateMap) {
            if (!this._pidsMap.size) {
                return;
            }

            const nChildren = this._applicationSection.list.get_n_children();
            if (nChildren) {
                this._applicationSection.list.remove_all_children();
            }
            this._pidsMap.forEach((app, pid) => {
                let listItem = new Dialog.ListSectionItem({
                    icon_actor: app.create_icon_texture(64),
                    title: app.get_name(),
                    description: _('pid: %d | status: %s').format(pid, this._formatProcessState(pidStateMap.get(pid))),
                });
                this._applicationSection.list.add_child(listItem);
            });

            if (this._visibleToUser)
                this._scheduleUpdatePosition();
        }

        // Borrowed from https://github.com/GNOME/gnome-system-monitor/blob/master/src/util.cpp (format_process_state)
        _formatProcessState(state) {
            if (!state) {
                return _('Exited');
            }
            let status;
            switch (state) {
              case ProcState.RUNNING:
                status = _('Running');
                break;

              case ProcState.STOPPED:
              case 't': // tracing stop
                status = _('Stopped');
                break;

              case ProcState.ZOMBIE:
                status = _('Zombie');
                break;

              case ProcState.UNINTERRUPTIBLE:
                status = _('Uninterruptible');
                break;

              default:
                status = _('Sleeping');
                break;
            }

          return status;
        }

        showRunningApps() {
            const apps = this._defaultAppSystem.get_running();
            const nChildren = this._applicationSection.list.get_n_children();
            if (nChildren) {
                this._applicationSection.list.remove_all_children();
            }
            apps.forEach(app => {
                let listItem = new Dialog.ListSectionItem({
                    icon_actor: app.create_icon_texture(64),
                    title: app.get_name(),
                    description: app._cannot_close_reason
                        ? app._cannot_close_reason[0].toUpperCase() + app._cannot_close_reason.substring(1)
                        : (app._is_closing ? _('Closing') : _('It might have multiple windows')),
                });
                // Set both line_wrap and ellipsize to wrap the description
                listItem._description.clutter_text.line_wrap = true;
                listItem._description.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                this._applicationSection.list.add_child(listItem);
            });

            if (this._visibleToUser)
                this._scheduleUpdatePosition();
        }

        _confirmNow() {
            // Ignore the dialog state
            this._visibleToUser = false;
            if (this._onComplete) {
                this._onComplete('Confirm');
            }
        }

        _confirm() {
            if (this.state == State.CONFIRMING || this.state == State.CONFIRMED)
                return;

            this._updateState(State.CONFIRMING);
            this._visibleToUser = false;
            if (this._onComplete) {
                this._onComplete('Confirm');
                this._cancelButton.reactive = false;
                this._retryButton.reactive = true;
            }

            this._updateState(State.CONFIRMED);
        }

        _cancel() {
            if (this.state == State.CANCELING || this.state == State.CANCELLED)
                return;

            this._updateState(State.CANCELING);
            this._visibleToUser = false;

            if (this._checkProcessStateId) {
                GLib.source_remove(this._checkProcessStateId);
                this._checkProcessStateId = null;
            }

            if (this._updatePositionIdleId) {
                GLib.source_remove(this._updatePositionIdleId);
                this._updatePositionIdleId = null;
            }

            this.hide();
            if (this._onComplete)
                this._onComplete('Cancel');

            this._updateState(State.CANCELLED);
        }

        _updateState(state) {
            this.state = state
        }

        disable() {
            if (this._disabled)
                return;
            this._disabled = true;

            this._defaultAppSystem.disconnectObject(this);
            Main.overview.disconnectObject(this);
            this._initialKeyFocus?.disconnectObject(this);
            this._initialKeyFocus = null;

            if (this._confirmIdleId) {
                GLib.source_remove(this._confirmIdleId);
                this._confirmIdleId = null;
            }
            if (this._checkProcessStateId) {
                GLib.source_remove(this._checkProcessStateId);
                this._checkProcessStateId = null;
            }
            if (this._updatePositionIdleId) {
                GLib.source_remove(this._updatePositionIdleId);
                this._updatePositionIdleId = null;
            }
            this.hide();
            super.destroy();
        }

        destroy() {
            this.disable();
        }


    });

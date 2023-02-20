
'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Shell, St, Atk, Pango, GTop } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseSession = Me.imports.closeSession;

const EndSessionDialog = imports.ui.endSessionDialog;
const DND = imports.ui.dnd;

const Gettext = imports.gettext;

const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;
const Layout = imports.ui.layout;
const Main = imports.ui.main;

const Log = Me.imports.utils.log;

const PrefsUtils = Me.imports.utils.prefsUtils;
const FileUtils = Me.imports.utils.fileUtils;
const SubprocessUtils = Me.imports.utils.subprocessUtils;

const UiHelper = Me.imports.ui.uiHelper;


var sessionClosedByUser = false;

let __confirm = null;
let __init = null;
let _addButton = null;
let _OpenAsync = null;


const callFunc = function (thisObj, func, param) {
    const log = new Log.Log();
    try {
        return func.call(thisObj, param);
    } catch (error) {
        log.error(error);
    }
}

var State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    CANCELING: 4,
    CANCELLED: 5,
    CONFIRMING: 6,
    CONFIRMED: 7
};

var Autoclose = GObject.registerClass(
    class Autoclose extends GObject.Object {
        _init() {

            this._log = new Log.Log();
            this._settings = new PrefsUtils.PrefsUtils().getSettings();
            this._defaultAppSystem = Shell.AppSystem.get_default();

            this._runningApplicationListWindow = null;
            
            this._retryIdleId = null;

            this._overrideEndSessionDialog();
        }

        _overrideEndSessionDialog() {
            __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;
            __init = EndSessionDialog.EndSessionDialog.prototype._init;
            _addButton = EndSessionDialog.EndSessionDialog.prototype.addButton;
            _OpenAsync = EndSessionDialog.EndSessionDialog.prototype.OpenAsync;

            this._log.debug('Overriding some functions in EndSessionDialog');

            const that = this;

            // OpenAsync is promised and does not have a `try..catch...` surrounding the entire function, 
            // so here we catch the error to avoid `Unhandled promise rejection` possibly caused by this extension.
            EndSessionDialog.EndSessionDialog.prototype.OpenAsync = function (parameters, invocation) {
                try {
                    if (this._openingByAWSM) {
                        that._log.debug(`EndSessionDialog is already opening, ignore...`);
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

            EndSessionDialog.EndSessionDialog.prototype.addButton = function (buttonInfo) {
                try {
                    const enableAutocloseSession = that._settings.get_boolean('enable-autoclose-session');
                    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#bound_function
                    // Function.prototype.bind() produces a function whose name is "bound " plus the function name.
                    if (buttonInfo.action.name !== `bound ${this.cancel.name}` && enableAutocloseSession) {
                        buttonInfo.label = (`${buttonInfo.label} (via AWSM)`);

                        // The button underlying uses `label` as an input param, so we cannot use Clutter.Text here
                        // const label = new Clutter.Text();
                        // label.set_markup(`${buttonInfo.label} (<b style='color:red'>via AWSM</b>)`);
                        // buttonInfo.label = label;
                    }
                } catch (error) {
                    that._log.error(error);
                } finally {
                    return callFunc(this, _addButton, buttonInfo);
                }
            };

            EndSessionDialog.EndSessionDialog.prototype._confirm = async function (signal) {
                try {
                    sessionClosedByUser = true;

                    const enableAutocloseSession = that._settings.get_boolean('enable-autoclose-session');
                    if (!enableAutocloseSession) {
                        callFunc(this, __confirm, signal);
                        return;
                    }

                    let confirmButtOnLabel = 'Continue';
                    if (signal === 'ConfirmedLogout') {
                        confirmButtOnLabel = 'Log out';
                    } else if (signal === 'ConfirmedShutdown') {
                        confirmButtOnLabel = 'Power off';
                    } else if (signal == 'ConfirmedReboot') {
                        confirmButtOnLabel = 'Restart';
                    }

                    if (!that._runningApplicationListWindow) {
                        that._runningApplicationListWindow = new RunningApplicationListWindow(
                            confirmButtOnLabel,
                            () => {
                                this._openingByAWSM = true;
                            },
                            (opt) => {
                                this._openingByAWSM = false;

                                if (opt === 'Confirm') {
                                    // this.close();
                                    callFunc(this, __confirm, signal);
                                }

                                if (opt == 'Cancel') {
                                    this.cancel();
                                }
                            },
                            () => {
                                that._retryIdleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                                    const closeSession = new CloseSession.CloseSession();
                                    closeSession.closeWindows(null, true);
                                    that._retryIdleId = null;
                                    return GLib.SOURCE_REMOVE;
                                });
                            }
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
                    const closeSession = new CloseSession.CloseSession();
                    closeSession.closeWindows(null, true)
                        .then((result) => {
                            try {
                                const { hasRunningApps } = result;
                                if (hasRunningApps) {
                                    that._log.debug('One or more apps cannot be closed, please close them manually.');
                                    that._runningApplicationListWindow._applicationSection.title = `Those apps can't be closed, please close them manually`;
                                    that._runningApplicationListWindow.showRunningApps();
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

            if (_addButton) {
                EndSessionDialog.EndSessionDialog.prototype.addButton = _addButton;
                _addButton = null;
            }

            if (_OpenAsync) {
                EndSessionDialog.EndSessionDialog.prototype.OpenAsync = _OpenAsync;
                _OpenAsync = null;
            }
        }

        destroy() {
            this._restoreEndSessionDialog();
            if (this._runningApplicationListWindow) {
                this._runningApplicationListWindow.destroyDialog()
            }
            if (this._retryIdleId) {
                GLib.source_remove(this._retryIdleId);
                this._retryIdleId = null;
            }

        }

    });


// Based on dialog.js of gnome-shell
var RunningApplicationListWindow = GObject.registerClass({
    Signals: { 'opened': {}, 'closed': {} }
},
    class RunningApplicationListWindow extends St.BoxLayout {

        _init(confirmButtOnLabel, onOpen, onComplete, onRetry) {
            super._init({
                // TODO
                // style: 'width: 150em;',
                // shellReactive: true,
                // destroyOnClose: true
                style_class: 'modal-dialog',
                can_focus: true,
                visible: true,
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

            // wm_class 
            this._apps_recheck_process_state = new Set(['Microsoft-edge']);

            this._delegate = this;
            this._draggable = DND.makeDraggable(this, {
                restoreOnSuccess: false,
                manualMode: false,
                dragActorMaxSize: null,
                dragActorOpacity: 128
            });
            this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
            this._draggable.connect('drag-cancelled', this._onDragCancelled.bind(this));
            this._draggable.connect('drag-end', this._onDragEnd.bind(this));
            this.inDrag = false;

            this._positionInitialed = false;

            this._initialKeyFocus = null;

            this._log = new Log.Log();

            this._defaultAppSystem = Shell.AppSystem.get_default();
            
            this._pidsMap = new Map();

            this._removeFromLayoutIfNecessary(this);
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
                label: _(`${this._confirmButtOnLabel} now`),
            });

            this.contentLayout.add_child(this._confirmDialogContent);

            // TODO The color is not $warning_color
            this._applicationSection = new Dialog.ListSection({
                title: _('Closing running apps, please wait a moment…'),
            });
            this.contentLayout.add_child(this._applicationSection);

            this._appStateChangedId = this._defaultAppSystem.connect('app-state-changed', this._appStateChanged.bind(this));
            this.showRunningApps();

            this._overViewShowingId = Main.overview.connect('showing', () => {
                this.close();
            });
            this._overViewHidingId = Main.overview.connect('hidden', () => {
                this.showAndUpdateState();
            });

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

        _onDragBegin(_draggable, _time) {
            this._removeFromLayoutIfNecessary();

            this.inDrag = true;
            this._dragMonitor = {
                dragMotion: this._onDragMotion.bind(this),
                dragDrop: this._onDragDrop.bind(this),
            };
            DND.addDragMonitor(this._dragMonitor);
        }

        _onDragDrop(dropEvent) {
            this._draggable._dragState = DND.DragState.DRAGGING;
            this._dropTarget = dropEvent.targetActor;
            return DND.DragMotionResult.SUCCESS;
        }

        _removeFromLayoutIfNecessary() {
            if (Main.uiGroup.contains(this)) {
                // Fix clutter_actor_add_child: assertion 'child->priv->parent == NULL' failed
                // complained by dnd.startDrag() https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/7ea0230a86dbee935b256171b07f2f8302917433/js/ui/dnd.js#L347
                Main.uiGroup.remove_child(this);
            }
        }

        _onDragMotion(dropEvent) {
            this._inDrag = true;
            this.set_position(dropEvent.dragActor.x, dropEvent.dragActor.y);
            this._dragToXY = [dropEvent.dragActor.x, dropEvent.dragActor.y];
            this._dragActor = dropEvent.dragActor;
            return DND.DragMotionResult.CONTINUE;
        }

        _onDragCancelled(_draggable, _time) {
            this._inDrag = false;
        }

        getDragActor() {
            return this.get_actor();
        }

        acceptDrop() {
            return true;
        }

        _onDragEnd(_draggable, _time, _snapback) {
            this._inDrag = false;
            DND.removeDragMonitor(this._dragMonitor);
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
            button.connect('clicked', () => action());

            buttonInfo['button'] = button;

            if (isDefault)
                button.add_style_pseudo_class('default');

            if (this._initialKeyFocus == null || isDefault)
                this._setInitialKeyFocus(button);

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
            if (this.state == State.OPENED || this.state == State.OPENING)
                return true;

            this._updateState(State.OPENING);
            this._updatePosition();

            this._monitorConstraint.index = global.display.get_current_monitor();
            this.show();
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
            const workAreaWidth = workArea.width;
            const workAreaHeight = workArea.height;
            const x = workAreaWidth / 2 - this.width / 2;
            const y = workAreaHeight / 2 - this.height / 2;
            this.set_position(x, y);
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
            const aboutToShow = this.state == State.CLOSING || this.state == State.CLOSED;
            this._log.debug(`Showing RunningApplicationListWindow with state ${this.state}: ${aboutToShow}`)
            if (aboutToShow) {
                this._updateState(State.OPENING);
                this.show();
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

            this._applicationSection.title = `Waiting below processes to exit, this may take a while…`;
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

                    this._applicationSection.title = `${this._confirmButtOnLabel} now, this may take a while, please wait…`;
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

        _checkRunningPidState() {
            const pidStateMap = new Map();
            let state = new GTop.glibtop_proc_state();
            for (const [pid, app] of this._pidsMap) {
                GTop.glibtop_get_proc_state(state, pid);
                // 0 has to indicate the process does not exist. See: https://developer-old.gnome.org/libgtop/stable/libgtop-procstate.html. 
                // But I don't fully understand this page.🫣
                const appName = app.get_name();
                // A zombie process is in terminated state and it has completed execution.
                // The underlying program is no longer executing, but the process remains 
                // in the process table as a zombie process until its parent process calls 
                // the wait system call to read its exit status, at which point the process
                // is removed from the process table, finally ending the process's lifetime. 
                // See: https://en.wikipedia.org/wiki/Zombie_process and https://en.wikipedia.org/wiki/Process_state#Terminated
                if (state.state && state.state !== GTop.GLIBTOP_PROCESS_ZOMBIE) {
                    // this._log.debug(`Process ${pid} (${appName}) is still running with state ${state.state}, waiting it to exit`)
                    pidStateMap.set(pid, state.state);
                } else {
                    this._log.info(`Process ${pid} (${appName}) is exited with process state ${state.state} (${this._formatProcessState(state.state)})`);
                    this._pidsMap.delete(pid)
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
                    description: `pid: ${pid} | status: ${this._formatProcessState(pidStateMap.get(pid))}`,
                });
                this._applicationSection.list.add_child(listItem);
            });
        }

        // Translated to js and borrowed from https://github.com/GNOME/gnome-system-monitor/blob/d80dceedd106ca2415aeb0cb71b54ae4bd93bf75/src/util.cpp#format_process_state
        _formatProcessState(state) {
            if (state === undefined) {
                return _('Exited');
            }
            let status;
            switch (state) {
              case GTop.GLIBTOP_PROCESS_RUNNING:
                status = _('Running');
                break;
        
              case GTop.GLIBTOP_PROCESS_STOPPED:
                status = _('Stopped');
                break;
        
              case GTop.GLIBTOP_PROCESS_ZOMBIE:
                status = _('Zombie');
                break;
        
              case GTop.GLIBTOP_PROCESS_UNINTERRUPTIBLE:
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
                        : (app._is_closing ? 'Closing' : 'It might have multiple windows'),
                });
                // Set both line_wrap and ellipsize to wrap the description
                listItem._description.clutter_text.line_wrap = true;
                listItem._description.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
                this._applicationSection.list.add_child(listItem);
            });
        }

        _confirmNow() {
            // Ignore the dialog state
            if (this._onComplete) {
                this._onComplete('Confirm');
            }
        }

        _confirm() {
            if (this.state == State.CONFIRMING || this.state == State.CONFIRMED)
                return;

            this._updateState(State.CONFIRMING);
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
            
            if (this._checkProcessStateId) {
                GLib.source_remove(this._checkProcessStateId);
                this._checkProcessStateId = null;
            }

            this.hide();
            if (this._onComplete)
                this._onComplete('Cancel');

            this._updateState(State.CANCELLED);
        }

        _updateState(state) {
            this.state = state
        }

        destroy() {
            // This function is called when drag is canceled, but the dialog should be always shown.
            // So we override it but do nothing. And there is a `destroyDialog()` which can be used to destroy the dialog anyway.
            // TODO This function is also called after releasing the left button, which is wired, I probably misuse something in this class.
        }

        destroyDialog() {
            this.hide();
            super.destroy();
            if (this._appStateChangedId) {
                this._defaultAppSystem.disconnect(this._appStateChangedId);
                this._appStateChangedId = null;
            }
            if (this._overViewShowingId) {
                Main.overview.disconnect(this._overViewShowingId);
                this._overViewShowingId = null;
            }
            if (this._overViewHidingId) {
                Main.overview.disconnect(this._overViewHidingId);
                this._overViewHidingId = null;
            }
            if (this._confirmIdleId) {
                GLib.source_remove(this._confirmIdleId);
                this._confirmIdleId = null;
            }
            if (this._checkProcessStateId) {
                GLib.source_remove(this._checkProcessStateId);
                this._checkProcessStateId = null;
            }
        }


    });

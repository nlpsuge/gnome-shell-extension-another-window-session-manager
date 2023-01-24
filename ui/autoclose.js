
'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Shell, St, Atk, Pango } = imports.gi;

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

            // this._alwaysRemoveOrphanSessions = false;

            this._runningApplicationListWindow = null;
            this._dbusImpl = null;

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
                _OpenAsync.call(this, parameters, invocation)
                    .catch(e => {
                        that._log.error(e);
                    });
            }

            EndSessionDialog.EndSessionDialog.prototype.addButton = function (buttonInfo) {
                try {
                    const enableAutocloseSession = that._settings.get_boolean('enable-autoclose-session');
                    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#bound_function
                    // Function.prototype.bind() produces a function whose name is "bound " plus the function name.
                    if (buttonInfo.action.name !== `bound ${this.cancel.name}` && enableAutocloseSession) {
                        buttonInfo.label = (`${buttonInfo.label}(via AWSM)`);

                        // The button underlying uses `label` as an input param, so we cannot use Clutter.Text here
                        // const label = new Clutter.Text();
                        // label.set_markup(`${buttonInfo.label}(<b style='color:red'>via AWSM</b>)`);
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

                    const runningApps = that._defaultAppSystem.get_running();
                    if (!runningApps.length) {
                        callFunc(this, __confirm, signal);
                        return;
                    }

                    if (!that._runningApplicationListWindow) {
                        let confirmButtOnLabel = 'Continue';
                        if (signal === 'ConfirmedLogout') {
                            confirmButtOnLabel = 'Logout';
                        } else if (signal === 'ConfirmedShutdown') {
                            confirmButtOnLabel = 'Shutdown';
                        } else if (signal == 'ConfirmedReboot') {
                            confirmButtOnLabel = 'Reboot';
                        }

                        that._runningApplicationListWindow = new RunningApplicationListWindow(
                            confirmButtOnLabel,
                            () => {
                                try {
                                    that._log.debug('Unexporting EndSessionDialog dbus service');
                                    that._dbusImpl = this._dbusImpl;
                                    //this._dbusImpl.flush();
                                    this._dbusImpl.unexport();
                                } catch (error) {
                                    that._log.error(error);
                                }
                            },
                            (opt) => {
                                try {
                                    that._log.debug('Restoring to export EndSessionDialog dbus service');
                                    this._dbusImpl.export(Gio.DBus.session, '/org/gnome/SessionManager/EndSessionDialog');
                                } catch (error) {
                                    that._log.error(error);
                                }

                                if (opt === 'Confirm') {
                                    // this.close();
                                    callFunc(this, __confirm, signal);
                                }

                                if (opt == 'Cancel') {
                                    this.cancel();
                                }
                            }
                        );
                    }

                    // Remove orphan session folders before closing all windows
                    // await that._removeOrphanSessions();

                    const closeSession = new CloseSession.CloseSession();
                    closeSession.closeWindows()
                        .then((result) => {
                            try {
                                const { hasRunningApps } = result;
                                if (hasRunningApps) {
                                    that._log.debug('One or more apps cannot be closed, please close them manually.');
                                    that._runningApplicationListWindow._applicationSection.title = `Those apps can't be closed, please close them manually`;
                                    that._runningApplicationListWindow.showRunningApps();
                                } else {
                                    callFunc(this, __confirm, signal);
                                }
                            } catch (error) {
                                that._log.error(error);
                            }
                        }).catch(error => {
                            that._log.error(error);
                        });

                    // Close the EndSessionDialog. Underlying, `this.close()` emits a `Closed` 
                    // dbus signal to gnome-session, so this should prevent the installation of inhibitions
                    // when users play videos via players or copy files in Nautilus. In this case, 
                    // once an inhibition is installed, an EndSessionDialog opens.
                    this.close();

                    this._stopTimer();
                    this._stopAltCapture();

                    that._runningApplicationListWindow.open();
                } catch (error) {
                    that._log.error(error);
                }

            };
        }

        // TODO Unused and untested...
        // async _removeOrphanSessions() {
        //     try {
        //         if (!this._alwaysRemoveOrphanSessions) return;

        //         const folderNames = new Set();
        //         const apps = this._defaultAppSystem.get_running();
        //         for (const app of apps) {
        //             const windows = app.get_windows();
        //             for (const metaWindow of windows) {
        //                 if (UiHelper.ignoreWindows(metaWindow)) continue;
        //                 folderNames.add(metaWindow.get_wm_class());
        //             }
        //         }

        //         await FileUtils.listAllSessions(FileUtils.current_session_path, false, (file, info) => {
        //             const filename = info.get_name();
        //             const path = file.get_path();
        //             if (!folderNames.has(filename) && path) {
        //                 this._log.debug(`Removing orphan session folder ${path}`);
        //                 FileUtils.removeFile(path, true);
        //             }
        //         });
        //     } catch (e) {
        //         this._log.error(e);
        //     }
        // }

        _restoreEndSessionDialog() {
            if (__confirm) {
                EndSessionDialog.EndSessionDialog.prototype._confirm = __confirm;
                __confirm = null;
            }

            if (this._dbusImpl) {
                this._log.debug('Restoring to export EndSessionDialog dbus service');
                this._dbusImpl.export(Gio.DBus.session, '/org/gnome/SessionManager/EndSessionDialog');
                this._dbusImpl = null;
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
            log('des...')
            this._restoreEndSessionDialog();
            if (this._runningApplicationListWindow) {
                this._runningApplicationListWindow.destroyDialog()
            }

        }


    });


var RunningApplicationListWindow = GObject.registerClass({
    Signals: { 'opened': {}, 'closed': {} }
},
    class RunningApplicationListWindow extends St.BoxLayout {

        _init(confirmButtOnLabel, onOpen, onComplete) {
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

            this.connect('stage-views-changed', () => {
                log('stage-views-changed...')
            });
            this.connectObject('notify::visible', (visible, p2) => {
                log('visible 111 ' + visible + ' ' + p2)
                log('this.visible ' + this.visible)
                if (!this.visible
                    && (this.state === State.OPENING || this.state === State.OPENED)) {
                    log('xxxxxxx')
                }


            });
            this.connect('hide', () => {
                log('hiding ' + this.state)
            });
            this._draggable.actor.connect('destroy', () => {
                log(`${RunningApplicationListWindow.name} _draggable destroyed`)
            });
            this._draggable.actor.connect('event', (actor, event) => {
                let [dropX, dropY] = event.get_coords();
                let target = this._dragActor?.get_stage().get_actor_at_pos(Clutter.PickMode.ALL,
                    dropX, dropY);

                const isr = this._draggable._eventIsRelease(event);
                // log('isr ' + isr + ' event.type() ' + event.type())
                if (isr) {
                    log(this._draggable._dragState)
                    log(target)
                    log('target._delegate && target._delegate.acceptDrop ' + target._delegate && target._delegate.acceptDrop);
                }
            });

            this._positionInitialed = false;

            this._initialKeyFocus = null;

            // super._hasModal = true;

            this._log = new Log.Log();

            this._defaultAppSystem = Shell.AppSystem.get_default();
            this._settings = new PrefsUtils.PrefsUtils().getSettings();

            this._removeFromLayoutIfNecessary(this);
            // Main.layoutManager.modalDialogGroup.add_actor(this);
            // Main.layoutManager.uiGroup.add_actor(this);
            Main.layoutManager.addChrome(this);

            // let display = global.display;
            // display.connect('restacked', (p1, p2) => {
            //     log('ccc ' + this)
            //     // const trackedActors = Main.layoutManager._trackedActors;
            //     // trackedActors.forEach(actorData => {
            //     //     log(actorData.actor + ' ' + actorData.actor.visible);
            //     //     log(actorData.trackFullscreen)
            //     // });
            //     log('visible 1112 ' + p1 + ' ' + p2)
            //     log('this.visible2 ' + this.visible)
            //     if (!this.visible 
            //         && (this.state === State.OPENING || this.state === State.OPENED)) {
            //         log('xxxxxxx2')
            //     }

            //     // if (global.top_window_group)
            //     //     Main.uiGroup.remove_child(global.top_window_group);
            //     // Main.uiGroup.remove_child(this);

            //     // GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            //     //     if (global.top_window_group)
            //     //         Main.uiGroup.add_actor(global.top_window_group);
            //     //     Main.uiGroup.add_actor(this);
            //     //     return GLib.SOURCE_REMOVE;
            //     // });


            // });
            // display.connect('in-fullscreen-changed', () => {
            //     log('ccc in fullscreen')
            //     const trackedActors = Main.layoutManager._trackedActors;
            //     trackedActors.forEach(actorData => {
            //         log(actorData.actor + ' ' + actorData.actor.visible);
            //         log(actorData.trackFullscreen)
            //     });
            // });

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
                    this._confirm();
                },
                label: _(`${this._confirmButtOnLabel} anyway`),
            });

            this.contentLayout.add_child(this._confirmDialogContent);

            // TODO The color is not $warning_color
            this._applicationSection = new Dialog.ListSection({
                title: _('Closing running apps, please wait a moment…'),
            });
            this.contentLayout.add_child(this._applicationSection);

            this._defaultAppSystem.connect('app-state-changed', this._appStateChanged.bind(this));
            this.showRunningApps();

            this._overViewShowingId = Main.overview.connect('showing', () => {
                // Main.overview.disconnect(this._overViewShowingId);
                this.close();
            });
            this._overViewHidingId = Main.overview.connect('hidden', () => {
                // Main.overview.disconnect(this._overViewHidingId);
                this.showAndUpdateState();
            });

        }

        _eventIsRelease(event) {
            if (event.type() == Clutter.EventType.BUTTON_RELEASE) {
                let buttonMask = Clutter.ModifierType.BUTTON1_MASK |
                    Clutter.ModifierType.BUTTON2_MASK |
                    Clutter.ModifierType.BUTTON3_MASK;
                /* We only obey the last button release from the device,
                 * other buttons may get pressed/released during the DnD op.
                 */
                return (event.get_state() & buttonMask) == 0;
            } else if (event.type() == Clutter.EventType.TOUCH_END) {
                /* For touch, we only obey the pointer emulating sequence */
                return global.display.is_pointer_emulating_sequence(event.get_event_sequence());
            }

            return false;
        }

        _onDragBegin(_draggable, _time) {
            log('_onDragBegin')
            this._removeFromLayoutIfNecessary();

            this.inDrag = true;
            this._dragMonitor = {
                dragMotion: this._onDragMotion.bind(this),
                dragDrop: this._onDragDrop.bind(this),
            };
            DND.addDragMonitor(this._dragMonitor);
        }

        _onDragDrop(dropEvent) {
            // this._dragToXY = [this._dragActor.x, this._dragActor.y];
            log('_dragState ' + this._draggable._dragState)
            this._draggable._dragState = DND.DragState.DRAGGING;
            log('_onDragDrop dropEvent.clutterEvent.type() ' + dropEvent.clutterEvent.type())
            this._dropTarget = dropEvent.targetActor;
            log('_onDragDrop this._dropTarget ' + this._dropTarget)
            log('_onDragDrop this._dropTarget._delegate ' + this._dropTarget._delegate)
            return DND.DragMotionResult.SUCCESS;
        }

        _removeFromLayoutIfNecessary() {
            if (Main.uiGroup.contains(this)) {
                log('removing ')
                // Fix clutter_actor_add_child: assertion 'child->priv->parent == NULL' failed
                // complained by dnd.startDrag() https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/7ea0230a86dbee935b256171b07f2f8302917433/js/ui/dnd.js#L347
                Main.uiGroup.remove_child(this);
            }
        }

        _onDragMotion(dropEvent) {
            log('_dragState ' + this._draggable._dragState)
            this._inDrag = true;
            // this._dragActor = dropEvent.dragActor;
            this.set_position(dropEvent.dragActor.x, dropEvent.dragActor.y);
            this._dragToXY = [dropEvent.dragActor.x, dropEvent.dragActor.y];
            // this.x = dropEvent.dragActor.x;
            // this.y = dropEvent.dragActor.y;
            this._dragActor = dropEvent.dragActor;
            log(dropEvent.dragActor.x)
            log(dropEvent.dragActor.y)
            return DND.DragMotionResult.CONTINUE;
        }

        _onDragCancelled(_draggable, _time) {
            this._inDrag = false;
            log('_onDragCancelled')
        }

        getDragActor() {
            return this.get_actor();
        }

        acceptDrop() {
            return true;
        }

        _onDragEnd(_draggable, _time, _snapback) {
            log('_dragState ' + this._draggable._dragState)
            this._inDrag = false;
            log('_onDragEnd')
            // if (this._dragToXY) {
            //     const [toX, toY] = this._dragToXY;
            //     log(toX)
            //     log(toY)
            //     this.set_position(toX, toY);
            // }
            DND.removeDragMonitor(this._dragMonitor);
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
            log('hiding dialog ' + this.state)
            if (this.state == State.OPENING || this.state == State.OPENED) {
                this._updateState(State.CLOSING);
                this.hide();

                // this.destroy();
                this.emit('closed');

                this._updateState(State.CLOSED);
            }
        }

        showAndUpdateState() {
            const aboutToShow = this.state == State.CLOSING || this.state == State.CLOSED;
            this._log.debug(`Showing ${RunningApplicationListWindow.name} with state ${this.state}: ${aboutToShow}`)
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

            // if (app.get_state() !== Shell.AppState.STOPPED) {
            //     this._desync();
            // }

            const apps = this._defaultAppSystem.get_running();
            if (!apps.length) {
                if (this._onComplete) {
                    const nChildren = this._applicationSection.list.get_n_children();
                    if (nChildren) {
                        this._applicationSection.list.remove_all_children();
                    }
                    this._applicationSection.title = `${this._confirmButtOnLabel} now…`
                    this._onComplete('Confirm');
                }
            } else {
                this.showRunningApps();
            }
            // this._sync();
        }

        // _startTimer() {
        //     let startTime = GLib.get_monotonic_time();
        //     this._secondsLeft = this._totalSecondsToStayOpen;

        //     this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        //         let currentTime = GLib.get_monotonic_time();
        //         let secondsElapsed = (currentTime - startTime) / 1000000;

        //         this._secondsLeft = this._totalSecondsToStayOpen - secondsElapsed;
        //         if (this._secondsLeft > 0) {
        //             this._sync();
        //             return GLib.SOURCE_CONTINUE;
        //         }

        //         this._confirm();
        //         this.close();
        //         this._timerId = 0;

        //         return GLib.SOURCE_REMOVE;
        //     });
        //     GLib.Source.set_name_by_id(this._timerId, '[gnome-shell-extension-another-window-session-manager] this._confirm');
        // }

        // _sync() {
        //     const displayTime = EndSessionDialog._roundSecondsToInterval(this._totalSecondsToStayOpen,
        //                                                                  this._secondsLeft,
        //                                                                  1);
        //     const desc = Gettext.ngettext('\'' + this._sessionName + '\' will be restored in %d second',
        //         '\'' + this._sessionName + '\' will be restored in %d seconds', displayTime).format(displayTime);
        //     this._confirmDialogContent.description = desc;

        // }

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

        _confirm() {
            log('this._onComplete _confirm ')
            if (this.state == State.CONFIRMING || this.state == State.CONFIRMED)
                return;

            this._updateState(State.CONFIRMING);
            this.hide();
            if (this._onComplete)
                this._onComplete('Confirm');

            this._updateState(State.CONFIRMED);
        }

        _cancel() {
            log('this._onComplete canceled ' + this.state);
            if (this.state == State.CANCELING || this.state == State.CANCELLED)
                return;

            this._updateState(State.CANCELING);
            this.hide();
            if (this._onComplete)
                this._onComplete('Cancel');

            this._updateState(State.CANCELLED);
        }

        _updateState(state) {
            this.state = state
        }

        destroy() {
            log('destroy override...')
        }

        destroyDialog() {
            log('destroying dialog...')
            this.hide();
            super.destroy();
            if (this._overViewShowingId) {
                Main.overview.disconnect(this._overViewShowingId);
                this._overViewShowingId = 0;
            }
            if (this._overViewHidingId) {
                Main.overview.disconnect(this._overViewHidingId);
                this._overViewHidingId = 0;
            }
        }


    });
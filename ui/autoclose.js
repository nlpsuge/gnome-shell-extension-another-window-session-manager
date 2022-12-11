
'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Shell, St, Atk } = imports.gi;

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

var closeSessionByUser = false;

let __confirm = EndSessionDialog.EndSessionDialog.prototype._confirm;
let __init = EndSessionDialog.EndSessionDialog.prototype._init;
let _addButton = EndSessionDialog.EndSessionDialog.prototype.addButton;

var State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
};

var Autoclose = GObject.registerClass(
    class Autoclose extends GObject.Object {
        _init() {
            this._runningApplicationListWindow = null;
            this._log = new Log.Log();
            const that = this;

            EndSessionDialog.EndSessionDialog.prototype.addButton = function(buttonInfo) {
                try {
                    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#bound_function
                    // Function.prototype.bind() produces a function whose name is "bound " plus the function name.
                    if (buttonInfo.action.name !== `bound ${this.cancel.name}`) {
                        buttonInfo.label = (`${buttonInfo.label}(via AWSM)`);

                        // The button underlying uses `label` as an input param, so we cannot use Clutter.Text here
                        // const label = new Clutter.Text();
                        // label.set_markup(`${buttonInfo.label}(<b style='color:red'>via AWSM</b>)`);
                        // buttonInfo.label = label;
                    }
                } catch (error) {
                    that._log.error(error);
                } finally {
                    try {
                        _addButton.call(this, buttonInfo);
                    } catch (error) {
                        that._log.error(error);
                    }
                }
            }

            EndSessionDialog.EndSessionDialog.prototype._confirm = function(signal) {
                try {
                    closeSessionByUser = true;
                    const closeSession = new CloseSession.CloseSession();
                    // closeSession.closeWindows()
                    //     .then((result) => {
                    try {
                        // const {hasRunningApps} = result;
                        const hasRunningApps = true;
                        if (hasRunningApps) {
                            that._log.debug('One or more apps cannot be closed, please close them manually.');
                            this._fadeOutDialog();
                            this._stopTimer();
                            this._stopAltCapture();
                            // call gtkdialog via dbus
                            if (!that._runningApplicationListWindow) {
                                that._runningApplicationListWindow = new RunningApplicationListWindow(
                                    this, 
                                    signal,
                                    () => this._dbusImpl.unexport(),
                                    () => this._dbusImpl.export(Gio.DBus.session, '/org/gnome/SessionManager/EndSessionDialog')
                                    );
                            }
                            
                            
                            that._runningApplicationListWindow.open();
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

            if (_addButton) {
                EndSessionDialog.EndSessionDialog.prototype.addButton = _addButton;
                _addButton = null;
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

        _init(endSessionDialog, signal, onOpen, onComplete) {
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

            this._signal = signal;
            this._endSessionDialog = endSessionDialog;
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
                log('destroyed')
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

            let label = 'Continue anyway';
            if (signal === 'ConfirmedLogout') {
                label = 'Logout anyway';
            } else if (signal === 'ConfirmedShutdown') {
                label = 'Shutdown anyway';
            } else if (signal == 'ConfirmedReboot') {
                label = 'Reboot anyway';
            }

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
                    let signalId = this.connect('closed', () => {
                        this.disconnect(signalId);
                        this._confirm();
                    });
                    this.close();
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
                if (this.state == State.CLOSED || this.state == State.CLOSING)
                    return;

                this.hide();
            });
            this._overViewHidingId = Main.overview.connect('hidden', () => {
                // Main.overview.disconnect(this._overViewHidingId);
                if (this.state == State.CLOSED || this.state == State.CLOSING
                    || this.state == State.OPENED || this.state == State.OPENING) 
                    return;

                log('showing dialog ' + this.state)
                this.show();
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

            this._updateState(State.CLOSING);
            const activeWorkspace = global.workspace_manager.get_active_workspace();
            const currentMonitorIndex = global.display.get_current_monitor();
            const workArea = activeWorkspace.get_work_area_for_monitor(currentMonitorIndex);
            const workAreaWidth = workArea.width;
            const workAreaHeight = workArea.height;
            const x = workAreaWidth / 2 - this.width / 2;
            const y = workAreaHeight / 2 - this.height / 2;
            this.set_position(x, y);

            this._monitorConstraint.index = global.display.get_current_monitor();
            this.show();
            this._updateState(State.OPENED);
            if (this._onOpen)
                this._onOpen();
            this.emit('opened');
            return true;
        }

        close() {
            if (this.state == State.CLOSED || this.state == State.CLOSING)
                return;

            this._updateState(State.CLOSING);
            this.hide();
            // this.destroy();
            this._updateState(State.CLOSED);
            this.emit('closed');
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
            log('this._onComplete _confirm ' + this._onComplete)
            if(this._onComplete)
                this._onComplete();
        }

        _cancel() {
            log('this._onComplete canceled ' + this._onComplete)
            this.close();
            if(this._onComplete)
                this._onComplete();
        }

        _updateState(state) {
            this.state = this.state
        }

        destroy() {
            log('destroy override...')
        }

        destroyDialog() {
            log('destroying dialog...')
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

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
                            new RunningApplicationListWindow(this, signal).open();
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
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                vertical: true,
                accessible_role: Atk.Role.DIALOG,
            });

            this._dialog = new ModalDialog.ModalDialog();

            this._delegate = this._dialog;
            this._draggable = DND.makeDraggable(this._dialog, {
                restoreOnSuccess: false,
                manualMode: false,
                dragActorMaxSize: null,
                dragActorOpacity: 128 
            });
            this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
            this._draggable.connect('drag-cancelled', this._onDragCancelled.bind(this));
            this._draggable.connect('drag-end', this._onDragEnd.bind(this));
            this.inDrag = false;


            this.connect('hide', () => {
                log('hiding ' + this.state)
            });
            this._draggable.actor.connect('destroy', () => {
                log('destroyed')
            });
            this._draggable.actor.connect('event', (actor, event) => {
                let [dropX, dropY] = event.get_coords();
                let target = this._dragActor.get_stage().get_actor_at_pos(Clutter.PickMode.ALL,
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
            this._signal = signal;
            this._endSessionDialog = endSessionDialog;

            this._defaultAppSystem = Shell.AppSystem.get_default();
            this._settings = new PrefsUtils.PrefsUtils().getSettings();

            // this._removeFromLayoutIfNecessary(this);
            // Main.layoutManager.modalDialogGroup.add_actor(this);
            // Main.layoutManager.uiGroup.add_actor(this);
            // Main.layoutManager.addChrome(this);

            this._confirmDialogContent = new Dialog.MessageDialogContent();
            this._confirmDialogContent.title = `Running applications`;

            // this.backgroundStack = new St.Widget({
            //     layout_manager: new Clutter.BinLayout(),
            //     x_expand: true,
            //     y_expand: true,
            // });
            // this._backgroundBin = new St.Bin({ child: this.backgroundStack });
            // this._monitorConstraint = new Layout.MonitorConstraint();
            // this._backgroundBin.add_constraint(this._monitorConstraint);
            // this.add_actor(this._backgroundBin);

            // this.backgroundStack.add_child(this);


            // this.dialogLayout = new Dialog.Dialog(this.backgroundStack, null);
            // this.contentLayout = this.dialogLayout.contentLayout;
            // this.buttonLayout = this.dialogLayout.buttonLayout;
            // this.contentLayout = new St.BoxLayout({
            //     vertical: true,
            //     style_class: 'modal-dialog-content-box',
            //     y_expand: true,
            //     x_align: Clutter.ActorAlign.CENTER,
            //     y_align: Clutter.ActorAlign.CENTER
            // });

            // this.add_child(this.contentLayout);

            // this.buttonLayout = new St.Widget({
            //     layout_manager: new Clutter.BoxLayout({ homogeneous: true }),
            // });
            // this.add_child(this.buttonLayout);

            this._dialog.addButton({
                action: this._cancel.bind(this),
                label: _('Cancel'),
                key: Clutter.KEY_Escape,
            });

            this._confirmButton = this._dialog.addButton({
                action: () => {
                    this.close();
                    let signalId = this.connect('closed', () => {
                        this.disconnect(signalId);
                        this._confirm();
                    });
                },
                label: _(label),
            });

            this._dialog.contentLayout.add_child(this._confirmDialogContent);
            // this.contentLayout.add_child(this._confirmDialogContent);

            this._applicationSection = new Dialog.ListSection({
                title: _('Please close running apps before proceeding'),
            });
            this._dialog.contentLayout.add_child(this._applicationSection);

            this._defaultAppSystem.connect('app-state-changed', this._appStateChanged.bind(this));
            this._showRunningApps(this._defaultAppSystem.get_running());

            this._overViewShowingId = Main.overview.connect('showing', () => {
                // Main.overview.disconnect(this._overViewShowingId);
                if (this.state == State.CLOSED || this.state == State.CLOSING)
                    return;

                this.hide();
            });
            this._overViewHidingId = Main.overview.connect('hiding', () => {
                // Main.overview.disconnect(this._overViewHidingId);
                if (this.state == State.CLOSED || this.state == State.CLOSING) 
                    return;

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
            // this._removeFromLayoutIfNecessary();

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
            // return this.get_actor();
            return this._dialog;
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
            this._dialog.open()
            // if (this.state == State.OPENED || this.state == State.OPENING)
            //     return true;

            const activeWorkspace = global.workspace_manager.get_active_workspace();
            const currentMonitorIndex = global.display.get_current_monitor();
            const workArea = activeWorkspace.get_work_area_for_monitor(currentMonitorIndex);
            const workAreaWidth = workArea.width;
            const workAreaHeight = workArea.height;
            const x = workAreaWidth / 2 - this.width / 2;
            const y = workAreaHeight / 2 - this.height / 2;
            this.set_position(x, y);

            // this._monitorConstraint.index = global.display.get_current_monitor();
            // this.show();
            // this._state = State.OPENED;
            return true;
        }

        destroy() {
            log('destroying...')
        }

        close() {
            // if (this.state == State.CLOSED || this.state == State.CLOSING)
            //     return;

            // this.hide();
            // this.destroy();
            this._dialog.close();
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
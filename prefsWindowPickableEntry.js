'use strict';

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import * as PrefsWidgets from './prefsWidgets.js';


export const WindowPickableEntry = GObject.registerClass({
    Signals: {
        'entry-changed': {
            param_types: [Gtk.Entry]
        },
        'entry-edit-complete': {
            param_types: [Gtk.Entry]
        },
    }
}, class WindowPickableEntry extends Gtk.Box {

    _init(entryParams, boxParams) {
        
        super._init(PrefsWidgets.gtkBoxProperties);
        Object.assign(this, boxParams);

        const entry = new Gtk.Entry({
            editable: false,
            can_focus: false,
            focus_on_click: false,
            halign: Gtk.Align.START,
            hexpand: true,
            // Make sure that text align left
            xalign: 0,
            width_chars: 20,
            max_width_chars: 20,
            // ellipsize: Pango.EllipsizeMode.END,
        });
        this.entry = entry;
        this.pickConditionFunc = entryParams.pickConditionFunc;
        Object.assign(entry, entryParams);

        this._initEntry(entry);
        entry.set_tooltip_text(entry.get_text());
        
        this.append(entry);
        this.append(this.chooseButton);
    }

    setText(text) {
        this.entry.set_text(text);
    }

    _initEntry(entry) {
        entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'document-edit-symbolic');
        entry.set_icon_tooltip_text(Gtk.EntryIconPosition.SECONDARY, 'Edit the entry');
        entry.set_icon_activatable(Gtk.EntryIconPosition.SECONDARY, true);
        const iconPressId = entry.connect('icon-press', (source, icon_pos) => {
            if (icon_pos !== Gtk.EntryIconPosition.SECONDARY)
                return;

            if (source._showSaveIconAWSM) {
                delete source._showSaveIconAWSM;
                this._completeEditEntry(entry);
                if (this._prefsDialogCloseRequestId) {
                    const prefsDialogWindow = entry.get_root();
                    if (prefsDialogWindow) prefsDialogWindow.disconnect(this._prefsDialogCloseRequestId);
                }
            } else {
                source.block_signal_handler(iconPressId);

                source.set_can_focus(true);
                source.set_editable(true);
                source.grab_focus_without_selecting();
                // -1 put the cursor to the end
                source.set_position(-1);

                source.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'emblem-ok-symbolic');
                source.set_icon_tooltip_text(Gtk.EntryIconPosition.SECONDARY, 'Complete editing');
                source._showSaveIconAWSM = true;

                // Save the entry when we close the prefs dialog window
                const prefsDialogWindow = entry.get_root();
                if (prefsDialogWindow) {
                    this._prefsDialogCloseRequestId = prefsDialogWindow.connect('close-request', () => {
                        this.emit('entry-edit-complete', entry);
                        prefsDialogWindow.disconnect(this._prefsDialogCloseRequestId);
                    });
                }
                source.unblock_signal_handler(iconPressId);
            }
        });
        // Accept Enter key to complete the editing
        entry.connect('activate', () => {
            this._completeEditEntry(entry);
        });
        let entryController = Gtk.EventControllerFocus.new();
        entry.add_controller(entryController);
        entryController.connect('leave', (source) => {
            this._completeEditEntry(entry);
        });
        entry.connect('changed', (source) => {
            this.emit('entry-changed', source);
        });

        // const image = new Gtk.Image({
        //     file: IconFinder.findPath('choose-window-symbolic.svg'),
        // });
        const chooseButton = new Gtk.Button({
            icon_name: 'find-location-symbolic',
            // label: 'Pick...',
            tooltip_text: 'Choose a window to fill the entry based on the current setting',
        });
        this.chooseButton = chooseButton;
        
        PrefsWidgets.updateStyle(entry, 
            `entry {
                border-top-right-radius: 0px;
                border-bottom-right-radius: 0px;
            }`);
        PrefsWidgets.updateStyle(chooseButton, 
            // Use .text-button if the button displays a label; Use .image-button if it displays an image
            `.image-button {
                padding-left: 0px;
                padding-right: 6px;
                border-top-left-radius: 0px;
                border-bottom-left-radius: 0px;
            }`); 

        // Pick a window to fetch application and window infos according to the current rule setting
        chooseButton.connect('clicked', (source, pickedWidget) => {
            if (this._dbusConnection) {
                // Unsubscribe the existing PickWindow DBus service, just in case of modifying another entry.
                Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
                this._dbusConnection = null;
            }

            Gio.DBus.session.call(
                'org.gnome.Shell',
                '/org/gnome/shell/extensions/awsm',
                'org.gnome.Shell.Extensions.awsm.PickWindow', 'PickWindow',
                null, null, Gio.DBusCallFlags.NO_AUTO_START, -1, null, null);

            this._dbusConnection = this._subscribeSignal('WindowPicked', (conn, sender, obj_path, iface, signal, results) => {
                // Unsubscribe the PickWindow DBus service, it's really no necessary to keep the subscription all the time
                Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
                this._dbusConnection = null;

                this._unfocus(entry);

                const resultsArray = results.recursiveUnpack();
                // Pick nothing, so we ignore this pick
                if(!resultsArray.length) {
                    return;
                }

                const [appName, wmClass, wmClassInstance, title] = resultsArray;
                let entryValue = '';
                switch (this.pickConditionFunc()) {
                    case 'wm_class':
                        entryValue = wmClass;
                        break;
                    case 'wm_class_instance':
                        entryValue = wmClassInstance;
                        break;
                    case 'app_name':
                        entryValue = appName;
                        break;
                    case 'title':
                        entryValue = title;
                        break;
                    default:
                        break;
                }

                entry.set_text(entryValue);
                entry.set_tooltip_text(entryValue);
                this.emit('entry-edit-complete', entry);
            });
        });

        this._subscribeSignal('WindowPickCancelled', () => {
            // Unsubscribe the PickWindow DBus service, it's really no necessary to keep the subscription all the time
            Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
            this._dbusConnection = null;
            
            this._unfocus(entry);
        });
    }

    _subscribeSignal(signalName, callback) {
        const dbusConnection = Gio.DBus.session.signal_subscribe(
            'org.gnome.Shell', 'org.gnome.Shell.Extensions.awsm.PickWindow', 
            signalName,
            '/org/gnome/shell/extensions/awsm', null, Gio.DBusSignalFlags.NONE, 
            callback);
        return dbusConnection;
    }

    _completeEditEntry(entry) {
        entry.set_can_focus(false);
        entry.set_editable(false);
        this._unfocus(entry);
        entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'document-edit-symbolic');
        entry.set_icon_tooltip_text(Gtk.EntryIconPosition.SECONDARY, 'Edit the entry');
        entry.set_tooltip_text(entry.get_text());
        this.emit('entry-edit-complete', entry);
    }

    _unfocus(widget) {
        const prefsDialogWindow = widget.get_root();
        if (prefsDialogWindow)
            // Pass `null` to unfocus the entry
            prefsDialogWindow.set_focus(null);
    }

});

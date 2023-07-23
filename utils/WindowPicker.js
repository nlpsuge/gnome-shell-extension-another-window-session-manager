// SPDX-FileCopyrightText: nlpsuge <https://github.com/nlpsuge>
// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-FileCopyrightText: Aurélien Hamy <aunetx@yandex.com>
// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const {Clutter, GObject, Gio, GLib, Shell}  = imports.gi;
const ByteArray    = imports.byteArray;
const Main         = imports.ui.main;
const LookingGlass = imports.ui.lookingGlass;
const Me           = imports.misc.extensionUtils.getCurrentExtension();

const GnomeVersion = Me.imports.utils.gnomeVersion;


// Based on the WindowPicker.js from Burn-My-Windows. 
// I modified and enhanced it, so it can be used in my case 
// properly for the Another Window Session Manager extension.


//////////////////////////////////////////////////////////////////////////////////////////
// This is based on the window-picking functionality of the Blur-My-Shell extension.    //
// The PickWindow() method is exposed via the D-Bus and can be called by the            //
// preferences dialog of the Burn-My-Windows extensions in order to initiate the window //
// picking.                                                                             //
//////////////////////////////////////////////////////////////////////////////////////////

var WindowPickerServiceProvider = class WindowPickerServiceProvider {
  // ------------------------------------------------------------------------- constructor

  constructor() {
    const iFace = ByteArray.toString(
      Me.dir.get_child('dbus-interfaces').get_child('org.gnome.Shell.Extensions.awsm.PickWindow.xml').load_contents(null)[1]);
    this._dbus = Gio.DBusExportedObject.wrapJSObject(iFace, this);
  }

  // --------------------------------------------------------------------- D-Bus interface

  // This method is exposed via the D-Bus. It is called by the preferences dialog of the
  // Burn-My-Windows extensions in order to initiate the window picking.
  PickWindow() {

    // We use the actor picking from LookingGlass. This seems a bit hacky and also allows
    // selecting things of the Shell which are not windows, but it does the trick :)
    const lookingGlass = Main.createLookingGlass();
    lookingGlass.open();
    lookingGlass.hide();

    const inspector = new MyInspector(Main.createLookingGlass());
    
    // Compatibility: gnome shell 41.x does not have the variable `_grab` in lookingGlass.LookingGlass
    // Release the global grab, so that we can move around freely (specially, free to use Ctrl+`
    // to switch windows) and pick a window that is on another workspace.
    if (GnomeVersion.isLessThan42()) {
      // Main.popModal(lookingGlass._entry);
    } else {
      Main.popModal(lookingGlass._grab);
    }

    inspector.connect('target', (me, target, x, y) => {
      // Remove border effect when window is picked.
      target.get_effects()
        .filter(e => e.toString().includes('lookingGlass_RedBorderEffect'))
        .forEach(e => target.remove_effect(e));

      // While we may switch windows to pick a window, the target actor also changes. 
      // Here we check the current actor again, make sure it's what we except.
      let currentActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
      if (currentActor != target) {
        log('Picked window changed to ' + currentActor);
        target = currentActor;
      }

      let actor = target;
      if (target.toString().includes('MetaSurfaceActor')) {
        actor = target.get_parent();
      }

      let variant;
      if (actor.toString().includes('WindowActor')) {
          const metaWindow = actor.meta_window;
          const app = Shell.WindowTracker.get_default().get_window_app(metaWindow);
          const appName = app ? app.get_name() : '';
          const wmClass = metaWindow.get_wm_class();
          const wmClassInstance = metaWindow.get_wm_class_instance();
          const title = metaWindow.get_title();
          const result = [
            appName, 
            wmClass ? wmClass : '', 
            wmClassInstance ? wmClassInstance : '', 
            title ? title : '',
          ];
          variant = new GLib.Variant('(ssss)', result)
      } else {
        variant = new GLib.Variant('()', []);
      }

      this._dbus.emit_signal('WindowPicked', variant);
    });

    // Close LookingGlass and release the grab when the picking is finished.
    inspector.connect('closed', () => {
      if (GnomeVersion.isLessThan42()) {
        // Main.pushModal(lookingGlass._entry, { actionMode: Shell.ActionMode.LOOKING_GLASS });
        lookingGlass.close();
      } else {
        // Restore the global grab to prevent the error 'incorrect pop' thrown by LookingGlass.close/Main.popModal(this._grab)
        lookingGlass._grab = Main.pushModal(lookingGlass, { actionMode: Shell.ActionMode.LOOKING_GLASS });
        lookingGlass.close();
      }
    });

    inspector.connect('WindowPickCancelled', () => {
      this._dbus.emit_signal('WindowPickCancelled', null);
    });
  }

  // -------------------------------------------------------------------- public interface

  // Call this to make the window-picking API available on the D-Bus.
  enable() {
    this._dbus.export(Gio.DBus.session, '/org/gnome/shell/extensions/awsm');
  }

  // Call this to stop this D-Bus again.
  destroy() {
    this._dbus.unexport();
  }
};

var MyInspector = GObject.registerClass({
  Signals: {
    'WindowPickCancelled': {}
  }
}, class MyInspector extends LookingGlass.Inspector {
  _init(lookingGlass) {
    super._init(lookingGlass);
  }

  _onKeyPressEvent(actor, event) {
    if (event.get_key_symbol() === Clutter.KEY_Escape) {
      this.emit('WindowPickCancelled');
      this._close();
    }
    return Clutter.EVENT_STOP;
  }
});
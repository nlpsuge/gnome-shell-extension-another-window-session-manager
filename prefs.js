'use strict';

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GdkWayland from 'gi://GdkWayland';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as FileUtils from './utils/fileUtils.js';
import * as Log from './utils/log.js';
import * as String from './utils/string.js';
import PrefsUtils from './utils/prefsUtils.js';

import * as PrefsCloseWindow from './prefsCloseWindow.js';


export default class AnotherWindowSessionManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(1000, 800);

        const settings = this.getSettings('org.gnome.shell.extensions.another-window-session-manager');
        
        this.initUtils(settings);

        this._log = new Log.Log();

        this.render_ui();
        new PrefsCloseWindow.UICloseWindows(this._builder).init();
        this._bindSettings();
        
        // Set sensitive AFTER this._bindSettings() to make it work
        this._setSensitive();

        this._addPages(window);
    }

    initUtils(settings) {
        String.initFill();
        PrefsUtils._init(this, settings);
        FileUtils.init(this);
    }

    _addPages(window) {
        const pages = [
            this._builder.get_object('close_windows_page'),
            this._builder.get_object('save_windows_page'),
            this._builder.get_object('restore_sessions_page'),
            this._builder.get_object('general_page'),
        ];
        pages.forEach(page => window.add(page));
    }

    _setSensitive() {
        const activeOfRestorePrevious = this.restore_previous_switch.get_active();
        this.restore_previous_delay_spinbutton.set_sensitive(activeOfRestorePrevious);

        const restore_at_startup_switch_state = this.restore_at_startup_switch.get_active();
        this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(restore_at_startup_switch_state);
        this.restore_at_startup_without_asking_switch.set_sensitive(restore_at_startup_switch_state);
        this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(
            restore_at_startup_switch_state && !this.restore_at_startup_without_asking_switch.get_active()
        );

        const display = Gdk.Display.get_default();
        if (display instanceof GdkWayland.WaylandDisplay) {
            this.stash_and_restore_states_switch.set_sensitive(false);
        }
    }

    _bindSettings() {
        PrefsUtils.getSettings().bind(
            'debugging-mode',
            this.debugging_mode_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'show-indicator',
            this.show_indicator_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'enable-save-session-notification',
            this.save_session_notification_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'enable-autorestore-sessions',
            this.restore_at_startup_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'enable-restore-previous-session',
            this.restore_previous_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'restore-at-startup-without-asking',
            this.restore_at_startup_without_asking_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'autorestore-sessions-timer',
            this.timer_on_the_autostart_dialog_spinbutton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'restore-previous-delay',
            this.restore_previous_delay_spinbutton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'restore-session-interval',
            this.restore_session_interval_spinbutton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'autostart-delay',
            this.autostart_delay_spinbutton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'restore-window-tiling',
            this.restore_window_tiling_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'raise-windows-together',
            this.raise_windows_together_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'stash-and-restore-states',
            this.stash_and_restore_states_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'enable-autoclose-session',
            this.auto_close_session_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().bind(
            'enable-close-by-rules',
            this.close_by_rules_switch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        PrefsUtils.getSettings().connect('changed::enable-autorestore-sessions', (settings) => {
            if (PrefsUtils.getSettings().get_boolean('enable-autorestore-sessions')) {
                this._installAutostartDesktopFile(FileUtils.desktop_template_path_restore_at_autostart,
                    FileUtils.autostart_restore_desktop_file_path);
            }
        });

        PrefsUtils.getSettings().connect('changed::enable-restore-previous-session', (settings) => {
            if (PrefsUtils.getSettings().get_boolean('enable-restore-previous-session')) {
                this._installAutostartDesktopFile(FileUtils.desktop_template_path_restore_previous_at_autostart,
                    FileUtils.autostart_restore_previous_desktop_file_path);
            }
        });

        PrefsUtils.getSettings().connect('changed::restore-at-startup-without-asking', (settings) => {
            this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(
                !PrefsUtils.getSettings().get_boolean('restore-at-startup-without-asking')
            );
        });

        PrefsUtils.getSettings().connect('changed::autostart-delay', (settings) => {
            this._installAutostartDesktopFile(FileUtils.desktop_template_path_restore_at_autostart,
                FileUtils.autostart_restore_desktop_file_path);
            this._installAutostartDesktopFile(FileUtils.desktop_template_path_restore_previous_at_autostart,
                FileUtils.autostart_restore_previous_desktop_file_path);
        });

    }

    render_ui() {
        this._builder = new Gtk.Builder();
        this._builder.set_scope(new BuilderScope(this));
        this._builder.add_from_file(this.path + '/ui/prefs-gtk4.ui');

        this.debugging_mode_switch = this._builder.get_object('debugging_mode_switch');
        this.show_indicator_switch = this._builder.get_object('show_indicator_switch');

        this.save_session_notification_switch = this._builder.get_object('save_session_notification_switch');

        this.restore_session_interval_spinbutton = this._builder.get_object('restore_session_interval_spinbutton');
        this.timer_on_the_autostart_dialog_spinbutton = this._builder.get_object('timer_on_the_autostart_dialog_spinbutton');
        this.autostart_delay_spinbutton = this._builder.get_object('autostart_delay_spinbutton');
        this.restore_window_tiling_switch = this._builder.get_object('restore_window_tiling_switch');
        this.restore_window_tiling_switch.connect('notify::active', (widget) => {
            const active = widget.active;
            this.raise_windows_together_switch.set_sensitive(active);
        });
        this.raise_windows_together_switch = this._builder.get_object('raise_windows_together_switch');
        this.stash_and_restore_states_switch = this._builder.get_object('stash_and_restore_states_switch');

        this.restore_previous_delay_spinbutton = this._builder.get_object('restore_previous_delay_spinbutton');
        this.restore_previous_switch = this._builder.get_object('restore_previous_switch');
        this.restore_previous_switch.connect('notify::active', (widget) => {
            const active = widget.active;
            const activeOfRestoreAtStartup = this.restore_at_startup_switch.get_active();
            if (activeOfRestoreAtStartup) {
                this.restore_at_startup_switch.set_active(!active);
            }
            this.restore_previous_delay_spinbutton.set_sensitive(active);
        });
        
        this.restore_at_startup_switch = this._builder.get_object('restore_at_startup_switch');
        this.restore_at_startup_switch.connect('notify::active', (widget) => {
            const active = widget.active;
            this.restore_at_startup_without_asking_switch.set_sensitive(active);
            const enableTimerSpinButton = active && !PrefsUtils.getSettings().get_boolean('restore-at-startup-without-asking');
            if (enableTimerSpinButton) {
                this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(true);
            } else {
                this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(false);
            }
            
            const activeOfRestorePrevious = this.restore_previous_switch.get_active();
            if (activeOfRestorePrevious) {
                this.restore_previous_switch.set_active(!active);
            }
        });

        this.restore_at_startup_without_asking_switch = this._builder.get_object('restore_at_startup_without_asking_switch');
        this.restore_at_startup_without_asking_switch.connect('notify::active', (widget) => {
            const active = widget.active;
            this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(!active);        
        });

        this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');
        this.auto_close_session_switch = this._builder.get_object('auto_close_session_switch');

    }

    _installAutostartDesktopFile(desktopFileTemplate, targetDesktopFilePath) {
        const argument = {
            autostartDelay: PrefsUtils.getSettings().get_int('autostart-delay'),
        };
        const desktopFileContent = FileUtils.loadTemplate(desktopFileTemplate).fill(argument);
        this._installDesktopFileToAutostartDir(targetDesktopFilePath, desktopFileContent);
    }

    _installDesktopFileToAutostartDir(desktopFilePath, desktopFileContents) {
        const autostart_restore_desktop_file = Gio.File.new_for_path(desktopFilePath);
        const autostart_restore_desktop_file_path_parent = autostart_restore_desktop_file.get_parent().get_path();
        if (GLib.mkdir_with_parents(autostart_restore_desktop_file_path_parent, 0o744) === 0) {
            let [success, tag] = autostart_restore_desktop_file.replace_contents(
                desktopFileContents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            if (success) {
                this._log.info(`Installed the autostart desktop file: ${desktopFilePath}!`);
            } else {
                this._log.error(new Error(`Failed to install the autostart desktop file: ${desktopFilePath}`))
            }
        } else {
            this._log.error(new Error(`Failed to create folder: ${autostart_restore_desktop_file_path_parent}`));
        }
    }
}


const BuilderScope = GObject.registerClass({
    // Should be a globally unique GType name
    GTypeName: "AnotherWindowSessionManagerBuilderScope",
    Implements: [Gtk.BuilderScope],
}, class BuilderScope extends GObject.Object {
    _init(preferences) {
        this._preferences = preferences;
        super._init();
    }

    // Fix: Gtk.BuilderError: Creating closures is not supported by Gjs_BuilderScope
    // https://docs.w3cub.com/gtk~4.0/gtkbuilder#gtk-builder-create-closure
    vfunc_create_closure(builder, handlerName, flags, connectObject) {
        if (flags & Gtk.BuilderClosureFlags.SWAPPED)
            throw new Error('Unsupported template signal flag "swapped"');
        
        if (typeof this[handlerName] === 'undefined')
            throw new Error(`${handlerName} is undefined`);
        
        return this[handlerName].bind(connectObject || this);
    }

});

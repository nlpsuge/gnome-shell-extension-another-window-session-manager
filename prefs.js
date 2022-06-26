'use strict';

const { Gtk, GObject, Gio, GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SubprocessUtils = Me.imports.utils.subprocessUtils;
const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;

Me.imports.utils.string;

const PrefsCloseWindow = Me.imports.prefsCloseWindow;

const Prefs = GObject.registerClass(
    {
        GTypeName: 'AnotherWindowSessionManagerPrefs',
    },
    class Prefs extends GObject.Object {
        _init() {
            Gtk.init()
            
            this._settings = ExtensionUtils.getSettings(
                'org.gnome.shell.extensions.another-window-session-manager');

            this._log = new Log.Log();

            this.render_ui();
            new PrefsCloseWindow.UICloseWindows(this._builder).init();
            this._bindSettings();
            
            // Set sensitive AFTER this._bindSettings() to make it work
            
            const restore_at_startup_switch_state = this._settings.get_boolean('enable-autorestore-sessions');
            this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(restore_at_startup_switch_state);
            this.autostart_delay_spinbutton.set_sensitive(restore_at_startup_switch_state);

            this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(
                !this._settings.get_boolean('restore-at-startup-without-asking')
            );
            
        }

        _bindSettings() {
            this._settings.bind(
                'debugging-mode',
                this.debugging_mode_switch,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.bind(
                'enable-autorestore-sessions',
                this.restore_at_startup_switch,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.bind(
                'restore-at-startup-without-asking',
                this.restore_at_startup_without_asking_switch,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.bind(
                'autorestore-sessions-timer',
                this.timer_on_the_autostart_dialog_spinbutton,
                'value',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.bind(
                'autostart-delay',
                this.autostart_delay_spinbutton,
                'value',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.bind(
                'enable-close-by-rules',
                this.close_by_rules_switch,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            this._settings.connect('changed::enable-autorestore-sessions', (settings) => {
                if (this._settings.get_boolean('enable-autorestore-sessions')) {
                    this._installAutostartDesktopFile();
                }
            });

            this._settings.connect('changed::restore-at-startup-without-asking', (settings) => {
                this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(
                    !this._settings.get_boolean('restore-at-startup-without-asking')
                );
            });

            this._settings.connect('changed::autostart-delay', (settings) => {
                this._installAutostartDesktopFile();
            });

            // this._settings.connect('changed::enable-close-by-rules', (settings) => {
            //     if (this._settings.get_boolean('enable-close-by-rules')) {
            //         this._install_udev_rules_for_ydotool();
            //     }
            // });

        }

        render_ui() {
            this._builder = new Gtk.Builder();
            this._builder.set_scope(new BuilderScope(this));
            this._builder.add_from_file(Me.path + '/ui/prefs-gtk4.ui');
            this.notebook = this._builder.get_object('prefs_notebook');

            this.debugging_mode_switch = this._builder.get_object('debugging_mode_switch');

            this.timer_on_the_autostart_dialog_spinbutton = this._builder.get_object('timer_on_the_autostart_dialog_spinbutton');
            this.autostart_delay_spinbutton = this._builder.get_object('autostart_delay_spinbutton');

            this.restore_at_startup_switch = this._builder.get_object('restore_at_startup_switch');
            this.restore_at_startup_switch.connect('notify::active', (widget) => {
                const active = widget.active;
                this.restore_at_startup_without_asking_switch.set_sensitive(active);
                const enableTimerSpinButton = active && !this._settings.get_boolean('restore-at-startup-without-asking');
                if (enableTimerSpinButton) {
                    this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(true);
                } else {
                    this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(false);
                }
                
                this.autostart_delay_spinbutton.set_sensitive(active);
                
            });

            this.restore_at_startup_without_asking_switch = this._builder.get_object('restore_at_startup_without_asking_switch');
            this.restore_at_startup_without_asking_switch.connect('notify::active', (widget) => {
                const active = widget.active;
                this.timer_on_the_autostart_dialog_spinbutton.set_sensitive(!active);           
            });

            this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');

        }

        _install_udev_rules_for_ydotool() {
            // Check the `/dev/uinput` permission of `read` and `write`
            const uinputFile = Gio.File.new_for_path('/dev/uinput');
            let info = uinputFile.query_info(
                    [Gio.FILE_ATTRIBUTE_ACCESS_CAN_READ, 
                        Gio.FILE_ATTRIBUTE_ACCESS_CAN_WRITE].join(','),
                    Gio.FileQueryInfoFlags.NONE,
                    null);

            const readable = info.get_attribute_boolean(Gio.FILE_ATTRIBUTE_ACCESS_CAN_READ);
            const writable = info.get_attribute_boolean(Gio.FILE_ATTRIBUTE_ACCESS_CAN_WRITE);
            if (readable && writable) {
                return;
            }

            // Copy `60-awsm-ydotool-input.rules` to `/etc/udev/rules.d/`
            const pkexecPath = GLib.find_program_in_path('pkexec');
            const cmd = [pkexecPath,
                         GLib.build_filenamev([Me.path, '/bin/install-udev-rules-for-ydotool.sh']),
                         FileUtils.desktop_template_path_ydotool_uinput_rules, 
                         FileUtils.system_udev_rules_path_ydotool_uinput_rules,
                        ];
            SubprocessUtils.trySpawnAsync(cmd, (output) => {
                this._log.info(`Installed the udev uinput rules ${FileUtils.desktop_template_path_ydotool_uinput_rules} to ${FileUtils.system_udev_rules_path_ydotool_uinput_rules}! This rule should take effect after relogin or reboot.`);    
                // TODO Send notification
            }, (output) => {
                this._settings.set_boolean('enable-close-by-rules', false);
                this._log.error(new Error(output), `Failed to install the udev uinput rules '${FileUtils.desktop_template_path_ydotool_uinput_rules}'`)
                // TODO Send notification
            });
        }

        _installAutostartDesktopFile() {
            const argument = {
                autostartDelay: this._settings.get_int('autostart-delay'),
            };
            const autostartDesktopContents = FileUtils.loadAutostartDesktopTemplate().fill(argument);
            const autostart_restore_desktop_file = Gio.File.new_for_path(FileUtils.autostart_restore_desktop_file_path);
            const autostart_restore_desktop_file_path_parent = autostart_restore_desktop_file.get_parent().get_path();
            if (GLib.mkdir_with_parents(autostart_restore_desktop_file_path_parent, 0o744) === 0) {
                let [success, tag] = autostart_restore_desktop_file.replace_contents(
                    autostartDesktopContents,
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null
                );
    
                if (success) {
                    this._log.info(`Installed the autostart desktop file: ${FileUtils.autostart_restore_desktop_file_path}!`);
                } else {
                    this._log.error(new Error(`Failed to install the autostart desktop file: ${FileUtils.autostart_restore_desktop_file_path}`))
                }
            } else {
                this._log.error(new Error(`Failed to create folder: ${autostart_restore_desktop_file_path_parent}`));
            }
        }
        
    }
);

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

function buildPrefsWidget() {
    const settings = new Prefs();
    return settings.notebook;
}

function init() {

}
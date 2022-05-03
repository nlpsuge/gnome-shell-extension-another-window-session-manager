'use strict';

const { Gtk, GObject, Gio, GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;
const Log = Me.imports.utils.log;

const CloseWindowsRules = Me.imports.model.closeWindowsRules;

Me.imports.utils.string;


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
                'close-by-rules',
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

            this._settings.connect('changed::close-by-rules', (settings) => {
                log('cccc');
            });
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
            

            this.close_rule_tree_view = this._builder.get_object('close_rule_tree_view');
            this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');
            this.close_by_rules_switch.connect('notify::active', (widget) => {
                const active = widget.active;
                log('xxxxx');
            });
            
            this.close_by_rules_add_rule_button = this._builder.get_object('close_by_rules_add_rule_button');
            this.close_by_rules_add_rule_button.connect('clicked', () => {
                const addRulesDialog = new AddRulesDialog(this._builder.get_object('close_rule_scrolled_window').get_root());
                addRulesDialog.connect('response', (dlg, id) => {
                    const appInfo = id === Gtk.ResponseType.OK
                        ? addRulesDialog.get_widget().get_app_info() : null;
                    if (appInfo) {
                        const closeWindowsRules = new CloseWindowsRules.CloseWindowsRules();
                        closeWindowsRules.type = 'shortcut';
                        closeWindowsRules.value = ''; 
                        closeWindowsRules.appId = appInfo.get_id(); 
                        closeWindowsRules.appName = appInfo.get_name();
                        closeWindowsRules.appDesktopFilePath = appInfo.get_filename();
                        closeWindowsRules.enabled = false;

                        const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
                        let oldCloseWindowsRulesObj =  JSON.parse(oldCloseWindowsRules);
                        oldCloseWindowsRulesObj[closeWindowsRules.appDesktopFilePath] = closeWindowsRules;
                        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
                        this._settings.set_string('close-windows-rules', newCloseWindowsRules);

                        const close_rule_tree_view_model = this.close_rule_tree_view.get_model();
                        log(close_rule_tree_view_model);
                        let iter = close_rule_tree_view_model.append();
                        log(iter);
                        close_rule_tree_view_model.set(
                            iter, 
                            [0, 1, 2, 3, 4, 5], 
                            [false, 
                            appInfo.get_name(), 
                            appInfo.get_id(), 
                            appInfo.get_filename(),
                            closeWindowsRules.type,
                            closeWindowsRules.value
                        ]);
                        log(close_rule_tree_view_model.get_value(iter, 0));
                        log(close_rule_tree_view_model.get_value(iter, 1));
                        log(close_rule_tree_view_model.get_value(iter, 2));
                        log(close_rule_tree_view_model.get_value(iter, 3));
                        log(close_rule_tree_view_model.get_value(iter, 4));
                        log(close_rule_tree_view_model.get_value(iter, 5));
                        // close_rule_tree_view_model.set_active_iter(iter);
                    }
                    addRulesDialog.destroy();
                });
                addRulesDialog.show();
                
            });

            const cellrenderertext_app_name = this._builder.get_object('cellrenderertext_app_name');
            cellrenderertext_app_name.connect('edited', () => {
                log('edited');
            })
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
                    this._log.error(`Failed to install the autostart desktop file: ${FileUtils.autostart_restore_desktop_file_path}`)
                }
            } else {
                this._log.error(`Failed to create folder: ${autostart_restore_desktop_file_path_parent}`);
            }
        }
        
    }
);

const AddRulesDialog = GObject.registerClass({
    
}, class AddRulesDialog extends Gtk.AppChooserDialog {
    _init(parent) {
        super._init({
            transient_for: parent,
            modal: true,
        });

        this.get_widget().set({
            show_recommended: true,
            show_all: true,
            show_other: true, // hide more button
        });

        this._settings = ExtensionUtils.getSettings(
            'org.gnome.shell.extensions.another-window-session-manager');

        this.get_widget().connect('application-selected',
            this._updateSensitivity.bind(this));
        this._updateSensitivity();

    }

    _updateSensitivity() {
        log(this._settings);
        const rules = this._settings.get_string('close-windows-rules');
        if (!rules) {
            return;    
        }
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !JSON.parse(rules)[appInfo.get_filename()]);
    }



});

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
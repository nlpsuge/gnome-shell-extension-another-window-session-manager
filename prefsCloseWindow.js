
const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// const _ = ExtensionUtils.gettext;

var UICloseWindows = GObject.registerClass(
class UICloseWindows extends GObject.Object {
    _init() {
        super._init({
        });

        this._builder = new Gtk.Builder();
        this._builder.add_from_file(Me.path + '/ui/prefs-gtk4.ui');
    }

    build() {
        this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');
        this.close_by_rules_switch.connect('notify::active', (widget) => {
            const active = widget.active;
    
        });
    
        this.close_by_rules_list_box = this._builder.get_object('close_by_rules_list_box');
        this.close_by_rules_list_box.append(new AwsmNewRuleRow());

        this._actionGroup = new Gio.SimpleActionGroup();
        this.close_by_rules_list_box.insert_action_group('rules', this._actionGroup);

        let action;
        action = new Gio.SimpleAction({ name: 'add' });
        action.connect('activate', this._onAddActivated.bind(this));
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({
            name: 'remove',
            parameter_type: new GLib.VariantType('s'),
        });
        action.connect('activate', this._onRemoveActivated.bind(this));
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({ name: 'update' });
        action.connect('activate', () => {
            this._settings.set_strv(SETTINGS_KEY,
                this._getRuleRows().map(row => `${row.id}:${row.value}`));
        });
        this._actionGroup.add_action(action);
        this._updateAction = action;


    }

    _onAddActivated() {
        const dialog = new AwsmNewRuleDialog(this.get_root());
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
            if (appInfo) {
                this._settings.set_strv(SETTINGS_KEY, [
                    ...this._settings.get_strv(SETTINGS_KEY),
                    `${appInfo.get_id()}:1`,
                ]);
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _onRemoveActivated(action, param) {
        const removed = param.deepUnpack();
        this._settings.set_strv(SETTINGS_KEY,
            this._settings.get_strv(SETTINGS_KEY).filter(entry => {
                const [id] = entry.split(':');
                return id !== removed;
            }));
    }

    _getRuleRows() {
        return [...this.close_by_rules_list_box].filter(row => !!row.id);
    }
});


const AwsmNewRuleRow = GObject.registerClass(
class AwsmNewRuleRow extends Gtk.ListBoxRow {
    _init() {
        super._init({
            action_name: 'rules.add',
            child: new Gtk.Image({
                icon_name: 'list-add-symbolic',
                pixel_size: 16,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            }),
        });
        this.update_property(
            [Gtk.AccessibleProperty.LABEL], ['Add Rule']);
    }
});

const AwsmNewRuleDialog = GObject.registerClass(
class AwsmNewRuleDialog extends Gtk.AppChooserDialog {
    _init(parent) {
        super._init({
            transient_for: parent,
            modal: true,
        });

        this._settings = ExtensionUtils.getSettings();

        this.get_widget().set({
            show_all: true,
            show_other: true, // hide more button
        });

        this.get_widget().connect('application-selected',
            this._updateSensitivity.bind(this));
        this._updateSensitivity();
    }

    _updateSensitivity() {
        const rules = this._settings.get_strv(SETTINGS_KEY);
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !rules.some(i => i.startsWith(appInfo.get_id())));
    }
});


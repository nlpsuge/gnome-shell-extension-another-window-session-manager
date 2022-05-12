
const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseWindowsRules = Me.imports.model.closeWindowsRules;

const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;

// const _ = ExtensionUtils.gettext;

/**
 * Based on https://gitlab.gnome.org/GNOME/gnome-shell-extensions/-/blob/main/extensions/auto-move-windows/prefs.js
 */
var UICloseWindows = GObject.registerClass(
class UICloseWindows extends GObject.Object {
    _init(builder) {
        super._init({
        });

        this._log = new Log.Log();

        this._builder = builder;
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();
    }

    init() {
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
            this._settings.set_string("close-windows-rules",
                this._getRuleRows().map(row => `${row.id}:${row.value}`));
        });
        this._actionGroup.add_action(action);
        this._updateAction = action;

        this._rulesChangedId = this._settings.connect(
            'changed::close-windows-rules',
            this._sync.bind(this));
        this._sync();

    }

    _onAddActivated() {
        const dialog = new AwsmNewRuleDialog(this._builder.get_object('close_rule_listbox_scrolledwindow').get_root());
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
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
                
            }
            dialog.destroy();
        });
        dialog.show();
    }

    _onRemoveActivated(action, param) {
        // Get the real value inside the GLib.Variant
        const removedAppDesktopFilePath = param.deepUnpack();
        const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
        let oldCloseWindowsRulesObj =  JSON.parse(oldCloseWindowsRules);
        delete oldCloseWindowsRulesObj[removedAppDesktopFilePath];
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string('close-windows-rules', newCloseWindowsRules);
    }

    _getRuleRows() {
        return [...this.close_by_rules_list_box].filter(row => !!row.appDesktopFilePath);
    }

    _sync() {
        const oldRules = this._getRuleRows();
        const newRules = JSON.parse(this._settings.get_string('close-windows-rules'));

        this._settings.block_signal_handler(this._rulesChangedId);
        this._updateAction.enabled = false;

        // Update old rules or insert new rules
        let index = -1
        for(const p in newRules) {
            index++;
            const ruleDetail = newRules[p];
            this._log.debug(`Checking rule changes for: ${JSON.stringify(ruleDetail)}`);
            const row = oldRules.find(r => r.appDesktopFilePath === ruleDetail.appDesktopFilePath);
            const appInfo = row
                ? null : Gio.DesktopAppInfo.new_from_filename(ruleDetail.appDesktopFilePath);

            if (row)
                row.set({ value : GLib.Variant.new_strv([ruleDetail.value]) });
            else if (appInfo)
                this.close_by_rules_list_box.insert(new RuleRow(appInfo, ruleDetail), index);
        }

        const removed = oldRules.filter((oldRuleDetail) => {
                let matched = false;
                for(const p in newRules) {
                    const newRuleDetail = newRules[p];
                    if (newRuleDetail.appDesktopFilePath === oldRuleDetail.appDesktopFilePath) {
                        matched = true;
                    }
                }
                return !matched;
            });

        removed.forEach(r => this.close_by_rules_list_box.remove(r));

        this._settings.unblock_signal_handler(this._rulesChangedId);
        this._updateAction.enabled = true;
    }

});

const RuleRow = GObject.registerClass({
    Properties: {
        'enabled': GObject.ParamSpec.boolean(
            'enabled', 'enabled', 'enabled',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'app-name': GObject.ParamSpec.string(
            'app-name', 'The application name', 'The application name',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'app-id': GObject.ParamSpec.string(
            'app-id', 
            'The application id', 
            'The .desktop file name of an app',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'app-desktop-file-path': GObject.ParamSpec.string(
            'app-desktop-file-path', 
            'The app desktop file path', 
            'The .desktop file name of an app',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'type': GObject.ParamSpec.string(
            'type', 'type', 'type',
            GObject.ParamFlags.READWRITE,
            'Shortcut'),
        'value': GObject.param_spec_variant(
            'value', 'value', 'The rules',
            // An array of strings
            new GLib.VariantType('as'),
            // Default value
            null,
            GObject.ParamFlags.READWRITE),
    },
}, class RuleRow extends Gtk.ListBoxRow {
    _init(appInfo, ruleDetail) {
        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        super._init({
            activatable: false,
            value: GLib.Variant.new_strv([ruleDetail.value]),
            child: box,
        });
        this._appInfo = appInfo;

        const icon = new Gtk.Image({
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        icon.get_style_context().add_class('icon-dropshadow');
        box.append(icon);

        const label = new Gtk.Label({
            label: appInfo.get_display_name(),
            halign: Gtk.Align.START,
            hexpand: true,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        box.append(label);

        const _model = new Gtk.ListStore();
        _model.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        let iter = _model.append();
        // https://docs.gtk.org/gtk4/method.ListStore.set.html
        _model.set(iter, [0], ['Shortcut', 'Shortcut']);
        const combo = new Gtk.ComboBox({
            model: _model,
            halign: Gtk.Align.START
        });
        combo.set_active_iter(iter);
        this.bind_property('value',
            combo, 'value',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
        box.append(combo);

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', this.appDesktopFilePath),
            icon_name: 'edit-delete-symbolic',
        });
        box.append(button);

        this.connect('notify::value',
            () => this.activate_action('rules.update', null));
    }

    get appName() {
        return this._appInfo.get_name();
    }

    get appId() {
        return this._appInfo.get_id();
    }

    get appDesktopFilePath() {
        return this._appInfo.get_filename();
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

        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        this.get_widget().set({
            show_recommended: true,
            show_all: true,
            show_other: true, // hide more button
        });

        this.get_widget().connect('application-selected',
            this._updateSensitivity.bind(this));
        this._updateSensitivity();
    }

    _updateSensitivity() {
        const rules = this._settings.get_string('close-windows-rules');
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !JSON.parse(rules)[appInfo.get_filename()]);
    }
});


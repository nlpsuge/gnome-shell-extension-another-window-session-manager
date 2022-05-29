
const { Gio, GLib, GObject, Gtk, Pango, Gdk } = imports.gi;

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

            action = new Gio.SimpleAction({
                name: 'update',
                parameter_type: new GLib.VariantType('a{sv}'),
            });
            action.connect('activate', (action, param) => {
                const newRuleRow = param.recursiveUnpack();
                const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
                let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
                oldCloseWindowsRulesObj[newRuleRow.appDesktopFilePath].enabled = newRuleRow.enabled;
                // oldCloseWindowsRulesObj[newRuleRow.appDesktopFilePath].value = newRuleRow.value;
                const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
                this._settings.set_string('close-windows-rules', newCloseWindowsRules);
            });
            this._actionGroup.add_action(action);
            this._updateAction = action;

            this._rulesChangedId = this._settings.connect(
                'changed::close-windows-rules',
                (settings) => {
                    // TODO Add new accelerator automatically after adding a new rule
                    // this._sync(true);
                    this._sync();
                });
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
                    closeWindowsRules.value = {};
                    closeWindowsRules.appId = appInfo.get_id();
                    closeWindowsRules.appName = appInfo.get_name();
                    closeWindowsRules.appDesktopFilePath = appInfo.get_filename();
                    closeWindowsRules.enabled = false;

                    const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
                    let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
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
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            delete oldCloseWindowsRulesObj[removedAppDesktopFilePath];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules', newCloseWindowsRules);
        }

        _getRuleRows() {
            return [...this.close_by_rules_list_box].filter(row => !!row.appDesktopFilePath);
        }

        _sync(autoNewAccelerator = false) {
            const oldRules = this._getRuleRows();
            const newRules = JSON.parse(this._settings.get_string('close-windows-rules'));

            this._settings.block_signal_handler(this._rulesChangedId);
            this._updateAction.enabled = false;

            // Update old rules or insert new rules
            let index = -1
            for (const p in newRules) {
                index++;
                const ruleDetail = newRules[p];
                this._log.debug(`Checking rule changes for: ${JSON.stringify(ruleDetail)}`);
                const row = oldRules.find(r => r.appDesktopFilePath === ruleDetail.appDesktopFilePath);
                const appInfo = row
                    ? null : Gio.DesktopAppInfo.new_from_filename(ruleDetail.appDesktopFilePath);

                if (row) {
                    // TODO
                    // row.set({ value: GLib.Variant.new_strv(ruleDetail.value) });
                } else if (appInfo) {
                    const newRuleRow = new RuleRow(appInfo, ruleDetail);
                    this.close_by_rules_list_box.insert(newRuleRow, index);
                    if (autoNewAccelerator) {
                        // TODO Fix the below error when autoNewAccelerator is true in the case of adding the new accelerator button after adding a new rule: 
                        // this._rendererAccelBox.get_root().get_surface() is null
                        newRuleRow._addNewAccel();
                    }
                }
            }

            const removed = oldRules.filter((oldRuleDetail) => {
                let matched = false;
                for (const p in newRules) {
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
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });
        this._box = box;

        super._init({
            activatable: false,
            // TODO
            // value: GLib.Variant.new_strv(ruleDetail.value),
            child: box,
        });
        this._appInfo = appInfo;
        this._ruleDetail = ruleDetail;

        this._rendererAccelBox = null;

        this._enabledCheckButton = new Gtk.CheckButton({
            active: ruleDetail.enabled,
        })
        // `flags` contains GObject.BindingFlags.BIDIRECTIONAL so we don't need to set `enable` manually
        this.bind_property('enabled',
            this._enabledCheckButton, 'active',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
        box.append(this._enabledCheckButton);

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
        const combo = new Gtk.ComboBox({
            model: _model,
            halign: Gtk.Align.START
        });
        // https://stackoverflow.com/questions/21568268/how-to-use-the-gtk-combobox-in-gjs
        // https://tecnocode.co.uk/misc/platform-demos/combobox.js.xhtml
        const renderer = new Gtk.CellRendererText();
        // Pack the renderers into the combobox in the order we want to see
        combo.pack_start(renderer, true);
        // Set the renderers to use the information from our liststore
        combo.add_attribute(renderer, 'text', 1);
        let iter = _model.append();
        // https://docs.gtk.org/gtk4/method.ListStore.set.html
        _model.set(iter, [0, 1], ['Shortcut', 'Shortcut']);
        // Set the first row in the combobox to be active on startup
        combo.set_active(0);
        box.append(combo);

        this._append_accel();

        const buttonRemove = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', this.appDesktopFilePath),
            icon_name: 'edit-delete-symbolic',
        });
        box.append(buttonRemove);
        
        // TODO Not used, can be deleted?
        this.connect('notify::value',
            () => this.activate_action('rules.update', new GLib.Variant('a{sv}', {
                appDesktopFilePath: GLib.Variant.new_string(this.appDesktopFilePath),
                enabled: GLib.Variant.new_boolean(this._enabledCheckButton.get_active()),
                // value: this.value,
            })));

        this.connect('notify::enabled',
            () => {
                this.activate_action('rules.update', new GLib.Variant('a{sv}', {
                    appDesktopFilePath: GLib.Variant.new_string(this.appDesktopFilePath),
                    enabled: GLib.Variant.new_boolean(this._enabledCheckButton.get_active()),
                    // value: this.value,
                }))
            });
    }

    _append_accel() {
        this._rendererAccelBox = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const rules = this._ruleDetail.value;
        const ruleOrders = Object.keys(rules);
        const maxRuleOrder = Math.max(...ruleOrders);
        for (const ruleOrder of ruleOrders) {
            const rule = rules[ruleOrder];
            const shortcut = rule.shortcut;
            const accelButton = new Gtk.Button({
                label: shortcut,
            });
            accelButton._rule = rule;
            const eventControllerKey = new Gtk.EventControllerKey();
            accelButton.add_controller(eventControllerKey);
            eventControllerKey.connect('key-pressed', this._onKeyPressed.bind(this));
            this._rendererAccelBox.append(accelButton);
            if (ruleOrder < maxRuleOrder) {
                let next = new Gtk.Label({
                    label: '→',
                    halign: Gtk.Align.CENTER
                });
                this._rendererAccelBox.append(next);
            }
        }

        const addAccelButton = new Gtk.Button({
            label: 'Add accelerator',
        });
        const deleteAccelButton = new Gtk.Button({
            label: 'Delete accelerator',
            icon_name: 'edit-clear-symbolic',
        });
        const rendererAccelOptBox = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });
        rendererAccelOptBox.append(addAccelButton);
        rendererAccelOptBox.append(deleteAccelButton);

        addAccelButton.connect('clicked', this._addNewAccel.bind(this));
        // Delete from the last accelerator button
        deleteAccelButton.connect('clicked', () => {
            this._removeAccelerator(this._rendererAccelBox.get_last_child());
        });

        const box = new Gtk.Box();
        box.append(this._rendererAccelBox);
        box.append(rendererAccelOptBox);

        const frame = new Gtk.Frame();
        frame.set_child(box);

        this._box.append(frame);
    }

    _addNewAccel() {
        if (this._get_n_accelerators(this._rendererAccelBox) > 0) {
            const lastNextArrow = new Gtk.Label({
                label: '→',
                halign: Gtk.Align.CENTER,
            });
            this._rendererAccelBox.append(lastNextArrow);
        }
        const newAccelButton = new Gtk.Button({
            label: 'New accelerator...',
        });
        
        let order;
        const previousAcceleratorButton = this._rendererAccelBox.get_last_child()?.get_prev_sibling();
        if (previousAcceleratorButton) {
            order = previousAcceleratorButton._rule.order + 1
        } else {
            // The vert first accelerator...
            order = 1;
        }

        newAccelButton._rule = {
            order: order,
        };
        
        const eventControllerKey = new Gtk.EventControllerKey();
        newAccelButton.add_controller(eventControllerKey);
        eventControllerKey.connect('key-pressed', this._onKeyPressed.bind(this));
        this._rendererAccelBox.append(newAccelButton);

        this._rendererAccelBox.get_root().get_surface().inhibit_system_shortcuts(null);
        const focused = newAccelButton.grab_focus();
        this._log.debug(`Grab the focus for setting the accelerator: ${focused}`);
    }

    _onKeyPressed(_eventControllerKey, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;

        // Backspace resets the new shortcut
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
            this._removeAccelerator(_eventControllerKey.get_widget());
            return Gdk.EVENT_STOP;
        }

        if (!Gtk.accelerator_valid(keyval, mask)) return Gdk.EVENT_STOP;
        const shortcut = Gtk.accelerator_get_label(keyval, mask);
        _eventControllerKey.get_widget().set_label(shortcut);

        const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
        let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
        const ruleValues = oldCloseWindowsRulesObj[this.appDesktopFilePath].value;
        const _currentAcceleratorRule = _eventControllerKey.get_widget()._rule;
        let order = _currentAcceleratorRule.order;
        ruleValues[order] = {
            shortcut: shortcut,
            keyval: keyval,
            keycode: keycode,
            state: state,
            order: order
        };
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string('close-windows-rules', newCloseWindowsRules);

        return Gdk.EVENT_STOP;
    }

    _removeAccelerator(currentWidgetRemoved) {
        if (!currentWidgetRemoved) {
            return;
        }
        this._removeAcceleratorSettings(currentWidgetRemoved);
        this._removeAcceleratorButtons(currentWidgetRemoved);
    }

    _removeAcceleratorSettings(currentWidgetRemoved) {
        const _rule = currentWidgetRemoved._rule;
        if (!_rule) {
            return;
        }

        const order =_rule.order;
        const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
        let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
        const ruleValues = oldCloseWindowsRulesObj[this.appDesktopFilePath].value;
        delete ruleValues[order];
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string('close-windows-rules', newCloseWindowsRules);
    }

    _removeAcceleratorButtons(currentWidgetRemoved) {
        const previousWidgetRemoved = currentWidgetRemoved.get_prev_sibling();
        const nextWidgetRemoved = currentWidgetRemoved.get_next_sibling();

        // The current widget is in the middle
        if (previousWidgetRemoved && nextWidgetRemoved) {
            previousWidgetRemoved.get_prev_sibling().grab_focus();
            this._rendererAccelBox.remove(previousWidgetRemoved);
            this._rendererAccelBox.remove(currentWidgetRemoved);
            return;
        }

        // Only one accelerator
        if (!previousWidgetRemoved && !nextWidgetRemoved) {
            this._rendererAccelBox.remove(currentWidgetRemoved);
            return;
        }

        // The current widget is in the beginning
        if (!previousWidgetRemoved) {
            this._rendererAccelBox.remove(nextWidgetRemoved);
        }
        // The current widget is in the last
        if (!nextWidgetRemoved) {
            previousWidgetRemoved.get_prev_sibling().grab_focus();
            this._rendererAccelBox.remove(previousWidgetRemoved);
        }
        this._rendererAccelBox.remove(currentWidgetRemoved);
    }

    /**
     * 
     * @param {Gtk.Widget} widget 
     * @returns The amount of the underlying children in a widget
     */
    _get_n_accelerators(widget) {
        if (!widget) {
            return 0;
        }
        
        const firstChild = widget.get_first_child();
        if (!firstChild) {
            return 0;
        }

        // 1 for the first child
        let count = 1;
        let next = firstChild.get_next_sibling();
        while (next != null) {
            if (next.label !== '→') {
                count++;
            }
            next = next.get_next_sibling();
        }

        return count;
    }


    get enabled() {
        return this._ruleDetail.enabled;
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


'use strict';

const { Gio, GLib, GObject, Gtk, Pango, Gdk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseWindowsRule = Me.imports.model.closeWindowsRule;

const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;
const GnomeVersion = Me.imports.utils.gnomeVersion;
const IconFinder = Me.imports.utils.iconFinder;

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

            // TODO
            this._scrollToWidget = null;
        }

        init() {
            this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');

            const close_by_rules_multi_grid2 = this._builder.get_object('close_by_rules_multi_grid2');
            const close_by_rules_list_box = this._builder.get_object('close_by_rules_list_box');
            // Remove GtkScrolledWindow on Gnome 42
            // See: https://gjs.guide/extensions/upgrading/gnome-shell-42.html#gtk-scrolledwindow
            if (!GnomeVersion.isLessThan42()) {
                close_by_rules_list_box.unparent();
                close_by_rules_multi_grid2.attach(close_by_rules_list_box, 0, 0, 1, 1);
            }
            
            close_by_rules_list_box.set_header_func((currentRow, beforeRow, data) => {
                this._setHeader(currentRow, beforeRow, data, 'Applications')
            });
            const addApp = new AwsmNewRuleRow();
            close_by_rules_list_box.append(addApp);
            addApp.connect('clicked', this._onAddAppActivated.bind(this));

            this._actionGroup = new Gio.SimpleActionGroup();
            close_by_rules_list_box.insert_action_group('rules', this._actionGroup);

            let action = new Gio.SimpleAction({ name: 'add' });
            action.connect('activate', this._onAddAppActivated.bind(this));
            this._actionGroup.add_action(action);

            this._updateAction = action;

            this._rulesChangedId = this._settings.connect(
                'changed::close-windows-rules',
                (settings) => {
                    try {
                        this._settings.block_signal_handler(this._rulesChangedId);
                        this._updateAction.enabled = false;
                        this._sync(close_by_rules_list_box, RuleRowByApp, 'close-windows-rules', 'appDesktopFilePath');
                        this._updateAction.enabled = true;
                    } finally {
                        this._settings.unblock_signal_handler(this._rulesChangedId);
                    }
                });
            this._sync(close_by_rules_list_box, RuleRowByApp, 'close-windows-rules', 'appDesktopFilePath');

            const close_by_rules_by_keyword_list_box = new Gtk.ListBox({
                hexpand: true,
                vexpand: true,
                show_separators: true,
            });
            close_by_rules_multi_grid2.attach(close_by_rules_by_keyword_list_box, 0, 1, 1, 1);
            close_by_rules_by_keyword_list_box.set_header_func((currentRow, beforeRow, data) => {
                this._setHeader(currentRow, beforeRow, data, 'Keywords')
            });
            const addKeyword = new AwsmNewRuleRow();
            close_by_rules_by_keyword_list_box.append(addKeyword);
            addKeyword.connect('clicked', (source) => {
                const oldCloseWindowsRules = this._settings.get_string('close-windows-rules-by-keyword');
                const newId = Math.max(...Object.keys(oldCloseWindowsRules)) + 1;

                const closeWindowsRule = CloseWindowsRule.CloseWindowsRuleByKeyword.new({
                    id: newId,
                    category: 'Keywords',
                    type: 'shortcut',
                    value: {},
                    enabled: false,
                    keyDelay: 0,
                    compareWith: 'title',
                    method: 'includes'
                });

                let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
                oldCloseWindowsRulesObj[newId] = closeWindowsRule;
                const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
                this._settings.set_string('close-windows-rules-by-keyword', newCloseWindowsRules);
            });

            this._keywordRulesChangedId = this._settings.connect(
                'changed::close-windows-rules-by-keyword',
                (settings) => {
                    try {
                        this._settings.block_signal_handler(this._keywordRulesChangedId);
                        this._sync(close_by_rules_by_keyword_list_box, RuleRowByKeyword, 'close-windows-rules-by-keyword', 'id');
                    } finally {
                        this._settings.unblock_signal_handler(this._keywordRulesChangedId);
                    }
                });
            this._sync(close_by_rules_by_keyword_list_box, RuleRowByKeyword, 'close-windows-rules-by-keyword', 'id');
        }

        _setHeader(currentRow, beforeRow, data, category) {
            const header = currentRow.get_header();
            if (header === null && beforeRow === null) {
                const boxVertical = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
                // box.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));
                boxVertical.append(new Gtk.Label({
                    xalign: 0, // align left
                    margin_top: 12,
                    margin_bottom: 6,
                    margin_start: 12,
                    use_markup: true,
                    label: `<b>${category}</b>`
                }));
                boxVertical.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));
                boxVertical._isHeaderAWSM = true;
                currentRow.set_header(boxVertical);
            }

            if ((currentRow instanceof AwsmNewRuleRow) && beforeRow && header) {
                currentRow.set_header(null);
            }
        }

        _onAddAppActivated() {
            const dialog = new AwsmNewRuleByAppDialog(this._builder.get_object('prefs_notebook').get_root());
            dialog.connect('response', (dlg, id) => {
                const appInfo = id === Gtk.ResponseType.OK
                    ? dialog.get_widget().get_app_info() : null;
                if (appInfo) {
                    const closeWindowsRule = CloseWindowsRule.CloseWindowsRuleByApp.new({
                        type: 'shortcut',
                        value: {},
                        appId: appInfo.get_id(),
                        appName: appInfo.get_name(),
                        appDesktopFilePath: appInfo.get_filename(),
                        enabled: false,
                    });

                    const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
                    let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
                    oldCloseWindowsRulesObj[closeWindowsRule.appDesktopFilePath] = closeWindowsRule;
                    const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
                    this._settings.set_string('close-windows-rules', newCloseWindowsRules);
                }
                dialog.destroy();
            });
            dialog.show();
        }

        _onRemoveActivated(action, source) {
            const removedAppDesktopFilePath = source.appDesktopFilePath;
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            delete oldCloseWindowsRulesObj[removedAppDesktopFilePath];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules', newCloseWindowsRules);
        }

        _getRuleRows(listBox, id) {
            return [...listBox].filter(row => 
                !(row instanceof AwsmNewRuleRow) 
                // Skip header (The header is a child of listBox actually)
                && !row._isHeaderAWSM);
        }

        _sync(listBox, obj, settingName, keyName) {
            const oldRules = this._getRuleRows(listBox, keyName);
            const newRules = JSON.parse(this._settings.get_string(settingName));

            let index = -1
            for (const key in newRules) {
                index++;
                const ruleDetail = newRules[key];
                const row = oldRules.find(r => r[keyName] === ruleDetail[keyName]);

                if (row) {
                    // Update existing rules (no use currently)
                } else {
                    // Insert new rules
                    const newRuleRow = new obj(ruleDetail);
                    listBox.insert(newRuleRow, index);
                }
            }

            const removed = oldRules.filter((oldRuleDetail) => {
                let matched = false;
                for (const p in newRules) {
                    const newRuleDetail = newRules[p];
                    if (newRuleDetail[keyName] === oldRuleDetail[keyName]) {
                        matched = true;
                    }
                }
                return !matched;
            });

            removed.forEach(r => {
                listBox.remove(r);
            });
        }

    });

const RuleRow = GObject.registerClass({
    Signals: {
        'accelerator-updated': {
            param_types: [GObject.TYPE_INT, CloseWindowsRule.GdkShortcuts]
        },
        'accelerator-deleted': {
            param_types: [GObject.TYPE_INT]
        },
        'row-deleted': {
            param_types: []
        },
        'key-delay-changed': {
            param_types: [GObject.TYPE_INT]
        }
    },
    Properties: {
        'enabled': GObject.ParamSpec.boolean(
            'enabled', 'enabled', 'enabled',
            GObject.ParamFlags.READWRITE,
            false
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
    _init(ruleDetail) {
        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        const ruleRowBox = this._newBox({
            hexpand: true,
            halign: Gtk.Align.FILL
        });
    
        const boxLeft = this._newBox({
            hexpand: true,
            halign: Gtk.Align.START
        });

        const boxRight = this._newBox({
            halign: Gtk.Align.END
        });

        super._init({
            activatable: false,
            // TODO
            // value: GLib.Variant.new_strv(ruleDetail.value),
            child: ruleRowBox,
        });
        this._ruleDetail = ruleDetail;

        this._rendererAccelBox = null;

        this._enabledCheckButton = new Gtk.CheckButton({
            active: ruleDetail.enabled,
        })
        // `flags` contains GObject.BindingFlags.BIDIRECTIONAL so we don't need to set `enable` manually
        this.bind_property('enabled',
            this._enabledCheckButton, 'active',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
        boxLeft.append(this._enabledCheckButton);

        boxLeft.append(this._newShortcutDropDown());

        boxLeft.append(this._newDelaySpinButton());

        this._append_accel(boxRight);

        const buttonRemove = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
        });
        buttonRemove.connect('clicked', () => {
            this.emit('row-deleted');
        });
        const boxRemoveButton = this._newBox({
            hexpand: true,
            halign: Gtk.Align.START
        });
        boxRemoveButton.append(buttonRemove);
        boxRight.append(boxRemoveButton);

        ruleRowBox.append(boxLeft);
        ruleRowBox.append(boxRight);

        this.boxLeft = boxLeft;
        this.boxRight = boxRight;
        
    }

    _newDelaySpinButton() {
        const savedKeyDelay = this._ruleDetail.keyDelay;
        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                // Up to 5 minutes
                upper: 300000,
                step_increment: 1,
                value: savedKeyDelay ? savedKeyDelay : 0
            }),
            snap_to_ticks: true,
            margin_end: 6,
        });
        spinButton.connect('value-changed', (source) => {
            const keyDelayValue = source.get_value();
            this.emit('key-delay-changed', keyDelayValue);
        });
        const listModel = spinButton.observe_controllers();
        for (let i = 0; i < listModel.get_n_items(); i++) {
            const controller = listModel.get_item(i);
            if (controller instanceof Gtk.EventControllerScroll) {
                spinButton.remove_controller(controller);
            }
        }
        return spinButton;
    }

    _newShortcutDropDown() {
        let comboBoxValues = [
            ['Shortcut', 'Shortcut']
        ];
        return this._newDropDown(comboBoxValues, null);
    }

    _newDropDown(values, activeValue) {
        const dropDownValues = values.map(cv => cv[1]);
        const dropDown = Gtk.DropDown.new_from_strings(dropDownValues);
        dropDown.set_valign(Gtk.Align.BASELINE);
        for (let i = 0; i < dropDownValues.length; i++) {
            if (dropDownValues[i] === activeValue)
                dropDown.set_selected(i);
        }
        const factory = dropDown.get_factory();
        factory.connect('bind', (factory, listItem) => {
            const box = listItem.get_child();
            const label = box.get_first_child();
            const widthChars = Math.max(...dropDownValues.map(
                // GLib.utf8_strlen(v, -1) causes right margin between the label and box is too large, so -2 to reduce this margin
                v => GLib.utf8_strlen(v, -1) - 2));
            label.set_width_chars(widthChars);
        });
        return dropDown;
    }

    _newComboBox(comboBoxValues, activeValue) {
        const _model = new Gtk.ListStore();
        _model.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        const combo = new Gtk.ComboBox({
            model: _model,
            halign: Gtk.Align.START,
            hexpand: true,
        });
        // https://stackoverflow.com/questions/21568268/how-to-use-the-gtk-combobox-in-gjs
        // https://tecnocode.co.uk/misc/platform-demos/combobox.js.xhtml
        const renderer = new Gtk.CellRendererText();
        // Pack the renderers into the combobox in the order we want to see
        combo.pack_start(renderer, true);
        // Set the renderers to use the information from our liststore
        combo.add_attribute(renderer, 'text', 0);
        let activeIter = null;
        for (let i = 0; i < comboBoxValues.length; i++) {
            let iter = _model.append();
            _model.set(iter, [0, 1], comboBoxValues[i]);
            if (comboBoxValues[i][1] === activeValue) {
                activeIter = iter;
            }
        }
        combo.set_active_iter(activeIter);
        return combo;
    }

    _newBox(properties) {
        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        })
        Object.assign(box, properties);
        return box;
    }

    _append_accel(parentWidget) {
        this._rendererAccelBox = this._newBox();

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
            eventControllerKey.connect('key-released', this._onKeyReleased.bind(this));
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
        const rendererAccelOptBox = this._newBox();
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
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(
            "frame { border-style: dashed; }");
        frame.get_style_context().add_provider(cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        parentWidget.append(frame);
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
            // The very first accelerator...
            order = 1;
        }

        newAccelButton._rule = {
            order: order,
        };
        
        const eventControllerKey = new Gtk.EventControllerKey();
        newAccelButton.add_controller(eventControllerKey);
        eventControllerKey.connect('key-pressed', this._onKeyPressed.bind(this));
        eventControllerKey.connect('key-released', this._onKeyReleased.bind(this));
        this._rendererAccelBox.append(newAccelButton);

        // TODO Calling this._rendererAccelBox.get_root().get_surface().restore_system_shortcuts(null); after this?
        this._rendererAccelBox.get_root().get_surface().inhibit_system_shortcuts(null);
        const focused = newAccelButton.grab_focus();
        this._log.debug(`Grab the focus for setting the accelerator: ${focused}`);
    }

    _onKeyReleased(_eventControllerKey, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;

        // Backspace remove the new shortcut
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
            this._removeAccelerator(_eventControllerKey.get_widget());
            this._rendererAccelBox.get_root().get_surface().restore_system_shortcuts();
            return Gdk.EVENT_STOP;
        }

        // Remove customized properties
        delete _eventControllerKey._controlRightPressed
        delete _eventControllerKey._shiftRightPressed;

        this._rendererAccelBox.get_root().get_surface().restore_system_shortcuts();
        this.grab_focus();
    }

    _onKeyPressed(_eventControllerKey, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;

        // Backspace remove the new shortcut
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
            this._removeAccelerator(_eventControllerKey.get_widget());
            return Gdk.EVENT_STOP;
        }
        // if (!Gtk.accelerator_valid(keyval, mask)) return Gdk.EVENT_STOP;
        let shortcut = Gtk.accelerator_get_label(keyval, mask);

        // Control Right
        if (keycode === 105) {
            _eventControllerKey._controlRightPressed = true;
        }
        // Override Ctrl to Ctrl_R
        if (_eventControllerKey._controlRightPressed) {
            shortcut = shortcut.replace('Ctrl', 'Ctrl_R');
        }
        // Shift Right
        if (keycode === 62) {
            _eventControllerKey._shiftRightPressed = true;
        }
        // Override Shift to Shift_R
        if (_eventControllerKey._shiftRightPressed && keycode !== 62) {
            shortcut = shortcut.replace('Shift', 'Shift_R');
        }

        _eventControllerKey.get_widget().set_label(shortcut);
        const _currentAcceleratorRule = _eventControllerKey.get_widget()._rule;
        let order = _currentAcceleratorRule.order;
        this.emit('accelerator-updated', order, CloseWindowsRule.GdkShortcuts.new({
            shortcut,
            keyval,
            keycode,
            state,
            controlRightPressed: _eventControllerKey._controlRightPressed,
            shiftRightPressed: _eventControllerKey._shiftRightPressed,
            order
        }));

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
        this.emit('accelerator-deleted', order);
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
            this.grab_focus();
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

    updateRule(settingName, keyName, propertyName, value) {
        const oldCloseWindowsRules = this._settings.get_string(settingName);
        let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
        const key = this[keyName];
        const rule = oldCloseWindowsRulesObj[key];
        rule[propertyName] = value;
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string(settingName, newCloseWindowsRules);
    }

    get enabled() {
        return this._ruleDetail.enabled;
    }

});

const RuleRowByApp = GObject.registerClass({
    Properties: {
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
        
    },
}, class RuleRowByApp extends RuleRow {
    _init(ruleDetail) {
        super._init(ruleDetail);

        const appInfo = Gio.DesktopAppInfo.new_from_filename(ruleDetail.appDesktopFilePath)
        this._appInfo = appInfo;

        const icon = new Gtk.Image({
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        icon.get_style_context().add_class('icon-dropshadow');
        icon.set_tooltip_text(appInfo.get_display_name());
        this.boxLeft.insert_child_after(icon, this._enabledCheckButton);

        const label = new Gtk.Label({
            label: appInfo.get_display_name(),
            halign: Gtk.Align.START,
            hexpand: true,
            // Make sure that text align left
            xalign: 0,
            width_chars: 20,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        label.set_tooltip_text(appInfo.get_display_name());
        this.boxLeft.insert_child_after(label, icon);

        this.connect('notify::enabled', (source) => {
            const enabled = source._enabledCheckButton.get_active();
            this.updateRule('close-windows-rules', 'appDesktopFilePath', 'enabled', enabled);
        });
        this.connect('key-delay-changed', (source, keyDelayValue) => {
            this.updateRule('close-windows-rules', 'appDesktopFilePath', 'keyDelay', keyDelayValue);
        });
        this.connect('accelerator-updated', (source, order, newRule) => {
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            const ruleValues = oldCloseWindowsRulesObj[source.appDesktopFilePath].value;
            ruleValues[order] = newRule;
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules', newCloseWindowsRules);
        });
        this.connect('accelerator-deleted', (source, order) => {
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            const ruleValues = oldCloseWindowsRulesObj[source.appDesktopFilePath].value;
            delete ruleValues[order];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules', newCloseWindowsRules);
        });
        this.connect('row-deleted', source => {
            const removedAppDesktopFilePath = source.appDesktopFilePath;
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            delete oldCloseWindowsRulesObj[removedAppDesktopFilePath];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules', newCloseWindowsRules);
        });
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

const RuleRowByKeyword = GObject.registerClass({
    Signals: {
        'keyword-changed': {
            param_types: [Gtk.Entry]
        },
        'keyword-edit-complete': {
            param_types: [Gtk.Entry]
        },
    }, 
    Properties: {
        'id': GObject.ParamSpec.int(
            'id', 'id', 'just like the id in MySQL. Used to update or delete rows.',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'keyword': GObject.ParamSpec.string(
            'keyword', 'keyword', 'keyword',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'compare-with': GObject.ParamSpec.string(
            'compare-with',
            'compare with',
            'Use keyword to compared with title, wm_class, wm_class_instance, app name etc',
            GObject.ParamFlags.READABLE,
            ''
        ),
        'method': GObject.ParamSpec.string(
            'method',
            'method',
            'The way to compare the keyword with title etc',
            GObject.ParamFlags.READABLE,
            ''
        ),
        
    },
}, class RuleRowByKeyword extends RuleRow {
    _init(ruleDetail) {
        super._init(ruleDetail);

        const icon = new Gtk.Image({
            gicon: IconFinder.find('empty-symbolic.svg'),
            pixel_size: 32,
        });
        const compareWithDropDown = this._newCompareWithDropDown();
        const methodDropDown = this._newMethodDropDown();
        const keywordEntry = this._newKeywordEntry();
        
        this._keywordEntry = keywordEntry;
        this._compareWithDropDown = compareWithDropDown;
        this._methodDropDown = methodDropDown;

        this.boxLeft.insert_child_after(icon, this._enabledCheckButton);
        this.boxLeft.insert_child_after(compareWithDropDown, icon);
        this.boxLeft.insert_child_after(methodDropDown, compareWithDropDown);
        this.boxLeft.insert_child_after(keywordEntry, methodDropDown);

        this.connect('keyword-edit-complete', (source, keywordEntry) => {
            this.updateRule('close-windows-rules-by-keyword', 'id', 'keyword', keywordEntry.get_text());
        });
        compareWithDropDown.connect('notify::selected-item', (source) => {
            const selectedItem = source.get_selected_item().get_string();
            this.updateRule('close-windows-rules-by-keyword', 'id', 'compareWith', selectedItem);
        });

        methodDropDown.connect('notify::selected-item', (source) => {
            const selectedItem = source.get_selected_item().get_string();
            this.updateRule('close-windows-rules-by-keyword', 'id', 'method', selectedItem);
        });

        this.connect('notify::enabled', (source, enabled) => {
            enabled = source._enabledCheckButton.get_active();
            this.updateRule('close-windows-rules-by-keyword', 'id', 'enabled', enabled);
        });
        this.connect('key-delay-changed', (source, keyDelayValue) => {
            this.updateRule('close-windows-rules-by-keyword', 'id', 'keyDelay', keyDelayValue);
        });
        this.connect('accelerator-updated', (source, order, newShort) => {
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules-by-keyword');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            const ruleValues = oldCloseWindowsRulesObj[source.id].value;
            ruleValues[order] = newShort;
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules-by-keyword', newCloseWindowsRules);
        });
        this.connect('accelerator-deleted', (source, order) => {
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules-by-keyword');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            const ruleValues = oldCloseWindowsRulesObj[source.id].value;
            delete ruleValues[order];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules-by-keyword', newCloseWindowsRules);
        });
        this.connect('row-deleted', source => {
            const oldCloseWindowsRules = this._settings.get_string('close-windows-rules-by-keyword');
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            delete oldCloseWindowsRulesObj[source.id];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string('close-windows-rules-by-keyword', newCloseWindowsRules);
        });
    }

    _newKeywordEntry() {
        const keyword = this._ruleDetail.keyword ? this._ruleDetail.keyword : '';
        const keywordEntry = new Gtk.Entry({
            text: keyword,
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
        keywordEntry.set_tooltip_text(keyword ? keyword : 'A string that is used to match windows');
        // keywordEntry.set_placeholder_text('A string that is used to match windows');
        keywordEntry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'document-edit-symbolic');
        keywordEntry.set_icon_tooltip_text(Gtk.EntryIconPosition.SECONDARY, 'Edit the entry');
        keywordEntry.set_icon_activatable(Gtk.EntryIconPosition.SECONDARY, true);
        const iconPressId = keywordEntry.connect('icon-press', (source, icon_pos) => {
            if (icon_pos !== Gtk.EntryIconPosition.SECONDARY)
                return;

            if (source._showSaveIconAWSM) {
                delete source._showSaveIconAWSM;
                this._completeEditKeyword();
                if (this._prefsDialogCloseRequestId) {
                    const prefsDialogWindow = this._keywordEntry.get_root();
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
                const prefsDialogWindow = this._keywordEntry.get_root();
                if (prefsDialogWindow) {
                    this._prefsDialogCloseRequestId = prefsDialogWindow.connect('close-request', () => {
                        this.updateRule('close-windows-rules-by-keyword', 'id', 'keyword', this._keywordEntry.get_text());
                        prefsDialogWindow.disconnect(this._prefsDialogCloseRequestId);
                    });
                }
                source.unblock_signal_handler(iconPressId);
            }
        });
        // Accept Enter key to complete the editing
        keywordEntry.connect('activate', () => {
            this._completeEditKeyword();
        });
        let keywordEntryController = Gtk.EventControllerFocus.new();
        keywordEntry.add_controller(keywordEntryController);
        keywordEntryController.connect('leave', (source) => {
            this._completeEditKeyword();
        });
        keywordEntry.connect('changed', (source) => {
            this.emit('keyword-changed', source);
        });
        return keywordEntry;
    }

    _completeEditKeyword() {
        this._keywordEntry.set_can_focus(false);
        this._keywordEntry.set_editable(false);
        // Pass `null` to unfocus the entry
        const prefsDialogWindow = this._keywordEntry.get_root();
        if (prefsDialogWindow) prefsDialogWindow.set_focus(null);
        this._keywordEntry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'document-edit-symbolic');
        this._keywordEntry.set_icon_tooltip_text(Gtk.EntryIconPosition.SECONDARY, 'Edit the entry');
        this.emit('keyword-edit-complete', this._keywordEntry);
    }

    _newMethodDropDown() {
        let comboBoxValues = [
            ['Includes', 'includes'],
            ['Ends with', 'endsWith'],
            ['Starts with', 'startsWith'],
            ['Equals', 'equals'],
            ['RegExp', 'regex']
        ];
        return this._newDropDown(comboBoxValues, this._ruleDetail.method);
    }

    _newCompareWithDropDown() {
        let comboBoxValues = [
            ['Window title', 'title'],
            ['wm class', 'wm_class'],
            ['wm class instance', 'wm_class_instance'],
            ['Application name', 'app_name'],
        ];
        return this._newDropDown(comboBoxValues, this._ruleDetail.compareWith);
    }

    get id() {
        return this._ruleDetail.id;
    }
    
    get keyword() {
        return this._keywordEntry.get_text();
    }

    get compareWith() {
        return this._compareWithDropDown.get_selected_item().get_string();
    }

    get method() {
        return this._methodDropDown.get_selected_item().get_string();
    }

});

const AwsmNewRuleRow = GObject.registerClass({
    Signals: {
        'clicked': { param_types: [] }
    }
},
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
            sensitive: true
        });
        this.update_property([Gtk.AccessibleProperty.LABEL], ['Add Rule']);
        
        const gesture = Gtk.GestureClick.new();
        gesture.set_button(Gdk.BUTTON_PRIMARY);
        gesture.connect('released', (controller) => {
            this.emit('clicked');
            controller.set_state(Gtk.EventSequenceState.CLAIMED);
        });
        this.add_controller(gesture);
    }
});

const AwsmNewRuleByAppDialog = GObject.registerClass(
    class AwsmNewRuleByAppDialog extends Gtk.AppChooserDialog {
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
            const sensitive = appInfo && !JSON.parse(rules)[appInfo.get_filename()];
            this.set_response_sensitive(Gtk.ResponseType.OK, sensitive);
        }
    });


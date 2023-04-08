'use strict';

const { Gio, GLib, GObject, Gtk, Pango, Gdk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseWindowsRule = Me.imports.model.closeWindowsRule;

const PrefsUtils = Me.imports.utils.prefsUtils;
const Log = Me.imports.utils.log;
const GnomeVersion = Me.imports.utils.gnomeVersion;
const IconFinder = Me.imports.utils.iconFinder;

const PrefsWindowPickableEntry = Me.imports.prefsWindowPickableEntry;
const PrefsWidgets = Me.imports.prefsWidgets;
const PrefsColumnView = Me.imports.prefsColumnView;


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
            this.close_by_rules_switch = this._builder.get_object('close_by_rules_switch');

            this._prefsUtils = new PrefsUtils.PrefsUtils();
            this._settings = this._prefsUtils.getSettings();

            // TODO
            this._scrollToWidget = null;
        }

        init() {
            const close_by_rules_multi_grid2 = this._builder.get_object('close_by_rules_multi_grid2');
            const close_by_rules_list_box = this._builder.get_object('close_by_rules_list_box');
            // Remove GtkScrolledWindow on Gnome 42
            // See: https://gjs.guide/extensions/upgrading/gnome-shell-42.html#gtk-scrolledwindow
            if (!GnomeVersion.isLessThan42()) {
                close_by_rules_list_box.unparent();
                close_by_rules_multi_grid2.attach(close_by_rules_list_box, 0, 0, 1, 1);
            }
            
            this._initAppRules();
            this._initKeywordRules();
            this._initWhitelist();

        }

        _initWhitelist() {
            const settingKey = 'close-windows-whitelist';
            const close_windows_whitelist_listbox = this._builder.get_object('close_windows_whitelist_listbox');
            close_windows_whitelist_listbox.set_header_func((currentRow, beforeRow, data) => {
                this._setHeader(currentRow, beforeRow, data, 'Whitelist', {margin_start: 0});
            });

            const whitelistColumnView = new PrefsColumnView.WhitelistColumnView();
            const addWhitelist = new AwsmNewRuleRow();
            close_windows_whitelist_listbox.append(whitelistColumnView);
            close_windows_whitelist_listbox.append(addWhitelist);

            addWhitelist.connect('clicked', (source) => {
                const oldCloseWindowsWhitelist = this._settings.get_string(settingKey);
                const newId = Math.max(...Object.keys(oldCloseWindowsWhitelist)) + 1;

                const closeWindowsWhitelist = CloseWindowsRule.CloseWindowsWhitelist.new({
                    id: newId,
                    enabled: false,
                    method: 'equals',
                    compareWith: 'wm_class',
                    enableWhenCloseWindows: true,
                    enableWhenLogout: true,
                });

                let oldWhitelist = JSON.parse(oldCloseWindowsWhitelist);
                oldWhitelist[newId] = closeWindowsWhitelist;
                const newWhitelist = JSON.stringify(oldWhitelist);
                this._settings.set_string(settingKey, newWhitelist);
            });

            this._changedId = this._settings.connect(
                `changed::${settingKey}`,
                (settings) => {
                    try {
                        this._settings.block_signal_handler(this._changedId);
                        this._syncColumnView(whitelistColumnView, CloseWindowsRule.CloseWindowsWhitelist, settingKey);
                    } finally {
                        this._settings.unblock_signal_handler(this._changedId);
                    }
                });
            this._syncColumnView(whitelistColumnView, CloseWindowsRule.CloseWindowsWhitelist, settingKey);
        }

        _syncColumnView(columnView, obj, settingName) {
            const newRules = JSON.parse(this._settings.get_string(settingName));
            let datalist = [];
            for (const key in newRules) {
                const data = Object.assign(new obj(), newRules[key])
                datalist.push(data);
            }
            columnView.updateView(datalist);
        }

        _initAppRules() {
            const close_by_rules_list_box = this._builder.get_object('close_by_rules_list_box');
            close_by_rules_list_box.set_header_func((currentRow, beforeRow, data) => {
                this._setHeader(currentRow, beforeRow, data, 'Applications');
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
        }

        _initKeywordRules() {
            const close_by_rules_multi_grid2 = this._builder.get_object('close_by_rules_multi_grid2');
            const close_by_rules_by_keyword_list_box = new Gtk.ListBox({
                hexpand: true,
                vexpand: true,
                show_separators: true,
            });
            close_by_rules_multi_grid2.attach(close_by_rules_by_keyword_list_box, 0, 1, 1, 1);
            close_by_rules_by_keyword_list_box.set_header_func((currentRow, beforeRow, data) => {
                this._setHeader(currentRow, beforeRow, data, 'Keywords');
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
                    compareWith: 'wm_class',
                    method: 'equals'
                });

                let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
                oldCloseWindowsRulesObj[newId] = closeWindowsRule;
                const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
                this._settings.set_string('close-windows-rules-by-keyword', newCloseWindowsRules);
            });

            this._changedId = this._settings.connect(
                'changed::close-windows-rules-by-keyword',
                (settings) => {
                    try {
                        this._settings.block_signal_handler(this._changedId);
                        this._sync(close_by_rules_by_keyword_list_box, RuleRowByKeyword, 'close-windows-rules-by-keyword', 'id');
                    } finally {
                        this._settings.unblock_signal_handler(this._changedId);
                    }
                });
            this._sync(close_by_rules_by_keyword_list_box, RuleRowByKeyword, 'close-windows-rules-by-keyword', 'id');
        }

        _setHeader(currentRow, beforeRow, data, headerName, labelProperties) {
            const header = currentRow.get_header();
            if (header === null && beforeRow === null) {
                const boxVertical = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
                const label = new Gtk.Label({
                    xalign: 0, // align left
                    margin_top: 12,
                    margin_bottom: 6,
                    margin_start: 12,
                    use_markup: true,
                    label: `<b>${headerName}</b>`,
                    tooltip_text: 'Apps in the whitelist will be closed even they has multiple windows'
                });
                if (labelProperties)
                    Object.assign(label, labelProperties);
                boxVertical.append(label);
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
                    const newRuleRow = new obj(ruleDetail, settingName);
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

const Row = GObject.registerClass({
    Signals: {
        'row-deleted': {
            param_types: []
        },
    },
    Properties: {
        'enabled': GObject.ParamSpec.boolean(
            'enabled', 'enabled', 'enabled',
            GObject.ParamFlags.READWRITE,
            false
        ),
    }
}, class Row extends Gtk.ListBoxRow {
    
    _init(detail, params) {
        super._init({
            activatable: false,
        });

        Object.assign(this, params);

        this.detail = detail;

        this._enabledCheckButton = new Gtk.CheckButton({
            active: detail.enabled,
        })
        
        // `flags` contains GObject.BindingFlags.BIDIRECTIONAL so we don't need to set `enable` manually
        this.bind_property('enabled',
            this._enabledCheckButton, 'active',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
    }

    _newRemoveButton() {
        const box = PrefsWidgets.newRemoveButton();
        box.connect('clicked', () => {
            this.emit('row-deleted');
        });
        return box;
    }

    updateRow(settingName, keyName, propertyName, value) {
        const oldCloseWindowsRules = this._settings.get_string(settingName);
        let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
        const key = this[keyName];
        const rule = oldCloseWindowsRulesObj[key];
        rule[propertyName] = value;
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string(settingName, newCloseWindowsRules);
    }

    get enabled() {
        return this.detail.enabled;
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
        'key-delay-changed': {
            param_types: [GObject.TYPE_INT]
        }
    },
    Properties: {
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
}, class RuleRow extends Row {
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

        super._init(ruleDetail, {
            // TODO
            // value: GLib.Variant.new_strv(ruleDetail.value),
            child: ruleRowBox,
        });
        this._ruleDetail = ruleDetail;

        this._rendererAccelBox = null;

        boxLeft.append(this._enabledCheckButton);
        boxLeft.append(this._newShortcutDropDown());
        boxLeft.append(this._newDelaySpinButton());

        this._append_accel(boxRight);
        boxRight.append(this._newRemoveButton());

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
        return PrefsWidgets._newDropDown(values, activeValue);
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
        return PrefsWidgets._newBox(properties);
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
        PrefsWidgets.updateStyle(frame, 'frame { border-style: dashed; }');
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
            label: 'New accelerator…',
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
        this.updateRow(settingName, keyName, propertyName, value);
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

        let displayName
        = appInfo
        ? appInfo.get_display_name()
        : `${ruleDetail.appDesktopFilePath} does't have app info. You may want to add this rule to 'Keywords'.`;

        const icon = new Gtk.Image({
            gicon: appInfo ? appInfo.get_icon() : IconFinder.find('empty-symbolic.svg'),
            pixel_size: 32,
        });
        icon.get_style_context().add_class('icon-dropshadow');
        icon.set_tooltip_text(displayName);
        this.boxLeft.insert_child_after(icon, this._enabledCheckButton);

        const label = new Gtk.Label({
            label: displayName,
            halign: Gtk.Align.START,
            hexpand: true,
            // Make sure that text align left
            xalign: 0,
            width_chars: 20,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        label.set_tooltip_text(displayName);
        if (!appInfo) {
            PrefsWidgets.updateStyle(label, 'label { color: red; }');
        }
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
        return this._appInfo ? this._appInfo.get_name() : null;
    }

    get appId() {
        return this._appInfo ? this._appInfo.get_id() : null;
    }

    get appDesktopFilePath() {
        return this._ruleDetail.appDesktopFilePath;
    }

});

const RuleRowByKeyword = GObject.registerClass({
    Signals: {
        'keyword-changed': {
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

        const compareWithDropDown = this._newCompareWithDropDown();
        const methodDropDown = this._newMethodDropDown();
        const pickableEntry = new PrefsWindowPickableEntry.WindowPickableEntry({
            text: ruleDetail.keyword ? ruleDetail.keyword : '',
            tooltip_text: ruleDetail.keyword ? ruleDetail.keyword : 'A string that is used to match windows or apps',
            pickConditionFunc: (() => {
                return this._compareWithDropDown.get_selected_item().get_string();
            }).bind(this)
        });

        this._keywordEntry = pickableEntry.entry;
        this._compareWithDropDown = compareWithDropDown;
        this._methodDropDown = methodDropDown;

        this.boxLeft.insert_child_after(compareWithDropDown, this._enabledCheckButton);
        this.boxLeft.insert_child_after(methodDropDown, compareWithDropDown);
        this.boxLeft.insert_child_after(pickableEntry, methodDropDown);

        pickableEntry.connect('entry-edit-complete', (source, keywordEntry) => {
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

    _newMethodDropDown() {
        let comboBoxValues = [
            ['Equals', 'equals'],
            ['Includes', 'includes'],
            ['Starts with', 'startsWith'],
            ['Ends with', 'endsWith'],
            ['RegExp', 'regex']
        ];
        return this._newDropDown(comboBoxValues, this._ruleDetail.method);
    }

    _newCompareWithDropDown() {
        let comboBoxValues = [
            ['wm class', 'wm_class'],
            ['wm class instance', 'wm_class_instance'],
            ['Application name', 'app_name'],
            ['Window title', 'title'],
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


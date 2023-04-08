'use strict';

const { GObject, Gtk, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseWindowsWhitelist = Me.imports.model.closeWindowsRule.CloseWindowsWhitelist;

const PrefsWindowPickableEntry = Me.imports.prefsWindowPickableEntry;
const PrefsWidgets = Me.imports.prefsWidgets;

const PrefsUtils = Me.imports.utils.prefsUtils;


var ColumnView = GObject.registerClass({
    Signals: {
        'activate': {
            param_types: [Gtk.CheckButton, GObject.TYPE_OBJECT]
        },
        'row-deleted': {
            param_types: [GObject.TYPE_OBJECT]
        },
    },
}, class ColumnView extends Gtk.Box {

    _init(datalist, params = {}) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL
        });

        datalist = datalist ? datalist : [];
        this.datalist = datalist;

        this._initUI();
        this.updateView(datalist);
    }

    _initUI() {
        this.model = new Gio.ListStore({ item_type: GObject.TYPE_OBJECT });
        this.selectionModel = new Gtk.SingleSelection({ model: this.model });

        this.view = new Gtk.ColumnView({
            css_classes: ['view'],
            // I feel it's ugly to set this to true
            // show_column_separators: true
        });
        this.view.set_model(this.selectionModel);

        const enabledColumn = PrefsWidgets.newColumnViewColumn('Enabled',
        (factory, listItem) => {
            const checkButton = new Gtk.CheckButton()
            listItem.set_child(checkButton);
        }, (factory, listItem) => {
            const widget = listItem.get_child();
            // item is the CloseWindowsWhitelist instance that is added into the model
            const item = listItem.get_item();
            // So we can get `enabled` value from `item` here
            const enabled = item.enabled
            widget.set_active(enabled);
            widget.connect('notify::active', () => {
                this.emit('activate', widget, item);
            });
        });

        const operationColumn = PrefsWidgets.newColumnViewColumn('Operation',
        (factory, listItem) => {
            const button = PrefsWidgets.newRemoveButton();
            listItem.set_child(button);
            button.connect('clicked', () => {
                const item = listItem.get_item();
                this.emit('row-deleted', item);
            });
        }, null);

        this.view.append_column(enabledColumn);
        this.view.append_column(operationColumn);

        // Add the ColumnView to the Box
        this.append(this.view);
    }

    updateView(dataList) {
        this.model.remove_all();
        for(const item of dataList) {
            this.model.append(item);
        }
    }

    updateRow(settingName, keyName, keyValue, propertyName, value) {
        const oldCloseWindowsRules = this._settings.get_string(settingName);
        let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
        const rule = oldCloseWindowsRulesObj[keyValue];
        rule[propertyName] = value;
        const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
        this._settings.set_string(settingName, newCloseWindowsRules);
    }

});

var WhitelistColumnView = GObject.registerClass({
    Signals: {}, 
    Properties: {},
}, class WhitelistColumnView extends ColumnView {

    _init(datalist) {
        super._init(datalist, {});

        const settingKey = 'close-windows-whitelist';
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        const nameColumn = PrefsWidgets.newColumnViewColumn('Name', 
        null, (factory, listItem) => {
            const item = listItem.get_item();
            const name = item.name ? item.name : '';
            const nameEntry = new PrefsWindowPickableEntry.WindowPickableEntry({
                text: name,
                tooltip_text: name,
                pickConditionFunc: (() => {
                    return 'wm_class';
                }).bind(this)
            });
            listItem.set_child(nameEntry);
            nameEntry.connect('entry-edit-complete', (source, entry) => {
                this.updateRow(settingKey, 'id', item.id, 'name', entry.get_text());
            });
        });

        const closeWindowsColumn = PrefsWidgets.newColumnViewColumn('Close windows',
        (factory, listItem) => {
            const switcher = new Gtk.Switch({halign: Gtk.Align.START, valign: Gtk.Align.CENTER});
            listItem.set_child(switcher);
        }, (factory, listItem) => {
            const widget = listItem.get_child();
            const item = listItem.get_item();
            const enableWhenCloseWindows = item.enableWhenCloseWindows
            widget.set_active(enableWhenCloseWindows);
            widget.connect('notify::active', (source) => {
                this.updateRow(settingKey, 'id', item.id, 'enableWhenCloseWindows', source.get_active());
            });
        });

        const logoffColumn = PrefsWidgets.newColumnViewColumn('Log Out, Reboot, Power Off',
        (factory, listItem) => {
            const switcher = new Gtk.Switch({halign: Gtk.Align.START, valign: Gtk.Align.CENTER});
            listItem.set_child(switcher);
        }, (factory, listItem) => {
            const widget = listItem.get_child();
            const item = listItem.get_item();
            const enableWhenLogout = item.enableWhenLogout;
            widget.set_active(enableWhenLogout);
            widget.connect('notify::active', (source) => {
                this.updateRow(settingKey, 'id', item.id, 'enableWhenLogout', source.get_active());
            });
        });

        // The first column is assigned to Enabled column
        let index = 1;
        this.view.insert_column(index++, nameColumn);
        this.view.insert_column(index++, closeWindowsColumn);
        this.view.insert_column(index++, logoffColumn);

        this.connect('activate', (source, checkButton, item) => {
            const enabled = checkButton.get_active();
            this.updateRow(settingKey, 'id', item.id, 'enabled', enabled);
        });
        this.connect('row-deleted', (source, item) => {
            const oldCloseWindowsRules = this._settings.get_string(settingKey);
            let oldCloseWindowsRulesObj = JSON.parse(oldCloseWindowsRules);
            delete oldCloseWindowsRulesObj[item.id];
            const newCloseWindowsRules = JSON.stringify(oldCloseWindowsRulesObj);
            this._settings.set_string(settingKey, newCloseWindowsRules);
        });
    }

});


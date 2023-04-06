'use strict';

const { GObject, Gtk, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const CloseWindowsWhitelist = Me.imports.model.closeWindowsRule.CloseWindowsWhitelist;

const PrefsWindowPickableEntry = Me.imports.prefsWindowPickableEntry;
const PrefsWidgets = Me.imports.prefsWidgets;


var CloseWhitelistColumnView = GObject.registerClass({
    GTypeName: 'AwsmCloseWhitelistColumnView',
    Template: Gio.File.new_for_path(`${Me.path}/data/ui/prefs-gtk4-close-whitelist.ui`).get_uri(),
    Children: [
      'list'
    ],
}, class CloseWhitelistColumnView extends Gtk.Box {

    _init(datalist, params = {}) {
        super._init(params);

        datalist = datalist ? datalist : [];
        this.datalist = datalist;

        this.model = new Gio.ListStore({ item_type: GObject.TYPE_OBJECT });

        this.selectionModel = new Gtk.SingleSelection({ model: this.model });

        this.list.set_model(this.selectionModel);
        this.updateView(datalist);
    }

    updateView(dataList) {
        this.model.remove_all();
        for(const item of dataList) {
            this.model.append(item);
        }
    }
    
    setup_enabled_cb(factory, listItem) {
        const checkButton = new Gtk.CheckButton()
        listItem.set_child(checkButton);
    }

    bind_enabled_cb(factory, listItem) {
        const widget = listItem.get_child();
        // item is the CloseWindowsWhitelist instance that is added into the model
        const item = listItem.get_item();
        // So we can get `enabled` value from `item` here
        const enabled = item.enabled
        log(enabled)
        widget.set_active(enabled);
    }

    setup_name_cb(factory, listItem) {
        log('setup_name_cb ' + listItem)
        
    }

    bind_name_cb(factory, listItem) {
        log('bind_name_cb ' + listItem)
        const item = listItem.get_item();
        const name = item.name ? item.name : '';
        const pickableEntry = new PrefsWindowPickableEntry.WindowPickableEntry({
            text: name,
            tooltip_text: name,
            pickConditionFunc: (() => {
                return 'wm_class';
            }).bind(this)
        });
        listItem.set_child(pickableEntry);
    }

    setup_close_windows_cb(factory, listItem) {
        const switcher = new Gtk.Switch({halign: Gtk.Align.START});
        listItem.set_child(switcher);
    }

    bind_close_windows_cb(factory, listItem) {
        log('bind_column3_cb ' + listItem)
        const widget = listItem.get_child();
        const item = listItem.get_item();
        const enableWhenCloseWindows = item.enableWhenCloseWindows
        widget.set_active(enableWhenCloseWindows);
    }

    setup_log_out_cb(factory, listItem) {
        const switcher = new Gtk.Switch({halign: Gtk.Align.START});
        listItem.set_child(switcher);
    }

    bind_log_out_cb(factory, listItem) {
        const widget = listItem.get_child();
        const item = listItem.get_item();
        const enableWhenLogout = item.enableWhenLogout;
        widget.set_active(enableWhenLogout);
    }

    setup_operation_cb(factory, listItem) {
        const box = PrefsWidgets.newRemoveButton();
        listItem.set_child(box);
    }

    bind_operation_cb(factory, listItem) {
        const widget = listItem.get_child();
        widget.connect('clicked', () => {
            const item = listItem.get_item();
            const id = item.id;
            log('removing ' + id)
        });
    }


});

'use strict';

const { GObject, St, Clutter, Atk } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Tooltip = Me.imports.utils.tooltip;


var SearchSessionItem = GObject.registerClass(
    class SearchSessionItem extends PopupMenu.PopupBaseMenuItem {

        _init(wantFilter) {
            super._init({
                activate: false,
                reactive: false,
                hover: false,
                can_focus: false
            });

            this._wantFilter = wantFilter;

            this._entry = new St.Entry({
                name: 'searchEntry',
                style_class: 'search-entry',
                can_focus: true,
                hint_text: _('Type to search'),
                track_hover: true,
                x_expand: true,
                y_expand: true
            });

            this._entry.set_primary_icon(new St.Icon({
                style_class: 'search-entry-icon',
                icon_name: 'edit-find-symbolic'
            }));

            this.add_child(this._entry);

            this._clearIcon = new St.Icon({
                style_class: 'search-entry-icon',
                icon_name: 'edit-clear-symbolic'
            });

            this._entry.set_secondary_icon(this._clearIcon);
            this._secondaryIconClickedId = this._entry.connect('secondary-icon-clicked', this.reset.bind(this));

            this._addFilters();
        }

        _addFilters() {
            if (!this._wantFilter) return;

            const filterLabel = new St.Label({
                text: 'Filter: ',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(filterLabel);
            this._filterAutoRestore();
            
        }
        
        _filterAutoRestore() {
            this._filterAutoRestoreSwitch = new PopupMenu.Switch(false);
            this._filterAutoRestoreSwitch.set_style_class_name('toggle-switch awsm-toggle-switch');
            let button = new St.Button({
                style_class: 'dnd-button',
                can_focus: true,
                x_align: Clutter.ActorAlign.END,
                toggle_mode: true,
                child: this._filterAutoRestoreSwitch,
            });
            this._filterAutoRestoreSwitch.bind_property('state',
                button, 'checked',
                GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE);

            new Tooltip.Tooltip({
                parent: button,
                markup: 'Show only auto-restore item(s)',
            });

            this.add_child(button);
        }

        reset() {
            this._entry.grab_key_focus();
            this._entry.set_text('');
            let text = this._entry.get_clutter_text();
            text.set_cursor_visible(true);
        }

        destroy() {
            if (this._secondaryIconClickedId) {
                this._entry.disconnect(this._secondaryIconClickedId);
                this._secondaryIconClickedId = null;
            }
        }
    });
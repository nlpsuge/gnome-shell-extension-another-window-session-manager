'use strict';

const { GObject, St, Clutter } = imports.gi;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const IconFinder = Me.imports.utils.iconFinder;
const FileUtils = Me.imports.utils.fileUtils;
const Tooltip = Me.imports.utils.tooltip;
const GnomeVersion = Me.imports.utils.gnomeVersion;

const SaveSession = Me.imports.saveSession;
const RestoreSession = Me.imports.restoreSession;
const MoveSession = Me.imports.moveSession;
const CloseSession = Me.imports.closeSession;

const { Button } = Me.imports.ui.button;

const PrefsUtils = Me.imports.utils.prefsUtils;

var SessionItemButtons = GObject.registerClass(
class SessionItemButtons extends GObject.Object {

    _init(sessionItem) {
        super._init();

        this.sessionItem = sessionItem;

        // TODO Nullify created object?
        this._saveSession = new SaveSession.SaveSession();
        this._moveSession = new MoveSession.MoveSession();
        this._closeSession = new CloseSession.CloseSession();

        this._settings = new PrefsUtils.PrefsUtils().getSettings();
    }

    addButtons() {
        this._addTags();
        
        this._addSeparator();

        const saveButton = this._addButton('save-symbolic.svg');
        new Tooltip.Tooltip({
            parent: saveButton,
            markup: 'Save open windows using the current session name',
        });
        saveButton.connect('clicked', this._onClickSave.bind(this));

        const restoreButton = this._addButton('restore-symbolic.svg');
        restoreButton.set_reactive(this.sessionItem._available);
        new Tooltip.Tooltip({
            parent: restoreButton,
            markup: 'Restore windows from the saved session',
        });
        restoreButton.connect('clicked', this._onClickRestore.bind(this));

        const moveButton = this._addButton('move-symbolic.svg');
        moveButton.set_reactive(this.sessionItem._available);
        new Tooltip.Tooltip({
            parent: moveButton,
            markup: 'Move windows to their workspace by the saved session',
        });
        moveButton.connect('clicked', this._onClickMove.bind(this));

        // this._addSeparator();

        // const closeButton = this._addButton('close-symbolic.svg');
        // closeButton.connect('clicked', this._onClickClose.bind(this));

        const autoRestoreSwitcher = this._addAutostartSwitcher();
        new Tooltip.Tooltip({
            parent: autoRestoreSwitcher,
            markup: 'Restore at startup',
        });
        autoRestoreSwitcher.connect('clicked', (button, event) => {
            const state = this._autostartSwitch.state;
            if (state) {
                this._settings.set_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS, this.sessionItem._filename);
            } else {
                this._settings.set_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS, '');
            }
        });

        this._settings.connect(`changed::${PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS}`, (settings) => {
            const toggled = this.sessionItem._filename == this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
            this._autostartSwitch.state = toggled;
        });

        this._addSeparator();
    
        const deleteButton = this._addDeleteButton();
        new Tooltip.Tooltip({
            parent: deleteButton,
            markup: 'Move to Trash',
        });
        deleteButton.connect('clicked', () => {
            // We just trash file to trash scan instead of delete in case still need it.
            FileUtils.trashSession(this.sessionItem._filename);
        });

    }

    _addAutostartSwitcher() {

        const toggled = this.sessionItem._filename == this._settings.get_string(PrefsUtils.SETTINGS_AUTORESTORE_SESSIONS);
        this._autostartSwitch = new PopupMenu.Switch(toggled);
        this._autostartSwitch.set_style_class_name('toggle-switch awsm-toggle-switch');
        let button = new St.Button({
            style_class: 'dnd-button',
            can_focus: true,
            x_align: Clutter.ActorAlign.END,
            toggle_mode: true,
            child: this._autostartSwitch,
            reactive: this.sessionItem._available
        });
        this._autostartSwitch.bind_property('state',
            button, 'checked',
            GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE);
        this.sessionItem.actor.add_child(button);
        return button;
    }

    _addDeleteButton() {
        let button = new St.Button({
            style_class: 'button',
            can_focus: true,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: true,
            track_hover: true,
            reactive: this.sessionItem._filename != FileUtils.recently_closed_session_name,
        });
        button.set_label('Delete');
        this.sessionItem.actor.add_child(button);
        return button;
    }

    _addTags() {
        // TODO Make the modification time align left

        let button = new St.Button({
            x_align: Clutter.ActorAlign.END,
        });

        button.set_label(this.sessionItem._modification_time);
        this.sessionItem.actor.add_child(button);

    }

    _addSeparator() {
        let icon = new St.Icon({
            gicon: IconFinder.find('separator-symbolic.svg'),
            style_class: 'system-status-icon'
        });

        let button = new St.Button({
            style_class: 'aws-item-separator',
            can_focus: false,
            child: icon,
            x_align: Clutter.ActorAlign.END,
            x_expand: false,
            y_expand: false,
            track_hover: false
        });

        this.sessionItem.actor.add_child(button);
    }

    _addButton(iconSymbolic) {
        const button = new Button({
            icon_symbolic: iconSymbolic,
        }).button;
        this.sessionItem.actor.add_child(button);
        return button;
    }

    _onClickSave(button, event) {
        this._saveSession.saveSession(this.sessionItem._filename);
    }
    
    _onClickRestore(button, event) {
        RestoreSession.restoringApps = new Map();
        // Using _restoredApps to hold restored apps so we create new instance every time for now
        const _restoreSession = new RestoreSession.RestoreSession();
        _restoreSession.restoreSession(this.sessionItem._filename);

        // The below bug is fixed in Gnome 42.
        // Leave Overview if we are in Overview to reduce or fix `Bug in window manager: Workspace does not exist to index!` in mutter
        // See: https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/2134, which has been merged into Gnome 42
        if (GnomeVersion.isOlderThan42() && Main.overview.visible) {
            Main.overview.toggle();
        }
    }
    
    _onClickMove(button, event) {
        this._moveSession.moveWindows(this.sessionItem._filename);
    }

    _onClickClose(button, event) {
        // TODO Close specified windows in the session?
        this._closeSession.closeWindows();
    }
});
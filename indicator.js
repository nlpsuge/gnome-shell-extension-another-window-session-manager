
const { GObject, St, Gio, GLib, Clutter, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PanelMenu = imports.ui.panelMenu;

const FileUtils = Me.imports.utils.fileUtils;
const SessionRows = Me.imports.sessionRows;


var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");
        
        this._sessions_path = FileUtils.sessions_path;
        // TODO backup path

        // Add an icon
        let iconPath = `${Me.path}/icons/restore-symbolic.svg`;
        let icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${iconPath}`),
            style_class: 'popup-menu-icon'
        });
        this.add_child(icon);
        this.buttonText = new St.Label({
            text: _("Loading..."),
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this.buttonText);

        this._addSessionItems();

        this.connect('destroy', this._onDestroy.bind(this));
        // Open menu
        // this.menu.open(true);
        // Toggle menu
        // this.menu.toggle();

    }

    _addSessionItems() {
        if (!GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            // TOTO Empty session
            log(`${this._sessions_path} not found!`);
            return;
        }

        this.menu.addMenuItem(new SessionRows.SessionRows());
        
    }

    _onDestroy() {
        log('Destroying...');
        
    }

});
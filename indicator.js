
const { GObject, St, Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PanelMenu = imports.ui.panelMenu;

const FileUtils = Me.imports.utils.fileUtils;


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

        this._addSessionItems();

        this.connect('destroy', this._onDestroy.bind(this));
        // TODO Not work
        this.menu.open(true);

    }

    _addSessionItems() {
        const sessions_path = GLib.build_filenamev([this._sessions_path]);
        if (GLib.file_test(this._sessions_path, GLib.FileTest.EXISTS)) {
            return;
        }

        let index = 0;
        FileUtils.listAllSessions(null, false, (file, info) => {
            if (info.get_file_type() === Gio.FileType.REGULAR) {
                let parent = file.get_parent();
                let parentPath;
                // https://gjs-docs.gnome.org/gio20~2.66p/gio.file#method-get_parent
                // If the this represents the root directory of the file system, then null will be returned.
                if (parent === null) {
                    // Impossible in the case
                    parentPath = '/';
                } else {
                    parentPath = parent.get_path();
                }
                const filePath = file.get_path();
                // Debug
                log(`Processing ${filePath} under ${parentPath}`);
                index++;
                let item = new sessionItem.SessionItem(info.get_name(), filePath, index);
                this.menu.addMenuItem(item, index);
            }
        });
        
    }

    _onDestroy() {
        log('Destroying...');
        
    }

});
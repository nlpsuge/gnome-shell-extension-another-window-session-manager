const { GObject, St, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionRow = Me.imports.sessionRow;

const SessionRows = GObject.registerClass(
class SessionRows extends Gtk.ScrolledWindow {
    _init() {
        super._init({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
            // show_separators: true,
        });

        print(this);
        this.set_child(this._list);

        this._loadSessions();


    }

    _loadSessions() {
        // Debug
        log('List all sessions to add session items');
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
                let row = new SessionRow.SessionRow(info, file);
                this._list.insert(row, index);
            }
        });
    }
    
});


const { Gio, GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const FileUtils = Me.imports.utils.fileUtils;

var RestoreSession = class {

    constructor() {
        this.session_name = 'defaultSession';

    }

    restoreSession() {
        const sessions_path = FileUtils.get_sessions_path();
        const session_file_path = GLib.build_filenamev([sessions_path, this.session_name]);
        if (!GLib.file_test(session_file_path, GLib.FileTest.EXISTS)) {
            logError(`Session file not found: ${session_file_path}`);
            return;
        }

        log(`Restoring saved session located ${session_file_path}`);
        
        const session_file = Gio.File.new_for_path(session_file_path);
        let [success, contents] = session_file.load_contents(null);
        if (success) {
            log(contents);
        }
        
    }

    destroy() {

    }

}
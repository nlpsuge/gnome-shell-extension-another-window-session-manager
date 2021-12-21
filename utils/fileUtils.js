const { Gio, GLib } = imports.gi

var default_sessionName = 'defaultSession';
const home_dir = GLib.get_home_dir();
const config_path_base = GLib.build_filenamev([home_dir, '.config', 'xsession-manager']);
var sessions_path = GLib.build_filenamev([config_path_base, 'sessions']);

function get_sessions_path() {
    return sessions_path;
}
function listAllSessions(sessionPath, recursion, callback) {
    if (!sessionPath) {
        sessionPath = get_sessions_path();
    }
    if (!GLib.file_test(sessionPath, GLib.FileTest.EXISTS)) {
        log(`${sessionPath} not exist`);
        return;
    }

    log(`Looking up path: ${sessionPath}`);
    const sessionPathFile = Gio.File.new_for_path(sessionPath);
    let fileEnumerator;
    try {
        fileEnumerator = sessionPathFile.enumerate_children(
            [Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FILE_ATTRIBUTE_STANDARD_TYPE].join(','),
            Gio.FileQueryInfoFlags.NONE,
            null);
    } catch(e) {
        logError(e, `Failed to list directory ${sessionPath}`);
        fileEnumerator = null;
    }

    if (fileEnumerator != null) {
        let info;
        while ((info = fileEnumerator.next_file(null))) {
            const file = fileEnumerator.get_child(info);
            if (recursion && info.get_file_type() === Gio.FileType.DIRECTORY) {
                log(`${info.get_name()} is a folder, checking`);
                listAllSessions(file.get_path(), callback);
            }

            if (callback) {
                callback(file, info);
            }
        }
    }
    
}

// test
// let index = 0;
// listAllSessions(null, false, (file, info) => {
//     if (info.get_file_type() === Gio.FileType.REGULAR) {
//         let parent = file.get_parent();
//         let parentPath;
//         if (parent === null) {
//             // Impossible in the case
//             parentPath = '/';
//         } else {
//             parentPath = parent.get_path();
//         }
//         log(`Processing ${file.get_path()} under ${parentPath}. ${index++}`);
//     }
// });

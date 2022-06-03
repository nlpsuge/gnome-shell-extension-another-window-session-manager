'use strict';

const { Gio, GLib } = imports.gi
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var default_sessionName = 'defaultSession';
const home_dir = GLib.get_home_dir();
// This extension can restore `xsm`'s session file, 
// but desktop_file_id is missing in that file, so can't move them. Will be fixed in the future.
const config_path_base = GLib.build_filenamev([home_dir, '.config', 'another-window-session-manager']);
var sessions_path = GLib.build_filenamev([config_path_base, 'sessions']);
var sessions_backup_folder_name = 'backups';
var sessions_backup_path = GLib.build_filenamev([sessions_path, sessions_backup_folder_name]);
var desktop_template_path = GLib.build_filenamev([Me.path, '/template/template.desktop']);
var desktop_template_path_restore_at_autostart = GLib.build_filenamev([Me.path, '/template/_gnome-shell-extension-another-window-session-manager.desktop']);
var desktop_file_store_path_base = '~/.local/share/applications';
var desktop_file_store_path = `${desktop_file_store_path_base}/__another-window-session-manager`;

var recently_closed_session_name = 'Recently Closed Session';
var recently_closed_session_path = GLib.build_filenamev([sessions_path, recently_closed_session_name]);

var autostart_restore_desktop_file_path = GLib.build_filenamev([home_dir, '/.config/autostart/_gnome-shell-extension-another-window-session-manager.desktop']);


function get_sessions_path() {
    return sessions_path;
}

function get_sessions_backups_path() {
    return sessions_backup_path;
}

function getJsonObj(contents) {
    let session_config;
    // Fix Gnome 3 crash due to: Some code called array.toString() on a Uint8Array instance. Previously this would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, but please fix your code anyway to explicitly call ByteArray.toString(array).
    if (contents instanceof Uint8Array) {
        const contentsConverted = imports.byteArray.toString(contents);
        session_config = JSON.parse(contentsConverted);
    } else {
        // Unreachable code
        session_config = JSON.parse(contents);
    }
    return session_config;
}

function listAllSessions(sessionPath, recursion, debug, callback) {
    if (!sessionPath) {
        sessionPath = get_sessions_path();
    }
    if (!GLib.file_test(sessionPath, GLib.FileTest.EXISTS)) {
        logError(new Error(`${sessionPath} not exist`));
        return;
    }

    if (debug) {
        log(`Looking up path: ${sessionPath}`);
    }
    const sessionPathFile = Gio.File.new_for_path(sessionPath);
    let fileEnumerator;
    try {
        fileEnumerator = sessionPathFile.enumerate_children(
            [Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
            Gio.FILE_ATTRIBUTE_TIME_MODIFIED,
            Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE].join(','),
            Gio.FileQueryInfoFlags.NONE,
            null);
    } catch (e) {
        logError(e, `Failed to list directory ${sessionPath}`);
        fileEnumerator = null;
    }

    if (fileEnumerator != null) {
        let info;
        while ((info = fileEnumerator.next_file(null))) {
            const file = fileEnumerator.get_child(info);
            if (recursion && info.get_file_type() === Gio.FileType.DIRECTORY) {
                if (debug) {
                    log(`${info.get_name()} is a folder, checking`);
                }
                listAllSessions(file.get_path(), recursion, debug, callback);
            }

            if (callback) {
                callback(file, info);
            }
        }
    }

}

function sessionExists(sessionName) {
    const sessionFilePath = GLib.build_filenamev([sessions_path, sessionName]);
    if (GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) {
        return true;
    }
    return false;
}

function trashSession(sessionName) {
    if (!sessionExists(sessionName)) {
        return true;
    }

    let trashed = false;
    const sessionFilePath = GLib.build_filenamev([sessions_path, sessionName]);
    try {
        const sessionPathFile = Gio.File.new_for_path(sessionFilePath);
        trashed = sessionPathFile.trash(null);
        if (!trashed) {
            logError(new Error(`Failed to trash file ${sessionFilePath}. Reason: Unknown.`));
        }
        return trashed;
    } catch (e) {
        logError(e, `Failed to trash file ${sessionFilePath}`);
        return false;
    }
}

function isDirectory(sessionName) {
    const sessionFilePath = GLib.build_filenamev([sessions_path, sessionName]);
    if (GLib.file_test(sessionFilePath, GLib.FileTest.IS_DIR)) {
        return true;
    }

    return false;
}

function loadAutostartDesktopTemplate() {
    return loadTemplate(desktop_template_path_restore_at_autostart);
}

function loadDesktopTemplate() {
    return loadTemplate(desktop_template_path);
}

function loadTemplate(path) {
    const desktop_template_file = Gio.File.new_for_path(path);
    let [success, contents] = desktop_template_file.load_contents(null);
    if (success) {
        if (contents instanceof Uint8Array) {
            return imports.byteArray.toString(contents);
        } else {
            // Unreachable code
            return contents;
        }
    }

    return '';
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

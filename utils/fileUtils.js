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
const sessions_backup_path = GLib.build_filenamev([sessions_path, sessions_backup_folder_name]);

var desktop_template_path = GLib.build_filenamev([Me.path, '/template/template.desktop']);
var desktop_template_path_restore_at_autostart = GLib.build_filenamev([Me.path, '/template/_gnome-shell-extension-another-window-session-manager.desktop']);
var desktop_file_store_path_base = '~/.local/share/applications';
var desktop_file_store_path = `${desktop_file_store_path_base}/__another-window-session-manager`;

var recently_closed_session_name = 'Recently Closed Session';
var recently_closed_session_path = GLib.build_filenamev([sessions_path, recently_closed_session_name]);
var recently_closed_session_file = Gio.File.new_for_path(recently_closed_session_path);


var autostart_restore_desktop_file_path = GLib.build_filenamev([home_dir, '/.config/autostart/_gnome-shell-extension-another-window-session-manager.desktop']);

var desktop_template_path_ydotool_uinput_rules = GLib.build_filenamev([Me.path, '/template/60-awsm-ydotool-uinput.rules']);
var system_udev_rules_path_ydotool_uinput_rules = '/etc/udev/rules.d/60-awsm-ydotool-uinput.rules';


/**
 * Get the absolute session path which contains sessions, 
 * it's `~/.config/another-window-session-manager` by default.
 * 
 * @param {string} baseDir base directory, `~/.config/another-window-session-manager/sessions` by default
 * @returns {string} the absolute session path which contains sessions
 */
function get_sessions_path(baseDir = null) {
    if (baseDir) {
        return baseDir;
    } else {
        return sessions_path;
    }
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

async function listAllSessions(sessionPath, recursion, debug, callback) {
    if (!sessionPath) {
        sessionPath = get_sessions_path();
    }
    if (!GLib.file_test(sessionPath, GLib.FileTest.EXISTS)) {
        logError(new Error(`${sessionPath} not exist`));
        return;
    }

    if (debug) {
        log(`[DEBUG  ][Another window session manager] Scanning ${sessionPath}`);
    }
    const sessionPathFile = Gio.File.new_for_path(sessionPath);
    let fileEnumerator = await new Promise((resolve, reject) => {
        sessionPathFile.enumerate_children_async(
            [Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
            Gio.FILE_ATTRIBUTE_TIME_MODIFIED,
            Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE].join(','),
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            (file, asyncResult) => {
                try {
                    resolve(file.enumerate_children_finish(asyncResult));
                } catch (e) {
                    logError(e, `Failed to list directory ${sessionPath}`);
                    reject(e);
                }
            });
    });

    const nextFilesFunc = async () => {
        return new Promise((resolve, reject) => {
            fileEnumerator.next_files_async(
                // num_files. Just set a random value, because I don't know which value is better yet
                10,
                GLib.PRIORITY_DEFAULT,
                null,
                (iter, asyncResult) => {
                    try {
                        resolve(iter.next_files_finish(asyncResult));
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    };

    let infos = await nextFilesFunc();
    while (infos && infos.length > 0) {
        for (const info of infos) {
            const file = fileEnumerator.get_child(info);
            if (recursion && info.get_file_type() === Gio.FileType.DIRECTORY) {
                listAllSessions(file.get_path(), recursion, debug, callback);
            }

            if (callback) {
                callback(file, info);
            }
        }

        infos = await nextFilesFunc();
    }
}

function sessionExists(sessionName, baseDir = null) {
    const sessionsPath = get_sessions_path(baseDir);
    const sessionFilePath = GLib.build_filenamev([sessionsPath, sessionName]);
    if (GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) {
        return [true, sessionFilePath];
    }
    return [false];
}

function trashSession(sessionName) {
    const [exists, sessionFilePath] = sessionExists(sessionName);
    if (!exists) {
        return true;
    }

    let trashed = false;
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

function loadDesktopTemplate(cancellable = null) {
    return loadTemplate(desktop_template_path, cancellable);
}

function loadTemplate(path, cancellable = null) {
    const desktop_template_file = Gio.File.new_for_path(path);
    let [success, contents] = desktop_template_file.load_contents(cancellable);
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

/**
 * Open session file using an external editor
 * 
 * @param {string} filePath 
 */
function findDefaultApp(filePath) {
    const session_file = Gio.File.new_for_path(filePath);
    return new Promise((resolve, reject) => {
        session_file.query_default_handler_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (file, asyncResult) => {
                try {
                    const app = session_file.query_default_handler_finish(asyncResult);
                    if (app) {
                        resolve([app, session_file]);
                    } else {
                        reject(new Error(`Cannot find the default application to ${filePath}`));
                    }   
                } catch (error) {
                    reject(error);
                }
            });
    });    
}
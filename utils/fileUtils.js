'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Log from './log.js';

let Extension;
try {
    let extensionObj = await import('resource:///org/gnome/shell/extensions/extension.js');
    Extension = extensionObj.Extension;
} catch (e) {
    let extensionPrefsObj = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
    Extension = extensionPrefsObj.ExtensionPreferences;
}

export const default_sessionName = 'defaultSession';
export const data_dir = GLib.get_user_data_dir();
export const user_config = GLib.get_user_config_dir();
// This extension can restore `xsm`'s session file, 
// but desktop_file_id is missing in that file, so can't move them. Will be fixed in the future.
export const config_path_base = GLib.build_filenamev([user_config, 'another-window-session-manager']);
// The session list
export const sessions_path = GLib.build_filenamev([config_path_base, 'sessions']);
export const sessions_backup_folder_name = 'backups';
const sessions_backup_path = GLib.build_filenamev([sessions_path, sessions_backup_folder_name]);

export const desktop_file_store_path_base = GLib.build_filenamev([data_dir, '/applications']);
export const desktop_file_store_path = `${desktop_file_store_path_base}/__another-window-session-manager`;

export const recently_closed_session_name = 'Recently Closed Session';
export const recently_closed_session_path = GLib.build_filenamev([sessions_path, recently_closed_session_name]);
export const recently_closed_session_file = Gio.File.new_for_path(recently_closed_session_path);

export const current_session_path = `${config_path_base}/currentSession`;

export const current_session_summary_name = 'summary.json';
export const current_session_summary_path = GLib.build_filenamev([current_session_path, 'summary.json']);

export const autostart_restore_desktop_file_path = GLib.build_filenamev([user_config, '/autostart/_gnome-shell-extension-another-window-session-manager.desktop']);
export const autostart_restore_previous_desktop_file_path = GLib.build_filenamev([user_config, '/autostart/_awsm-restore-previous-session.desktop']);

export const system_udev_rules_path_ydotool_uinput_rules = '/etc/udev/rules.d/60-awsm-ydotool-uinput.rules';


export const FileUtils = class FileUtils {
    
    constructor() {
        const extensionObject = Extension.lookupByUUID('another-window-session-manager@gmail.com');
        this.desktop_template_path = GLib.build_filenamev([extensionObject.path, '/template/template.desktop']);
        this.desktop_template_path_restore_at_autostart = GLib.build_filenamev([extensionObject.path, '/template/_gnome-shell-extension-another-window-session-manager.desktop']);
        this.desktop_template_path_restore_previous_at_autostart = GLib.build_filenamev([extensionObject.path, '/template/_awsm-restore-previous-session.desktop']);
        this.desktop_template_launch_app_shell_script = GLib.build_filenamev([extensionObject.path, '/template/launch-app.sh']);
        this.desktop_template_path_ydotool_uinput_rules = GLib.build_filenamev([extensionObject.path, '/template/60-awsm-ydotool-uinput.rules']);
    }

    async loadSummary() {
        try {
            return await this.loadFile(current_session_summary_path);   
        } catch (error) {
            Log.Log.getDefault().error(error);
        }
    }

    async loadFile(path) {
        try {
            return new Promise((resolve, reject) => {
                const file = Gio.File.new_for_path(path);
                file.load_contents_async(
                null, 
                (file, asyncResult) => {
                    try {
                        const [success, contents, _] = file.load_contents_finish(asyncResult);
                        resolve([getJsonObj(contents), path]);
                    } catch (error) {
                        Log.Log.getDefault().error(error);
                        reject(error);
                    }
                });
            });
        } catch (error) {
            Log.Log.getDefault().error(error);
        }
    }

    /**
     * Get the absolute session path which contains sessions, 
     * it's `~/.config/another-window-session-manager` by default.
     * 
     * @param {string} baseDir base directory, `~/.config/another-window-session-manager/sessions` by default
     * @returns {string} the absolute session path which contains sessions
     */
    get_sessions_path(baseDir = null) {
        if (baseDir) {
            return baseDir;
        } else {
            return sessions_path;
        }
    }

    get_sessions_backups_path() {
        return sessions_backup_path;
    }

    getJsonObj(contents) {
        let session_config;
        // Fix Gnome 3 crash due to: Some code called array.toString() on a Uint8Array instance. Previously this would have interpreted the bytes of the array as a string, but that is nonstandard. In the future this will return the bytes as comma-separated digits. For the time being, the old behavior has been preserved, but please fix your code anyway to explicitly call new TextDecoder().decode(array).
        if (contents instanceof Uint8Array) {
            const contentsConverted = new TextDecoder().decode(contents);
            session_config = JSON.parse(contentsConverted);
        } else {
            // Unreachable code
            session_config = JSON.parse(contents);
        }
        return session_config;
    }

    async listAllSessions(sessionPath, recursion, callback) {
        try {
            if (!sessionPath) {
                sessionPath = this.get_sessions_path();
            }
            if (!GLib.file_test(sessionPath, GLib.FileTest.EXISTS)) {
                Log.Log.getDefault().warn(`${sessionPath} not exist`);
                return;
            }
        
            Log.Log.getDefault().debug(`Scanning ${sessionPath}`);
        
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
                            Log.Log.getDefault().error(e, `Failed to list directory ${sessionPath}`);
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
            while (infos && infos.length) {
                for (const info of infos) {
                    const file = fileEnumerator.get_child(info);
                    if (recursion && info.get_file_type() === Gio.FileType.DIRECTORY) {
                        await this.listAllSessions(file.get_path(), recursion, callback);
                    }

                    if (callback) {
                        callback(file, info);
                    }
                }

                infos = await nextFilesFunc();
            }
        } catch (e) {
            Log.Log.getDefault().error(e);
        }
    }

    sessionExists(sessionName, baseDir = null) {
        const sessionsPath = this.get_sessions_path(baseDir);
        const sessionFilePath = GLib.build_filenamev([sessionsPath, sessionName]);
        if (GLib.file_test(sessionFilePath, GLib.FileTest.EXISTS)) {
            return [true, sessionFilePath];
        }
        return [false];
    }

    /**
     * Remove files. And also remove its parent if it's empty.
     * 
     * @param {String} path         The path of a file or a directory
     */
    removeFileAndParent(path) {
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
            throw new Error(`Cannot remove '${path}': No such file or directory`);
        }

        const file = Gio.File.new_for_path(path);
        try {
            const info = file.query_info(
                [Gio.FILE_ATTRIBUTE_STANDARD_TYPE].join(','),
                Gio.FileQueryInfoFlags.NONE,
                null);

            const fileType = info.get_file_type();
            const isDir = fileType === Gio.FileType.DIRECTORY;
            
            file.delete(null);
            Log.Log.getDefault().debug(`Removed ${isDir ? 'directory' : ''} ${path}`);

            const parent = file.get_parent();
            if (parent && isEmpty(parent)) {
                parent.delete(null);
                Log.Log.getDefault().debug(`Removed directory ${parent.get_path()}`);
            }
        
        } catch (e) {
            Log.Log.getDefault().error(e);
        }
    }

    isEmpty(directory) {
        const fileEnumerator = directory.enumerate_children(
            [Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FILE_ATTRIBUTE_STANDARD_TYPE].join(','),
            Gio.FileQueryInfoFlags.NONE, 
            null);
        return !fileEnumerator.next_file(null);
    }

    /**
     * Remove files or directories
     * 
     * @param {String} path         The path of a file or a directory
     * @param {Boolean} recursively true if remove all files or directories in `path`
     */
    removeFile(path, recursively = false) {
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
            throw new Error(`Cannot remove '${path}': No such file or directory`);
        }

        const file = Gio.File.new_for_path(path);
        try {
            const info = file.query_info(
                [Gio.FILE_ATTRIBUTE_STANDARD_TYPE].join(','),
                Gio.FileQueryInfoFlags.NONE,
                null);

            const fileType = info.get_file_type();
            if (fileType === Gio.FileType.DIRECTORY) {
                if (!recursively) {
                    throw new Error(`Cannot remove '${path}': Is a directory`);
                }
                const fileEnumerator = file.enumerate_children(
                    [Gio.FILE_ATTRIBUTE_STANDARD_NAME,
                    Gio.FILE_ATTRIBUTE_STANDARD_TYPE].join(','),
                    Gio.FileQueryInfoFlags.NONE, 
                    null);
                
                let fileInfo = null;
                while (fileInfo = fileEnumerator.next_file(null)) {
                    const childFile = fileEnumerator.get_child(fileInfo);
                    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                        this.removeFile(childFile.get_path(), recursively);
                    }
                }

                file.delete(null);
                Log.Log.getDefault().debug(`Removed directory ${path}`);
            } else {
                file.delete(null);
                Log.Log.getDefault().debug(`Removed ${path}`);
            }
        } catch (e) {
            Log.Log.getDefault().error(e);
        }
    }

    trashSession(sessionName) {
        const [exists, sessionFilePath] = this.sessionExists(sessionName);
        if (!exists) {
            return true;
        }

        let trashed = false;
        try {
            const sessionPathFile = Gio.File.new_for_path(sessionFilePath);
            trashed = sessionPathFile.trash(null);
            if (!trashed) {
                Log.Log.getDefault().error(new Error(`Failed to trash file ${sessionFilePath}. Reason: Unknown.`));
            }
            return trashed;
        } catch (e) {
            Log.Log.getDefault().error(e, `Failed to trash file ${sessionFilePath}`);
            return false;
        }
    }

    isDirectory(sessionName) {
        const sessionFilePath = GLib.build_filenamev([sessions_path, sessionName]);
        if (GLib.file_test(sessionFilePath, GLib.FileTest.IS_DIR)) {
            return true;
        }

        return false;
    }

    loadAutostartDesktopTemplate() {
        return this.loadTemplate(this.desktop_template_path_restore_at_autostart);
    }

    loadDesktopTemplate(cancellable = null) {
        return this.loadTemplate(this.desktop_template_path, cancellable);
    }

    loadTemplate(path, cancellable = null) {
        const desktop_template_file = Gio.File.new_for_path(path);
        let [success, contents] = desktop_template_file.load_contents(cancellable);
        if (success) {
            if (contents instanceof Uint8Array) {
                return new TextDecoder().decode(contents);
            } else {
                // Unreachable code
                return contents;
            }
        }

        return '';
    }

    /**
     * Find the default app to open session file
     * 
     * @param {string} filePath 
     */
    findDefaultApp(filePath) {
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

}

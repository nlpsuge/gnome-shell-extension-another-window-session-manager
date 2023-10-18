'use strict';

// imports.gi.versions.Soup = "3.0";

const {Gio, GLib, Soup} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Log = Me.imports.utils.log;

var SnapSupport = class {

    static async getAppInfos(appName) {
        const unixSocketAddress = Gio.UnixSocketAddress.new('/run/snapd.socket');
        const session = new Soup.Session({remote_connectable: unixSocketAddress});
        const message = Soup.Message.new('GET', `http://localhost/v2/apps?names=${appName}`);
        const cancellable = null;
        return new Promise((resolve, reject) => {
            session.send_and_read_async(
                message, 
                GLib.PRIORITY_LOW, cancellable,
                (_session, asyncResult) => {
                    try {
                        const responseBodyBytes = session.send_and_read_finish(asyncResult);
                        const decoder = new TextDecoder();
                        const responseData = responseBodyBytes.get_data();
                        if (message.status_code === Soup.Status.OK) {
                            const response = decoder.decode(responseData);
                            resolve(response['result']);
                        } else {
                            reject(new Error(response['result']['message']));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });    
        });
    }

    /**
     * 
     * @param {*} appName 
     * @returns null if no app info can be found from Snap
     */
    static async findOneAppDesktopFile(appName) {
        if (!appName) {
            return null;
        }
        const appInfos = await this.getAppInfos(appName);
        if (!appInfos.length) return null;
        if (appInfos.length > 1) {
            const desktopFiles = appInfos.map(appInfo => {
                return appInfo['desktop-file'] ? appInfo['desktop-file'].trim() : null;
            }).filter(desktopFile => {
                return !desktopFile;
            });
            
            if (!desktopFiles.length) {
                return null;
            }

            if (desktopFiles.length > 1) {
                const df = desktopFiles[0];
                const message = `Found multiple desktop files (${desktopFiles.join(', ')}) according to ${appName}, use the first one (${df})`;
                Log.Log.getDefault().warn(message);
                return df;
            }
        }

        return appInfos[0]['desktop-file'];
    }

    static async findOneAppDesktopFileFromCmd(fullCmd) {
        const snapAppName = this.getSnapAppName(fullCmd);
        return await this.findOneAppDesktopFile(snapAppName);
    }
    /**
     * 
     * @param {*} appExecutablePath For example, /snap/postman/215/usr/share/postman/postman
     * @returns the app name if it is a Snap app, otherwise null
     */
    static getSnapAppName(fullCmd) {
        if (fullCmd && fullCmd.length) {
            const appExecutablePath = fullCmd[0];
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
            // Visit https://regex101.com/r/Y56A1w/1 to check the explanation of this regular expression pattern
            const regex = /([\/]|[\\]{,2})snap([\/]|[\\]{,2})[\w:\-]+([\/]|[\\]{,2})[\d]+/gm;
            const matchedArray = regex.exec(appExecutablePath);
            if (matchedArray && matchedArray.length) {
                const appName = 
                                // /snap/postman/215
                                matchedArray[0]
                                // ["", "snap", "postman", "215"]
                                .split(/[/|\\]/)
                                // postman
                                [2];
                return appName;
            }
        }
        return null;
    }

}
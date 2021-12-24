'use strict';

const { Gio, GLib } = imports.gi

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function find(iconName) {
    let iconPath = `${Me.path}/icons/${iconName}`;
    if (GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
        return Gio.icon_new_for_string(`${iconPath}`);
    }

    return Gio.ThemedIcon.new_from_names([iconName]);
    
}

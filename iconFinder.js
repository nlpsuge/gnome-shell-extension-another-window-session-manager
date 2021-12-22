const { Gio } = imports.gi

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function find(iconName) {
    let iconPath = `${Me.path}/icons/${iconName}`;
    return Gio.icon_new_for_string(`${iconPath}`);
}

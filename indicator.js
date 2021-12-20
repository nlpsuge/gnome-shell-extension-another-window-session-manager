
const { GObject, St, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PanelMenu = imports.ui.panelMenu;

var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");
        
        // Add an icon
        let iconPath = `${Me.path}/icons/restore-symbolic.svg`;
        let icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${iconPath}`),
            style_class: 'system-status-icon'
        });
        this.add_child(icon);
    }

    _onDestroy() {
        
    }

});
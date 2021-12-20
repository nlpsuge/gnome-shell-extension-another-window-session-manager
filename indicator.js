
const { GObject, St, Gio } = imports.gi;

const PanelMenu = imports.ui.panelMenu;

var AwsIndicator = GObject.registerClass(
class AwsIndicator extends PanelMenu.Button {

    _init() {
        super._init(0.0, "Another Window Session Manager");
        
        // Add an icon
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({name: 'face-laugh-symbolic'}),
            style_class: 'system-status-icon'
        });
        this.add_child(icon);
    }

    _onDestroy() {
        
    }

});
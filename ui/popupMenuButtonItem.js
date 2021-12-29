const { GObject, St, Clutter } = imports.gi;

const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Button } = Me.imports.ui.button;


var PopupMenuButtonItem = GObject.registerClass(
class PopupMenuButtonItem extends PopupMenu.PopupMenuItem {

    _init() {
        super._init('');

        this.yesButton = null;
        this.noButton = null;
    }

    /**
     * Hide both Yes and No buttons by default
     */
    createYesAndNoButtons() {
        this.yesButton = this.createButton('emblem-ok-symbolic');
        this.noButton = this.createButton('edit-undo-symbolic');
        this.yesButton.add_style_class_name('confirm-before-operate');
        this.noButton.add_style_class_name('confirm-before-operate');
        this.yesButton.hide();
        this.noButton.hide();
    }

    showYesAndNoButtons() {
        this.yesButton.show();
        this.noButton.show();
    }

    hideYesAndNoButtons() {
        this.yesButton.hide();
        this.noButton.hide();
    }

    createButton(iconSymbolic) {
        const button = new Button({
            icon_symbolic: iconSymbolic,
            button_style_class: 'button-item',
        }).button;
        return button;
    }

    createTimeLine() {
        // Set actor when using
        const timeline = new Clutter.Timeline({
            // 1.5s
            duration: 1500,
            repeat_count: 0,
        });
        return timeline;
    }

    // Add the icon description. Only once icon may be too weird?
    addIconDescription(iconDescription) {
        this.iconDescriptionLabel = new St.Label({
            text: iconDescription
        });
        this.actor.add_child(this.iconDescriptionLabel);
    }

});

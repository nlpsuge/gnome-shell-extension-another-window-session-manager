'use strict';

const { Meta } = imports.gi;

function isDialog(metaWindow) {
    const dialogTypes = [
        Meta.WindowType.DIALOG,
        Meta.WindowType.MODAL_DIALOG,
    ];
    const winType = metaWindow.get_window_type();
    return dialogTypes.includes(winType) &&
        metaWindow.get_transient_for() != null;
}

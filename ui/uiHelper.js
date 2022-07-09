'use strict';

const { Meta } = imports.gi;

function isDialog(metaWindow) {
    const dialogTypes = [
        // 3
        Meta.WindowType.DIALOG,
        // 4
        Meta.WindowType.MODAL_DIALOG,
    ];
    const winType = metaWindow.get_window_type();
    return dialogTypes.includes(winType) &&
        metaWindow.get_transient_for() != null;
}

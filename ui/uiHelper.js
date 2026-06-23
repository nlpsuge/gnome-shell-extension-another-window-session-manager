'use strict';

import Meta from 'gi://Meta';


export function isDialog(metaWindow) {
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

export function ignoreWindows(metaWindow) {
    if (isDialog(metaWindow)) {
        return true;
    }

    // The override-redirect windows is invisible to the users,
    // and the workspace index is -1 and don't have proper x, y, width, height.
    // See also:
    // https://gjs-docs.gnome.org/meta9~9_api/meta.window#method-is_override_redirect
    // https://wiki.tcl-lang.org/page/wm+overrideredirect
    // https://docs.oracle.com/cd/E36784_01/html/E36843/windowapi-3.html
    // https://stackoverflow.com/questions/38162932/what-does-overrideredirect-do
    // https://ml.cddddr.org/cl-windows/msg00166.html
    if (metaWindow.is_override_redirect()) {
        return true;
    }
       
    return false;
}
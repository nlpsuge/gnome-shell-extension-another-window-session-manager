'use strict';

import Meta from 'gi://Meta';

// Close still uses these. A Wayland dialog is often NORMAL, so this list
// alone is not enough to decide what always-place may touch.
const DIALOG_WINDOW_TYPES = [
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
];

// Accessory toplevels. Parent is the Wayland signal; type is the X11 one.
const CHILD_WINDOW_TYPES = [
    ...DIALOG_WINDOW_TYPES,
    Meta.WindowType.UTILITY,
    Meta.WindowType.MENU,
    Meta.WindowType.SPLASHSCREEN,
];

export function isDialog(metaWindow) {
    return DIALOG_WINDOW_TYPES.includes(metaWindow.get_window_type()) &&
        metaWindow.get_transient_for() != null;
}

function isChildWindow(metaWindow) {
    if (metaWindow.get_transient_for() != null) {
        return true;
    }
    return CHILD_WINDOW_TYPES.includes(metaWindow.get_window_type());
}

export function ignoreWindows(metaWindow) {
    if (isChildWindow(metaWindow)) {
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

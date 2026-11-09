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

// Human-readable names for Meta.WindowType values, for the temporary
// always-place debug line. Index must equal the enum value.
const WINDOW_TYPE_NAMES = [
    'NORMAL',
    'DESKTOP',
    'DOCK',
    'DIALOG',
    'MODAL_DIALOG',
    'TOOLBAR',
    'MENU',
    'UTILITY',
    'SPLASHSCREEN',
    'DROPDOWN_MENU',
    'POPUP_MENU',
    'TOOLTIP',
    'NOTIFICATION',
    'COMBO',
    'DND',
    'OVERRIDE_OTHER',
];


function safeCall(fn, fallback) {
    try {
        const value = fn();
        return value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

function windowTypeName(type) {
    return WINDOW_TYPE_NAMES[type] ?? `UNKNOWN(${type})`;
}

// TEMP DEBUG: single-line dump of everything that could tell a transient
// Find dialog apart from a second toplevel like Chrome DevTools. Every
// accessor is guarded: Meta.Window API varies by shell version and a throw
// here must never take the extension to State: ERROR.
export function describeWindowForPlaceDebug(metaWindow, windowTracker) {
    if (!metaWindow) {
        return 'metaWindow=null';
    }
    const title = safeCall(() => metaWindow.get_title(), 'n/a');
    const wmClass = safeCall(() => metaWindow.get_wm_class(), 'n/a');
    const wmInstance = safeCall(() => metaWindow.get_wm_class_instance(), 'n/a');
    const type = safeCall(() => metaWindow.get_window_type(), -1);
    const transientFor = safeCall(() => metaWindow.get_transient_for(), null);
    const parentTitle = transientFor
        ? safeCall(() => transientFor.get_title(), 'n/a')
        : null;
    const parentClass = transientFor
        ? safeCall(() => transientFor.get_wm_class(), 'n/a')
        : null;
    const parentType = transientFor
        ? safeCall(() => transientFor.get_window_type(), -1)
        : -1;
    let appId = 'n/a';
    let appName = 'n/a';
    if (windowTracker) {
        const app = safeCall(() => windowTracker.get_window_app(metaWindow), null);
        if (app) {
            appId = safeCall(() => app.get_id(), 'n/a');
            appName = safeCall(() => app.get_name(), 'n/a');
        }
    }
    const parts = [
        `title='${title}'`,
        `app='${appName}'`,
        `appId='${appId}'`,
        `wm_class='${wmClass}'`,
        `wm_instance='${wmInstance}'`,
        `type=${windowTypeName(type)}(${type})`,
        transientFor
            ? `transient_for=title='${parentTitle}' class='${parentClass}' type=${windowTypeName(parentType)}(${parentType})`
            : 'transient_for=null',
        `dialog=${safeCall(() => metaWindow.is_dialog(), 'n/a')}`,
        `modal=${safeCall(() => metaWindow.is_modal(), 'n/a')}`,
        `attached=${safeCall(() => metaWindow.is_attached_dialog(), 'n/a')}`,
        `skip_taskbar=${safeCall(() => metaWindow.is_skip_taskbar(), 'n/a')}`,
        `override_redirect=${safeCall(() => metaWindow.is_override_redirect(), 'n/a')}`,
        `role='${safeCall(() => metaWindow.get_role(), 'n/a')}'`,
        `desc='${safeCall(() => metaWindow.get_description(), 'n/a')}'`,
        `client_type=${safeCall(() => metaWindow.get_client_type(), 'n/a')}`,
        `pid=${safeCall(() => metaWindow.get_pid(), 'n/a')}`,
        `id=${safeCall(() => metaWindow.get_id(), 'n/a')}`,
        `monitor=${safeCall(() => metaWindow.get_monitor(), 'n/a')}`,
        `workspace=${safeCall(() => metaWindow.get_workspace()?.index(), 'n/a')}`,
    ];
    return parts.join(' ');
}


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

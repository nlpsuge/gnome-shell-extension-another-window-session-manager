'use strict';

const { Meta } = imports.gi;


/**
 * Get the stable window id, don't change even after gnome shell is restarted
 * 
 * On X11, return xid; On Wayland, return id
 * 
 * @returns stable window id
 */
var getStableWindowId = function(metaWindow) {
    return Meta.is_wayland_compositor() ? metaWindow.get_id() : metaWindow.get_description();
}
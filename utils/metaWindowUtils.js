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

var isSurfaceActor = function(clutterActor) {
    const className = clutterActor.constructor.$gtype.name;
    // Excepted MetaSurfaceActorX11 and MetaSurfaceActorWayland on X11 and Wayland, respectively
    return className.startsWith('MetaSurfaceActor');
}
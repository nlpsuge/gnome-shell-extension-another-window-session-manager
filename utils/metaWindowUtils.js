function __awsmIsWayland() {
    if (typeof Meta.is_wayland_compositor === 'function')
        return __awsmIsWayland();
    return global.context.get_wayland_compositor() !== null;
}
'use strict';

import Meta from 'gi://Meta';


/**
 * Get the stable window id, don't change even after gnome shell is restarted
 * 
 * On X11, return xid; On Wayland, return id
 * 
 * @returns stable window id
 */
export const getStableWindowId = function(metaWindow) {
    return __awsmIsWayland() ? metaWindow.get_id() : metaWindow.get_description();
}

export const isSurfaceActor = function(clutterActor) {
    const className = clutterActor.constructor.$gtype.name;
    // Excepted MetaSurfaceActorX11 and MetaSurfaceActorWayland on X11 and Wayland, respectively
    return className.startsWith('MetaSurfaceActor');
}
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

// TODO inspect.js Shell.AppSystem.get_default().get_running().forEach(a => a.get_windows().forEach(w => {log(w.get_title() + ' ' + w.get_compositor_private() + ' ' + w.get_compositor_private().get_first_child().get_parent().get_meta_window().get_title())}))
// Translated from src/compositor/meta-window-actor.c -> meta_window_actor_from_actor
var getMetaWindowActor = function(clutterActor){
    const className = clutterActor.constructor.$gtype.name;
    if (isSurfaceActor(clutterActor))
        return null;

    do {
        clutterActor = clutterActor.get_parent();

        if (clutterActor instanceof Meta.WindowActor)
            return clutterActor;
    } while (clutterActor != null);

    return null;
}

var isSurfaceActor = function(clutterActor) {
    const className = clutterActor.constructor.$gtype.name;
    // Excepted MetaSurfaceActorX11 and MetaSurfaceActorWayland on X11 and Wayland, respectively
    return className.startsWith('MetaSurfaceActor');
}
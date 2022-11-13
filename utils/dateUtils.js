'use strict';

const { GLib } = imports.gi;

/**
 * Get the current timestamp through `global.get_current_time()`, but it might return 0,
 * which is not a valid value for some function such as `metaWindow.delete(timestamp)`, 
 * will get a warning if pass 0 to it.
 * 
 * The doc states "If called from outside an event handler, this may return 
 * %Clutter.CURRENT_TIME (aka 0), or it may return a slightly out-of-date timestamp." 
 * 
 * If so we use `global.display.get_current_time_roundtrip()` to get a valid timestamp.
 * 
 * On Wayland, `global.display.get_current_time_roundtrip()` also uses 
 * `Number.parseInt(GLib.get_monotonic_time() / 1000)` to get the current timestamp.
 * 
 * @returns guint32 type timestamp, in milliseconds, for example 751764
 */
var get_current_time = function() {
    return global.get_current_time() || global.display.get_current_time_roundtrip();
}

var getRealTime = function(window) {
    // In milliseconds
    const elapsedTime = get_current_time() - window.get_user_time();
    // In seconds
    const realUserTimestamp = (GLib.get_real_time() / 1000 - elapsedTime) / 1000;
    const realUserTime = GLib.DateTime.new_from_unix_local(realUserTimestamp).format('%Y-%m-%d %T')
    return realUserTime;
}

const { Gio, GLib } = imports.gi

const default_sessionName = 'defaultSession';
const home_dir = GLib.get_home_dir();
const config_path_base = GLib.build_filenamev([home_dir, '.config', 'xsession-manager']);
const sessions_path = GLib.build_filenamev([config_path_base, 'sessions']);

function get_sessions_path() {
    return sessions_path;
}


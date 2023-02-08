'use strict';

class WindowState {
    // If always on visible workspace
    is_sticky; // bool
    // If always on top
    is_above; // bool

    // Additional fields

    // https://gjs-docs.gnome.org/meta9~9_api/meta.window#method-get_maximized
    // 0: Not in the maximization mode
    // 1: Horizontal - Meta.MaximizeFlags.HORIZONTAL
    // 2: Vertical - Meta.MaximizeFlags.VERTICAL
    // 3. Both - Meta.MaximizeFlags.BOTH
    meta_maximized;
}

class WindowPosition {  
    provider; // str
    x_offset; // int
    y_offset; // int
    width; // int
    height; // int
}

class WindowTilingFor {
    app_name; // str
    // the .desktop file name
    desktop_file_id; // str
    // The full .desktop file path
    desktop_file_id_full_path; // str
    window_title; // str
}

class WindowTiling {
    window_tile_for = new WindowTilingFor(); // WindowTilingFor
}

var SessionConfigObject = class {

    window_id; // str, hexadecimal on X11, int on Wayland
    desktop_number; // int
    pid; // int
    username; // str
    window_position = new WindowPosition(); // WindowPosition
    client_machine_name; // str
    window_title; // str

    app_name; // str
    wm_class; // str
    wm_class_instance; // str

    cmd; // list
    process_create_time; // str

    window_state = new WindowState(); // WindowState
    
    windows_count; // int
    
    cpu_percent; // float
    memory_percent; // float

    // Additional fields

    // the .desktop file name
    desktop_file_id; // str
    // The full .desktop file path
    desktop_file_id_full_path; // str
    // The index of the monitor that this window is on.
    monitor_number;
    // TODO Primary monitor can be changed, what if the primary monitor have been changed when restoring apps? The monitor number is the same as saved monitor_number?
    is_on_primary_monitor;

    fullscreen; // boolean
    minimized; // boolean

    window_tiling; // WindowTiling

    is_focused; // boolean, whether is the currently active window

    compositor_type; // string. X11, Wayland
}

var SessionConfig = class {
    session_name; // str
    session_create_time; // str
    backup_time; // str
    restore_times; // list = []
    active_workspace_index; // int
    // TODO 
    // https://gjs-docs.gnome.org/meta9~9_api/meta.workspace#method-activate_with_focus
    // https://gjs-docs.gnome.org/meta9~9_api/meta.window#method-activate
    focused_window; // SessionConfigObject or SessionConfigObject.window_id?
    windows_count; // int
    x_session_config_objects = []; // list[SessionConfigObject]


    /**
     * Sort session_config_objects by desktop number
     * 
     */
    sort() {
        let x_session_config_objects_copy = this.x_session_config_objects.slice();
        x_session_config_objects_copy.sort((o1, o2) => {
            const desktop_number1 = o1.desktop_number;
            const desktop_number2 = o2.desktop_number;

            const diff = desktop_number1 - desktop_number2;
            if (diff === 0) {
                return 0;
            }

            if (diff > 0) {
                return 1;
            }

            if (diff < 0) {
                return -1;
            }

        });
        return x_session_config_objects_copy;
    }
}
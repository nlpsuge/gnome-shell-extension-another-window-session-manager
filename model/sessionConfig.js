'use strict';

class WindowState {
    // If always on visible workspace
    is_sticky; // bool
    // If always on top
    is_above; // bool
}

class WindowPosition {  
    provider; // str
    x_offset; // int
    y_offset; // int
    width; // int
    height; // int
}

var SessionConfigObject = class {

    window_id; // str, hexadecimal
    window_id_the_int_type; // int
    desktop_number; // int
    pid; // int
    username; // str
    window_position = new WindowPosition(); // WindowPosition
    client_machine_name; // str
    window_title; // str

    app_name; // str
    cmd; // list
    process_create_time; // str

    window_state = new WindowState(); // WindowState
    
    windows_count; // int
    
    cpu_percent; // float
    memory_percent; // float

    // Additional fields

    desktop_file_id; // str
}

var SessionConfig = class {
    session_name; // str
    session_create_time; // str
    backup_time; // str
    restore_times; // list = []
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
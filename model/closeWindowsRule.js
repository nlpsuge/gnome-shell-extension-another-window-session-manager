
var CloseWindowsRule = class {

    type; // string, rule type, such as 'shortcut'
    value; // GdkShortcuts, order and the rule pairs, such as "{1: 'Ctrl+Q}'".
    appId; // string, such as 'firefox.desktop'
    appName; // string, such as 'Firefox'
    appDesktopFilePath; // string, such as '/usr/share/applications/firefox.desktop'
    enabled; // boolean
    keyDelay; // int, for example: `enabydotool key --key-delay 500 29:1 16:1 16:0 29:0`
}

/**
* See: https://gitlab.gnome.org/GNOME/gtk/blob/d726ecdb5d1ece870585c7be89eb6355b2482544/gdk/gdkenums.h:L73
* See: https://gitlab.gnome.org/GNOME/gtk/blob/1ce79b29e363e585872901424d3b72041b55e3e4/gtk/gtkeventcontrollerkey.c:L203
*/
var GdkShortcuts = class {
    /**
     * For example: Ctrl+Q
     */
    shortcut;
    order;
    /**
     * the pressed key.
     */
    keyval;
    /**
     * the raw code of the pressed key.
     */
    keycode;
    /**
     * the bitmask, representing the state of modifier keys and pointer buttons. See `GdkModifierType` in Gtk source.
     */
    state;
    /**
     * Indicate the right Ctrl key was pressed
     */
    controlRightPressed;
    /**
     * Indicate the right Shift key was pressed
     */
    shiftRightPressed;
}
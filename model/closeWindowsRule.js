'use strict';

const { GObject } = imports.gi;


var CloseWindowsWhitelist = GObject.registerClass({
}, class CloseWindowsWhitelist extends GObject.Object {
    id; // int. just like the id in MySQL. Used to update or delete rows.
    name; // string. Can be any string
    compareWith; // string. title, wm_class, wm_class_instance, app_name...
    method; // string. equals
    enabled; // boolean
    enableWhenCloseWindows; // boolean
    enableWhenLogout; // boolean

    static new(param) {
        return Object.assign(new CloseWindowsWhitelist(), param);
    }
});

var CloseWindowsRuleBase = class {
    category; // string. Applications, Keywords
    type; // string, rule type, such as 'shortcut'
    value; // GdkShortcuts, order and the rule pairs, such as "{1: 'Ctrl+Q}'".
    // wm_class; // string
    // wm_class_instance; // string
    enabled; // boolean
    keyDelay; // int, for example: `enabydotool key --key-delay 500 29:1 16:1 16:0 29:0`
} 

var CloseWindowsRuleByKeyword = class extends CloseWindowsRuleBase {
    id; // int. just like the id in MySQL. Used to update or delete rows.
    keyword; // string. Can be any string
    compareWith; // string. title, wm_class, wm_class_instance, app_name...
    // enableRegex; // int. 0, 1
    method; // string. endsWith, includes, startsWith, equals, regex. 

    static new(param) {
        return Object.assign(new CloseWindowsRuleByKeyword(), param);
    }
}

var CloseWindowsRuleByApp = class extends CloseWindowsRuleBase {
    appId; // string, such as 'firefox.desktop'
    appDesktopFilePath; // string, such as '/usr/share/applications/firefox.desktop'
    appName; // string, such as 'Firefox'

    static new(param) {
        return Object.assign(new CloseWindowsRuleByApp(), param);
    }
}

/**
* See: https://gitlab.gnome.org/GNOME/gtk/blob/d726ecdb5d1ece870585c7be89eb6355b2482544/gdk/gdkenums.h:L73
* See: https://gitlab.gnome.org/GNOME/gtk/blob/1ce79b29e363e585872901424d3b72041b55e3e4/gtk/gtkeventcontrollerkey.c:L203
*/
var GdkShortcuts = GObject.registerClass({
}, class GdkShortcuts extends GObject.Object{
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

    static new(param) {
        return Object.assign(new GdkShortcuts(), param);
    }
});
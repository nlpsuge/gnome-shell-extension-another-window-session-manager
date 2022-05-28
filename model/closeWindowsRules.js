
var CloseWindowsRules = class {

    type; // string, rule type, such as 'shortcut'
    value; // object, order and the rule pairs, such as "{1: 'Ctrl+Q}'"
    appId; // string, such as 'firefox.desktop'
    appName; // string, such as 'Firefox'
    appDesktopFilePath; // string, such as '/usr/share/applications/firefox.desktop'
    enabled; // boolean
}

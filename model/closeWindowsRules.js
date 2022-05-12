
var CloseWindowsRules = class {

    type; // string, rule type, such as 'shortcut'
    value; // string, the rule, such as 'Ctrl+Q' (TODO, string may not suitable)
    appId; // string, such as 'firefox.desktop'
    appName; // string, such as 'Firefox'
    appDesktopFilePath; // string, such as '/usr/share/applications/firefox.desktop'
    enabled; // boolean
}

let Config;
try {
    Config = await import('resource:///org/gnome/shell/misc/config.js');
} catch (e) {
    Config = await import('resource:///org/gnome/Shell/Extensions/js/misc/config.js');
}

// '41.beta' => 41
// '41.4' => 41.4
// '3.38.beta' => 3.38
const GNOME_VERSION = parseFloat(Config.PACKAGE_VERSION);


export function isLessThan44() {
    return GNOME_VERSION < 44;
}

export function isLessThan43() {
    return GNOME_VERSION < 43;
}

export function isLessThan42() {
    return GNOME_VERSION < 42;
}

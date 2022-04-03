const Config = imports.misc.config; 

const GNOME_VERSION = Config.PACKAGE_VERSION;


function isOlderThan42() {
    return GNOME_VERSION < '42';
}



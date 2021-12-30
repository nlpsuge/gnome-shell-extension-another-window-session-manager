'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PrefsUtils = Me.imports.utils.prefsUtils;


const _prefsUtils = new PrefsUtils.PrefsUtils();

function debug(logContent) {
    if (_prefsUtils.isDebug()) {
        log(`[Another window session manager] ${logContent}`);
    }
}

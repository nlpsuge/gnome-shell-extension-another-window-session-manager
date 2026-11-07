'use strict';

// Shell-only. The preferences process does not register resource:///org/gnome/shell/.
// prefs.js must not import this module.
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

export const shellVersion = parseFloat(Config.PACKAGE_VERSION);

'use strict'

/**
 * Format string like this and fill variables in ${} with real data:
 * 
 * Name=${appName} Comment=${appName} Type=Application Exec=${commandLine} Icon=${icon}
 * 
 * @see _testFill()
 */
if (!String.prototype.fill) {
  String.prototype.fill = function() {
    const length = arguments.length;
    if (length !== 1) {
      throw(new Error(`Wrong arguments number, expect 1, but receive ${length}`));
    }

    const obj = arguments[0];
    if (typeof obj !== 'object') {
      throw(new Error('Wrong arguments, only supports object'));
    }

    let thisString = this;
    for (const key in obj) {
        thisString = thisString.replaceAll("${" + key + "}", obj[key])
    }
    return thisString
  };
}

// test
// gjs utils/string.js
// _testFill();
function _testFill() {
    let str = 'Name=${appName} Comment=${appName} Type=Application Exec=${commandLine} Icon=${icon}';
    // let str = '';
    const strNew = str.fill({
        appName: 'Anki',
        commandLine: 'anki --no-sandbox -b /tmp/anki-tmp',
        icon:''
    });
    log(str);
    log(strNew);
}






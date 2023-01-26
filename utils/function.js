'use strict';


var callFunc = function (thisObj, func, param) {
    try {
        if (!(param instanceof Array)) {
            return func.call(thisObj, param);
        }
        return func.call(thisObj, ...param);
    } catch (error) {
        logError(error);
    }
}

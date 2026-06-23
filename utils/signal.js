import GObject from 'gi://GObject';


export const Signal = class {

    constructor() {

    }

    /**
     * Disconnect signal from an object without the below error / warning in `journalctl`:
     * 
     * ../gobject/gsignal.c:2732: instance '0x55629xxxxxx' has no handler with id '11000'
     */
    disconnectSafely(obj, signalId) {
        if (!signalId) {
            return;
        }

        // https://gjs-docs.gnome.org/gobject20~2.66p/gobject.signal_handler_find
        // Fix ../gobject/gsignal.c:2732: instance '0x55629xxxxxx' has no handler with id '11000' in some case, see two callers for more info 
        const matchedId = GObject.signal_handler_find(
            obj, // GObject.Object
            GObject.SignalMatchType.ID, 
            signalId,
            null, null, null, null);
        if (matchedId) {
            obj.disconnect(signalId);
        }
    }

}

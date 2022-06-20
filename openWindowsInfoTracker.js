'use strict';

const { Shell, Meta, Gio, GLib } = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;
const PrefsUtils = Me.imports.utils.prefsUtils;

var OpenWindowsInfoTracker = class {

    constructor() {
        this._windowTracker = Shell.WindowTracker.get_default();
        this._defaultAppSystem = Shell.AppSystem.get_default();

        this._log = new Log.Log();
        this._prefsUtils = new PrefsUtils.PrefsUtils();
        this._settings = this._prefsUtils.getSettings();

        const SystemdLoginManagerIface = ByteArray.toString(
            Me.dir.get_child('dbus-interfaces').get_child('org.freedesktop.login1.Manager.xml').load_contents(null)[1]);
        const SystemdLoginManager = Gio.DBusProxy.makeProxyWrapper(SystemdLoginManagerIface);
        this._proxy = new SystemdLoginManager(Gio.DBus.system,
                                              'org.freedesktop.login1',
                                              '/org/freedesktop/login1');
        this._proxy.connectSignal('UserNew', this._userNew.bind(this));
        this._proxy.connectSignal('UserRemoved', this._userRemove.bind(this));
        this._proxy.connectSignal('PrepareForShutdown', this._prepareForShutdown.bind(this));

        this._display = global.display;
        this._displayId = this._display.connect('window-created', this._windowCreated.bind(this));
              
    }

    _userNew(proxy, sender, [uid, object_path]) {
        log('_userNew');
        log(uid);
        log(object_path);
    }

    _userRemove(proxy, sender, [uid, object_path]) {
        log('_userRemove');
        log(uid);
        log(object_path);
    }

    _prepareForShutdown(proxy, sender, [aboutToShutdown]) {
        log(`Cleaning windows-mapping before shutdown or reboot. ${aboutToShutdown}`);
        this._settings.set_string('windows-mapping', '{}');
    }

    async inhibit(reason, cancellable) {
        log('inhibit ddd')
        const inVariant = new GLib.Variant('(ssss)',
            ['sleep', 'GNOME Shell ex', reason, 'delay']);
        const [outVariant_, fdList] =
            await this._proxy.call_with_unix_fd_list('Inhibit',
                inVariant, 0, -1, null, cancellable);
        const [fd] = fdList.steal_fds();
        return new Gio.UnixInputStream({ fd });
    }
    
    _windowCreated(display, metaWindow, userData) {
        const shellApp = this._windowTracker.get_window_app(metaWindow);
        if (!shellApp) {
            return;
        }

        const app_info = shellApp.get_app_info();
        if (!app_info) {
            return;
        }
        
        const xid = metaWindow.get_description();
        const windowStableSequence = metaWindow.get_stable_sequence();
        const savedWindowsMappingJsonStr = this._settings.get_string('windows-mapping');
        let savedWindowsMapping;
        if (savedWindowsMappingJsonStr === '{}') {
            savedWindowsMapping = new Map();
        } else {
            savedWindowsMapping = new Map(JSON.parse(savedWindowsMappingJsonStr));
        }
        const desktopFullPath = app_info.get_filename();
        let xidObj = savedWindowsMapping.get(desktopFullPath);
        if (xidObj && !xidObj[xid]) {
            xidObj[xid] = {
                windowTitle: metaWindow.get_title(),
                xid: xid,
                windowStableSequence: windowStableSequence
            };
        } else {
            if (!xidObj) {
                xidObj = {};
            }
            xidObj[xid] = {
                windowTitle: metaWindow.get_title(),
                xid: xid,
                windowStableSequence: windowStableSequence
            };
            savedWindowsMapping.set(desktopFullPath, xidObj);
        }

        const newSavedWindowsMappingJsonStr = JSON.stringify(Array.from(savedWindowsMapping.entries()));
        this._settings.set_string('windows-mapping', newSavedWindowsMappingJsonStr);
        Gio.Settings.sync();
    }

    destroy() {
        if (this._displayId) {
            this._display.disconnect(this._displayId);
            this._displayId = 0;
        }
        
        if (this._metaRestartId) {
            this._display.disconnect(this._metaRestartId);
            this._metaRestartId = 0;
        }

    }

}

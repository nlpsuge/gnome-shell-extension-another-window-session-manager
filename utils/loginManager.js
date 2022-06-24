

var LoginManager = class {

    constructor() {
        const SystemdLoginManagerIface = ByteArray.toString(
            Me.dir.get_child('dbus-interfaces').get_child('org.freedesktop.login1.Manager.xml').load_contents(null)[1]);
        const SystemdLoginManager = Gio.DBusProxy.makeProxyWrapper(SystemdLoginManagerIface);
        this._proxy = new SystemdLoginManager(Gio.DBus.system,
                                              'org.freedesktop.login1',
                                              '/org/freedesktop/login1');
        this._proxy.connectSignal('SeatNew', this._userNew.bind(this));
        this._proxy.connectSignal('UserRemoved', this._userRemove.bind(this));
        this._proxy.connectSignal('SessionRemoved', this._sessionRemoved.bind(this));
        this._proxy.connectSignal('PrepareForShutdown', this._prepareForShutdown.bind(this));
    }

    _userNew(proxy, sender, [uid, object_path]) {
        log('_userNew');
        log(uid);
        log(object_path);
    }

    _sessionRemoved(proxy, sender, [session_id, object_path]) {
        log('_sessionRemoved');
        log(session_id);
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

    inhibit(reason) {
        log('inhibit ddd')
        const inVariant = new GLib.Variant('(ssss)',
            ['shutdown', 'gnome-shell-extension-another-window-session-manager', reason, 'delay']);
        // See: https://gjs-docs.gnome.org/gio20~2.66p/gio.dbusproxy#method-call_with_unix_fd_list_sync
        const [outVariant_, fdList] =
            this._proxy.call_with_unix_fd_list_sync('Inhibit',
                inVariant,  Gio.DBusCallFlags.NONE, -1, null, null);
        const [fd] = fdList.steal_fds();
        return new Gio.UnixInputStream({ fd });
    }

}
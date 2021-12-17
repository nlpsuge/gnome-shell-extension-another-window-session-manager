const Gio = imports.gi.Gio;

var Subprocess = class Subprocess {

    constructor() {
        this.launcher = new Gio.SubprocessLauncher({
            flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE)});
    }

    run_cmd() {
        
    }


}
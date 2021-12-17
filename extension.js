const { Shell, Gio } = imports.gi;

let windowTracker;
let defaultAppSystem;
let subprocessLauncher;

function enable() {
    windowTracker = Shell.WindowTracker.get_default();
    subprocessLauncher = new Gio.SubprocessLauncher({
        flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE)});
    defaultAppSystem = Shell.AppSystem.get_default();
    const running_shell_apps = defaultAppSystem.get_running();
    for (const running_shell_app of running_shell_apps) {
        const desktop_file_id = running_shell_app.get_id();
        log(desktop_file_id);
        const desktop_app_info = running_shell_app.get_app_info();
        const desktop_app_info_commandline = desktop_app_info.get_commandline();
        log(desktop_app_info_commandline);
        const meta_windows = running_shell_app.get_windows();
        for (const meta_window of meta_windows) {
            const pid = meta_window.get_pid();
            const proc = subprocessLauncher.spawnv(['ps', '--no-headers', '-p', `${pid}`, '-o', 'command']);
            proc.communicate_utf8_async(null, null, (proc, asyncResult) => {
                try {
                    let [, cmd_line, stderr] = proc.communicate_utf8_finish(asyncResult);
                    let status = proc.get_exit_status();
                    if (status === 0 && cmd_line) {
                        cmd_line = cmd_line.trim();
                        log(`Got cmd line ${cmd_line} by ${pid} via ps`);
                    } else {
                        log(`Failed to query process ${pid} info via ps. status: ${status}, cmd_line: ${cmd_line}`);   
                    }
                } catch (e) {
                    logError(e, `Failed to query process ${pid} info via ps`);
                }

            });
        }
    }

}

function disable() {
    if (windowTracker) {
        windowTracker = null;
    }
    if (defaultAppSystem) {
        defaultAppSystem = null;
    }
}

function init() {

}
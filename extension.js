const { Shell, Gio, GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SessionConfig = Me.imports.model.sessionConfig;

let windowTracker;
let defaultAppSystem;
let subprocessLauncher;

function enable() {
    windowTracker = Shell.WindowTracker.get_default();
    subprocessLauncher = new Gio.SubprocessLauncher({
        flags: (Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE)});
    defaultAppSystem = Shell.AppSystem.get_default();
    const runningShellApps = defaultAppSystem.get_running();
    for (const runningShellApp of runningShellApps) {
        const desktopFileId = runningShellApp.get_id();
        log(desktopFileId);
        const desktopAppInfo = runningShellApp.get_app_info();
        const desktopAppInfoCommandline = desktopAppInfo?.get_commandline();
        log(desktopAppInfoCommandline);

        const sessionConfig = new SessionConfig.SessionConfig();
        sessionConfig.session_name = 'defaultSession';
        sessionConfig.session_create_time = new Date().toLocaleString();

        const appName = runningShellApp.get_name();
        // TODO Not reliable, the result can be wrong?
        const n_windows = runningShellApp.get_n_windows();

        const metaWindows = runningShellApp.get_windows();
        for (const metaWindow of metaWindows) {
            // TODO pid is 0 if not known 
            // get_sandboxed_app_id() Gets an unique id for a sandboxed app (currently flatpaks and snaps are supported).
            const pid = metaWindow.get_pid();
            const input_cmd = ['ps', '--no-headers', '-p', `${pid}`, '-o', 'lstart,%cpu,%mem,command'];
            const proc = subprocessLauncher.spawnv(input_cmd);
            proc.communicate_utf8_async(null, null, (proc, asyncResult) => {
                try {
                    let [, stdout, stderr] = proc.communicate_utf8_finish(asyncResult);
                    let status = proc.get_exit_status();
                    if (status === 0 && stdout) {
                        stdout = stdout.trim();
                        log(`Got stdout ${stdout} by ${pid} via ${input_cmd}`);
                        const sessionConfigObject = new SessionConfig.SessionConfigObject();
                        const stdoutArr = stdout.split(' ').filter(a => a);
                        sessionConfigObject.process_create_time = stdoutArr.slice(0, 5).join(' ');
                        sessionConfigObject.cpu_percent = stdoutArr.slice(5, 6).join();
                        sessionConfigObject.memory_percent = stdoutArr.slice(6, 7).join();
                        sessionConfigObject.cmd = stdoutArr.slice(7).join(' ');

                        sessionConfigObject.window_id_the_int_type = metaWindow.get_id();
                        if (metaWindow.is_always_on_all_workspaces()) {
                            sessionConfigObject.desktop_number = -1;
                        } else {
                            const workspace = metaWindow.get_workspace();
                            sessionConfigObject.desktop_number = workspace.index();
                        }
                        sessionConfigObject.pid = pid;
                        sessionConfigObject.username = GLib.get_user_name();
                        const frameRect = metaWindow.get_frame_rect();
                        let window_position = sessionConfigObject.window_position;
                        window_position.provider = 'Meta';
                        window_position.x_offset = frameRect.x;
                        window_position.y_offset = frameRect.y;
                        window_position.width = frameRect.width;
                        window_position.height = frameRect.height;
                        sessionConfigObject.client_machine_name = GLib.get_host_name();
                        sessionConfigObject.window_title = metaWindow.get_title();
                        sessionConfigObject.app_name = appName;
                        sessionConfigObject.windows_count = n_windows;
                        sessionConfigObject.desktop_file_id = desktopFileId;
                        let window_state = sessionConfigObject.window_state;
                        // See: ui/windowMenu.js:L80
                        window_state.is_sticky = metaWindow.is_on_all_workspaces();
                        window_state.is_above = metaWindow.is_above();

                        sessionConfig.x_session_config_objects.push(sessionConfigObject);

                        log('sessionConfig', JSON.stringify(sessionConfig));
                    } else {
                        log(`Failed to query process ${pid} info via ps. status: ${status}, stdout: ${stdout}, stderr: ${stderr}`);   
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
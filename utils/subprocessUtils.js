'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Log = Me.imports.utils.log;

const subprocessLauncher = new Gio.SubprocessLauncher({
    flags: (Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_PIPE)});


async function getProcessInfo(apps /*ShellApp*/, ignoreWindowsCb) {
    try {
        const pidSet = new Set();
        for (const app of apps) {
            let metaWindows = app.get_windows();
            for (const metaWindow of metaWindows) {
                if (ignoreWindowsCb && ignoreWindowsCb(metaWindow)) {
                    continue;
                }
    
                const pid = metaWindow.get_pid();
                // pid is `0` if not known
                // Note that pass `0` or negative value to `ps -p` will get `error: process ID out of range`
                if (pid > 0) pidSet.add(pid);
            }
        }

        if (!pidSet.size) return;
    
        // Separated with comma
        const pids = Array.from(pidSet).join(',');
        // TODO get_sandboxed_app_id() Gets an unique id for a sandboxed app (currently flatpaks and snaps are supported).
        const psCmd = ['ps', '--no-headers', '-p', `${pids}`, '-o', 'lstart,%cpu,%mem,pid,command'];
    
        return new Promise((resolve, reject) => {
            try {
                // const proc = subprocessLauncher.spawnv(psCmd);
                let proc = Gio.Subprocess.new(
                    psCmd,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                proc.communicate_utf8_async(null, null, ((proc, res) => {
                    try {
                        const processInfoMap = new Map();
                        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                        let status = proc.get_exit_status();
                        if (status === 0 && stdout) {
                            const lines = stdout.trim();
                            for (const line of lines.split('\n')) {
                                const processInfoArray = line.split(' ').filter(a => a);
                                const pid = processInfoArray.slice(7, 8).join();
                                processInfoMap.set(Number(pid), processInfoArray);
                            }
                            return resolve(processInfoMap);
                        }
    
                        Log.Log.getDefault().error(new Error(`Failed to query process info. status: ${status}, stdout: ${stdout}, stderr: ${stderr}`));
                        resolve(processInfoMap);
                    } catch(e) {
                        Log.Log.getDefault().error(e);
                        reject(e);
                    }
                }));
            } catch (e) {
                Log.Log.getDefault().error(e);
                reject(e);
            }
            
        })
    } catch (e) {
        Log.Log.getDefault().error(e);
    }
}

// A simple asynchronous read loop
function readOutput(stream, lineBuffer) {
    stream.read_line_async(0, null, (stream, res) => {
        try {
            let line = stream.read_line_finish_utf8(res)[0];

            if (line !== null) {
                lineBuffer.push(line);
                readOutput(stream, lineBuffer);
            }
        } catch (e) {
            logError(e);
        }
    });
}

/**
 * We can get the pid after `proc.wait_finish(res)`, but note that the 
 * subprocess might exit later with failure.
 * 
 */
var trySpawnCmdstr = function(commandLineString, callBackOnSuccess, callBackOnFailure) {
    let success_, argv;

    try {
        [success_, argv] = GLib.shell_parse_argv(commandLineString);
    } catch (err) {
        // Replace "Error invoking GLib.shell_parse_argv: " with
        // something nicer
        err.message = err.message.replace(/[^:]*: /, `${_('Could not parse command:')}\n`);
        throw err;
    }

    let proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    return new Promise((resolve, reject) => {
        proc.wait_async(null, ((proc, res) => {
            try {
                let successful = proc.wait_finish(res);
                let status = proc.get_exit_status();
                let stdoutInputStream = proc.get_stdout_pipe();
                let stderrInputStream = proc.get_stderr_pipe();
                if (!(stdoutInputStream instanceof Gio.DataInputStream)) {
                    stdoutInputStream = new Gio.DataInputStream({
                        base_stream: stdoutInputStream,
                    });
                }

                if (!(stderrInputStream instanceof Gio.DataInputStream)) {
                    stderrInputStream = new Gio.DataInputStream({
                        base_stream: stderrInputStream,
                    });
                }

                resolve([status === 0, status, stdoutInputStream, stderrInputStream]);
            } catch(e) {
                Log.Log.getDefault().error(e);
                reject(e);
            }
        }));
    });
}

/**
 * Deprecated. Use `trySpawnCmdstr()` instead.
 * 
 * Since `proc.communicate_utf8_finish(res)` only returns value
 * after the subprocess (created by `commandLineString`)
 * exits, we cannot get the pid right after the subprocess launches. 
 * So there will be some kind of blocking here. 
 */
var trySpawnCmdstrWithBlocking = function(commandLineString, callBackOnSuccess, callBackOnFailure) {
    let success_, argv;

    try {
        [success_, argv] = GLib.shell_parse_argv(commandLineString);
    } catch (err) {
        // Replace "Error invoking GLib.shell_parse_argv: " with
        // something nicer
        err.message = err.message.replace(/[^:]*: /, `${_('Could not parse command:')}\n`);
        throw err;
    }

    let proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, null, ((proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let status = proc.get_exit_status();
                resolve([status === 0, status, stdout, stderr]);
            } catch(e) {
                Log.Log.getDefault().error(e);
                reject(e);
            }
        }));
    });
}

var trySpawn = async function(commandLineArray, callBackOnSuccess, callBackOnFailure) {
    try {
        return await new Promise((resolve, reject) => {
            trySpawnAsync(commandLineArray,
                (output) => {
                    if (callBackOnSuccess) {
                        callBackOnSuccess(output);
                    }
                    resolve(output);
                },
                (output, status) => {
                    if (callBackOnFailure) {
                        callBackOnFailure(output, status);
                    }
                    reject(new Error(output));
                });
        });
    } catch (e) {
        Log.Log.getDefault().error(e);
    }
}
/** 
 * Based on:
 * 1. https://gjs.guide/guides/gio/subprocesses.html#asynchronous-communication
 * 2. https://gitlab.gnome.org/GNOME/gnome-shell/blob/8fda3116f03d95fabf3fac6d082b5fa268158d00/js/misc/util.js:L111
 * 
 * This implement will return the `stderr` and `stdout` to caller via two callback 
 * `callBackOnFailure` and `callBackOnFailure`
 * 
 */
var trySpawnAsync = function(commandLineArray, callBackOnSuccess, callBackOnFailure) {
    try {
        let [, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
            // Working directory, passing %null to use the parent's
            null,
            // An array of arguments
            commandLineArray,
            // Process ENV, passing %null to use the parent's
            null,
            // Flags; we need to use PATH so `ls` can be found and also need to know
            // when the process has finished to check the output and status.
            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            // Child setup function
            () => {
                try {
                    global.context.restore_rlimit_nofile();
                } catch (err) {
                }
            }
        );

        // Any unsused streams still have to be closed explicitly, otherwise the
        // file descriptors may be left open
        GLib.close(stdin);

        // Okay, now let's get output stream for `stdout`
        let stdoutStream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({
                fd: stdout,
                close_fd: true
            }),
            close_base_stream: true
        });

        // We'll read the output asynchronously to avoid blocking the main thread
        let stdoutLines = [];
        readOutput(stdoutStream, stdoutLines);

        // We want the real error from `stderr`, so we'll have to do the same here
        let stderrStream = new Gio.DataInputStream({
            base_stream: new Gio.UnixInputStream({
                fd: stderr,
                close_fd: true
            }),
            close_base_stream: true
        });

        let stderrLines = [];
        readOutput(stderrStream, stderrLines);

        // Watch for the process to finish, being sure to set a lower priority than
        // we set for the read loop, so we get all the output
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT_IDLE, pid, (pid, status) => {
            // TODO Note that this status is usually not equal to the integer passed to `exit()`
            // See: https://gitlab.gnome.org/GNOME/glib/-/blob/5d498f4d1ce0fd124cbfb065fb2155a2e964bf5f/glib/gmain.h#L244
            if (status === 0) {
                if (callBackOnSuccess) {
                    callBackOnSuccess(stdoutLines.join('\n'));
                }
            } else {
                if (callBackOnFailure) {
                    callBackOnFailure(stderrLines.join('\n'));
                }
            }

            // Ensure we close the remaining streams and process
            stdoutStream.close(null);
            stderrStream.close(null);
            GLib.spawn_close_pid(pid);

        });
    } catch (e) {
        logError(e);
    }
}


/**
 * Execute a command asynchronously and check the exit status.
 *
 * If given, @cancellable can be used to stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {Promise<boolean>} - The process success
 */
 async function execCheck(argv, cancellable = null) {
    let cancelId = 0;
    let proc = new Gio.Subprocess({
        argv: argv,
        flags: Gio.SubprocessFlags.NONE
    });
    proc.init(cancellable);

    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => proc.force_exit());
    }

    return new Promise((resolve, reject) => {
        proc.wait_check_async(null, (proc, res) => {
            try {
                if (!proc.wait_check_finish(res)) {
                    let status = proc.get_exit_status();

                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: GLib.strerror(status)
                    });
                }

                resolve();
            } catch (e) {
                reject(e);
            } finally {
                if (cancelId > 0) {
                    cancellable.disconnect(cancelId);
                }
            }
        });
    });
}


'use strict';

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

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

// Based on:
// 1. https://gjs.guide/guides/gio/subprocesses.html#asynchronous-communication
// 2. https://gitlab.gnome.org/GNOME/gnome-shell/blob/8fda3116f03d95fabf3fac6d082b5fa268158d00/js/misc/util.js:L111
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


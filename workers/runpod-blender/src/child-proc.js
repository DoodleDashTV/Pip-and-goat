/**
 * Instrumented child-process runner for blender / ffmpeg / ffprobe.
 *
 * Captures a bounded, secret-redacted diagnostic for every external process:
 * command, redacted argv, spawn timestamp, PID, exit code, terminating signal,
 * wall-clock runtime, and bounded stdout/stderr tails (so a hung or crashing
 * child never balloons the logs and never leaks credentials).
 */
const { spawnSync } = require('node:child_process');

const DEFAULT_MAX_CAPTURE = 8_000; // chars per stream kept in the diagnostic

function redactArgs(args) {
  return (args || []).map((a) =>
    String(a)
      .replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]')
      .replace(/(secretaccesskey|accesskeyid|password)=[^\s]+/gi, '$1=[REDACTED]'),
  );
}

function tail(text, max = DEFAULT_MAX_CAPTURE) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `...[${s.length - max} chars truncated]...` + s.slice(s.length - max);
}

/**
 * Run a child process synchronously with full diagnostics.
 *
 * @returns {{ status:number|null, signal:string|null, stdout:string, stderr:string,
 *            diagnostic: object }}
 */
function runInstrumented(bin, args = [], opts = {}) {
  const maxCapture = opts.maxCapture ?? DEFAULT_MAX_CAPTURE;
  const startedAt = Date.now();
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: opts.timeout,
    maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
    ...opts,
  });
  const runtimeMs = Date.now() - startedAt;
  const timedOut = res.error && (res.error.code === 'ETIMEDOUT' || res.signal === 'SIGTERM' && Boolean(opts.timeout));
  const diagnostic = {
    command: bin,
    args: redactArgs(args),
    spawnedAt: new Date(startedAt).toISOString(),
    pid: res.pid ?? null,
    exitCode: res.status,
    signal: res.signal ?? null,
    timedOut: Boolean(timedOut),
    runtimeMs,
    stdoutTail: tail(res.stdout, maxCapture),
    stderrTail: tail(res.stderr, maxCapture),
    spawnError: res.error ? String(res.error.code || res.error.message) : null,
  };
  return {
    status: res.status,
    signal: res.signal ?? null,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
    diagnostic,
  };
}

module.exports = { runInstrumented, redactArgs, tail };

/**
 * Boot-stage diagnostics for the Runpod GPU worker.
 *
 * From the very first instruction the worker emits structured, timestamped boot
 * events so a paid-pod failure is diagnosable even when RunPod captured no
 * in-container logs (the exact situation on the two prior failed attempts). The
 * same diagnostic payload is what gets persisted to R2 as startup-status.json.
 *
 * Boot stages (see BOOT_STAGE): PROCESS_STARTED, ENV_VALIDATION_*,
 * R2_CLIENT_CREATED, MANIFEST_FETCH_*, ASSET_DOWNLOAD_*, ASSETS_READY,
 * BLENDER_PREFLIGHT_*, RENDER_STARTED.
 *
 * NEVER logs secret values.
 */
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { collectProvenance } = require('./provenance');

const BOOT_STAGE = Object.freeze({
  PROCESS_STARTED: 'PROCESS_STARTED',
  ENV_VALIDATION_START: 'ENV_VALIDATION_START',
  ENV_VALIDATION_OK: 'ENV_VALIDATION_OK',
  ENV_VALIDATION_FAILED: 'ENV_VALIDATION_FAILED',
  R2_CLIENT_CREATED: 'R2_CLIENT_CREATED',
  MANIFEST_FETCH_START: 'MANIFEST_FETCH_START',
  MANIFEST_FETCH_OK: 'MANIFEST_FETCH_OK',
  MANIFEST_FETCH_FAILED: 'MANIFEST_FETCH_FAILED',
  ASSET_DOWNLOAD_START: 'ASSET_DOWNLOAD_START',
  ASSET_DOWNLOAD_OK: 'ASSET_DOWNLOAD_OK',
  ASSET_DOWNLOAD_FAILED: 'ASSET_DOWNLOAD_FAILED',
  ASSETS_READY: 'ASSETS_READY',
  BLENDER_PREFLIGHT_START: 'BLENDER_PREFLIGHT_START',
  BLENDER_PREFLIGHT_OK: 'BLENDER_PREFLIGHT_OK',
  BLENDER_PREFLIGHT_FAILED: 'BLENDER_PREFLIGHT_FAILED',
  RENDER_STARTED: 'RENDER_STARTED',
});

const WORKER_VERSION = safeReadWorkerVersion();

function safeReadWorkerVersion() {
  try {
    const pkg = require('../package.json');
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function binVersion(bin, arg = '--version') {
  try {
    const res = spawnSync(bin, [arg], { encoding: 'utf8', timeout: 15_000 });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
    return out.split('\n')[0] || null;
  } catch {
    return null;
  }
}

function diskInfo(dir) {
  try {
    const st = fs.statfsSync(dir || '/');
    const totalGb = (st.blocks * st.bsize) / 1e9;
    const freeGb = (st.bfree * st.bsize) / 1e9;
    return { totalGb: Number(totalGb.toFixed(2)), freeGb: Number(freeGb.toFixed(2)) };
  } catch {
    return { totalGb: null, freeGb: null };
  }
}

/**
 * Collect non-secret host/runtime facts. imageDigest is read from an env var
 * that CI/orchestrator can inject (RUNPOD_WORKER_IMAGE or DDP_IMAGE_DIGEST).
 *
 * sourceCommit / workerBuildTime / renderCodeSha256 come from the build stamps
 * baked into the image, so every render records exactly which render code ran —
 * the fact that was missing when a stale image silently produced a bad shot.
 */
function collectSystemInfo(env = process.env) {
  const image = String(env.DDP_IMAGE_DIGEST || env.RUNPOD_WORKER_IMAGE || '');
  const digestMatch = image.match(/@(sha256:[0-9a-f]{64})/);
  let provenance = null;
  try {
    provenance = collectProvenance(env);
  } catch {
    provenance = null;
  }
  return {
    sourceCommit: provenance ? provenance.sourceCommit : null,
    workerBuildTime: provenance ? provenance.workerBuildTime : null,
    renderCodeSha256: provenance ? provenance.renderCodeSha256 : null,
    renderCodeSha256Declared: provenance ? provenance.renderCodeSha256Declared : null,
    renderCodeMatch: provenance ? provenance.renderCodeMatch : null,
    assembleScriptSha256: provenance ? provenance.assembleScriptSha256 : null,
    host: os.hostname(),
    pid: process.pid,
    node: process.version,
    arch: process.arch,
    platform: process.platform,
    cpuCount: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
    disk: diskInfo(env.RENDER_WORKSPACE_DIR || os.tmpdir()),
    blenderVersion: binVersion(env.BLENDER_BIN || 'blender'),
    ffmpegVersion: binVersion('ffmpeg', '-version'),
    workerVersion: WORKER_VERSION,
    imageDigest: digestMatch ? digestMatch[1] : null,
    gpuVisible: String(env.NVIDIA_VISIBLE_DEVICES || '') || null,
    requireGpuHealth: String(env.REQUIRE_GPU_HEALTH ?? 'true'),
    startedAt: new Date().toISOString(),
  };
}

function makeBootLogger(sink) {
  const out = sink || ((line) => console.log(line));
  return function bootLog(event, detail = {}) {
    out(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
  };
}

/**
 * Install global process handlers that persist a diagnostic and exit with an
 * explicit classification. `persist` is an async (classification, detail) => void
 * that writes the failure to R2 (best-effort, bounded). NEVER reports COMPLETE.
 *
 * @returns {() => void} an uninstall function (used by tests).
 */
function installGlobalHandlers({ log, persist, exit }) {
  const doExit = exit || ((code) => { process.exitCode = code; });
  const { EXIT_CLASS, exitCodeFor } = require('./exit-codes');
  let handling = false;

  const persistAndExit = async (classification, detail) => {
    if (handling) return;
    handling = true;
    try {
      log('fatal_signal', { classification, ...detail });
      if (persist) {
        await Promise.race([
          persist(classification, detail),
          new Promise((r) => setTimeout(r, 8_000)),
        ]);
      }
    } catch (e) {
      log('fatal_persist_failed', { error: String(e && e.message) });
    } finally {
      doExit(exitCodeFor(classification));
    }
  };

  const onUncaught = (err) => {
    persistAndExit(EXIT_CLASS.UNKNOWN_FATAL, {
      kind: 'uncaughtException',
      error: redactMessage(err && err.message),
      stack: redactMessage(err && err.stack, 1200),
    });
  };
  const onRejection = (reason) => {
    persistAndExit(EXIT_CLASS.UNKNOWN_FATAL, {
      kind: 'unhandledRejection',
      error: redactMessage(reason && (reason.message || String(reason))),
    });
  };
  const onSigterm = () => persistAndExit(EXIT_CLASS.TIMEOUT, { kind: 'SIGTERM' });
  const onSigint = () => persistAndExit(EXIT_CLASS.TIMEOUT, { kind: 'SIGINT' });

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  process.on('SIGTERM', onSigterm);
  process.on('SIGINT', onSigint);

  const uninstall = function uninstall() {
    process.removeListener('uncaughtException', onUncaught);
    process.removeListener('unhandledRejection', onRejection);
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
  // The individual handlers are exposed so they can be exercised directly in
  // tests (the node:test runner intercepts real uncaughtException emits).
  uninstall.handlers = { onUncaught, onRejection, onSigterm, onSigint, persistAndExit };
  return uninstall;
}

function redactMessage(text, max = 500) {
  const s = String(text || '')
    .replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/(secretaccesskey|accesskeyid)["']?\s*[:=]\s*["']?[^\s"',}]+/gi, '$1=[REDACTED]');
  return s.length > max ? s.slice(0, max) + '...' : s;
}

module.exports = {
  BOOT_STAGE,
  WORKER_VERSION,
  collectSystemInfo,
  makeBootLogger,
  installGlobalHandlers,
  redactMessage,
  binVersion,
};

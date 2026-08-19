/**
 * DDP Runpod Blender worker entrypoint.
 *
 * Two execution modes, both performing REAL work (no fake progress):
 *  1. SINGLE-SHOT (benchmark / primary cloud path): driven by RENDER_JOB_ID +
 *     an immutable R2 manifest. Requires NO public ingress / RENDER_API_URL.
 *     After the job the pod may self-terminate only when
 *     ALLOW_WORKER_SELF_TERMINATE is not false (TivvleJoy forces false).
 *  2. API CLAIM LOOP (preserved for later development): polls RENDER_API_URL,
 *     renders claimed jobs with the shared render-core, and reports COMPLETE
 *     only after a verified R2 artifact upload.
 *
 * Never logs secrets. Never reports COMPLETE without a verified artifact.
 * Does not start paid resources itself — runs ON an already-provisioned pod.
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { evaluateHealth } = require('./gpu-health');
const { RunawayRenderGuard } = require('./runaway');
const r2 = require('./r2-client');
const core = require('./render-core');
const { runSingleShot, redact } = require('./single-shot');
const {
  BOOT_STAGE,
  collectSystemInfo,
  installGlobalHandlers,
  redactMessage,
} = require('./boot-diagnostics');
const { EXIT_CLASS, exitCodeFor, classifyCode } = require('./exit-codes');
const { StartupWatchdog } = require('./watchdog');

const { strip } = r2;
const { buildRenderSubprocessEnvironment } = require('./child-env');

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

/**
 * Best-effort R2 diagnostic writer for the worker's own startup-status.json.
 * Used by the global fatal handlers and the startup watchdog so a death anywhere
 * during boot is still recorded to R2 (never reports COMPLETE).
 */
function makeDiagnosticPersister(env) {
  const jobId = strip(env.RENDER_JOB_ID);
  let ctx = null;
  try {
    if (jobId) ctx = r2.createR2Client(env);
  } catch {
    ctx = null;
  }
  return async function persist(classification, detail = {}) {
    if (!ctx || !jobId) return;
    const key = `jobs/${jobId}/startup-status.json`;
    // Non-failure boot milestones (PROCESS_STARTED / WORKER_READY) must NOT set
    // result:'FAILED' — the orchestrator treats that as a terminal kill.
    const booting = classification === 'BOOTING';
    const body = Buffer.from(
      JSON.stringify(
        {
          jobId,
          result: booting ? 'RUNNING' : 'FAILED',
          classification,
          bootStage: detail.bootStage || undefined,
          systemInfo: collectSystemInfo(env),
          detail,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    try {
      await r2.withTimeout(r2.uploadBuffer(ctx, key, body, 'application/json'), 8_000, 'diagnostic upload');
    } catch (e) {
      log('diagnostic_persist_failed', { error: redactMessage(e && e.message) });
    }
  };
}

function canWorkerSelfTerminate(env = process.env) {
  return String(env.ALLOW_WORKER_SELF_TERMINATE || 'true').toLowerCase() !== 'false';
}

async function terminateSelf(reason = 'done', env = process.env) {
  log('terminate_self', { reason });
  const podId = strip(env.RUNPOD_POD_ID);
  const apiKey = strip(env.RUNPOD_API_KEY);
  // TivvleJoy single-shot forces ALLOW_WORKER_SELF_TERMINATE=false.
  // A platform-injected Pod-scoped RUNPOD_API_KEY must never enable
  // termination, and the worker must not require that key to render.
  if (!canWorkerSelfTerminate(env) || !podId || !apiKey) {
    log('terminate_self_skipped', { hint: 'orchestrator should terminate pod' });
    return;
  }
  try {
    const res = await fetch(env.RUNPOD_API_ENDPOINT || 'https://api.runpod.io/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'User-Agent': 'DoodleDashProductionWorker/1.0' },
      body: JSON.stringify({ query: 'mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }', variables: { podId } }),
    });
    log('terminate_self_http', { status: res.status });
  } catch (e) {
    log('terminate_self_failed', { error: redact(e.message) });
  }
}

/**
 * Startup watchdog owns BOOT only: PROCESS_STARTED → healthGate → WORKER_READY.
 * Call start() before healthGate. Cancel permanently with reached('WORKER_READY').
 */
function createAndStartStartupWatchdog({
  env = process.env,
  persist,
  logFn = log,
  StartupWatchdogImpl = StartupWatchdog,
  terminate = terminateSelf,
  exitFn = (code) => process.exit(code),
} = {}) {
  const startupTimeoutMs = Number(env.STARTUP_WATCHDOG_MS || 180_000);
  return new StartupWatchdogImpl({
    startupTimeoutMs,
    onTimeout: async (info) => {
      logFn('startup_watchdog_timeout', { ...info, startupTimeoutMs });
      try {
        if (typeof persist === 'function') {
          await persist(EXIT_CLASS.TIMEOUT, { kind: 'STARTUP_TIMEOUT', ...info });
        }
      } finally {
        await terminate(`startup_timeout:${info.lastMilestone || 'none'}`, env);
        exitFn(exitCodeFor(EXIT_CLASS.TIMEOUT));
      }
    },
  }).start();
}

function applyHealthGateToStartupWatchdog(startupWatchdog, health) {
  if (!health || health.ok !== true) {
    startupWatchdog.reached('HEALTH_GATE_FAILED');
    return {
      ok: false,
      ready: false,
      cancelled: startupWatchdog.cleared === true,
      lastMilestone: startupWatchdog.lastMilestone,
    };
  }
  // Authoritative successful startup transition: cancel the boot watchdog.
  startupWatchdog.reached('WORKER_READY');
  return {
    ok: true,
    ready: true,
    cancelled: startupWatchdog.cleared === true && startupWatchdog.timer == null,
    lastMilestone: startupWatchdog.lastMilestone,
  };
}

function healthGate() {
  const requireGpu = String(process.env.REQUIRE_GPU_HEALTH || 'true').toLowerCase() !== 'false';
  const allowCpuFallback =
    String(process.env.ALLOW_CPU_DIAGNOSTIC_FALLBACK || 'false').toLowerCase() === 'true';
  if (requireGpu || allowCpuFallback) {
    const health = evaluateHealth({ allowCpuFallback: allowCpuFallback && !requireGpu ? true : allowCpuFallback });
    log('gpu_health', {
      ok: health.ok,
      reason: health.reason,
      glMode: health.report.glMode,
      benchmarkOk: health.report.benchmarkOk,
      eeveeContextFailed: health.eeveeContextFailed,
      hardwareAcceleration: health.report.hardwareAcceleration,
    });
    return {
      ok: health.ok,
      classification: health.eeveeContextFailed
        ? EXIT_CLASS.EEVEE_CONTEXT_FAILURE
        : health.report.hardwareAcceleration
          ? EXIT_CLASS.BLENDER_INITIALIZATION_FAILURE
          : EXIT_CLASS.IMAGE_BOOT_FAILURE,
    };
  }
  // Non-GPU mode: still require blender + ffmpeg binaries.
  const childEnv = buildRenderSubprocessEnvironment({ PATH: process.env.PATH, ...process.env });
  const blender = core.defaultRunCommand(process.env.BLENDER_BIN || 'blender', ['--version'], {
    env: childEnv,
  });
  const ffmpeg = core.defaultRunCommand('ffmpeg', ['-version'], { env: childEnv });
  const ok = blender.status === 0 && ffmpeg.status === 0;
  return {
    ok,
    classification: blender.status !== 0 ? EXIT_CLASS.BLENDER_BINARY_FAILURE : EXIT_CLASS.FFMPEG_FAILURE,
  };
}

// ── API claim-loop helpers (real render via shared core) ──
async function claimJob(apiUrl, workerId) {
  const res = await fetch(`${apiUrl}/api/render-worker/jobs/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, capabilities: { provider: 'RUNPOD_BLENDER', supportsGpu: true } }),
  });
  const data = await res.json();
  return data.job || null;
}

async function reportProgress(apiUrl, jobId, status, progress, message) {
  try {
    await fetch(`${apiUrl}/api/render-worker/jobs/${jobId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, progress, message }),
    });
  } catch (e) {
    log('progress_report_failed', { error: redact(e.message) });
  }
}

async function downloadUriAsset(ctx, uri, dest, expectedChecksum) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (uri.startsWith('s3://')) {
    const without = uri.slice('s3://'.length);
    const key = without.slice(without.indexOf('/') + 1);
    await r2.downloadToFile(ctx, key, dest, expectedChecksum);
  } else if (uri.startsWith('file://')) {
    await fsp.copyFile(uri.slice('file://'.length), dest);
  } else if (uri.startsWith('local://')) {
    const root = process.env.OBJECT_STORAGE_ROOT || path.resolve(process.cwd(), '.doodle-dash-storage');
    await fsp.copyFile(path.join(root, uri.slice('local://'.length)), dest);
  } else if (uri.startsWith('/') || uri.startsWith('.')) {
    await fsp.copyFile(uri, dest);
  } else {
    throw core.tagged(`Unsupported asset URI scheme: ${uri}`, 'ASSET_URI_UNSUPPORTED');
  }
  if (expectedChecksum && !uri.startsWith('s3://')) {
    const actual = core.sha256File(dest);
    if (actual !== expectedChecksum) throw core.tagged(`Checksum mismatch for ${uri}`, 'ASSET_HASH_MISMATCH');
  }
}

async function processApiJob(ctx, apiUrl, job) {
  const jobId = job.id || job.queueId;
  const payload = job.payload || {};
  const meta = payload.metadata || {};
  const resolution = job.resolution || '540x960';
  const fps = job.fps || 30;
  const workDir = path.join(process.env.RENDER_WORKSPACE_DIR || path.join(os.tmpdir(), 'ddp-runpod-worker'), String(jobId));
  const outputDir = path.join(workDir, 'output');
  const assetsDir = path.join(workDir, 'assets');
  await fsp.mkdir(assetsDir, { recursive: true });

  await reportProgress(apiUrl, jobId, 'PREPARING', 5, 'Downloading assets');
  const rawAssets = Array.isArray(payload.assets) ? payload.assets : [];
  const assets = [];
  for (const [i, a] of rawAssets.entries()) {
    const uri = a.uri || a.storageLocation || '';
    const dest = path.join(assetsDir, `${i}-${path.basename(uri).replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    await downloadUriAsset(ctx, uri, dest, a.checksum);
    assets.push({ id: a.id || a.role || `asset-${i}`, role: a.id || a.role, uri: `file://${dest}`, localPath: dest });
  }

  const manifest = {
    jobId,
    sceneId: payload.sceneId || jobId,
    episodeId: payload.episodeId || jobId,
    renderMode: job.profileCode || 'DRAFT_HD',
    resolution,
    fps,
    frameRange: {
      start: meta.startFrame || 1,
      end: meta.endFrame || Math.max(1, Math.round((meta.durationSec || 2) * fps)),
    },
    eevee: { engine: job.engine || 'EEVEE', samples: meta.samples || (resolution === '1080x1920' ? 20 : 8) },
    cameraState: { preset: meta.cameraPreset || 'WIDE' },
    shotMeta: meta.shotMeta || meta,
  };

  const assembleScript = process.env.BLENDER_ASSEMBLE_SCRIPT || path.resolve(__dirname, '../blender/assemble_scene.py');
  const argv = core.buildBlenderArgv({ manifest, assets, outputDir, assembleScript });
  const renderEnv = buildRenderSubprocessEnvironment({ PATH: process.env.PATH, ...process.env });
  await reportProgress(apiUrl, jobId, 'RENDERING', 20, 'Blender EEVEE render');
  await core.renderWithBlender({ blenderBin: process.env.BLENDER_BIN || 'blender', argv, outputDir, log, env: renderEnv });
  await core.verifyFrames({ manifest, outputDir });

  await reportProgress(apiUrl, jobId, 'ENCODING', 80, 'Encoding + validating');
  const mp4Path = path.join(outputDir, 'shot.mp4');
  await core.encodeVideo({ outputDir, fps, mp4Path, env: renderEnv });
  await core.validateOutput({ manifest, mp4Path, env: renderEnv });

  await reportProgress(apiUrl, jobId, 'ENCODING', 90, 'Uploading artifact');
  const bytes = await fsp.readFile(mp4Path);
  const checksum = core.sha256Buffer(bytes);
  const outputKey = `draft-renders/worker-jobs/${jobId}/shot.mp4`;
  await r2.uploadBuffer(ctx, outputKey, bytes, 'video/mp4');
  // Verify readback before COMPLETE.
  const verifyPath = path.join(workDir, 'readback.mp4');
  await r2.downloadToFile(ctx, outputKey, verifyPath);
  if (core.sha256File(verifyPath) !== checksum) throw core.tagged('Readback hash mismatch', 'R2_READBACK_HASH_MISMATCH');

  await fetch(`${apiUrl}/api/render-worker/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId: process.env.RENDER_WORKER_ID, outputs: [{ kind: 'final', uri: `s3://${ctx.bucket}/${outputKey}`, checksum, resolution }] }),
  });
  log('api_job_complete', { jobId, outputKey, checksum });
}

async function main() {
  const env = process.env;
  const systemInfo = collectSystemInfo(env);
  log('boot_stage', { bootStage: BOOT_STAGE.PROCESS_STARTED, systemInfo });
  log('startup');

  // Global fatal handlers persist a diagnostic to R2 before exit (never COMPLETE).
  const persist = makeDiagnosticPersister(env);
  installGlobalHandlers({ log, persist });

  // Record PROCESS_STARTED to R2 BEFORE the GPU health gate. Two confirmation
  // pods previously burned 8–15 min with no startup-status.json at all; without
  // this early write we cannot tell image-pull failure from a hung EEVEE probe.
  // Best-effort: never block boot if R2 is briefly unreachable.
  try {
    await persist('BOOTING', { kind: 'PROCESS_STARTED', bootStage: BOOT_STAGE.PROCESS_STARTED });
  } catch (e) {
    log('early_startup_status_failed', { error: redactMessage(e && e.message) });
  }

  // Startup watchdog owns BOOT only. Arm it before healthGate. Cancel it at
  // WORKER_READY. The single-shot runtime/cost guard owns the render job.
  const startupWatchdog = createAndStartStartupWatchdog({ env, persist });

  // healthGate() is synchronous (spawnSync Blender). Yield once so the watchdog
  // timer and the early R2 write above can settle before we block the event loop.
  await new Promise((r) => setImmediate(r));

  const health = healthGate();
  const startup = applyHealthGateToStartupWatchdog(startupWatchdog, health);
  if (!startup.ok) {
    log('worker_unhealthy_abort', { classification: health.classification });
    await persist(health.classification, { kind: 'HEALTH_GATE_FAILED' });
    process.exitCode = exitCodeFor(health.classification);
    return;
  }
  log('WORKER_READY');
  try {
    await persist('BOOTING', { kind: 'WORKER_READY', bootStage: 'WORKER_READY' });
  } catch (e) {
    log('ready_startup_status_failed', { error: redactMessage(e && e.message) });
  }

  const jobId = strip(env.RENDER_JOB_ID);
  const apiUrl = strip(env.RENDER_API_URL);

  // Single-shot mode takes precedence and requires no ingress.
  // The startup watchdog is already cancelled. Do not re-arm it here.
  if (jobId) {
    const result = await runSingleShot({ env, log });
    const classification = result.ok ? EXIT_CLASS.OK : result.classification || classifyCode(result.code);
    log('single_shot_result', { ok: result.ok, code: result.code || null, classification, artifactKey: result.artifactKey || null });
    process.exitCode = result.ok ? 0 : exitCodeFor(classification);
    await terminateSelf(result.ok ? 'single_shot_complete' : `single_shot_failed:${result.code}`);
    return;
  }
  startupWatchdog.reached('NO_SINGLE_SHOT');

  if (!apiUrl) {
    log('no_work_source', { hint: 'Set RENDER_JOB_ID (single-shot) or RENDER_API_URL (claim loop).' });
    return;
  }

  // API claim loop (real render via shared core; no fake progress).
  let ctx = null;
  if (String(process.env.CLOUD_RENDER_ENABLED || 'false').toLowerCase() === 'true') {
    ctx = r2.createR2Client(process.env);
  }
  const workerId = strip(process.env.RENDER_WORKER_ID) || `runpod-${process.env.RUNPOD_POD_ID || 'local'}`;
  const runaway = new RunawayRenderGuard({ maxJobRuntimeMinutes: Number(process.env.MAX_JOB_RUNTIME_MINUTES || 180) });
  for (;;) {
    runaway.markHeartbeat();
    let job = null;
    try {
      job = await claimJob(apiUrl, workerId);
    } catch (e) {
      log('claim_failed', { error: redact(e.message) });
    }
    if (!job) break; // single pass; orchestrator controls lifecycle
    try {
      if (!ctx) ctx = r2.createR2Client(process.env);
      await processApiJob(ctx, apiUrl, job);
    } catch (e) {
      log('api_job_failed', { jobId: job.id || job.queueId, code: e.code || 'RENDER_FAILED', error: redact(e.message) });
      try {
        await fetch(`${apiUrl}/api/render-worker/jobs/${encodeURIComponent(job.id || job.queueId)}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerId, error: { code: e.code || 'RENDER_FAILED', message: redact(e.message) } }),
        });
      } catch { /* ignore */ }
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    const classification = classifyCode(e && e.code);
    console.error(JSON.stringify({ event: 'fatal', classification, error: redact(e && e.message) }));
    process.exitCode = exitCodeFor(classification);
  });
}

module.exports = {
  main,
  processApiJob,
  downloadUriAsset,
  terminateSelf,
  canWorkerSelfTerminate,
  createAndStartStartupWatchdog,
  applyHealthGateToStartupWatchdog,
};

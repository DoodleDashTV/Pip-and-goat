/**
 * R2-backed single-shot render execution mode for the Runpod GPU worker.
 *
 * Flow (no RENDER_API_URL / no public ingress required):
 *   env RENDER_JOB_ID (+ optional RENDER_JOB_MANIFEST_KEY)
 *   -> download immutable manifest from R2
 *   -> validate manifest (reject malformed/incomplete)
 *   -> download + SHA-256 verify every expected asset
 *   -> reconstruct workspace + prepare Blender scene
 *   -> Blender EEVEE render (headless) -> verify frames
 *   -> ffmpeg encode -> validate output (ffprobe)
 *   -> SHA-256 -> upload artifact + metadata + status to R2
 *   -> read the artifact back and re-verify SHA-256
 *   -> mark COMPLETE only after verified R2 upload
 *
 * Fails closed at every stage: on any failure it persists a FAILED status +
 * diagnostics to R2, never reports COMPLETE, and returns ok:false so the
 * worker can terminate the pod.
 */
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const core = require('./render-core');
const { BOOT_STAGE, collectSystemInfo } = require('./boot-diagnostics');
const { EXIT_CLASS, classifyCode } = require('./exit-codes');
const { runBlenderPreflight } = require('./blender-preflight');
const { computeCostAwareMaxRuntime } = require('./watchdog');
const { resolveHeadlessGlConfig, applyHeadlessGlEnv } = require('./headless-gl');

function redact(text) {
  return String(text || '')
    .replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

async function runSingleShot(options = {}) {
  const env = options.env || process.env;
  const log = options.log || ((event, detail = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail })));
  const now = options.now || (() => Date.now());
  const r2 = options.r2 || require('./r2-client');
  const renderCore = options.core || core;

  const jobId = String(env.RENDER_JOB_ID || '').trim();
  const manifestKey = String(env.RENDER_JOB_MANIFEST_KEY || (jobId ? `jobs/${jobId}/manifest.json` : '')).trim();
  const statusKey = `jobs/${jobId}/status.json`;
  const startupStatusKey = `jobs/${jobId}/startup-status.json`;
  const workspaceRoot = env.RENDER_WORKSPACE_DIR || path.join(os.tmpdir(), 'ddp-runpod-worker');
  const assembleScript =
    env.BLENDER_ASSEMBLE_SCRIPT || path.resolve(__dirname, '../blender/assemble_scene.py');
  const preflightEnabled = String(env.SKIP_BLENDER_PREFLIGHT || 'false').toLowerCase() !== 'true';

  const startedAt = now();
  const timings = {};
  let ctx = null;
  let manifest = null;
  let stage = 'INIT';
  let bootStage = BOOT_STAGE.PROCESS_STARTED;
  const systemInfo = collectSystemInfo(env);

  const writeStatus = async (status, extra = {}) => {
    if (!ctx) return;
    const body = Buffer.from(
      JSON.stringify(
        { jobId, status, stage, ...extra, workerId: env.RENDER_WORKER_ID || env.RUNPOD_POD_ID || 'runpod', at: new Date().toISOString() },
        null,
        2,
      ),
    );
    try {
      await r2.uploadBuffer(ctx, statusKey, body, 'application/json');
    } catch (e) {
      log('status_write_failed', { error: redact(e.message) });
    }
  };

  // Early startup diagnostic, written to R2 as soon as R2 is up and UPDATED as
  // boot progresses — so a death after R2-init but before render is diagnosable.
  const writeStartupStatus = async (extra = {}) => {
    if (!ctx) return;
    const body = Buffer.from(
      JSON.stringify(
        { jobId, bootStage, stage, systemInfo, ...extra, at: new Date().toISOString() },
        null,
        2,
      ),
    );
    try {
      await r2.uploadBuffer(ctx, startupStatusKey, body, 'application/json');
    } catch (e) {
      log('startup_status_write_failed', { error: redact(e.message) });
    }
  };

  const setBootStage = async (s, extra = {}) => {
    bootStage = s;
    log('boot_stage', { bootStage: s, ...extra });
    await writeStartupStatus(extra);
  };

  const fail = async (code, message, extra = {}) => {
    const classification = classifyCode(code);
    log('job_failed', { stage, bootStage, code, classification, error: redact(message) });
    await writeStatus('FAILED', { code, classification, message: redact(message), timings, ...extra });
    await writeStartupStatus({ result: 'FAILED', code, classification, error: redact(message) });
    return { ok: false, code, classification, stage, bootStage, message: redact(message) };
  };

  try {
    log('boot_stage', { bootStage: BOOT_STAGE.PROCESS_STARTED, systemInfo });
    stage = 'ENV_VALIDATION';
    bootStage = BOOT_STAGE.ENV_VALIDATION_START;
    if (!jobId) {
      return { ok: false, code: 'NO_JOB_ID', classification: EXIT_CLASS.ENV_CONFIGURATION_FAILURE, stage, message: 'RENDER_JOB_ID not set' };
    }
    bootStage = BOOT_STAGE.ENV_VALIDATION_OK;

    stage = 'R2_CONNECT';
    try {
      ctx = r2.createR2Client(env);
    } catch (e) {
      return { ok: false, code: 'R2_CONFIG_INCOMPLETE', classification: EXIT_CLASS.ENV_CONFIGURATION_FAILURE, stage, message: redact(e.message) };
    }
    await setBootStage(BOOT_STAGE.R2_CLIENT_CREATED, { timeouts: ctx.timeouts || null });
    log('single_shot_start', { jobId, manifestKey });

    // 1. Download + validate manifest
    stage = 'MANIFEST';
    await setBootStage(BOOT_STAGE.MANIFEST_FETCH_START, { manifestKey });
    const workDir = path.join(workspaceRoot, jobId);
    await fsp.mkdir(workDir, { recursive: true });
    const manifestPath = path.join(workDir, 'manifest.json');
    try {
      await r2.downloadToFile(ctx, manifestKey, manifestPath);
    } catch (e) {
      return fail('MANIFEST_MISSING', `Manifest not found at ${manifestKey}: ${e.message}`);
    }
    try {
      manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
      renderCore.validateManifest(manifest);
    } catch (e) {
      return fail('MANIFEST_INVALID', e.message);
    }
    if (manifest.jobId !== jobId) {
      return fail('JOB_ID_MISMATCH', `Manifest jobId ${manifest.jobId} != authorized ${jobId}`);
    }
    await setBootStage(BOOT_STAGE.MANIFEST_FETCH_OK, { renderMode: manifest.renderMode, resolution: manifest.resolution });
    await writeStatus('PREPARING_ASSETS', { timings });

    // Runtime budget: manifest limit, further tightened by a COST-AWARE cap
    // derived from the ACTUAL live GPU hourly rate vs the job's hard USD cap so
    // worst-case spend can never exceed the cap (never keep a paid GPU past it).
    let maxRuntimeMs = manifest.limits.maxRuntimeMinutes * 60_000;
    const liveRate = Number(env.RUNPOD_GPU_HOURLY_RATE || env.GPU_HOURLY_RATE_USD || 0);
    if (liveRate > 0) {
      const sizing = computeCostAwareMaxRuntime({
        gpuHourlyRateUsd: liveRate,
        hardCapUsd: manifest.limits.maxCostUsd,
        manifestMaxRuntimeMinutes: manifest.limits.maxRuntimeMinutes,
      });
      maxRuntimeMs = Math.min(maxRuntimeMs, sizing.maxRuntimeMs);
      log('cost_aware_runtime_sizing', {
        gpuHourlyRateUsd: liveRate,
        hardCapUsd: sizing.hardCapUsd,
        maxRuntimeMinutes: sizing.maxRuntimeMinutes,
        worstCaseCostUsd: sizing.worstCaseCostUsd,
        cappedBy: sizing.cappedBy,
      });
    }
    const remainingMs = () => maxRuntimeMs - (now() - startedAt);
    const checkBudget = async (where) => {
      if (remainingMs() <= 0) throw core.tagged(`Runtime limit exceeded before ${where}`, 'TIMEOUT');
    };

    // 2. Download + verify assets
    stage = 'DOWNLOADING_ASSETS';
    await setBootStage(BOOT_STAGE.ASSET_DOWNLOAD_START, { assetCount: manifest.expectedAssets.length });
    await checkBudget('asset download');
    const assetsDir = path.join(workDir, 'assets');
    await fsp.mkdir(assetsDir, { recursive: true });
    const assets = [];
    for (const [i, asset] of manifest.expectedAssets.entries()) {
      const safe = path.basename(asset.r2Key).replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = path.join(assetsDir, `${i}-${safe}`);
      try {
        await r2.downloadToFile(ctx, asset.r2Key, dest, asset.sha256);
      } catch (e) {
        return fail('ASSET_MISSING_OR_HASH_MISMATCH', `Asset ${asset.role} (${asset.r2Key}): ${e.message}`, { asset: asset.role });
      }
      assets.push({ id: asset.role, role: asset.role, kind: asset.kind, uri: `file://${dest}`, localPath: dest, checksum: asset.sha256 });
    }
    timings.assetDownloadMs = now() - startedAt;
    await setBootStage(BOOT_STAGE.ASSETS_READY, { timings });
    await writeStatus('RENDERING', { timings });

    // 2b. Blender headless preflight — verify Blender launches, EEVEE is
    // available, and a minimal scene (camera+light+mesh) renders BEFORE
    // committing the pod to the real render. Skipped when a runCommand is
    // injected (unit tests) or SKIP_BLENDER_PREFLIGHT=true.
    if (preflightEnabled && (options.forcePreflight || !options.runCommand)) {
      stage = 'BLENDER_PREFLIGHT';
      await setBootStage(BOOT_STAGE.BLENDER_PREFLIGHT_START, {});
      await checkBudget('blender preflight');
      const preflight = (options.runBlenderPreflight || runBlenderPreflight)({
        env,
        blenderBin: env.BLENDER_BIN || 'blender',
        timeoutMs: Number(env.BLENDER_PREFLIGHT_TIMEOUT_MS || 90_000),
      });
      log('blender_preflight', {
        ok: preflight.ok,
        glMode: preflight.glMode,
        engineUsed: preflight.engineUsed,
        durationMs: preflight.durationMs,
        code: preflight.code || null,
      });
      if (!preflight.ok) {
        return fail(preflight.code || 'BLENDER_PREFLIGHT_FAILED', `Blender preflight failed: ${preflight.reason}`, { glMode: preflight.glMode });
      }
      await setBootStage(BOOT_STAGE.BLENDER_PREFLIGHT_OK, { glMode: preflight.glMode, engineUsed: preflight.engineUsed });
    }

    // 3. Blender EEVEE render
    stage = 'RENDERING';
    await setBootStage(BOOT_STAGE.RENDER_STARTED, {});
    await checkBudget('render');
    const outputDir = path.join(workDir, 'output');
    const argv = renderCore.buildBlenderArgv({ manifest, assets, outputDir, assembleScript });
    // Apply the resolved headless GL/EGL config (NVIDIA EGL on GPU, llvmpipe on
    // CPU) to the REAL render spawn — not just the preflight — so EEVEE gets a
    // valid off-screen context. Never clobbers operator-set GL env.
    const glConfig = resolveHeadlessGlConfig({ env });
    const renderEnv = applyHeadlessGlEnv(env, glConfig);
    log('render_gl_config', { glMode: glConfig.mode, gpuPresent: glConfig.gpuPresent });
    const budgetRunCommand = (bin, args, opts = {}) =>
      renderCore.defaultRunCommand(bin, args, { timeout: Math.max(1000, remainingMs()), env: renderEnv, ...opts });
    const renderStart = now();
    try {
      await renderCore.renderWithBlender({
        blenderBin: env.BLENDER_BIN || 'blender',
        argv,
        outputDir,
        runCommand: options.runCommand || budgetRunCommand,
        log: (e, d) => log(e, d),
      });
      await renderCore.verifyFrames({ manifest, outputDir });
    } catch (e) {
      return fail(e.code || 'RENDER_FAILED', e.message);
    }
    timings.renderMs = now() - renderStart;
    await writeStatus('ENCODING', { timings });

    // 4. Encode + validate output
    stage = 'ENCODING';
    await checkBudget('encode');
    const mp4Path = path.join(outputDir, 'shot.mp4');
    const encStart = now();
    try {
      await renderCore.encodeVideo({
        outputDir,
        fps: manifest.fps,
        mp4Path,
        runCommand: options.runCommand || budgetRunCommand,
      });
    } catch (e) {
      return fail(e.code || 'FFMPEG_FAILED', e.message);
    }
    timings.encodeMs = now() - encStart;

    stage = 'QC';
    let outputInfo;
    try {
      outputInfo = await renderCore.validateOutput({
        manifest,
        mp4Path,
        runCommand: options.runCommand || renderCore.defaultRunCommand,
      });
    } catch (e) {
      return fail(e.code || 'OUTPUT_INVALID', e.message);
    }

    // 5. Upload artifact + metadata, then read back and re-verify
    stage = 'UPLOADING';
    await checkBudget('upload');
    const artifactBytes = await fsp.readFile(mp4Path);
    const artifactSha = renderCore.sha256Buffer(artifactBytes);
    try {
      await r2.uploadBuffer(ctx, manifest.outputKey, artifactBytes, 'video/mp4');
    } catch (e) {
      return fail('R2_UPLOAD_FAILED', e.message);
    }

    // Read back the uploaded artifact and re-verify SHA-256 before COMPLETE.
    stage = 'VERIFY_READBACK';
    const verifyPath = path.join(workDir, 'readback.mp4');
    try {
      await r2.downloadToFile(ctx, manifest.outputKey, verifyPath);
    } catch (e) {
      return fail('R2_READBACK_FAILED', e.message);
    }
    const readbackSha = renderCore.sha256File(verifyPath);
    if (readbackSha !== artifactSha) {
      return fail('R2_READBACK_HASH_MISMATCH', `readback ${readbackSha} != ${artifactSha}`);
    }

    const metadata = {
      jobId,
      episodeId: manifest.episodeId,
      renderMode: manifest.renderMode,
      resolution: manifest.resolution,
      fps: manifest.fps,
      frameRange: manifest.frameRange,
      frameCount: outputInfo.frames,
      eevee: manifest.eevee,
      outputKey: manifest.outputKey,
      artifactSha256: artifactSha,
      outputBytes: outputInfo.bytes,
      outputResolution: `${outputInfo.width}x${outputInfo.height}`,
      timings: { ...timings, totalMs: now() - startedAt },
      gpu: env.RUNPOD_GPU_NAME || null,
      podId: env.RUNPOD_POD_ID || null,
      completedAt: new Date().toISOString(),
    };
    const metadataKey = `jobs/${jobId}/metadata.json`;
    try {
      await r2.uploadBuffer(ctx, metadataKey, Buffer.from(JSON.stringify(metadata, null, 2)), 'application/json');
    } catch (e) {
      return fail('R2_METADATA_UPLOAD_FAILED', e.message);
    }

    stage = 'COMPLETE';
    await writeStatus('COMPLETE', {
      artifactKey: manifest.outputKey,
      artifactSha256: artifactSha,
      metadataKey,
      metadata,
    });
    await writeStartupStatus({ result: 'COMPLETE' });
    log('single_shot_complete', { jobId, artifactKey: manifest.outputKey, artifactSha256: artifactSha, totalMs: metadata.timings.totalMs });
    return { ok: true, classification: EXIT_CLASS.OK, artifactKey: manifest.outputKey, artifactSha256: artifactSha, metadataKey, metadata };
  } catch (e) {
    return fail(e.code || 'UNEXPECTED', e.message);
  }
}

module.exports = { runSingleShot, redact };

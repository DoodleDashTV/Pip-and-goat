/**
 * DDP Runpod Blender worker entrypoint.
 *
 * Two execution modes, both performing REAL work (no fake progress):
 *  1. SINGLE-SHOT (benchmark / primary cloud path): driven by RENDER_JOB_ID +
 *     an immutable R2 manifest. Requires NO public ingress / RENDER_API_URL.
 *     After the job the pod self-terminates.
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

const { strip } = r2;

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

async function terminateSelf(reason = 'done') {
  log('terminate_self', { reason });
  const podId = strip(process.env.RUNPOD_POD_ID);
  const apiKey = strip(process.env.RUNPOD_API_KEY);
  if (String(process.env.ALLOW_WORKER_SELF_TERMINATE || 'true').toLowerCase() === 'false' || !podId || !apiKey) {
    log('terminate_self_skipped', { hint: 'orchestrator should terminate pod' });
    return;
  }
  try {
    const res = await fetch(process.env.RUNPOD_API_ENDPOINT || 'https://api.runpod.io/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'User-Agent': 'DoodleDashProductionWorker/1.0' },
      body: JSON.stringify({ query: 'mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }', variables: { podId } }),
    });
    log('terminate_self_http', { status: res.status });
  } catch (e) {
    log('terminate_self_failed', { error: redact(e.message) });
  }
}

function healthGate() {
  const requireGpu = String(process.env.REQUIRE_GPU_HEALTH || 'true').toLowerCase() !== 'false';
  if (requireGpu) {
    const health = evaluateHealth();
    log('gpu_health', { ok: health.ok, reason: health.reason });
    return health.ok;
  }
  // Non-GPU mode: still require blender + ffmpeg binaries.
  const blender = core.defaultRunCommand(process.env.BLENDER_BIN || 'blender', ['--version']);
  const ffmpeg = core.defaultRunCommand('ffmpeg', ['-version']);
  return blender.status === 0 && ffmpeg.status === 0;
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
  await reportProgress(apiUrl, jobId, 'RENDERING', 20, 'Blender EEVEE render');
  await core.renderWithBlender({ blenderBin: process.env.BLENDER_BIN || 'blender', argv, outputDir, log });
  await core.verifyFrames({ manifest, outputDir });

  await reportProgress(apiUrl, jobId, 'ENCODING', 80, 'Encoding + validating');
  const mp4Path = path.join(outputDir, 'shot.mp4');
  await core.encodeVideo({ outputDir, fps, mp4Path });
  await core.validateOutput({ manifest, mp4Path });

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
  log('startup');
  if (!healthGate()) {
    log('worker_unhealthy_abort');
    process.exitCode = 2;
    return;
  }
  log('WORKER_READY');

  const jobId = strip(process.env.RENDER_JOB_ID);
  const apiUrl = strip(process.env.RENDER_API_URL);

  // Single-shot mode takes precedence and requires no ingress.
  if (jobId) {
    const result = await runSingleShot({ env: process.env, log });
    log('single_shot_result', { ok: result.ok, code: result.code || null, artifactKey: result.artifactKey || null });
    process.exitCode = result.ok ? 0 : 1;
    await terminateSelf(result.ok ? 'single_shot_complete' : `single_shot_failed:${result.code}`);
    return;
  }

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
    console.error(JSON.stringify({ event: 'fatal', error: redact(e.message) }));
    process.exitCode = 1;
  });
}

module.exports = { main, processApiJob, downloadUriAsset, terminateSelf };

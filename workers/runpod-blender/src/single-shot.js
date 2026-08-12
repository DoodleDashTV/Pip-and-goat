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
  const workspaceRoot = env.RENDER_WORKSPACE_DIR || path.join(os.tmpdir(), 'ddp-runpod-worker');
  const assembleScript =
    env.BLENDER_ASSEMBLE_SCRIPT || path.resolve(__dirname, '../blender/assemble_scene.py');

  const startedAt = now();
  const timings = {};
  let ctx = null;
  let manifest = null;
  let stage = 'INIT';

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

  const fail = async (code, message, extra = {}) => {
    log('job_failed', { stage, code, error: redact(message) });
    await writeStatus('FAILED', { code, message: redact(message), timings, ...extra });
    return { ok: false, code, stage, message: redact(message) };
  };

  try {
    if (!jobId) return { ok: false, code: 'NO_JOB_ID', stage, message: 'RENDER_JOB_ID not set' };

    stage = 'R2_CONNECT';
    try {
      ctx = r2.createR2Client(env);
    } catch (e) {
      return { ok: false, code: 'R2_CONFIG_INCOMPLETE', stage, message: redact(e.message) };
    }
    log('single_shot_start', { jobId, manifestKey });

    // 1. Download + validate manifest
    stage = 'MANIFEST';
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
    await writeStatus('PREPARING_ASSETS', { timings });

    // Runtime budget from manifest limits
    const maxRuntimeMs = manifest.limits.maxRuntimeMinutes * 60_000;
    const remainingMs = () => maxRuntimeMs - (now() - startedAt);
    const checkBudget = async (where) => {
      if (remainingMs() <= 0) throw core.tagged(`Runtime limit exceeded before ${where}`, 'TIMEOUT');
    };

    // 2. Download + verify assets
    stage = 'DOWNLOADING_ASSETS';
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
    await writeStatus('RENDERING', { timings });

    // 3. Blender EEVEE render
    stage = 'RENDERING';
    await checkBudget('render');
    const outputDir = path.join(workDir, 'output');
    const argv = renderCore.buildBlenderArgv({ manifest, assets, outputDir, assembleScript });
    const budgetRunCommand = (bin, args, opts = {}) =>
      renderCore.defaultRunCommand(bin, args, { timeout: Math.max(1000, remainingMs()), ...opts });
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
    log('single_shot_complete', { jobId, artifactKey: manifest.outputKey, artifactSha256: artifactSha, totalMs: metadata.timings.totalMs });
    return { ok: true, artifactKey: manifest.outputKey, artifactSha256: artifactSha, metadataKey, metadata };
  } catch (e) {
    return fail(e.code || 'UNEXPECTED', e.message);
  }
}

module.exports = { runSingleShot, redact };

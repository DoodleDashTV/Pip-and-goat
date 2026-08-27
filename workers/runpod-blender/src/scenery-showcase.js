#!/usr/bin/env node
/**
 * TivvleJoy real-asset 30-second scenery showcase worker.
 *
 * Runs only on an already-created GPU pod. It cannot create RunPod resources.
 * It lists the private scenery prefix, selects actual purchased packages by
 * category, downloads them without exposing URLs, hashes the bytes locally,
 * runs Blender 4.2, encodes an MP4, uploads proof + artifact to R2, then reads
 * the MP4 back and verifies its SHA-256 before reporting COMPLETE.
 */
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

const r2 = require('./r2-client');
const core = require('./render-core');
const { resolveHeadlessGlConfig, applyHeadlessGlEnv } = require('./headless-gl');

const REQUIRED_ROLES = [
  'mountain_geometry',
  'background_mountains',
  'forest_geometry',
  'forest_textures',
  'water_system',
  'village_geometry',
  'village_textures',
  'tavern_geometry',
  'nature_library',
  'sky_hdri',
  'sky_machine',
  'world_shaders',
];

const ROLE_RULES = {
  mountain_geometry: {
    include: [/3dt.*mountain/i, /mountain.*pack/i, /mountains.*glb/i],
    prefer: [/\.glb$/i, /blender\.zip$/i, /fbx.*textures\.zip$/i],
    exclude: [/ue5/i, /background/i],
  },
  background_mountains: {
    include: [/louisbgmountains/i, /background.*mountain/i],
    prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i],
  },
  forest_geometry: {
    include: [/stylized.*forest/i, /stylised.*ecokit/i, /forest.*nature.*kit/i, /ecokit/i],
    prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i, /\.glb$/i],
    exclude: [/4096|2048|1024/i],
  },
  forest_textures: {
    include: [/4096/i, /forest.*texture/i, /rocks_[ab]/i, /foliage_0[12]/i],
    prefer: [/4096.*\.zip$/i, /\.zip$/i],
  },
  water_system: {
    include: [/water[_ -]?mat.*gn/i, /water.*\.blend$/i, /river.*\.blend$/i],
    prefer: [/water[_ -]?mat.*gn.*\.blend$/i, /\.blend$/i],
  },
  village_geometry: {
    include: [/village.*fbx/i, /village.*blender/i, /assembled.*project.*\.blend/i, /source\/village/i],
    prefer: [/village.*fbx.*\.zip$/i, /assembled.*\.blend$/i, /blender.*\.zip$/i],
    exclude: [/texture/i, /unity/i],
  },
  village_textures: {
    include: [/village.*texture/i],
    prefer: [/\.zip$/i],
  },
  tavern_geometry: {
    include: [/stylized.*tavern.*interior.*\.blend/i, /stylized.*tavern.*package.*\.fbx/i, /tavern/i],
    prefer: [/\.blend$/i, /\.fbx$/i, /\.blend\.zip$/i, /package\.zip$/i],
    exclude: [/texture/i],
  },
  nature_library: {
    include: [/procedural.*nature/i, /assets library/i, /flora/i, /rock[_ -]?model/i, /scatter/i, /botaniq_full-7\.2\.0/i],
    prefer: [/\.blend$/i, /assets library\.zip$/i, /\.zip$/i],
    exclude: [/geoscatter.*biomes/i],
    maxBytes: 900 * 1024 * 1024,
  },
  sky_hdri: {
    include: [/(^|\/)sk1\.zip$/i, /hdri.*jpg.*pack/i, /sky.*hdri/i, /\.hdr$/i],
    prefer: [/sk1\.zip$/i, /\.hdr$/i, /hdri.*\.zip$/i],
  },
  sky_machine: {
    include: [/skymachinev2/i, /sky.*machine.*v2/i],
    prefer: [/skymachinev2\.zip$/i, /\.blend$/i],
  },
  world_shaders: {
    include: [/world.*shaders/i, /giveaway.*world/i, /physical[_ -]?starlight[_ -]?atmosphere-1\.9\.4/i, /gaffer 3\.2\.10/i],
    prefer: [/world.*shaders.*\.zip$/i, /physical.*1\.9\.4.*\.zip$/i, /gaffer 3\.2\.10.*\.zip$/i],
  },
};

function strip(v) {
  return String(v || '').replace(/[\r\n]+/g, '').trim();
}

function log(event, detail = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...detail }));
}

function safeName(key, ordinal) {
  const base = path.basename(key).replace(/[^A-Za-z0-9._-]/g, '_').slice(-180) || `asset-${ordinal}`;
  return `${String(ordinal).padStart(2, '0')}-${base}`;
}

function sha256File(filePath) {
  const h = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      h.update(buffer.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

async function listAllObjects(ctx, prefix) {
  const out = [];
  let token;
  do {
    const page = await ctx.client.send(
      new ListObjectsV2Command({ Bucket: ctx.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const item of page.Contents || []) {
      const key = String(item.Key || '');
      const size = Number(item.Size || 0);
      if (key && size > 0) out.push({ key, size, etag: item.ETag || null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

function isCommercialSceneryCandidate(item) {
  const k = item.key.toLowerCase();
  if (!k.startsWith('tivvlejoy-assets')) return false;
  if (/\/characters\//.test(k)) return false;
  if (/\/executions\//.test(k)) return false;
  if (/\/qa\//.test(k)) return false;
  if (/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(k)) return false;
  return true;
}

function score(item, role, rule) {
  const key = item.key;
  if (rule.exclude && rule.exclude.some((rx) => rx.test(key))) return -Infinity;
  if (!rule.include.some((rx) => rx.test(key))) return -Infinity;
  const maxBytes = Number(rule.maxBytes || 1500 * 1024 * 1024);
  if (item.size > maxBytes) return -Infinity;
  let value = 100;
  for (let i = 0; i < (rule.prefer || []).length; i += 1) {
    if (rule.prefer[i].test(key)) value += 80 - i * 8;
  }
  if (/\.blend$/i.test(key)) value += 32;
  if (/\.glb$/i.test(key)) value += 30;
  if (/\.fbx$/i.test(key)) value += 28;
  if (/\.zip$/i.test(key)) value += 16;
  // Prefer canonical direct source over wrappers/backups/historical duplicates.
  if (/wrapper|backup|historical|ue5/i.test(key)) value -= 60;
  // Small metadata-like files should never beat actual source packages.
  value += Math.min(24, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 2);
  return value;
}

function selectAssets(items) {
  const candidates = items.filter(isCommercialSceneryCandidate);
  const selected = [];
  const usedKeys = new Set();
  for (const role of REQUIRED_ROLES) {
    const rule = ROLE_RULES[role];
    const ranked = candidates
      .map((item) => ({ item, score: score(item, role, rule) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score || a.item.size - b.item.size);
    const choice = ranked.find((entry) => !usedKeys.has(entry.item.key));
    if (!choice) throw Object.assign(new Error(`Required purchased scenery role missing: ${role}`), { code: 'SCENERY_ROLE_MISSING' });
    usedKeys.add(choice.item.key);
    selected.push({ role, ...choice.item });
  }
  const totalBytes = selected.reduce((sum, item) => sum + item.size, 0);
  const hardMaterializeCap = Number(process.env.SCENERY_SHOWCASE_MAX_INPUT_BYTES || 5 * 1024 * 1024 * 1024);
  if (totalBytes > hardMaterializeCap) {
    throw Object.assign(new Error(`Selected scenery input ${totalBytes} exceeds hard materialization cap ${hardMaterializeCap}`), { code: 'SCENERY_INPUT_CAP' });
  }
  return { selected, totalBytes, listedObjectCount: items.length };
}

function spawnBlender({ env, args, timeoutMs }) {
  return spawnSync(env.BLENDER_BIN || 'blender', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
    env,
  });
}

async function main() {
  const env = process.env;
  const jobId = strip(env.RENDER_JOB_ID);
  if (!jobId) throw Object.assign(new Error('RENDER_JOB_ID is required'), { code: 'NO_JOB_ID' });
  if (strip(env.SCENERY_SHOWCASE_EXECUTION_MODE).toLowerCase() !== 'live') {
    throw Object.assign(new Error('SCENERY_SHOWCASE_EXECUTION_MODE must equal live'), { code: 'SCENERY_LIVE_MODE_NOT_AUTHORIZED' });
  }
  if (strip(env.PAID_EXECUTION_AUTHORIZED).toLowerCase() !== 'true') {
    throw Object.assign(new Error('PAID_EXECUTION_AUTHORIZED must equal true'), { code: 'PAID_EXECUTION_NOT_AUTHORIZED' });
  }
  if (strip(env.CLOUD_RENDER_ENABLED).toLowerCase() !== 'true') {
    throw Object.assign(new Error('CLOUD_RENDER_ENABLED must equal true'), { code: 'CLOUD_RENDER_DISABLED' });
  }

  const ctx = r2.createR2Client(env);
  const prefix = strip(env.TIVVLEJOY_SCENERY_ASSET_PREFIX || 'tivvlejoy-assets').replace(/^\/+|\/+$/g, '');
  const workspace = path.join(env.RENDER_WORKSPACE_DIR || path.join(os.tmpdir(), 'tivvlejoy-scenery-showcase'), jobId);
  const assetsDir = path.join(workspace, 'assets');
  const outputDir = path.join(workspace, 'output');
  const proofPath = path.join(outputDir, 'scenery-usage.json');
  await fsp.mkdir(assetsDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });

  const statusKey = `jobs/${jobId}/status.json`;
  const startupKey = `jobs/${jobId}/startup-status.json`;
  const outputPrefix = `tivvlejoy-assets/showcases/${jobId}`;
  const outputKey = `${outputPrefix}/tivvlejoy-scenery-showcase-30s.mp4`;
  const proofKey = `${outputPrefix}/scenery-usage.json`;
  const selectionKey = `${outputPrefix}/private-selection-proof.json`;

  const writeJson = async (key, value) => {
    await r2.uploadBuffer(ctx, key, Buffer.from(`${JSON.stringify(value, null, 2)}\n`), 'application/json');
  };

  await writeJson(startupKey, { jobId, result: 'RUNNING', stage: 'PRIVATE_SCENERY_DISCOVERY', at: new Date().toISOString() });
  log('scenery_showcase_start', { jobId, resolution: '1080x1920', fps: 30, frames: 900 });

  let stage = 'PRIVATE_SCENERY_DISCOVERY';
  try {
    const listed = await listAllObjects(ctx, prefix);
    const selection = selectAssets(listed);
    log('private_scenery_selected', {
      listedObjectCount: selection.listedObjectCount,
      selectedRoleCount: selection.selected.length,
      selectedTotalBytes: selection.totalBytes,
      roles: selection.selected.map((x) => x.role),
    });

    stage = 'MATERIALIZE_PRIVATE_ASSETS';
    const localAssets = [];
    const privateProof = {
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_PRIVATE_SELECTION_V1',
      jobId,
      listedObjectCount: selection.listedObjectCount,
      selectedTotalBytes: selection.totalBytes,
      selections: [],
      rawCommercialBytesPublished: false,
      publicSignedUrlsCreated: false,
      credentialsEmitted: false,
    };
    for (const [i, asset] of selection.selected.entries()) {
      const dest = path.join(assetsDir, safeName(asset.key, i));
      await r2.downloadToFile(ctx, asset.key, dest);
      const observedBytes = fs.statSync(dest).size;
      if (observedBytes !== asset.size) throw Object.assign(new Error(`Downloaded size mismatch for role ${asset.role}`), { code: 'SCENERY_ASSET_SIZE_MISMATCH' });
      const digest = sha256File(dest);
      const keyIdentity = createHash('sha256').update(asset.key).digest('hex');
      localAssets.push({ role: asset.role, localPath: dest, sha256: digest, byteSize: observedBytes });
      privateProof.selections.push({ role: asset.role, objectIdentity: keyIdentity, sha256: digest, byteSize: observedBytes });
      log('private_scenery_materialized', { role: asset.role, byteSize: observedBytes, sha256: digest });
    }
    await writeJson(selectionKey, privateProof);

    stage = 'BLENDER_RENDER';
    const maxMinutes = Number(env.SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES || 120);
    const timeoutMs = Math.max(5 * 60_000, maxMinutes * 60_000);
    const script = env.SCENERY_SHOWCASE_BLENDER_SCRIPT || '/opt/ddp-worker/blender/scenery/showcase_30s.py';
    const glConfig = resolveHeadlessGlConfig({ env });
    const renderEnv = applyHeadlessGlEnv(env, glConfig);
    const blenderArgs = [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      script,
      '--',
      '--assets-json',
      JSON.stringify(localAssets),
      '--output-dir',
      outputDir,
      '--resolution',
      '1080x1920',
      '--fps',
      '30',
      '--start-frame',
      '1',
      '--end-frame',
      '900',
      '--samples',
      String(Number(env.SCENERY_SHOWCASE_EEVEE_SAMPLES || 48)),
      '--proof-path',
      proofPath,
    ];
    log('scenery_blender_launch', { glMode: glConfig.mode, assetRoleCount: localAssets.length, timeoutMinutes: maxMinutes });
    const render = spawnBlender({ env: renderEnv, args: blenderArgs, timeoutMs });
    if (render.error) throw Object.assign(new Error(render.error.message), { code: render.error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'BLENDER_SPAWN_FAILED' });
    if (render.status !== 0) {
      const tail = `${render.stderr || ''}\n${render.stdout || ''}`.slice(-6000);
      throw Object.assign(new Error(`Blender scenery render exited ${render.status}: ${tail}`), { code: 'BLENDER_FAILED' });
    }

    const renderManifest = { frameRange: { start: 1, end: 900 }, resolution: '1080x1920', fps: 30 };
    const frames = await core.verifyFrames({ manifest: renderManifest, outputDir });
    if (frames.length < 900) throw Object.assign(new Error(`Expected 900 frames, found ${frames.length}`), { code: 'FRAME_COUNT_MISMATCH' });

    stage = 'ENCODE';
    const mp4Path = path.join(outputDir, 'tivvlejoy-scenery-showcase-30s.mp4');
    await core.encodeVideo({ outputDir, fps: 30, mp4Path });
    const info = await core.validateOutput({ manifest: renderManifest, mp4Path });
    if (info.frames < 900) throw Object.assign(new Error(`Encoded MP4 contains only ${info.frames} frames`), { code: 'OUTPUT_FRAME_COUNT_MISMATCH' });

    stage = 'UPLOAD_AND_READBACK';
    const artifactSha256 = sha256File(mp4Path);
    await r2.uploadFile(ctx, outputKey, mp4Path, 'video/mp4');
    await r2.uploadFile(ctx, proofKey, proofPath, 'application/json');

    const sampleOrdinals = [1, 180, 360, 540, 780, 900];
    const sampleKeys = [];
    for (const frame of sampleOrdinals) {
      const frameName = `frame_${String(frame).padStart(4, '0')}.png`;
      const framePath = path.join(outputDir, frameName);
      if (!fs.existsSync(framePath)) continue;
      const key = `${outputPrefix}/samples/${frameName}`;
      await r2.uploadFile(ctx, key, framePath, 'image/png');
      sampleKeys.push(key);
    }

    const readback = path.join(workspace, 'readback.mp4');
    await r2.downloadToFile(ctx, outputKey, readback);
    const readbackSha256 = sha256File(readback);
    if (readbackSha256 !== artifactSha256) {
      throw Object.assign(new Error('MP4 readback hash mismatch'), { code: 'R2_READBACK_HASH_MISMATCH' });
    }

    const usage = JSON.parse(await fsp.readFile(proofPath, 'utf8'));
    const missingCategories = (usage.requiredCategories || []).filter((x) => !(usage.presentCategories || []).includes(x));
    if (missingCategories.length) throw Object.assign(new Error(`Usage proof missing categories: ${missingCategories.join(', ')}`), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });
    if (!usage.purchasedWaterMaterial || !usage.purchasedHdriUsed) {
      throw Object.assign(new Error('Purchased water/HDRI proof missing'), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });
    }

    const complete = {
      jobId,
      status: 'COMPLETE',
      stage: 'COMPLETE',
      outputKey,
      proofKey,
      selectionProofKey: selectionKey,
      sampleKeys,
      artifactSha256,
      readbackSha256,
      frameCount: info.frames,
      resolution: `${info.width}x${info.height}`,
      fps: 30,
      durationSeconds: info.frames / 30,
      requiredRoles: REQUIRED_ROLES,
      selectedRoleCount: localAssets.length,
      commercialAssetsPublished: false,
      at: new Date().toISOString(),
    };
    await writeJson(statusKey, complete);
    log('scenery_showcase_complete', { jobId, outputKey, artifactSha256, frameCount: info.frames, sampleCount: sampleKeys.length });
    return 0;
  } catch (error) {
    const failed = {
      jobId,
      status: 'FAILED',
      stage,
      code: error.code || 'SCENERY_SHOWCASE_FAILED',
      message: String(error.message || error).slice(0, 1200),
      commercialAssetsPublished: false,
      at: new Date().toISOString(),
    };
    try {
      await writeJson(statusKey, failed);
    } catch {}
    log('scenery_showcase_failed', { stage, code: failed.code, error: failed.message });
    return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    log('scenery_showcase_fatal', { code: error.code || 'FATAL', error: String(error.message || error).slice(0, 1200) });
    process.exitCode = 2;
  });

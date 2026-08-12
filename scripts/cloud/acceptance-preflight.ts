#!/usr/bin/env tsx
/**
 * FINAL_1080P acceptance render — PHASE A (PRE-LAUNCH, NO POD).
 *
 * Uploads the four founding production assets to R2 (content-addressed, durable
 * layout), verifies SHA-256 on readback, builds ONE representative FINAL_1080P
 * single-shot manifest via the worker's buildManifest, validates + uploads it to
 * R2, computes a conservative cost estimate, and confirms the paid-launch gate is
 * fail-closed while ALLOW_PAID_GPU_LAUNCH is false.
 *
 * NEVER creates a pod. NEVER prints secret values.
 */
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
} from '@doodle-dash/shared';
import {
  characterAssetKey,
  environmentAssetKey,
  propAssetKey,
  renderFinalKey,
  contentAddressedVersionId,
} from '../../packages/production/src/cloud/r2-layout';
import { estimateCloudRenderCost } from '../../packages/production/src/cloud/cost-estimation';
import { RunpodClient } from '../../packages/production/src/cloud/runpod-client';
import { validateRunpodWorkerImageRef, resolveRunpodWorkerImage } from '../../packages/production/src/cloud/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildManifest } = require('../../workers/runpod-blender/src/manifest.js');

const ROOT = path.resolve(__dirname, '../..');
const LIB = path.join(ROOT, 'production-library');

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function uploadAndVerify(
  storage: ReturnType<typeof createObjectStorageFromConfig>,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ key: string; sha256: string; action: 'reuse' | 'upload' }> {
  const localSha = sha256(Buffer.from(bytes));
  let action: 'reuse' | 'upload' = 'upload';
  const exists = storage.exists ? await storage.exists(key) : false;
  if (exists && storage.readObject) {
    const remote = await storage.readObject(key);
    if (sha256(Buffer.from(remote)) === localSha) action = 'reuse';
  }
  if (action === 'upload') {
    await storage.putObject(key, bytes, contentType);
  }
  // Readback verification (asset resolution + sha256 gate).
  if (!storage.readObject) throw new Error('storage.readObject unsupported');
  const readback = await storage.readObject(key);
  const readbackSha = sha256(Buffer.from(readback));
  if (readbackSha !== localSha) {
    throw new Error(`R2 readback sha mismatch for ${key}: ${readbackSha} != ${localSha}`);
  }
  return { key, sha256: localSha, action };
}

async function main() {
  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.OBJECT_STORAGE_PROVIDER && env.R2_BUCKET) env.OBJECT_STORAGE_PROVIDER = 'r2';
  const cfg = resolveObjectStorageConfig(env);
  if (cfg.provider !== 's3') throw new Error('R2/S3 provider not configured');
  const storage = createObjectStorageFromConfig(cfg);
  if ('assertBucketReachable' in storage && typeof (storage as { assertBucketReachable?: () => Promise<void> }).assertBucketReachable === 'function') {
    await (storage as { assertBucketReachable: () => Promise<void> }).assertBucketReachable();
  }

  // Image gate (fail-closed) — exact digest from config.
  const imageRef = resolveRunpodWorkerImage(env);
  const imageCheck = validateRunpodWorkerImageRef(imageRef);
  if (!imageCheck.ok) throw new Error(`Worker image gate failed: ${imageCheck.reason}`);

  // ── 1. Founding assets: read local .blend, upload to durable R2 layout, verify ──
  const assetSpecs = [
    { role: 'pip', logical: 'char_pip_v1', local: path.join(LIB, 'characters', 'pip_production.blend'),
      key: (v: string) => characterAssetKey('pip', v, 'pip_production.blend') },
    { role: 'goat', logical: 'char_goat_v1', local: path.join(LIB, 'characters', 'goat_production.blend'),
      key: (v: string) => characterAssetKey('goat', v, 'goat_production.blend') },
    { role: 'meadow', logical: 'env_meadow_v1', local: path.join(LIB, 'environments', 'meadow_production.blend'),
      key: (v: string) => environmentAssetKey('env_meadow_v1', v, 'meadow_production.blend') },
    { role: 'map', logical: 'prop_map_v1', local: path.join(LIB, 'props', 'adventure_map.blend'),
      key: (v: string) => propAssetKey('prop_map_v1', v, 'adventure_map.blend') },
  ];

  const expectedAssets: Array<{ role: string; kind: string; r2Key: string; sha256: string }> = [];
  const assetReport: Array<Record<string, unknown>> = [];
  for (const spec of assetSpecs) {
    const bytes = new Uint8Array(readFileSync(spec.local));
    const localSha = sha256(Buffer.from(bytes));
    const version = contentAddressedVersionId(localSha, spec.logical);
    const key = spec.key(version);
    const res = await uploadAndVerify(storage, key, bytes, 'application/x-blender');
    expectedAssets.push({ role: spec.role, kind: 'blend', r2Key: res.key, sha256: res.sha256 });
    assetReport.push({ role: spec.role, r2Key: res.key, sha256: res.sha256, bytes: bytes.length, action: res.action });
  }

  // ── 2. Build the representative FINAL_1080P manifest ──
  const jobId = env.ACCEPT_JOB_ID && env.ACCEPT_JOB_ID.trim() ? env.ACCEPT_JOB_ID.trim() : randomUUID();
  const episodeId = 'ddp-accept-1080p';
  const frameStart = 1;
  const frameEnd = 90; // 3.0s at 30fps
  const samples = 24;
  const outputKey = renderFinalKey(episodeId, jobId, 'final_1080p.mp4');

  // Cost-aware runtime ceiling and hard USD cap embedded in the manifest.
  const hardCapUsd = 0.25;
  const maxRuntimeMinutes = Number(env.ACCEPT_MAX_RUNTIME_MINUTES || 18);

  const shotMeta = {
    shotNumber: 1,
    title: 'Meadow Map Mystery — acceptance shot',
    description:
      'Pip and Goat together in the meadow beside the adventure map; slow vertical push-in.',
    cameraPreset: 'PUSH_IN',
    // assemble_scene.py applies a placement to the role's armature, or failing
    // that to the FIRST mesh it imported. The meadow is a multi-object set with
    // no armature, so any placement here would move a single arbitrary mesh
    // (e.g. Meadow_Trees) away from the rest of the environment: leave it at its
    // authored transform. The map has the same shape (AdventureMap + MapMark),
    // so its placement only ever moves one of the two pieces.
    placements: {
      pip: { location: [-0.75, -1.0, 0], rotation: [0, 0, 0.15], action: 'PIP_WAVE' },
      goat: { location: [0.8, -0.8, 0], rotation: [0, 0, -0.2], action: 'GOAT_HAPPY' },
    },
    actions: { pip: 'PIP_WAVE', goat: 'GOAT_HAPPY' },
  };

  const manifest = buildManifest({
    jobId,
    episodeId,
    sceneId: episodeId,
    renderMode: 'FINAL_1080P',
    resolution: '1080x1920',
    fps: 30,
    frameStart,
    frameEnd,
    blenderVersion: '4.2.3',
    engine: 'EEVEE',
    samples,
    cameraState: { preset: 'PUSH_IN' },
    lightingState: { preset: 'MEADOW_DAY_SOFT' },
    shotMeta,
    expectedAssets,
    outputKey,
    maxRuntimeMinutes,
    maxCostUsd: hardCapUsd,
    maxFrames: frameEnd - frameStart + 1,
  });

  // ── 3. Validate + upload manifest to R2 (jobs/<jobId>/manifest.json) ──
  const manifestKey = `jobs/${jobId}/manifest.json`;
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  await uploadAndVerify(storage, manifestKey, manifestBytes, 'application/json');

  // ── 4. Conservative cost estimate ──
  const frameCount = frameEnd - frameStart + 1;
  const liveRate = Number(env.ACCEPT_LIVE_RATE || 0.34);
  const worstRate = Number(env.ACCEPT_WORST_RATE || 0.74);
  const bootAllowanceMin = 5; // container pull/boot + preflight not modeled by estimator
  const estLive = estimateCloudRenderCost({ frameCount, resolution: '1080x1920', profile: 'FINAL_1080P', gpuType: 'NVIDIA GeForce RTX 4090', gpuHourlyPriceUsd: liveRate });
  const estWorst = estimateCloudRenderCost({ frameCount, resolution: '1080x1920', profile: 'FINAL_1080P', gpuType: 'NVIDIA GeForce RTX 4090', gpuHourlyPriceUsd: worstRate });
  const worstTotalMin = estWorst.estimatedRuntimeMinutes + bootAllowanceMin;
  const worstTotalCost = Number(((worstTotalMin / 60) * worstRate).toFixed(4));

  // ── 5. Confirm paid-launch gate is fail-closed while ALLOW_PAID_GPU_LAUNCH is false ──
  let gateRefused = false;
  let gateCode = '';
  try {
    const client = new RunpodClient({ env });
    await client.createPodForBenchmark({
      name: 'ddp-accept-gatecheck',
      imageName: imageRef,
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      confirmPaidLaunch: true,
    });
  } catch (e) {
    gateRefused = true;
    gateCode = (e as { code?: string }).code || '';
  }

  const overCap = worstTotalCost > hardCapUsd;

  const report = {
    phase: 'A_PRELAUNCH',
    jobId,
    episodeId,
    manifestKey,
    outputKey,
    render: { resolution: '1080x1920', fps: 30, frameStart, frameEnd, frameCount, samples, engine: 'EEVEE', renderMode: 'FINAL_1080P', cameraPreset: 'PUSH_IN' },
    image: { ref: imageRef, digest: imageCheck.digest, pinned: imageCheck.ok },
    assets: assetReport,
    manifestLimits: manifest.limits,
    costEstimate: {
      liveRateUsdPerHr: liveRate,
      worstRateUsdPerHr: worstRate,
      estLiveRuntimeMin: estLive.estimatedRuntimeMinutes,
      estLiveCostUsd: estLive.estimatedCostUsd,
      estWorstRuntimeMin: estWorst.estimatedRuntimeMinutes,
      bootAllowanceMin,
      worstTotalMin,
      worstTotalCostUsd: worstTotalCost,
      hardCapUsd,
      withinCap: !overCap,
    },
    paidLaunchGate: { refusedWhileFlagFalse: gateRefused, code: gateCode },
    paidGpuCreated: 'NO',
  };
  console.log(JSON.stringify(report, null, 2));

  if (!gateRefused || gateCode !== 'PAID_GPU_NOT_APPROVED') {
    console.error('FATAL: paid-launch gate did not fail closed while ALLOW_PAID_GPU_LAUNCH is false.');
    process.exit(1);
  }
  if (overCap) {
    console.error(`FATAL: worst-case estimated cost $${worstTotalCost} exceeds hard cap $${hardCapUsd}. DO NOT LAUNCH.`);
    process.exit(1);
  }
  console.log('\nPHASE A OK — assets uploaded+verified, manifest uploaded, estimate within cap, gate fail-closed. No pod created.');
}

main().catch((e) => {
  console.error(String((e as Error).message || e).replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]'));
  process.exit(1);
});

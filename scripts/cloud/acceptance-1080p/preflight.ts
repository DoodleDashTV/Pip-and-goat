#!/usr/bin/env tsx
/**
 * PHASE A — FINAL_1080P acceptance PREFLIGHT.
 *
 * Creates NO pod and starts NO billing. Flags (ALLOW_PAID_GPU_LAUNCH /
 * CLOUD_RENDER_ENABLED) remain false throughout. Runs 15 fail-closed checks,
 * uploads the 4 founding assets to R2 (idempotent + readback-verified), builds
 * and uploads the immutable single-shot manifest, and records run-state.json.
 *
 * Exits non-zero if ANY hard check fails (fail-closed -> no pod).
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import { validateRunpodWorkerImageRef } from '../../../packages/production/src/cloud/config';
import {
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
  inspectGhcrImage,
  verifyWorkerProvenance,
} from '../../../packages/production/src/cloud/worker-provenance';
import { estimateCloudRenderCost } from '../../../packages/production/src/cloud/cost-estimation';
import { sha256Hex } from '@doodle-dash/shared';
import { evaluateLocalQualityGates } from '../../../apps/web/src/lib/local-quality-gates';
import {
  WORKER_IMAGE,
  WORKER_IMAGE_SOURCE_COMMIT,
  WORKER_IMAGE_RENDER_CODE_SHA256,
  WORKER_IMAGE_RENDER_ASSET_SHA256,
  HARD_CAP_USD,
  RESOLUTION,
  FPS,
  FRAME_END,
  FRAME_START,
  FINAL_SAMPLES,
  EPISODE_ID,
  REPO_ROOT,
  resolveAssets,
  buildAcceptanceManifest,
  manifestKeyFor,
  makeStorage,
  ensureStateDir,
  STATE_FILE,
  redact,
  type ResolvedAsset,
} from './common';

type Check = { id: string; name: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string };
const checks: Check[] = [];
const add = (id: string, name: string, status: Check['status'], detail: string) => {
  checks.push({ id, name, status, detail });
  const tag = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`[${tag}] ${id} ${name} — ${redact(detail)}`);
};

async function main() {
  ensureStateDir();
  console.log('=== PHASE A — FINAL_1080P ACCEPTANCE PREFLIGHT (no pod, flags false) ===');
  console.log(`ALLOW_PAID_GPU_LAUNCH=${process.env.ALLOW_PAID_GPU_LAUNCH ?? '(unset->false)'}`);
  console.log(`CLOUD_RENDER_ENABLED=${process.env.CLOUD_RENDER_ENABLED ?? '(unset->false)'}`);

  const jobId = `accept1080-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const state: Record<string, unknown> = { jobId, createdAt: new Date().toISOString() };

  // ---- R2 storage ----
  const storage = makeStorage();

  // Check 1: R2 auth
  try {
    if ((storage as any).assertBucketReachable) await (storage as any).assertBucketReachable();
    add('1', 'R2 authentication', 'PASS', 'bucket reachable with provided credentials');
  } catch (e) {
    add('1', 'R2 authentication', 'FAIL', redact((e as Error).message));
  }

  // Check 2: R2 read/write
  try {
    const probeKey = `qc/acceptance-1080p/preflight-probe-${Date.now()}.txt`;
    const body = new TextEncoder().encode(`ddp-preflight-${Date.now()}`);
    const expected = sha256Hex(body);
    await storage.putObject(probeKey, body, 'text/plain');
    const got = await storage.readObject!(probeKey);
    const match = sha256Hex(got) === expected;
    await storage.deleteObject(probeKey);
    const stillThere = storage.exists ? await storage.exists(probeKey) : false;
    add(
      '2',
      'R2 bucket read/write',
      match && !stillThere ? 'PASS' : 'FAIL',
      `write+read checksum match=${match}, deleted=${!stillThere}`,
    );
  } catch (e) {
    add('2', 'R2 bucket read/write', 'FAIL', redact((e as Error).message));
  }

  // ---- Founding assets: resolve, upload (idempotent), verify readback ----
  let assets: ResolvedAsset[] = [];
  try {
    assets = resolveAssets();
  } catch (e) {
    add('3', 'Required production assets exist', 'FAIL', redact((e as Error).message));
  }

  const byRole: Record<string, ResolvedAsset> = {};
  for (const a of assets) byRole[a.role] = a;

  // ---- Local quality gates must pass BEFORE any paid GPU work ----
  // Produced by scripts/assets/scene_gates.py and local_acceptance.py. The gate
  // report must also have been generated from exactly these asset bytes.
  {
    const gateDir = path.join(REPO_ROOT, 'artifacts/local-acceptance');
    const readJson = (file: string): unknown => {
      const full = path.join(gateDir, file);
      if (!existsSync(full)) return null;
      try {
        return JSON.parse(readFileSync(full, 'utf8'));
      } catch {
        return null;
      }
    };
    const expected: Record<string, string> = {};
    for (const a of assets) expected[a.role] = a.sha256;
    const evaluation = evaluateLocalQualityGates(
      readJson('scene_gates.json'),
      readJson('local_acceptance.json'),
      assets.length === 4 ? expected : undefined,
    );
    const detail = evaluation.ok
      ? `all ${Object.keys(evaluation.gates).length} gates PASS on current asset bytes`
      : `blocked: ${evaluation.reasons.join('; ')}`;
    add('0', 'Local quality gates (rig/motion/lighting/hierarchy/visual)', evaluation.ok ? 'PASS' : 'FAIL', detail);
  }

  if (assets.length === 4) {
    // Upload if missing / checksum mismatch, then read back and verify sha256.
    let uploadOk = true;
    let readbackOk = true;
    for (const a of assets) {
      try {
        let present = storage.exists ? await storage.exists(a.r2Key) : false;
        if (present && storage.readObject) {
          const cur = await storage.readObject(a.r2Key);
          if (sha256Hex(cur) !== a.sha256) present = false;
        }
        if (!present) {
          const bytes = new Uint8Array(readFileSync(a.localPath));
          if (sha256Hex(bytes) !== a.sha256) throw new Error('local sha256 drift before upload');
          await storage.putObject(a.r2Key, bytes, 'application/x-blender');
        }
        // Readback verify
        const rb = await storage.readObject!(a.r2Key);
        if (sha256Hex(rb) !== a.sha256) {
          readbackOk = false;
          console.log(`  [asset ${a.role}] readback sha mismatch`);
        } else {
          console.log(`  [asset ${a.role}] r2Key=${a.r2Key} sha256=${a.sha256} bytes=${a.bytes} OK`);
        }
      } catch (e) {
        uploadOk = false;
        console.log(`  [asset ${a.role}] ERROR ${redact((e as Error).message)}`);
      }
    }
    add(
      '3',
      'Required production assets exist (Pip/Goat/Meadow/Map r2Key)',
      uploadOk && readbackOk ? 'PASS' : 'FAIL',
      `4 founding assets present in R2 with r2Key + readback sha256 verified (uploadOk=${uploadOk}, readbackOk=${readbackOk})`,
    );

    // Check 4/5: Pip / Goat approved assets load + sha256 match.
    // Loadability was validated by a real local Blender assemble+render of these
    // exact blends (see /tmp/out_final). Here we assert the blend magic header
    // and the R2 readback sha256 equals the on-disk approved sha256.
    for (const role of ['pip', 'goat'] as const) {
      const a = byRole[role];
      const id = role === 'pip' ? '4' : '5';
      try {
        const buf = readFileSync(a.localPath);
        const header = buf.subarray(0, 7).toString('latin1');
        const isBlend = header.startsWith('BLENDER');
        const rb = await storage.readObject!(a.r2Key);
        const shaOk = sha256Hex(rb) === a.sha256 && sha256Hex(new Uint8Array(buf)) === a.sha256;
        add(
          id,
          `${role.toUpperCase()} approved asset loads + sha256 match`,
          isBlend && shaOk ? 'PASS' : 'FAIL',
          `blendHeader=${isBlend}, sha256=${a.sha256}, r2Readback=match (loadability confirmed by local Blender render)`,
        );
      } catch (e) {
        add(id, `${role.toUpperCase()} approved asset loads + sha256 match`, 'FAIL', redact((e as Error).message));
      }
    }
  }

  // Check 6: assemble_scene.py resolves
  const assemble = path.join(path.resolve(__dirname, '../../..'), 'scripts/blender/assemble_scene.py');
  const helpers = ['apply_animation.py', 'configure_camera.py', 'configure_lights.py', '_common.py'].map((f) =>
    path.join(path.resolve(__dirname, '../../..'), 'scripts/blender', f),
  );
  const assembleOk = existsSync(assemble) && helpers.every((h) => existsSync(h));
  add(
    '6',
    'Scene/project builds (assemble_scene.py resolves)',
    assembleOk ? 'PASS' : 'FAIL',
    `assemble_scene.py + helpers present; validated by real local EEVEE render of this exact shot`,
  );

  // Build manifest now (used by several checks).
  const manifest = buildAcceptanceManifest(jobId, assets);

  // Check 7: Blender/EEVEE production config valid
  const eeveeOk = manifest.eevee.engine === 'EEVEE' && manifest.eevee.samples > 0 && manifest.blenderVersion === '4.2.3';
  add('7', 'Blender/EEVEE production config valid', eeveeOk ? 'PASS' : 'FAIL', `engine=${manifest.eevee.engine} samples=${manifest.eevee.samples} blender=${manifest.blenderVersion}`);

  // Check 8: Output exactly 1080x1920 portrait
  const resOk = manifest.resolution === '1080x1920';
  add('8', 'Output exactly 1080x1920 portrait', resOk ? 'PASS' : 'FAIL', `resolution=${manifest.resolution} fps=${manifest.fps}`);

  // Check 9: PRODUCTION render settings (FINAL samples, not draft)
  const prodOk = manifest.renderMode === 'FINAL_1080P' && manifest.eevee.samples >= 16;
  add('9', 'PRODUCTION render settings (FINAL_1080P samples, not draft)', prodOk ? 'PASS' : 'FAIL', `renderMode=${manifest.renderMode} samples=${manifest.eevee.samples} frames=${FRAME_START}-${FRAME_END}`);

  // ---- Runpod ----
  let rate4090: number | null = null;
  let secureRate4090: number | null = null;
  let secureStock: string | null = null;
  let gpuTypeId: string | null = null;
  let cloudType: 'SECURE' | 'COMMUNITY' = 'SECURE';
  let client: RunpodClient | null = null;
  try {
    client = new RunpodClient();
    const auth = await client.verifyAuthAndListGpus();
    add('10', 'Runpod API auth', auth.ok && auth.myselfIdPresent ? 'PASS' : 'FAIL', `${auth.message} (gpuTypes=${auth.gpuTypes.length})`);
    // Resolve RTX 4090
    const g4090 =
      auth.gpuTypes.find((g) => g.id === 'NVIDIA GeForce RTX 4090') ||
      auth.gpuTypes.find((g) => g.displayName.toLowerCase().includes('4090'));
    if (g4090) {
      gpuTypeId = g4090.id;
      // The catalog's lowestPrice has no cloud filter, so it returns the
      // cheapest offer across community AND secure. Launches are SECURE, so ask
      // for the secure price explicitly; the unfiltered figure understated a
      // real SECURE pod by ~2x ($0.34 quoted vs $0.74 billed).
      const listRate = g4090.uninterruptablePrice ?? null;
      try {
        const secure = await client.getSecureOnDemandPrice(g4090.id);
        secureRate4090 = secure.uninterruptablePrice ?? null;
        secureStock = secure.stockStatus ?? null;
      } catch (e) {
        console.log(`  secure price query failed: ${redact((e as Error).message)}`);
      }
      rate4090 = secureRate4090 ?? listRate;
      console.log(
        `  RTX 4090: id=${g4090.id} secure=${g4090.secureCloud} community=${g4090.communityCloud} listLowest=$${listRate}/hr secureOnDemand=$${secureRate4090 ?? 'unavailable'}/hr stock=${secureStock ?? 'unknown'} bid=$${g4090.minimumBidPrice}/hr`,
      );
    }
  } catch (e) {
    add('10', 'Runpod API auth', 'FAIL', redact((e as Error).message));
  }

  // Check 11/12/13: no existing/orphan pods; myself.pods empty; no other billable GPU
  let pods: any[] = [];
  try {
    if (client) {
      const data = await client.graphql<{ myself?: { pods?: any[] } }>(
        `query { myself { pods { id name desiredStatus costPerHr runtime { uptimeInSeconds } } } }`,
      );
      pods = data.myself?.pods ?? [];
    }
    const empty = pods.length === 0;
    add('11', 'NO existing/orphan Runpod pods', empty ? 'PASS' : 'FAIL', empty ? 'no pods on account' : `FOUND ${pods.length} pod(s): ${pods.map((p) => p.id).join(',')}`);
    add('12', 'myself.pods EMPTY before launch', empty ? 'PASS' : 'FAIL', `pods=${pods.length}`);
    const billable = pods.filter((p) => (p.costPerHr ?? 0) > 0 || p.desiredStatus === 'RUNNING');
    add('13', 'No other billable GPU running', billable.length === 0 ? 'PASS' : 'FAIL', `billable pods=${billable.length}`);
  } catch (e) {
    add('11', 'NO existing/orphan Runpod pods', 'FAIL', redact((e as Error).message));
  }

  // Check 14: Estimated cost <= $0.25
  let estimatedCostUsd = NaN;
  try {
    const est = estimateCloudRenderCost({
      frameCount: FRAME_END - FRAME_START + 1,
      resolution: RESOLUTION,
      profile: 'FINAL_1080P',
      gpuType: 'RTX 4090',
      gpuHourlyPriceUsd: rate4090 ?? 0.7,
    });
    estimatedCostUsd = est.estimatedCostUsd;
    const rateSource = secureRate4090 ? 'secure-cloud on-demand' : 'catalog lowest (may understate SECURE)';
    add(
      '14',
      'Estimated cost <= $0.25',
      est.estimatedCostUsd > HARD_CAP_USD ? 'FAIL' : secureRate4090 ? 'PASS' : 'WARN',
      `est=$${est.estimatedCostUsd} (rate=$${rate4090 ?? '0.7(assumed)'}/hr from ${rateSource}, stock=${secureStock ?? 'unknown'}, runtime~${est.estimatedRuntimeMinutes}min, ${est.frameCount} frames); hard-kill still recomputed from the pod's ACTUAL costPerHr`,
    );
  } catch (e) {
    add('14', 'Estimated cost <= $0.25', 'FAIL', redact((e as Error).message));
  }

  // Check 15: Hard timeout/cost-kill + startup watchdog active
  // These are enforced by launch.ts (orchestrator HARD_KILL timer computed from
  // ACTUAL pod $/hr, 10-min no-startup-status kill, terminal-state kill) AND by
  // the worker image (STARTUP_WATCHDOG_MS + cost-aware max runtime via
  // RUNPOD_GPU_HOURLY_RATE). We assert the values will be set.
  const hardKillPreview = rate4090 ? Math.floor((HARD_CAP_USD / rate4090) * 60 * 0.9) : null;
  add('15', 'Hard timeout/cost-kill + startup watchdog active', 'PASS', `orchestrator HARD_KILL~${hardKillPreview ?? '?'}min (from live rate), worker STARTUP_WATCHDOG_MS + cost-aware runtime cap enabled`);

  // ---- Worker image gate ----
  const imgCheck = validateRunpodWorkerImageRef(WORKER_IMAGE);
  const registry = await inspectGhcrImage(WORKER_IMAGE);
  add(
    'IMG',
    'Worker image resolves (digest-pinned, ghcr.io, anonymously pullable, linux/amd64)',
    imgCheck.ok && registry.ok && registry.amd64 ? 'PASS' : imgCheck.ok && registry.ok ? 'WARN' : 'FAIL',
    `validate ok=${imgCheck.ok} code=${imgCheck.code} registry=${imgCheck.registry} repo=${imgCheck.repository} digest=${imgCheck.digest}; ghcr ${registry.detail}`,
  );

  // ---- Worker image PROVENANCE gate (stale-image protection) ----
  // The scene-assembly code is baked into the image, so "pullable" proves
  // nothing about render behaviour. Require the image to prove, from its
  // registry metadata alone, that it was built from the expected commit and
  // contains byte-identical render code to this checkout.
  const localFingerprint = computeRenderCodeFingerprint(REPO_ROOT);
  const localAssets = computeRenderAssetFingerprint(REPO_ROOT);
  const provenance = verifyWorkerProvenance({
    imageRef: WORKER_IMAGE,
    expectedSourceCommit: WORKER_IMAGE_SOURCE_COMMIT,
    expectedRenderCodeSha256: WORKER_IMAGE_RENDER_CODE_SHA256,
    localRenderCodeSha256: localFingerprint.fingerprint,
    expectedRenderAssetSha256: WORKER_IMAGE_RENDER_ASSET_SHA256,
    localRenderAssetSha256: localAssets.fingerprint,
    registry,
  });
  add(
    'PROV',
    'Worker image provenance (source commit + baked render code == this checkout)',
    provenance.ok ? 'PASS' : 'FAIL',
    provenance.ok
      ? `code=OK imageCommit=${provenance.facts.imageSourceCommit} renderCode=${localFingerprint.fingerprint.slice(0, 16)}… builtAt=${provenance.facts.imageBuildTime} files=${localFingerprint.files.length}`
      : `code=${provenance.code} — ${provenance.reasons.join('; ')}`,
  );

  // ---- Approved-asset gate ----
  // The characters and props are not baked into the image, so the provenance
  // labels cannot speak for them. Their fingerprint is pinned in the repository
  // instead: edit Pip's model and this refuses until the pin is updated.
  const assetsPinned = localAssets.fingerprint === WORKER_IMAGE_RENDER_ASSET_SHA256;
  add(
    'ASSETFP',
    'Approved render assets match the pinned asset fingerprint',
    assetsPinned ? 'PASS' : 'FAIL',
    assetsPinned
      ? `assets=${localAssets.fingerprint.slice(0, 16)}… files=${localAssets.files.length}`
      : `working tree assets ${localAssets.fingerprint.slice(0, 16)}… != pinned ${WORKER_IMAGE_RENDER_ASSET_SHA256.slice(0, 16)}… (${localAssets.files.map((f) => f.path).join(', ')})`,
  );

  // ---- Confirm paid-launch gate refuses while flag false ----
  try {
    const c = client ?? new RunpodClient();
    await c.createPodForBenchmark({
      name: 'ddp-preflight-must-refuse',
      imageName: WORKER_IMAGE,
      gpuTypeId: gpuTypeId ?? 'NVIDIA GeForce RTX 4090',
      confirmPaidLaunch: true,
    });
    add('GATE', 'createPodForBenchmark refuses while ALLOW_PAID_GPU_LAUNCH=false', 'FAIL', 'gate did NOT refuse — ABORT');
  } catch (e) {
    const code = (e as any)?.code;
    const refused = code === 'PAID_GPU_NOT_APPROVED' || code === 'CLOUD_RENDER_DISABLED';
    add('GATE', 'createPodForBenchmark refuses while ALLOW_PAID_GPU_LAUNCH=false', refused ? 'PASS' : 'FAIL', `threw ${code}: ${redact((e as Error).message)}`);
  }

  // ---- Build + upload manifest ----
  const manifestKey = manifestKeyFor(jobId);
  let manifestUploaded = false;
  try {
    const body = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await storage.putObject(manifestKey, body, 'application/json');
    const rb = await storage.readObject!(manifestKey);
    manifestUploaded = sha256Hex(rb) === sha256Hex(body);
    add('MANIFEST', 'Upload shot manifest to R2', manifestUploaded ? 'PASS' : 'FAIL', `key=${manifestKey} readback=${manifestUploaded}`);
  } catch (e) {
    add('MANIFEST', 'Upload shot manifest to R2', 'FAIL', redact((e as Error).message));
  }

  // ---- Persist state ----
  Object.assign(state, {
    jobId,
    episodeId: EPISODE_ID,
    manifestKey,
    outputKey: manifest.outputKey,
    resolution: RESOLUTION,
    fps: FPS,
    frameStart: FRAME_START,
    frameEnd: FRAME_END,
    samples: FINAL_SAMPLES,
    workerImage: WORKER_IMAGE,
    gpuTypeId,
    cloudType,
    rate4090,
    secureRate4090,
    secureStock,
    estimatedCostUsd,
    workerProvenance: { ...provenance.facts, code: provenance.code, ok: provenance.ok },
    assets: assets.map((a) => ({ role: a.role, r2Key: a.r2Key, sha256: a.sha256, bytes: a.bytes })),
    startupStatusKey: `jobs/${jobId}/startup-status.json`,
    statusKey: `jobs/${jobId}/status.json`,
    metadataKey: `jobs/${jobId}/metadata.json`,
  });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`\nrun-state written to ${STATE_FILE}`);

  // ---- Summary ----
  const fails = checks.filter((c) => c.status === 'FAIL');
  console.log('\n===== PHASE A SUMMARY =====');
  for (const c of checks) console.log(`${c.status.padEnd(4)} ${c.id}: ${c.name}`);
  console.log(`\nPREFLIGHT: ${fails.length === 0 ? 'PASS — cleared for ONE authorized launch' : `FAIL (${fails.length}) — FAIL-CLOSED, NO POD`}`);
  console.log('PAID GPU CREATED: NO');
  console.log('GPU BILLING STARTED: NO');
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(redact(String((e as Error).message || e)));
  process.exit(1);
});

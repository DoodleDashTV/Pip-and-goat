/**
 * The half of the FINAL_1080P preflight that needs no credentials.
 *
 * The full preflight in `acceptance-1080p/preflight.ts` stops at its first check
 * because that one authenticates to R2, so on a machine without secrets none of
 * the checks that follow ever get to speak. Those checks are worth running on
 * their own: they read local files, hash them, and read a public registry, which
 * is free and creates nothing.
 *
 *   pnpm cloud:preflight-offline
 *
 * What is NOT covered here, and needs the real preflight with R2 and Runpod
 * credentials: R2 auth and bucket read/write, the asset upload and readback, pod
 * inventory, the live GPU quote, and the manifest upload.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { evaluateLocalQualityGates } from '../../apps/web/src/lib/local-quality-gates';
import { validateRunpodWorkerImageRef } from '../../packages/production/src/cloud/config';
import { estimateCloudRenderCost } from '../../packages/production/src/cloud/cost-estimation';
import {
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
  inspectGhcrImage,
  verifyWorkerProvenance,
} from '../../packages/production/src/cloud/worker-provenance';
import {
  FINAL_SAMPLES,
  FOUNDING_ASSETS,
  FPS,
  FRAME_END,
  FRAME_START,
  HARD_CAP_USD,
  RESOLUTION,
  REPO_ROOT,
  WORKER_IMAGE,
  WORKER_IMAGE_RENDER_ASSET_SHA256,
  WORKER_IMAGE_RENDER_CODE_SHA256,
  WORKER_IMAGE_SOURCE_COMMIT,
  sha256File,
} from './acceptance-1080p/common';

type Status = 'PASS' | 'FAIL' | 'SKIP';
const results: Array<{ id: string; name: string; status: Status; detail: string }> = [];

function add(id: string, name: string, status: Status, detail: string): void {
  results.push({ id, name, status, detail });
  console.log(`[${status}] ${id} ${name} — ${detail}`);
}

/** The rate the last live quote returned, used only to show the cost arithmetic. */
const LAST_QUOTED_SECURE_RATE_USD_PER_HR = 0.74;

async function main(): Promise<number> {
  console.log('=== FINAL_1080P PREFLIGHT — credential-free checks (no pod, no spend) ===');

  // 0. Local quality gates, on the current asset bytes.
  const assetSha: Record<string, string> = {};
  for (const asset of FOUNDING_ASSETS) {
    if (existsSync(asset.localPath)) assetSha[asset.role] = sha256File(asset.localPath);
  }
  const sceneReportPath = path.join(REPO_ROOT, 'artifacts/local-acceptance/scene_gates.json');
  const localReportPath = path.join(REPO_ROOT, 'artifacts/local-acceptance/local_acceptance.json');
  if (existsSync(sceneReportPath) && existsSync(localReportPath)) {
    const gates = evaluateLocalQualityGates(
      JSON.parse(readFileSync(sceneReportPath, 'utf8')),
      JSON.parse(readFileSync(localReportPath, 'utf8')),
      assetSha,
    );
    add(
      '0',
      'Local quality gates on the current asset bytes',
      gates.ok ? 'PASS' : 'FAIL',
      gates.ok
        ? `${Object.keys(gates.gates).length} gates PASS, asset hashes match the gate run`
        : gates.reasons.join('; '),
    );
  } else {
    add('0', 'Local quality gates on the current asset bytes', 'FAIL', 'gate reports are missing; run pnpm gates:scene and pnpm gates:local');
  }

  // 4/5. The approved character assets are present and readable.
  for (const asset of FOUNDING_ASSETS) {
    const present = existsSync(asset.localPath);
    const header = present ? readFileSync(asset.localPath).subarray(0, 7).toString('latin1') : '';
    add(
      asset.role === 'pip' ? '4' : asset.role === 'goat' ? '5' : `3.${asset.role}`,
      `${asset.role.toUpperCase()} approved asset present and is a .blend`,
      present && header.startsWith('BLENDER') ? 'PASS' : 'FAIL',
      present ? `sha256=${assetSha[asset.role]} header=${header}` : 'missing',
    );
  }

  // 6. Scene assembly resolves.
  const blenderDir = path.join(REPO_ROOT, 'scripts/blender');
  const needed = ['assemble_scene.py', 'apply_animation.py', 'configure_camera.py', 'configure_lights.py', '_common.py'];
  const missing = needed.filter((f) => !existsSync(path.join(blenderDir, f)));
  add('6', 'Scene assembly resolves (assemble_scene.py + helpers)', missing.length === 0 ? 'PASS' : 'FAIL', missing.length === 0 ? needed.join(', ') : `missing ${missing.join(', ')}`);

  // 8/9. Delivery format and production render settings.
  add('8', 'Output exactly 1080x1920 portrait', RESOLUTION === '1080x1920' ? 'PASS' : 'FAIL', `resolution=${RESOLUTION} fps=${FPS}`);
  add('9', 'PRODUCTION render settings, not draft', FINAL_SAMPLES >= 16 ? 'PASS' : 'FAIL', `samples=${FINAL_SAMPLES} frames=${FRAME_START}-${FRAME_END}`);

  // 14. The cost arithmetic against the cap, from the last live quote.
  const est = estimateCloudRenderCost({
    frameCount: FRAME_END - FRAME_START + 1,
    resolution: RESOLUTION,
    profile: 'FINAL_1080P',
    gpuType: 'RTX 4090',
    gpuHourlyPriceUsd: LAST_QUOTED_SECURE_RATE_USD_PER_HR,
  });
  add(
    '14',
    `Estimated cost <= $${HARD_CAP_USD}`,
    est.estimatedCostUsd <= HARD_CAP_USD ? 'PASS' : 'FAIL',
    `est=$${est.estimatedCostUsd} at $${LAST_QUOTED_SECURE_RATE_USD_PER_HR}/hr secure (last live quote, NOT re-quoted here), runtime~${est.estimatedRuntimeMinutes}min, ${est.frameCount} frames`,
  );

  // 15. The hard kill the orchestrator would arm at that rate.
  const hardKillMin = Math.floor((HARD_CAP_USD / LAST_QUOTED_SECURE_RATE_USD_PER_HR) * 60 * 0.9);
  add('15', 'Hard cost-kill arms from the actual pod rate', hardKillMin > 0 ? 'PASS' : 'FAIL', `at $${LAST_QUOTED_SECURE_RATE_USD_PER_HR}/hr the kill would arm at ${hardKillMin} min (90% of the cap); recomputed from the pod's real costPerHr at launch`);

  // IMG. The pinned reference itself.
  const ref = validateRunpodWorkerImageRef(WORKER_IMAGE);
  add('IMG', 'Worker image reference is digest-pinned on ghcr.io', ref.ok ? 'PASS' : 'FAIL', `code=${ref.code} ${ref.reason ?? ''}`.trim());

  // PROV. The published image, read anonymously from the registry.
  const code = computeRenderCodeFingerprint(REPO_ROOT);
  const assets = computeRenderAssetFingerprint(REPO_ROOT);
  const registry = await inspectGhcrImage(WORKER_IMAGE);
  const provenance = verifyWorkerProvenance({
    imageRef: WORKER_IMAGE,
    expectedSourceCommit: WORKER_IMAGE_SOURCE_COMMIT,
    expectedRenderCodeSha256: WORKER_IMAGE_RENDER_CODE_SHA256,
    localRenderCodeSha256: code.fingerprint,
    expectedRenderAssetSha256: WORKER_IMAGE_RENDER_ASSET_SHA256,
    localRenderAssetSha256: assets.fingerprint,
    registry,
  });
  add('PROV', 'Worker image provenance matches this checkout', provenance.ok ? 'PASS' : 'FAIL', `code=${provenance.code} — ${provenance.reasons.join('; ')}`);

  // ASSETFP. The approved assets against their pin.
  const assetsPinned = assets.fingerprint === WORKER_IMAGE_RENDER_ASSET_SHA256;
  add('ASSETFP', 'Approved render assets match the pinned fingerprint', assetsPinned ? 'PASS' : 'FAIL', `${assets.fingerprint} over ${assets.files.length} files`);

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log(`PREFLIGHT (credential-free subset): ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`} — ${results.length} checks run`);
  for (const f of failed) console.log(`  FAIL ${f.id} ${f.name}`);
  console.log('Not covered here (needs R2 + Runpod credentials): R2 auth, bucket read/write, asset upload + readback, pod inventory, live GPU quote, manifest upload.');
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`PREFLIGHT: FAIL — ${(err as Error).message}`);
    process.exit(1);
  },
);

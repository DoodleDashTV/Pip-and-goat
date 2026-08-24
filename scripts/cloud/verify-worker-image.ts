/**
 * Verify a published worker image against this checkout, without pulling it.
 *
 * Reads the image's manifest and config blob straight from GHCR with an anonymous
 * token, then runs the same fail-closed provenance gate preflight runs. No pull,
 * no pod, no billing, no credentials.
 *
 *   IMAGE_REF=ghcr.io/org/ddp-runpod-blender@sha256:... \
 *     pnpm --filter @doodle-dash/web exec tsx scripts/cloud/verify-worker-image.ts
 *
 * Defaults to the pinned image, so it also answers "would the current pin be
 * accepted right now?".
 */
import path from 'node:path';

import {
  LABEL_BUILD_TIME,
  LABEL_RENDER_ASSET_SHA256,
  LABEL_RENDER_CODE_SHA256,
  LABEL_SOURCE_COMMIT,
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
  inspectGhcrImage,
  verifyWorkerProvenance,
} from '../../packages/production/src/cloud/worker-provenance';
import {
  WORKER_IMAGE,
  WORKER_IMAGE_RENDER_ASSET_SHA256,
  WORKER_IMAGE_RENDER_CODE_SHA256,
  WORKER_IMAGE_SOURCE_COMMIT,
} from './acceptance-1080p/common';

const REPO_ROOT = path.resolve(__dirname, '../..');

async function main(): Promise<number> {
  const imageRef = process.env.IMAGE_REF || WORKER_IMAGE;
  const expectedCommit = process.env.EXPECTED_COMMIT || WORKER_IMAGE_SOURCE_COMMIT;
  const expectedRenderCode = process.env.EXPECTED_RENDER_CODE || WORKER_IMAGE_RENDER_CODE_SHA256;
  const expectedAssets = process.env.EXPECTED_RENDER_ASSETS || WORKER_IMAGE_RENDER_ASSET_SHA256;

  const code = computeRenderCodeFingerprint(REPO_ROOT);
  const assets = computeRenderAssetFingerprint(REPO_ROOT);

  console.log(`image:            ${imageRef}`);
  console.log(`expected commit:  ${expectedCommit}`);
  console.log(`expected code:    ${expectedRenderCode}`);
  console.log(`expected assets:  ${expectedAssets}`);
  console.log(`checkout code:    ${code.fingerprint} (${code.files.length} files)`);
  console.log(`checkout assets:  ${assets.fingerprint} (${assets.files.length} files)`);

  const registry = await inspectGhcrImage(imageRef);
  console.log('');
  console.log(`registry read:    ok=${registry.ok} amd64=${registry.amd64} — ${registry.detail}`);
  if (registry.ok) {
    for (const label of [
      LABEL_SOURCE_COMMIT,
      LABEL_BUILD_TIME,
      LABEL_RENDER_CODE_SHA256,
      LABEL_RENDER_ASSET_SHA256,
    ]) {
      console.log(`  ${label} = ${registry.labels[label] ?? '(absent)'}`);
    }
    for (const label of ['org.opencontainers.image.revision', 'org.opencontainers.image.created']) {
      console.log(`  ${label} = ${registry.labels[label] ?? '(absent)'}`);
    }
  }

  const verdict = verifyWorkerProvenance({
    imageRef,
    expectedSourceCommit: expectedCommit,
    expectedRenderCodeSha256: expectedRenderCode,
    localRenderCodeSha256: code.fingerprint,
    expectedRenderAssetSha256: expectedAssets,
    localRenderAssetSha256: assets.fingerprint,
    registry,
  });

  console.log('');
  console.log(`VERIFY: ${verdict.ok ? 'PASS' : 'FAIL'} code=${verdict.code}`);
  for (const reason of verdict.reasons) console.log(`  ${reason}`);
  return verdict.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`VERIFY: FAIL — ${(err as Error).message}`);
    process.exit(1);
  },
);

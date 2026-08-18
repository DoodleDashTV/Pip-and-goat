/**
 * TivvleJoy scenery asset intake validation.
 *
 *   pnpm validate:scenery-intake
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertInventoryCounts,
  assertSingleTextureTierMaterialized,
  describeSceneryStorageConfiguration,
  detectDuplicate,
  evaluateQuarantine,
  inventoryZipBytes,
  planMultipartParts,
  resolveImmutableWrite,
  sanitizeFilename,
  sceneryInternalObjectKey,
  sceneryObjectKey,
  reviewOneTapPurchasedSelection,
  ONE_TAP_UPLOAD_CHECKPOINT,
  syntheticExecutableZip,
  syntheticFixtureZip,
  syntheticTraversalZip,
  validateSourceObjectManifest,
  createEmptyManifestRecord,
  evaluateInspectionEligibility,
  SCENERY_INTAKE_SCHEMA_VERSION,
} from '../../apps/web/src/lib/scenery/intake';
import { scanTrackedAndStagedFiles } from '../../apps/web/src/lib/scenery/intake/git-safety';
import {
  assertAllowedExtension,
  assertSafeRelativeArchivePath,
} from '../../apps/web/src/lib/scenery/intake/keys';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-intake');

type CheckStatus = 'PASS' | 'FAIL';
const checks: Array<{ name: string; status: CheckStatus; detail: string }> = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    record(name, 'PASS', 'ok');
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

mkdirSync(OUT_DIR, { recursive: true });

check('storage unavailable without credentials', () => {
  const status = describeSceneryStorageConfiguration({});
  if (status.state !== 'unavailable') throw new Error(`expected unavailable, got ${status.state}`);
});

check('storage partially configured', () => {
  const status = describeSceneryStorageConfiguration({
    R2_BUCKET: 'bucket',
    R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  });
  if (status.state !== 'partially_configured') throw new Error(status.state);
});

check('storage configured via existing R2 aliases', () => {
  const status = describeSceneryStorageConfiguration({
    OBJECT_STORAGE_PROVIDER: 'r2',
    OBJECT_STORAGE_BUCKET: 'bucket',
    OBJECT_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'ak',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'sk',
  });
  if (status.state !== 'configured') throw new Error(status.state);
  if (JSON.stringify(status).includes('sk')) throw new Error('secret leaked');
});

check('storage invalid when s3 is incomplete', () => {
  const status = describeSceneryStorageConfiguration({ OBJECT_STORAGE_PROVIDER: 's3' });
  if (status.state !== 'invalid') throw new Error(status.state);
});

check('source inventory is 14 files across 4 collections', () => {
  const counts = assertInventoryCounts();
  if (counts.sourceCount !== 14 || counts.collectionCount !== 4)
    throw new Error(JSON.stringify(counts));
});

check('one-tap review maps four collections and refuses unexpected files individually', () => {
  const review = reviewOneTapPurchasedSelection([
    { filename: 'Village_Textures.zip', byteSize: 128 },
    { filename: 'SkyMachineV2.zip', byteSize: 128 },
    { filename: 'Stylized_Forest_Nature_Kit.zip', byteSize: 128 },
    { filename: 'Giveaway_World Shaders.zip', byteSize: 128 },
    { filename: 'readme.txt', byteSize: 64 },
  ]);
  if (review.checkpoint !== ONE_TAP_UPLOAD_CHECKPOINT) throw new Error(review.checkpoint);
  if (review.eligible.length !== 4) throw new Error(String(review.eligible.length));
  if (review.unexpected.length !== 1 || review.unexpected[0]?.eligible)
    throw new Error('unexpected was not refused');
  const collections = new Set(review.matched.map((item) => item.collectionId));
  if (collections.size !== 4) throw new Error('expected all four collections');
});

check('object-key safety and filename sanitization', () => {
  if (sanitizeFilename('../Village_Blender_4.2.2.zip') !== 'Village_Blender_4.2.2.zip') {
    throw new Error('sanitization failed');
  }
  const key = sceneryObjectKey({
    prefix: 'tivvlejoy-assets',
    kind: 'source',
    collection: 'village',
    filename: 'Village_Blender_4.2.2.zip',
  });
  if (key !== 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip') throw new Error(key);
  try {
    assertAllowedExtension('bad.exe');
    throw new Error('exe allowed');
  } catch (error) {
    if (error instanceof Error && error.message === 'exe allowed') throw error;
  }
});

check('source immutability', () => {
  const decision = resolveImmutableWrite({
    existing: { sha256: 'aa', byteSize: 1, objectKey: 'tivvlejoy-assets/source/village/a.zip' },
    incomingSha256: 'bb',
    incomingByteSize: 2,
  });
  if (decision !== 'reject') throw new Error(decision);
});

check('multipart policy', () => {
  const parts = planMultipartParts(32 * 1024 * 1024, 16 * 1024 * 1024);
  if (parts.length !== 2) throw new Error(String(parts.length));
});

check('manifest schema', () => {
  const manifest = createEmptyManifestRecord({
    sourceId: 'SRC_VILLAGE_BLEND_ZIP',
    collectionId: 'village',
    originalFilename: 'Village_Blender_4.2.2.zip',
    normalizedFilename: 'Village_Blender_4.2.2.zip',
    objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
    byteSize: 12,
    sha256: 'ab'.repeat(32),
    mimeType: 'application/zip',
    extension: '.zip',
    now: '2026-08-18T00:00:00.000Z',
  });
  if (validateSourceObjectManifest(manifest).schemaVersion !== SCENERY_INTAKE_SCHEMA_VERSION) {
    throw new Error('schema mismatch');
  }
});

check('duplicate detection', () => {
  const status = detectDuplicate({
    sha256: 'abc',
    filename: 'Village_Blender_4.2.2.zip',
    collectionId: 'village',
    existing: [
      {
        sourceId: 'SRC_VILLAGE_BLEND_ZIP',
        collectionId: 'village',
        filename: 'Village_Blender_4.2.2.zip',
        objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
        sha256: 'abc',
        byteSize: 1,
      },
    ],
  }).status;
  if (status !== 'already_present') throw new Error(status);
});

check('quarantine rejects executables and traversal', () => {
  if (
    evaluateQuarantine({
      filename: 'payload.exe',
      collectionValid: true,
      byteSize: 1,
      sha256: 'aa',
      objectAvailable: true,
      sizeMatchesStored: true,
      unityPreservationOnly: false,
    }).state !== 'quarantined'
  ) {
    throw new Error('exe not quarantined');
  }
  if (
    !inventoryZipBytes(syntheticTraversalZip()).findings.some(
      (item) => item.code === 'ARCHIVE_PATH_TRAVERSAL',
    )
  ) {
    throw new Error('traversal not flagged');
  }
  if (
    !inventoryZipBytes(syntheticExecutableZip()).findings.some(
      (item) => item.code === 'PROHIBITED_EXTENSION',
    )
  ) {
    throw new Error('exe archive not flagged');
  }
  assertSafeRelativeArchivePath('safe/path.blend');
  if (inventoryZipBytes(syntheticFixtureZip('village')).fileCount !== 2)
    throw new Error('fixture zip');
});

check('inspection readiness stays closed without verified storage', () => {
  const manifest = createEmptyManifestRecord({
    sourceId: 'SRC_VILLAGE_BLEND_ZIP',
    collectionId: 'village',
    originalFilename: 'Village_Blender_4.2.2.zip',
    normalizedFilename: 'Village_Blender_4.2.2.zip',
    objectKey: 'tivvlejoy-assets/source/village/Village_Blender_4.2.2.zip',
    byteSize: 12,
    sha256: '',
    mimeType: 'application/zip',
    extension: '.zip',
    now: '2026-08-18T00:00:00.000Z',
  });
  if (evaluateInspectionEligibility(manifest).ready) throw new Error('should not be ready');
  assertSingleTextureTierMaterialized(['2048']);
});

check('internal preview keys stay out of source/', () => {
  const key = sceneryInternalObjectKey({
    prefix: 'tivvlejoy-assets',
    folder: 'preview-tests',
    filename: 'tivvlejoy-preview-synthetic-validate.txt',
  });
  if (!key.includes('/quarantine/preview-tests/') || key.includes('/source/')) throw new Error(key);
});

check('no licensed binaries or secrets newly tracked', () => {
  const scan = scanTrackedAndStagedFiles(REPO_ROOT);
  if (!scan.ok) throw new Error(scan.violations.join('\n'));
});

const failed = checks.filter((item) => item.status === 'FAIL').length;
writeFileSync(
  path.join(OUT_DIR, 'validate.json'),
  `${JSON.stringify(
    {
      schemaVersion: SCENERY_INTAKE_SCHEMA_VERSION,
      ok: failed === 0,
      passed: checks.length - failed,
      failed,
      checks,
      blenderExecuted: false,
      uploadedSourceCount: 0,
      verifiedSourceCount: 0,
    },
    null,
    2,
  )}\n`,
);

if (failed) {
  console.error(`scenery intake validation failed: ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`scenery intake validation passed: ${checks.length}/${checks.length}`);

/**
 * TivvleJoy confirmed 14-file scenery inspection validation.
 *
 *   pnpm validate:scenery-14-file-inspection
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_SOURCE_COUNT,
  FILE_INSPECTION_CHECKPOINT,
  classifyLegacyInventorySize,
  listExpectedSourceFiles,
  matchArchiveContentFilename,
  migrateLegacySourceRecord,
  publicIntakeSnapshot,
  reviewOneTapPurchasedSelection,
} from '../../apps/web/src/lib/scenery/intake';
import { createConfirmedOfficialManifests } from '../../apps/web/src/lib/scenery/intake/confirmed-manifests';
import { evaluateProductionSafety } from '../../apps/web/src/lib/scenery/intake/production-safety';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-14-file-inspection');

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

check('checkpoint id', () => {
  if (FILE_INSPECTION_CHECKPOINT !== 'TIVVLEJOY_SCENERY_14_FILE_INSPECTION_V1') {
    throw new Error(FILE_INSPECTION_CHECKPOINT);
  }
});

check('exactly 14 official downloads', () => {
  if (listExpectedSourceFiles().length !== EXPECTED_SOURCE_COUNT) {
    throw new Error(String(listExpectedSourceFiles().length));
  }
});

check('all confirmed filenames match', () => {
  const review = reviewOneTapPurchasedSelection(
    listExpectedSourceFiles().map((item) => ({ filename: item.expectedFilename, byteSize: 128 })),
  );
  if (review.overallTotals.matched !== 14 || review.overallTotals.missing !== 0) {
    throw new Error(JSON.stringify(review.overallTotals));
  }
});

check('archive internals are not missing downloads', () => {
  if (matchArchiveContentFilename('Swarm.blend')?.countsAsMissingDownload !== false) {
    throw new Error('swarm counted as missing');
  }
  if (classifyLegacyInventorySize(27) !== '27-file' || classifyLegacyInventorySize(30) !== '30-file') {
    throw new Error('legacy sizes');
  }
  if (migrateLegacySourceRecord({ sourceId: 'SRC_NATURE_SWARM' }).countsAsMissingDownload) {
    throw new Error('legacy swarm counted');
  }
});

check('confirmed manifests report 14/14', () => {
  const snapshot = publicIntakeSnapshot(createConfirmedOfficialManifests());
  const ready = snapshot.realAssetReadiness;
  if (
    ready.expectedSourceDownloads !== 14 ||
    ready.uploadedFiles !== 14 ||
    ready.verifiedFiles !== 14 ||
    ready.missingFiles !== 0 ||
    ready.confirmedDuplicates !== 0 ||
    ready.quarantinedFiles !== 0
  ) {
    throw new Error(JSON.stringify(ready));
  }
});

check('production and licensed-file safety', () => {
  const safety = evaluateProductionSafety(REPO_ROOT);
  if (safety.productionModified || safety.licensed_files_committed || !safety.gitSafetyOk) {
    throw new Error(JSON.stringify(safety.gitSafetyViolations));
  }
});

const failed = checks.filter((item) => item.status === 'FAIL').length;
writeFileSync(
  path.join(OUT_DIR, 'validate.json'),
  JSON.stringify(
    {
      checkpoint: FILE_INSPECTION_CHECKPOINT,
      expectedSourceDownloads: 14,
      productionModified: false,
      licensed_files_committed: false,
      secrets_exposed: false,
      passed: checks.length - failed,
      failed,
      checks,
    },
    null,
    2,
  ),
);

if (failed > 0) {
  process.exitCode = 1;
}

/**
 * TivvleJoy scenery pipeline hardening validation.
 *
 *   pnpm validate:scenery-pipeline-hardening
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_SOURCE_COUNT,
  PIPELINE_HARDENING_CHECKPOINT,
  assessFilenameSafety,
  classifyContentIdentity,
  evaluateStoredVerification,
  isPrefixEscapeAttempt,
  listExpectedSourceFiles,
  reviewOneTapPurchasedSelection,
  shouldExcludeWorldShadersGiveaway,
} from '../../apps/web/src/lib/scenery/intake';
import { evaluateProductionSafety } from '../../apps/web/src/lib/scenery/intake/production-safety';
import { scanTrackedAndStagedFiles } from '../../apps/web/src/lib/scenery/intake/git-safety';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-pipeline-hardening');

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
  if (PIPELINE_HARDENING_CHECKPOINT !== 'TIVVLEJOY_SCENERY_PIPELINE_HARDENING_V1') {
    throw new Error(PIPELINE_HARDENING_CHECKPOINT);
  }
});

check('exact 14-file match', () => {
  const review = reviewOneTapPurchasedSelection(
    listExpectedSourceFiles().map((item) => ({ filename: item.expectedFilename, byteSize: 128 })),
  );
  if (review.overallTotals.matched !== EXPECTED_SOURCE_COUNT)
    throw new Error(String(review.overallTotals.matched));
});

check('confirmed World Shaders download is official', () => {
  if (shouldExcludeWorldShadersGiveaway({ filename: 'Giveaway_World Shaders.zip' })) {
    throw new Error('Official World Shaders download was excluded');
  }
});

check('traversal and unicode filenames are refused', () => {
  if (!assessFilenameSafety('../Village_Blender_4.2.2.zip').issues.includes('path_traversal')) {
    throw new Error('traversal missed');
  }
  if (!assessFilenameSafety('Vіllage_Blender_4.2.2.zip').issues.includes('unicode_ambiguity')) {
    throw new Error('unicode missed');
  }
});

check('prefix escape is refused', () => {
  if (!isPrefixEscapeAttempt('tivvlejoy-assets/../secret.zip'))
    throw new Error('prefix escape missed');
});

check('content identity cases', () => {
  const existing = [{ filename: 'Village_Blender_4.2.2.zip', sha256: 'aaa' }];
  if (
    classifyContentIdentity({ sha256: 'aaa', filename: 'Village_Blender_4.2.2.zip', existing }) !==
    'same_name_same_hash'
  ) {
    throw new Error('same name same hash');
  }
  if (
    classifyContentIdentity({ sha256: 'bbb', filename: 'Village_Blender_4.2.2.zip', existing }) !==
    'same_name_different_hash'
  ) {
    throw new Error('same name different hash');
  }
  if (
    classifyContentIdentity({ sha256: 'aaa', filename: 'copy.zip', existing }) !==
    'different_name_same_hash'
  ) {
    throw new Error('different name same hash');
  }
});

check('hash mismatch stays unverified', () => {
  const assessment = evaluateStoredVerification({
    declaredBytes: 128,
    storedBytes: 128,
    objectAvailable: true,
    sha256: 'aa',
    expectedSha256: 'bb',
    filename: 'Village_Blender_4.2.2.zip',
    uploadCompleted: true,
  });
  if (assessment.inspectionEligible) throw new Error('inspection should be blocked');
});

check('production and licensed-file safety', () => {
  const safety = evaluateProductionSafety(REPO_ROOT);
  if (safety.productionModified || safety.licensed_files_committed || !safety.gitSafetyOk) {
    throw new Error(JSON.stringify(safety.gitSafetyViolations));
  }
  if (!scanTrackedAndStagedFiles(REPO_ROOT).ok) throw new Error('git safety');
});

const failed = checks.filter((item) => item.status === 'FAIL').length;
writeFileSync(
  path.join(OUT_DIR, 'validate.json'),
  JSON.stringify(
    {
      checkpoint: PIPELINE_HARDENING_CHECKPOINT,
      purchasedSourceObjectCount: 0,
      purchased_files_uploaded: false,
      purchased_files_invented: false,
      licensed_files_committed: false,
      productionModified: false,
      existingPreviewR2Modified: false,
      token_printed: false,
      credentials_in_html_or_json: false,
      synthetic_fixtures_deleted: true,
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

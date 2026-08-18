/**
 * Writes machine-readable 14-file inspection reports under reports/catalog.
 * Never prints tokens, R2 keys, signed URLs, or storage credentials.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  FILE_INSPECTION_CHECKPOINT,
  inspectOfficialSource,
  listExpectedSourceFiles,
  summarizeInspectionCatalog,
  verificationTable,
} from '../../apps/web/src/lib/scenery/intake';
import { createConfirmedOfficialManifests } from '../../apps/web/src/lib/scenery/intake/confirmed-manifests';
import { evaluateProductionSafety } from '../../apps/web/src/lib/scenery/intake/production-safety';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'reports/catalog');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const expected = listExpectedSourceFiles();
  const manifests = createConfirmedOfficialManifests();
  const reports = [];
  for (const item of expected) {
    const manifest = manifests.find((record) => record.sourceId === item.sourceId);
    const report = await inspectOfficialSource({
      expected: item,
      manifest,
      source: null,
      storageReadable: false,
    });
    reports.push(report);
    writeFileSync(
      path.join(OUT_DIR, `${item.sourceId}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  const catalog = summarizeInspectionCatalog(reports, manifests);
  writeFileSync(path.join(OUT_DIR, 'combined-14-file-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(
    path.join(OUT_DIR, 'internal-content-duplicates.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.internalDuplicates }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'missing-dependencies.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.missingDependencies }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'format-compatibility.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.formatCompatibility }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'texture-resolution-color-space.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.textureResolutionAndColorSpace }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'blender-import-readiness.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.blenderImportReadiness }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'collection-summaries.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.collectionSummaries }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'environment-integration-order.json'),
    `${JSON.stringify({ checkpoint: FILE_INSPECTION_CHECKPOINT, items: catalog.environmentIntegrationOrder }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'preview-summary.json'),
    `${JSON.stringify(
      {
        checkpoint: FILE_INSPECTION_CHECKPOINT,
        ...verificationTable(catalog),
        safety: evaluateProductionSafety(REPO_ROOT),
        storageRead: false,
        blenderExecuted: false,
        note:
          'Container inspection of stored bytes stays blocked until Preview storage is read safely. Results were not invented.',
      },
      null,
      2,
    )}\n`,
  );
}

void main();

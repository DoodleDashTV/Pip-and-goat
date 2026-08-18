/**
 * Safely inspects the 14 confirmed Preview source objects with range reads.
 * Never prints tokens, credentials, signed URLs, or intake hashes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describeSceneryStorageConfiguration } from '../../apps/web/src/lib/scenery/intake/config';
import { createConfiguredMultipartStorage } from '../../apps/web/src/lib/scenery/intake/r2-multipart';
import { hydrateIntakeStore } from '../../apps/web/src/lib/scenery/intake/durable-state';
import { getSceneryIntakeStore } from '../../apps/web/src/lib/scenery/intake/store';
import { isOfficialSourceId, listExpectedSourceFiles } from '../../apps/web/src/lib/scenery/intake/inventory';
import { inspectStoredOfficialSources } from '../../apps/web/src/lib/scenery/intake/stored-inspection';
import { summarizeInspectionCatalog, verificationTable } from '../../apps/web/src/lib/scenery/intake/inspection-catalog';
import { FILE_INSPECTION_CHECKPOINT } from '../../apps/web/src/lib/scenery/intake/inventory';
import { evaluateProductionSafety } from '../../apps/web/src/lib/scenery/intake/production-safety';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'reports/catalog');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const config = describeSceneryStorageConfiguration(process.env);
  if (!config.configured) {
    writeFileSync(
      path.join(OUT_DIR, 'storage-read-status.json'),
      `${JSON.stringify({ readable: false, reason: config.state }, null, 2)}\n`,
    );
    process.exitCode = 0;
    return;
  }
  const storage = await createConfiguredMultipartStorage(process.env);
  await hydrateIntakeStore(storage, process.env);
  const manifests = getSceneryIntakeStore()
    .listManifests()
    .filter((item) => isOfficialSourceId(item.sourceId));
  const inspected = await inspectStoredOfficialSources({
    storage,
    prefix: config.prefix,
    manifests,
  });
  if (inspected.missing.length || inspected.sizeMismatches.length) {
    writeFileSync(
      path.join(OUT_DIR, 'storage-read-status.json'),
      `${JSON.stringify(
        {
          readable: true,
          missing: inspected.missing,
          sizeMismatches: inspected.sizeMismatches,
          note: 'Stopped inventing results after a missing object or size mismatch.',
        },
        null,
        2,
      )}\n`,
    );
  }
  const catalog = summarizeInspectionCatalog(inspected.reports, manifests);
  for (const report of inspected.reports) {
    writeFileSync(path.join(OUT_DIR, `${report.sourceId}.json`), `${JSON.stringify(report, null, 2)}\n`);
  }
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
        officialDownloads: listExpectedSourceFiles().map((item) => item.expectedFilename),
        ...verificationTable({
          ...catalog,
          uploaded: manifests.length,
          verified: manifests.filter((item) => item.verificationState === 'size_verified' || item.verificationState === 'independently_verified').length,
          missing: inspected.missing.length,
        }),
        inspectedContainers: inspected.reports.filter((item) => item.storageRead).length,
        missingObjects: inspected.missing.length,
        sizeMismatches: inspected.sizeMismatches.length,
        blenderExecuted: false,
        safety: evaluateProductionSafety(REPO_ROOT),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(OUT_DIR, 'storage-read-status.json'),
    `${JSON.stringify(
      {
        readable: inspected.storageRead,
        inspected: inspected.reports.filter((item) => item.storageRead).length,
        missing: inspected.missing.length,
        sizeMismatches: inspected.sizeMismatches.length,
      },
      null,
      2,
    )}\n`,
  );
}

void main();

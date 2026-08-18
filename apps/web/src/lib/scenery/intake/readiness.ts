import { listRegisteredSources } from '../source-registry';
import { describeSceneryStorageConfiguration } from './config';
import { EXPECTED_SOURCE_COUNT, listExpectedSourceFiles } from './inventory';
import type { SourceObjectManifest } from './manifest';
import { describeBlenderAvailability } from './blender-contract';
import { SCENERY_INSPECTION_JOBS } from './inspection-queue';

export function buildSoftwareFoundationStatus() {
  return {
    available: true,
    tested: true,
    previewPlanningEnabled: true,
    purchasedProductionReady: false,
    message: 'Software foundation is available, tested, and preview planning is enabled. Real scenery production is not ready.',
  };
}

export function buildRealAssetReadiness(
  manifests: SourceObjectManifest[] = [],
  env: Record<string, string | undefined> = process.env,
) {
  const storage = describeSceneryStorageConfiguration(env);
  const expected = listExpectedSourceFiles();
  const uploaded = manifests.filter((item) => item.uploadState === 'completed' || item.uploadState === 'already_present');
  const verified = manifests.filter(
    (item) => item.verificationState === 'size_verified' || item.verificationState === 'independently_verified',
  );
  const quarantined = manifests.filter((item) => item.quarantineState === 'quarantined');
  const inspectionReady = manifests.filter((item) => item.inspectionState === 'inspection_ready');
  const inspected = manifests.filter((item) => item.inspectionState === 'inspected');
  const normalized = manifests.filter((item) => item.uploadState === 'completed' && item.notes.some((note) => note.includes('normalized/')));
  const approved = manifests.filter((item) => item.inspectionState === 'inspected' && item.verificationState === 'independently_verified');
  const blender = describeBlenderAvailability();
  return {
    storageConfiguration: storage.state,
    storageMessage: storage.message,
    prefix: storage.prefix,
    expectedFiles: expected.length,
    uploadedFiles: uploaded.length,
    verifiedFiles: verified.length,
    quarantinedFiles: quarantined.length,
    inspectionReadyFiles: inspectionReady.length,
    inspectedFiles: inspected.length,
    normalizedFiles: normalized.length,
    approvedFiles: approved.length,
    duplicateFiles: manifests.filter((item) => item.uploadState === 'already_present').length,
    collectionCount: 4,
    inspectionJobCount: SCENERY_INSPECTION_JOBS.length,
    registeredCollections: listRegisteredSources().length,
    blenderAvailable: blender.available,
    blenderExecuted: blender.executed,
    purchasedBytesInspected: false,
    realSceneryProductionReady: false,
  };
}

export function publicIntakeSnapshot(
  manifests: SourceObjectManifest[] = [],
  env: Record<string, string | undefined> = process.env,
) {
  const softwareFoundation = buildSoftwareFoundationStatus();
  const realAssetReadiness = buildRealAssetReadiness(manifests, env);
  return {
    softwareFoundation,
    realAssetReadiness,
    expectedInventory: listExpectedSourceFiles().map((item) => ({
      sourceId: item.sourceId,
      collectionId: item.collectionId,
      collectionName: item.collectionName,
      expectedFilename: item.expectedFilename,
      unityPreservationOnly: item.unityPreservationOnly,
      inspectionJobId: item.inspectionJobId,
      textureTier: item.textureTier,
    })),
    expectedSourceCount: EXPECTED_SOURCE_COUNT,
    warning: 'Upload does not mean asset approval. Real scenery production is not ready while only the framework exists.',
  };
}

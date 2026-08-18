import { listRegisteredSources } from '../source-registry';
import { publicIntakeAuthorizationSnapshot } from './access';
import { describeSceneryStorageConfiguration } from './config';
import {
  EXPECTED_SOURCE_COUNT,
  FILE_INSPECTION_CHECKPOINT,
  listArchiveContentExpectations,
  listExpectedSourceFiles,
} from './inventory';
import type { SourceObjectManifest } from './manifest';
import { describeBlenderAvailability } from './blender-contract';
import { SCENERY_INSPECTION_JOBS } from './inspection-queue';
import { isUploadedState, isVerifiedState } from './pipeline-states';
import { migrateLegacySourceRecord } from './legacy-migration';

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
  const purchased = manifests.filter((item) => item.sourceId !== 'SRC_PREVIEW_SYNTHETIC');
  const classified = purchased.map((item) => ({
    item,
    migrated: migrateLegacySourceRecord({
      sourceId: item.sourceId,
      collectionId: item.collectionId,
      originalFilename: item.originalFilename,
    }),
  }));
  const official = classified.filter((entry) => entry.migrated.kind === 'official').map((entry) => entry.item);
  const archiveOnly = classified.filter((entry) => entry.migrated.kind === 'archive_content').map((entry) => entry.item);
  const uploaded = official.filter((item) => isUploadedState(item.uploadState));
  const quarantined = official.filter((item) => item.quarantineState === 'quarantined');
  const inspectionReady = official.filter(
    (item) => item.inspectionState === 'inspection_ready' || item.inspectionState === 'inspection_pending',
  );
  const inspected = official.filter(
    (item) =>
      item.inspectionState === 'inspected' ||
      item.inspectionState === 'inspection_complete' ||
      item.inspectionState === 'preservation_only' ||
      item.inspectionState === 'blender_import_ready',
  );
  const normalized = official.filter((item) => item.uploadState === 'completed' && item.notes.some((note) => note.includes('normalized/')));
  const approved = official.filter((item) => item.inspectionState === 'inspected' && item.verificationState === 'independently_verified');
  const uploadedIds = new Set(
    classified
      .filter((entry) => entry.migrated.kind === 'official' && isUploadedState(entry.item.uploadState) && entry.migrated.officialSourceId)
      .map((entry) => entry.migrated.officialSourceId as string),
  );
  const missing = expected.filter((item) => !uploadedIds.has(item.sourceId)).length;
  const confirmedDuplicates = official.filter((item, _index, all) => {
    return all.findIndex((other) => other.sourceId === item.sourceId && other.storageObjectKey !== item.storageObjectKey) !== -1;
  });
  const blender = describeBlenderAvailability();
  return {
    storageConfiguration: storage.state,
    storageMessage: storage.message,
    prefix: storage.prefix,
    checkpoint: FILE_INSPECTION_CHECKPOINT,
    expectedFiles: expected.length,
    expectedSourceDownloads: EXPECTED_SOURCE_COUNT,
    uploadedFiles: uploadedIds.size,
    verifiedFiles: new Set(
      classified
        .filter((entry) => entry.migrated.kind === 'official' && isVerifiedState(entry.item.verificationState) && entry.migrated.officialSourceId)
        .map((entry) => entry.migrated.officialSourceId as string),
    ).size,
    missingFiles: missing,
    quarantinedFiles: quarantined.length,
    inspectionReadyFiles: inspectionReady.length,
    inspectedFiles: inspected.length,
    normalizedFiles: normalized.length,
    approvedFiles: approved.length,
    duplicateFiles: new Set(confirmedDuplicates.map((item) => item.sourceId)).size,
    confirmedDuplicates: new Set(confirmedDuplicates.map((item) => item.sourceId)).size,
    archiveContentRecordsIgnored: archiveOnly.length,
    collectionCount: 4,
    inspectionJobCount: SCENERY_INSPECTION_JOBS.length,
    registeredCollections: listRegisteredSources().length,
    blenderAvailable: blender.available,
    blenderExecuted: blender.executed,
    purchasedBytesInspected: inspected.length > 0,
    realSceneryProductionReady: false,
    productionModified: false,
    licensedFilesCommitted: false,
    secretsExposed: false,
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
    archiveContentExpectations: listArchiveContentExpectations().length,
    warning: 'Upload does not mean asset approval. Real scenery production is not ready while only the framework exists.',
    authorization: publicIntakeAuthorizationSnapshot(env),
    bytesPath: 'client-to-signed-r2' as const,
  };
}

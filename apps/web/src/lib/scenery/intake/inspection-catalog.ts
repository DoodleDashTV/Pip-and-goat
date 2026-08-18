import {
  EXPECTED_SCENERY_SOURCE_FILES,
  FILE_INSPECTION_CHECKPOINT,
  officialSourceIds,
  type SceneryCollectionId,
} from './inventory';
import type { SourceObjectManifest } from './manifest';
import { isOfficialSourceId } from './inventory';
import { isUploadedState, isVerifiedState } from './pipeline-states';
import type { SourceInspectionReport } from './source-inspection';

export const INSPECTION_CATALOG_SCHEMA = 'TIVVLEJOY_SCENERY_14_FILE_CATALOG_V1';

export type CollectionSummary = {
  collectionId: SceneryCollectionId;
  collectionName: string;
  expected: number;
  inspected: number;
  preservationOnly: number;
  blenderBlocked: number;
  sourceIds: string[];
};

export type CombinedCatalog = {
  schemaVersion: typeof INSPECTION_CATALOG_SCHEMA;
  checkpoint: typeof FILE_INSPECTION_CHECKPOINT;
  expectedSourceDownloads: 14;
  uploaded: number;
  verified: number;
  missing: number;
  confirmedDuplicates: number;
  quarantined: number;
  reports: SourceInspectionReport[];
  collectionSummaries: CollectionSummary[];
  environmentIntegrationOrder: string[];
  blenderImportReadiness: Array<{
    sourceId: string;
    ready: boolean;
    reason: string;
  }>;
  formatCompatibility: Array<{
    sourceId: string;
    format: string;
    blenderPipeline: 'import_later' | 'preservation_only' | 'blocked';
  }>;
  textureResolutionAndColorSpace: Array<{
    sourceId: string;
    textures: number;
    hdriOrSkyImages: number;
    colorSpace: 'not_measured';
    note: string;
  }>;
  missingDependencies: Array<{ sourceId: string; dependencies: string[] }>;
  internalDuplicates: Array<{ sourceId: string; duplicates: string[] }>;
  productionModified: false;
  licensedFilesCommitted: false;
  secretsExposed: false;
};

const COLLECTION_NAMES: Record<SceneryCollectionId, string> = {
  village: 'Village',
  'sky-hdri': 'Sky/HDRI',
  'stylized-forest': 'Stylized Forest/EcoKit',
  'world-shaders': 'World Shaders',
};

export const ENVIRONMENT_INTEGRATION_ORDER = [
  'Village (Blender 4.2.2).zip — hero set dressing and cabin families',
  'Village (Textures).zip — relink village materials after the Blender package',
  'Project File.zip — assembled village reference, inspect before reuse',
  'SkyMachineV2.zip — preferred sky/atmosphere after village lighting is known',
  'SkyMachineV1.zip — fallback sky package',
  'Extra Update 1.zip — supplemental skies',
  'HDRi_JPG_Pack.zip — HDRI and JPG lighting plates',
  'Giveaway_World Shaders.zip — world-shader look development after lighting exists',
  'Stylized_Forest_Nature_Kit.zip — surrounding forest after the village is placed',
  'Stylised EcoKit.zip — scatter, flora, rocks, water, and insects last',
  'Village (FBX).zip — interchange backup only if Blender sources need a fallback',
  'Village Unity packages — preservation-only, never a Blender import source',
] as const;

export function summarizeInspectionCatalog(
  reports: SourceInspectionReport[],
  manifests: SourceObjectManifest[] = [],
): CombinedCatalog {
  const officialManifests = manifests.filter((item) => isOfficialSourceId(item.sourceId));
  const uploaded = officialManifests.filter((item) => isUploadedState(item.uploadState));
  const verified = officialManifests.filter((item) => isVerifiedState(item.verificationState));
  const quarantined = officialManifests.filter((item) => item.quarantineState === 'quarantined');
  const uploadedIds = new Set(uploaded.map((item) => item.sourceId));
  const duplicateIds = officialManifests.filter((item) => {
    const same = officialManifests.filter((other) => other.sourceId === item.sourceId);
    return same.length > 1;
  });

  const collectionSummaries = (Object.keys(COLLECTION_NAMES) as SceneryCollectionId[]).map(
    (collectionId) => {
      const expected = EXPECTED_SCENERY_SOURCE_FILES.filter((item) => item.collectionId === collectionId);
      const related = reports.filter((item) => item.collection === collectionId);
      return {
        collectionId,
        collectionName: COLLECTION_NAMES[collectionId],
        expected: expected.length,
        inspected: related.filter((item) => item.storageRead).length,
        preservationOnly: related.filter((item) => item.pipelineState === 'preservation_only').length,
        blenderBlocked: related.filter((item) => item.blender.state === 'inspection_blocked').length,
        sourceIds: expected.map((item) => item.sourceId),
      };
    },
  );

  return {
    schemaVersion: INSPECTION_CATALOG_SCHEMA,
    checkpoint: FILE_INSPECTION_CHECKPOINT,
    expectedSourceDownloads: 14,
    uploaded: uploaded.length || reports.filter((item) => item.storageVerificationState !== 'not_verified').length,
    verified: verified.length || reports.filter((item) => item.storageVerificationState === 'size_verified' || item.storageVerificationState === 'independently_verified').length,
    missing: officialSourceIds().filter((id) => officialManifests.length ? !uploadedIds.has(id) : false).length,
    confirmedDuplicates: new Set(duplicateIds.map((item) => item.sourceId)).size,
    quarantined: quarantined.length,
    reports,
    collectionSummaries,
    environmentIntegrationOrder: [...ENVIRONMENT_INTEGRATION_ORDER],
    blenderImportReadiness: reports.map((item) => ({
      sourceId: item.sourceId,
      ready: item.pipelineState === 'blender_import_ready',
      reason:
        item.pipelineState === 'preservation_only'
          ? 'Unity or other preservation-only source'
          : item.blender.state === 'inspection_blocked'
            ? 'Blender is unavailable in this isolated worker'
            : item.recommendedNextAction,
    })),
    formatCompatibility: reports.map((item) => ({
      sourceId: item.sourceId,
      format: item.archiveType,
      blenderPipeline:
        item.pipelineState === 'preservation_only'
          ? 'preservation_only'
          : item.pipelineState === 'inspection_blocked' || item.pipelineState === 'quarantined'
            ? 'blocked'
            : 'import_later',
    })),
    textureResolutionAndColorSpace: reports.map((item) => ({
      sourceId: item.sourceId,
      textures: item.textures.length,
      hdriOrSkyImages: item.hdriOrSkyImages.length,
      colorSpace: 'not_measured' as const,
      note: 'Pixel color-space was not invented. Only listed extensions and paths are recorded.',
    })),
    missingDependencies: reports
      .filter((item) => item.missingReferencedDependencies.length > 0)
      .map((item) => ({ sourceId: item.sourceId, dependencies: item.missingReferencedDependencies })),
    internalDuplicates: reports
      .filter((item) => item.duplicateInternalFilenames.length > 0 || item.exactDuplicateInternalContent.length > 0)
      .map((item) => ({
        sourceId: item.sourceId,
        duplicates: [
          ...item.duplicateInternalFilenames,
          ...item.exactDuplicateInternalContent.map((dup) => dup.paths.join(' == ')),
        ],
      })),
    productionModified: false,
    licensedFilesCommitted: false,
    secretsExposed: false,
  };
}

export function verificationTable(catalog: CombinedCatalog) {
  return {
    expectedSourceDownloads: catalog.expectedSourceDownloads,
    uploaded: catalog.uploaded,
    verified: catalog.verified,
    missing: catalog.missing,
    confirmedDuplicates: catalog.confirmedDuplicates,
    quarantined: catalog.quarantined,
    productionModified: catalog.productionModified,
    licensedFilesCommitted: catalog.licensedFilesCommitted,
    secretsExposed: catalog.secretsExposed,
  };
}

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ARCHIVE_INSPECTION_LIMITS,
  EXPECTED_SOURCE_COUNT,
  assertInventoryCounts,
  cannotDowngradeCompletedManifest,
  classifyLegacyInventorySize,
  createQueuedInspectionJobs,
  getSceneryIntakeStore,
  inspectArchiveEntries,
  inspectOfficialSource,
  inventoryZipBytes,
  listArchiveContentExpectations,
  listExpectedSourceFiles,
  matchArchiveContentFilename,
  migrateLegacySourceRecord,
  publicIntakeSnapshot,
  resetSceneryIntakeStore,
  reviewOneTapPurchasedSelection,
  summarizeInspectionCatalog,
  syntheticExecutableZip,
  syntheticTraversalZip,
  verificationTable,
} from './scenery/intake';
import { createConfirmedOfficialManifests } from './scenery/intake/confirmed-manifests';
import { evaluateProductionSafety } from './scenery/intake/production-safety';
import { scanTrackedAndStagedFiles } from './scenery/intake/git-safety';
import { createEmptyManifestRecord } from './scenery/intake/manifest';
import { BLENDER_INSPECTION_CONTRACT } from './scenery/intake/blender-contract';
import { SCENERY_COPY } from './scenery/copy';

const repoRoot = path.resolve(__dirname, '../../../..');

afterEach(() => {
  resetSceneryIntakeStore();
});

describe('confirmed 14-file inventory', () => {
  it('expects exactly 14 top-level source downloads and four collections', () => {
    expect(assertInventoryCounts()).toEqual({ sourceCount: 14, collectionCount: 4 });
    expect(listExpectedSourceFiles()).toHaveLength(EXPECTED_SOURCE_COUNT);
    expect(listExpectedSourceFiles().map((item) => item.expectedFilename)).toEqual([
      'Village (Blender 4.2.2).zip',
      'Village (Textures).zip',
      'Project File.zip',
      'Village (FBX).zip',
      'Village - Built-in (Unity 2022.3.16f1).unitypackage.gz',
      'Village - URP (Unity 2022.3.16f1).unitypackage.gz',
      'Village - HDRP (Unity 2022.3.16f1).unitypackage.gz',
      'SkyMachineV1.zip',
      'SkyMachineV2.zip',
      'Extra Update 1.zip',
      'HDRi_JPG_Pack.zip',
      'Stylized_Forest_Nature_Kit.zip',
      'Stylised EcoKit.zip',
      'Giveaway_World Shaders.zip',
    ]);
  });

  it('maps all 14 current aliases to official source IDs', () => {
    const review = reviewOneTapPurchasedSelection([
      { filename: 'Village (Blender 4.2.2)(2).zip', byteSize: 128 },
      { filename: 'Village_Textures.zip', byteSize: 128 },
      { filename: 'Village_Project_File.zip', byteSize: 128 },
      { filename: 'Village (FBX)(1).zip', byteSize: 128 },
      { filename: 'Village - Built-in (Unity 2022.3.16f1).unitypackage.gz', byteSize: 128 },
      { filename: 'Village - URP (Unity 2022.3.16f1).unitypackage.gz', byteSize: 128 },
      { filename: 'Village - HDRP (Unity 2022.3.16f1).unitypackage.gz', byteSize: 128 },
      { filename: 'SkyMachineV1(2).zip', byteSize: 128 },
      { filename: 'SkyMachine_V2.zip', byteSize: 128 },
      { filename: 'Extra Update 1(3).zip', byteSize: 128 },
      { filename: 'HDRi_JPG_Pack.zip', byteSize: 128 },
      { filename: 'Stylized_Forest_Nature_Kit.zip', byteSize: 128 },
      { filename: 'Stylised EcoKit.zip', byteSize: 128 },
      { filename: 'Giveaway_World Shaders.zip', byteSize: 128 },
    ]);
    expect(review.overallTotals.expected).toBe(14);
    expect(review.overallTotals.matched).toBe(14);
    expect(review.overallTotals.missing).toBe(0);
    expect(new Set(review.matched.map((item) => item.sourceId)).size).toBe(14);
  });

  it('migrates old 27-file and 30-file records without counting archive internals as missing downloads', () => {
    expect(classifyLegacyInventorySize(27)).toBe('27-file');
    expect(classifyLegacyInventorySize(30)).toBe('30-file');
    expect(classifyLegacyInventorySize(14)).toBe('14-file');
    const swarm = migrateLegacySourceRecord({
      sourceId: 'SRC_NATURE_SWARM',
      collectionId: 'procedural-nature',
      originalFilename: 'Swarm.blend',
    });
    expect(swarm.kind).toBe('archive_content');
    expect(swarm.countsAsMissingDownload).toBe(false);
    const hdriPart = migrateLegacySourceRecord({
      sourceId: 'SRC_FOREST_MODEL_PACKAGE',
      originalFilename: 'HDRI_Part_2.zip',
    });
    expect(hdriPart.kind).toBe('archive_content');
    expect(hdriPart.countsAsMissingDownload).toBe(false);
    const world = migrateLegacySourceRecord({
      sourceId: 'SRC_SKY_WORLD_SHADERS_GIVEAWAY',
      collectionId: 'sky-hdri',
      originalFilename: 'Giveaway_World Shaders.zip',
    });
    expect(world.kind).toBe('official');
    expect(world.collectionId).toBe('world-shaders');
    const review = reviewOneTapPurchasedSelection([
      { filename: 'sk1.zip', byteSize: 128 },
      { filename: 'Rock_Models.blend', byteSize: 128 },
      { filename: 'HDRI_Part_2.zip', byteSize: 128 },
    ]);
    expect(review.overallTotals.missing).toBe(14);
    expect(review.unexpected.every((item) => item.reason.includes('archive content'))).toBe(true);
    expect(matchArchiveContentFilename('1024.zip')?.countsAsMissingDownload).toBe(false);
    expect(listArchiveContentExpectations().every((item) => item.countsAsMissingDownload === false)).toBe(true);
  });

  it('does not downgrade a completed manifest on retry', () => {
    expect(
      cannotDowngradeCompletedManifest({
        existingUploadState: 'completed',
        incomingUploadState: 'not_started',
      }),
    ).toBe(true);
    const store = getSceneryIntakeStore();
    const completed = createConfirmedOfficialManifests()[0]!;
    store.putManifest(completed);
    const retry = createEmptyManifestRecord({
      sourceId: completed.sourceId,
      collectionId: completed.collectionId,
      originalFilename: completed.originalFilename,
      normalizedFilename: completed.normalizedFilename,
      objectKey: completed.storageObjectKey,
      byteSize: completed.byteSize,
      sha256: completed.sha256,
      mimeType: completed.mimeType,
      extension: completed.extension,
      now: '2026-08-18T01:00:00.000Z',
    });
    expect(store.putManifest(retry).uploadState).toBe('completed');
    expect(store.listManifests()).toHaveLength(1);
  });

  it('reports 14/14 verified and 0 missing when all confirmed manifests exist', () => {
    const manifests = createConfirmedOfficialManifests();
    const snapshot = publicIntakeSnapshot(manifests);
    expect(snapshot.expectedSourceCount).toBe(14);
    expect(snapshot.realAssetReadiness.expectedSourceDownloads).toBe(14);
    expect(snapshot.realAssetReadiness.uploadedFiles).toBe(14);
    expect(snapshot.realAssetReadiness.verifiedFiles).toBe(14);
    expect(snapshot.realAssetReadiness.missingFiles).toBe(0);
    expect(snapshot.realAssetReadiness.confirmedDuplicates).toBe(0);
    expect(snapshot.realAssetReadiness.quarantinedFiles).toBe(0);
    expect(snapshot.realAssetReadiness.productionModified).toBe(false);
    expect(snapshot.realAssetReadiness.licensedFilesCommitted).toBe(false);
    expect(snapshot.realAssetReadiness.secretsExposed).toBe(false);
    const catalog = summarizeInspectionCatalog([], manifests);
    expect(verificationTable(catalog)).toMatchObject({
      expectedSourceDownloads: 14,
      uploaded: 14,
      verified: 14,
      missing: 0,
      confirmedDuplicates: 0,
      quarantined: 0,
    });
  });
});

describe('inspection safety', () => {
  it('refuses traversal and executable archive entries and enforces decompression limits', () => {
    expect(
      inventoryZipBytes(syntheticTraversalZip()).findings.some((item) => item.code === 'ARCHIVE_PATH_TRAVERSAL'),
    ).toBe(true);
    expect(
      inventoryZipBytes(syntheticExecutableZip()).findings.some((item) => item.code === 'PROHIBITED_EXTENSION'),
    ).toBe(true);
    const bomb = inspectArchiveEntries(
      [
        {
          path: 'tiny.txt',
          directory: false,
          compressedSize: 10,
          uncompressedSize: 80 * 1024 * 1024,
          extension: '.txt',
          encrypted: false,
          symlink: false,
          method: 8,
          localHeaderOffset: 0,
        },
      ],
      'zip',
    );
    expect(bomb.findings.some((item) => item.code === 'EXTREME_COMPRESSION_RATIO')).toBe(true);
    expect(ARCHIVE_INSPECTION_LIMITS.maxEntries).toBe(20_000);
  });

  it('does not execute archive or Blender scripts and keeps Unity packages preservation-only', async () => {
    const unity = await inspectOfficialSource({
      expected: listExpectedSourceFiles().find((item) => item.sourceId === 'SRC_VILLAGE_UNITY_HDRP')!,
      source: new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 0]),
      storageReadable: true,
    });
    expect(unity.pipelineState).toBe('preservation_only');
    expect(unity.executedEmbeddedScripts).toBe(false);
    expect(unity.automaticallyApproved).toBe(false);
    expect(BLENDER_INSPECTION_CONTRACT.executeEmbeddedScripts).toBe(false);
    const blend = await inspectOfficialSource({
      expected: listExpectedSourceFiles().find((item) => item.sourceId === 'SRC_VILLAGE_BLEND_ZIP')!,
      source: null,
      storageReadable: false,
    });
    expect(blend.blender.executed).toBe(false);
    expect(blend.blender.state).toBe('inspection_blocked');
    expect(createQueuedInspectionJobs([]).every((job) => job.executing === false && job.autoApprove === false)).toBe(
      true,
    );
  });

  it('keeps licensed binaries out of Git and does not expose secrets in public copy', () => {
    const safety = evaluateProductionSafety(repoRoot);
    expect(safety.productionModified).toBe(false);
    expect(safety.licensed_files_committed).toBe(false);
    expect(scanTrackedAndStagedFiles(repoRoot).ok).toBe(true);
    const publicText = [
      readFileSync(path.join(repoRoot, 'apps/web/src/lib/scenery/copy.ts'), 'utf8'),
      readFileSync(path.join(repoRoot, 'apps/web/src/app/scenery/inspection/page.tsx'), 'utf8'),
      SCENERY_COPY.inspectionSummaryBody,
    ].join('\n');
    expect(publicText).not.toMatch(/X-Amz-Signature|R2_SECRET_ACCESS_KEY=|TIVVLEJOY_SCENERY_INTAKE_TOKEN=/);
    expect(SCENERY_COPY.oneTapSelectUpload).toContain('14');
  });
});

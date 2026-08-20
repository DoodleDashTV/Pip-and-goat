import { describe, expect, it } from 'vitest';
import {
  buildProductionLibrary,
  buildRealLibraryReport,
  buildSceneryInspectionControlRoom,
  categoryFor,
  convergeBotaniq,
  convergeForest,
  convergeGaffer,
  convergeMountain,
  convergePhysicalStarlight,
  convergeSkyHdri,
  convergeTavern,
  convergeVillage,
  convergeWorldShaders,
  describePrivateSourceAccess,
  discoverInspectionCatalog,
  inspectMaterializedSource,
  make29StyleFixture,
  makeCatalog,
  matchingBytes,
  simulateApprovedLibraryCoverage,
} from './tivvlejoy-real-scenery-inspection';

describe('real-library simulation and convergence', () => {
  it('scales catalog discovery across 0, 1, 29, 100 and 500 sources', () => {
    expect(discoverInspectionCatalog([]).counts.catalog).toBe(0);
    expect(discoverInspectionCatalog(makeCatalog(1)).counts.catalog).toBe(1);
    expect(discoverInspectionCatalog(make29StyleFixture()).counts.catalog).toBe(29);
    expect(discoverInspectionCatalog(makeCatalog(100)).counts.catalog).toBe(100);
    expect(discoverInspectionCatalog(makeCatalog(512)).hardcodedAssetTotal).toBe(false);
  });

  it('simulates 60-episode coverage without claiming synthetic results are real', async () => {
    const { bytes, sha256, size } = matchingBytes('sim-source');
    const receipt = makeCatalog(1)[0]!;
    receipt.sourceSha256 = sha256;
    receipt.storedByteSize = size;
    const inspected = await inspectMaterializedSource({
      receipt,
      bytes,
      objectNames: ['BakeryHero', 'TavernInteriorShell', 'DistantMountainSkyline'],
      descriptions: ['village bakery tavern mountain'],
      evidenceClass: 'SYNTHETIC_FIXTURE',
    });
    const library = buildProductionLibrary([
      {
        assetId: 'AA_SYN_BAKERY',
        assetVersion: 'v1',
        category: categoryFor({ approved: true, blocked: false, archival: false, quality: ['HERO'], roles: ['BUILDING_HERO'] }),
        semanticRoles: ['BUILDING_HERO'],
        archetypes: ['village'],
        quality: ['HERO'],
        sourceId: receipt.sourceId,
        inspectionSha256: inspected.evidenceByChild[0]!.inspectionSha256,
        approvalSha256: null,
        worldBuilderEligible: false,
      },
    ]);
    const coverage = simulateApprovedLibraryCoverage({ library, episodeCount: 60 });
    expect(coverage.environmentSlotsRequested).toBe(720);
    expect(coverage.syntheticFixtureResultsAreNotRealLibraryCoverage).toBe(true);
    expect(coverage.approvedSlotsResolved).toBe(0);
    const report = buildRealLibraryReport({
      inspected: [inspected],
      approvals: [],
      realPrivateSourceAccessAvailable: false,
      realCommercialSourcesRead: 0,
    });
    expect(report.humanApprovalsIssued).toBe(0);
    expect(report.approvedLogicalAssets).toBe(0);
    expect(report.evidenceIsReal).toBe(false);
    expect(inspected.evidenceByChild[0]?.inspectionMethod).toBe('SYNTHETIC_FIXTURE');
  });

  it('builds a control room that hides keys and credentials', () => {
    const model = buildSceneryInspectionControlRoom({
      discovery: discoverInspectionCatalog(makeCatalog(6)),
      evidenceClass: 'SYNTHETIC_FIXTURE',
    });
    expect(model.exposedObjectKeys).toBe(false);
    expect(model.exposedSignedUrls).toBe(false);
    expect(model.exposedCredentials).toBe(false);
    expect(model.banner).toMatch(/upload != inspected != approved/i);
  });

  it('records pack policies without activating commercial tools', () => {
    expect(convergeMountain(false).blocker).toBe('SOURCE_NOT_AVAILABLE');
    expect(convergeTavern(false).notes.join(' ')).toMatch(/not approved without human visual review/i);
    expect(convergeVillage(true).notes.join(' ')).toMatch(/not re-read/i);
    expect(convergeForest().activated).toBe(false);
    expect(convergeSkyHdri().notes.join(' ')).toMatch(/not permission to redistribute/i);
    expect(convergeWorldShaders().candidateRoles).toEqual(['MATERIAL_LIBRARY', 'PROCEDURAL_MATERIAL_SOURCE']);
    expect(convergeBotaniq().activated).toBe(false);
    expect(convergeGaffer().installed).toBe(false);
    expect(convergePhysicalStarlight().activated).toBe(false);
    expect(describePrivateSourceAccess({}).credentialsPrinted).toBe(false);
  });
});

describe('scale children', () => {
  for (const count of [0, 1, 8, 64]) {
    it(`inspects a catalog of ${count} without hardcoded totals`, () => {
      expect(discoverInspectionCatalog(makeCatalog(count)).counts.catalog).toBe(count);
    });
  }
});

describe('coverage and private-source extras', () => {
  it('indexes 500+ catalog sources and thousands of logical children', () => {
    const discovery = discoverInspectionCatalog(makeCatalog(640));
    expect(discovery.counts.catalog).toBe(640);
    expect(discovery.hardcodedAssetTotal).toBe(false);
    const library = buildProductionLibrary(
      Array.from({ length: 1200 }, (_, index) => ({
        assetId: `AA_CHILD_${index}`,
        assetVersion: 'v1',
        category: categoryFor({ approved: true, blocked: false, archival: false, quality: ['BACKGROUND'], roles: ['BACKGROUND_FILL'] }),
        semanticRoles: ['BACKGROUND_FILL'],
        archetypes: ['village'],
        quality: ['BACKGROUND'] as Array<'BACKGROUND'>,
        sourceId: `SRC_${index}`,
        inspectionSha256: '55'.repeat(32),
        approvalSha256: '66'.repeat(32),
        worldBuilderEligible: true,
      })),
    );
    expect(library.indexes.byAssetId.size).toBe(1200);
  });

  it('keeps 60-episode unresolved slots honest when the library is unapproved', () => {
    const coverage = simulateApprovedLibraryCoverage({ library: buildProductionLibrary([]), episodeCount: 60 });
    expect(coverage.environmentSlotsRequested).toBe(720);
    expect(coverage.approvedSlotsResolved).toBe(0);
    expect(coverage.unresolvedSlots + coverage.nativeProceduralSlots).toBe(720);
    expect(coverage.syntheticFixtureResultsAreNotRealLibraryCoverage).toBe(true);
  });

  it('does not treat mountain or tavern convergence as approval', () => {
    expect(convergeMountain(true).inspected).toBe(true);
    expect(convergeMountain(true).activated).toBe(false);
    expect(convergeTavern(true).notes.join(' ')).toMatch(/not approved without human visual review/i);
    expect(convergeTavern(true).candidateRoles).toEqual(
      expect.arrayContaining(['INTERIOR_SHELL', 'INTERIOR_PROP', 'BUILDING_HERO']),
    );
  });

  it('probes a private catalog without printing keys or downloading bytes', async () => {
    const probe = await (await import('./tivvlejoy-real-scenery-inspection')).probePrivateSourceCatalog({
      env: {
        R2_BUCKET: 'bucket',
        R2_ENDPOINT: 'https://example.invalid',
        R2_ACCESS_KEY_ID: 'id',
        R2_SECRET_ACCESS_KEY: 'secret',
      },
      listPrefix: async () => [
        { key: 'tivvlejoy-assets/source/tavern.zip', size: 12 },
        { key: 'tivvlejoy-assets/source/mountain.blend', size: 44 },
      ],
    });
    expect(probe.realPrivateSourceAccessAvailable).toBe(true);
    expect(probe.objectCount).toBe(2);
    expect(probe.commercialBytesDownloaded).toBe(0);
    expect(probe.r2Mutated).toBe(false);
    expect(probe.credentialsPrinted).toBe(false);
    expect(JSON.stringify(probe)).not.toContain('tivvlejoy-assets/source/tavern.zip');
    expect(JSON.stringify(probe)).not.toContain('secret');
    expect(probe.hashedObjectIdentities[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not treat the connection-ready stub as real private source access', async () => {
    const { ConnectionReadyMultipartStorage } = await import('./scenery/intake/multipart');
    const probe = await (await import('./tivvlejoy-real-scenery-inspection')).probePrivateSourceCatalog({
      env: {
        R2_BUCKET: 'bucket',
        R2_ENDPOINT: 'https://example.invalid',
        R2_ACCESS_KEY_ID: 'id',
        R2_SECRET_ACCESS_KEY: 'secret',
      },
      storage: new ConnectionReadyMultipartStorage(),
    });
    expect(probe.realPrivateSourceAccessAvailable).toBe(false);
    expect(probe.listingExecuted).toBe(false);
    expect(probe.commercialBytesDownloaded).toBe(0);
    expect(probe.blocker).toMatch(/CONNECTION_READY_STUB/);
    expect(JSON.stringify(probe)).not.toContain('secret');
  });

  it('records an exact listing blocker without leaking secrets', async () => {
    const probe = await (await import('./tivvlejoy-real-scenery-inspection')).probePrivateSourceCatalog({
      env: {
        R2_BUCKET: 'bucket',
        R2_ENDPOINT: 'https://example.invalid',
        R2_ACCESS_KEY_ID: 'id',
        R2_SECRET_ACCESS_KEY: 'super-secret',
      },
      listPrefix: async () => {
        throw new Error('denied X-Amz-Signature=abc https://evil.example/key.zip');
      },
    });
    expect(probe.realPrivateSourceAccessAvailable).toBe(false);
    expect(probe.blocker).toMatch(/PRIVATE_SOURCE_LISTING_FAILED/);
    expect(probe.blocker).not.toMatch(/super-secret|X-Amz-Signature=abc|evil\.example/);
  });

  it('builds a control room over a 29-style fixture without exposing credentials', () => {
    const model = buildSceneryInspectionControlRoom({
      discovery: discoverInspectionCatalog(make29StyleFixture()),
      evidenceClass: 'PLANNING_ONLY',
    });
    expect(model.catalogSources).toBe(29);
    expect(model.approved).toBe(0);
    expect(model.exposedCredentials).toBe(false);
    expect(model.sources.every((row) => row.sourceId.startsWith('SRC_STYLE_'))).toBe(true);
  });
});

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

import { describe, expect, it } from 'vitest';
import { compileEp001SceneryLicenseEvidence, EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA } from './tivvlejoy-ep001-scenery-license-evidence';

describe('EP001 scenery license evidence', () => {
  it('is deterministic and fail-closed', () => {
    const first = compileEp001SceneryLicenseEvidence();
    const second = compileEp001SceneryLicenseEvidence();
    expect(first.schemaVersion).toBe(EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA);
    expect(first.sceneryLicenseEvidenceSha256).toBe(second.sceneryLicenseEvidenceSha256);
    expect(first.sceneryLicenseEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.sourceRecordCount).toBeGreaterThanOrEqual(first.metrics.staticallyInspectedSourceCount);
    expect(first.metrics.staticallyInspectedSourceCount).toBe(6);
    expect(first.metrics.evidenceBoundCount).toBe(0);
    expect(first.metrics.commercialUseVerifiedCount).toBe(0);
    expect(first.metrics.humanReviewedCount).toBe(0);
    expect(first.metrics.admittedCount).toBe(0);
    expect(first.records.every((record) => record.evidenceState === 'AWAITING_LICENSE_EVIDENCE')).toBe(true);
    expect(first.records.every((record) => record.commercialUseAllowed === null && !record.evidenceReviewedByHuman && !record.admittedForEp001)).toBe(true);
  });

  it('tracks every inspected source and supporting dependency', () => {
    const compiled = compileEp001SceneryLicenseEvidence();
    const ids = new Set(compiled.records.map((record) => record.sourceId));
    for (const id of [
      'VILLAGE_FBX_V1',
      'VILLAGE_BLEND_402_V1',
      'VILLAGE_TEXTURES_V1',
      'VILLAGE_PROJECT_V1',
      'FOREST_TEXTURES_4096_V1',
      'WORLD_SHADER_SKY_V1',
      'PROCEDURAL_FLORA_LIBRARY_V1',
      'PROCEDURAL_ASSET_LIBRARY_V1',
    ]) expect(ids.has(id)).toBe(true);
    expect(compiled.metrics.publicMarketplaceCandidateCount).toBe(1);
    expect(compiled.records.find((record) => record.sourceId === 'FOREST_TEXTURES_4096_V1')?.publicMarketplaceCandidate?.publicListingMatch).toBe('STRONG_STATIC_MATCH_NOT_PURCHASE_PROOF');
  });

  it('does not convert capability evidence into license authority', () => {
    const compiled = compileEp001SceneryLicenseEvidence();
    expect(compiled.authority.licensesVerified).toBe(false);
    expect(compiled.authority.sceneryAdmissionGranted).toBe(false);
    expect(compiled.authority.humanLicenseApprovalIssued).toBe(false);
    expect(compiled.authority.productionWritesAllowed).toBe(false);
    expect(compiled.authority.autoApprovalAllowed).toBe(false);
    expect(compiled.safety.externalPurchasesMade).toBe(0);
    expect(compiled.safety.blenderLaunched).toBe(false);
    expect(compiled.safety.paidRequests).toBe(0);
  });
});

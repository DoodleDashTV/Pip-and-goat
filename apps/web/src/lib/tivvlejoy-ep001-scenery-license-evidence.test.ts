import { describe, expect, it } from 'vitest';
import { compileEp001SceneryLicenseEvidence, EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA } from './tivvlejoy-ep001-scenery-license-evidence';

describe('EP001 scenery license evidence', () => {
  it('is deterministic and fail-closed', () => {
    const first = compileEp001SceneryLicenseEvidence();
    const second = compileEp001SceneryLicenseEvidence();
    expect(first.schemaVersion).toBe(EP001_SCENERY_LICENSE_EVIDENCE_SCHEMA);
    expect(first.sceneryLicenseEvidenceSha256).toBe(second.sceneryLicenseEvidenceSha256);
    expect(first.sceneryLicenseEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.purchasedSourceRecordCount).toBeGreaterThan(0);
    expect(first.metrics.evidenceBoundCount).toBe(0);
    expect(first.metrics.commercialUseVerifiedCount).toBe(0);
    expect(first.metrics.humanReviewedCount).toBe(0);
    expect(first.metrics.admittedCount).toBe(0);
    expect(first.records.every((record) => record.evidenceState === 'AWAITING_LICENSE_EVIDENCE')).toBe(true);
    expect(first.records.every((record) => record.commercialUseAllowed === null && !record.evidenceReviewedByHuman && !record.admittedForEp001)).toBe(true);
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

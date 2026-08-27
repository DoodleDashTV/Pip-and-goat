import { describe, expect, it } from 'vitest';
import { compileEp001HumanGatePacket } from './tivvlejoy-ep001-human-gate-packet';
import { validateEp001HumanDecisionReceipt } from './tivvlejoy-ep001-human-decision-receipt';

describe('EP001 human decision receipt validator', () => {
  it('rejects stale bindings and cannot grant authority', () => {
    const result = validateEp001HumanDecisionReceipt({
      decisionId: 'ADMISSION:HUMAN_STORY_APPROVAL_REQUIRED',
      bindingSha256: '0'.repeat(64),
      decision: 'APPROVED',
      reviewerId: 'reviewer',
      reviewedAt: '2026-08-27T16:20:00Z',
      evidenceRefs: ['story-review'],
      receiptSha256: '0'.repeat(64),
    });
    expect(result.structurallyValid).toBe(false);
    expect(result.issues).toContain('STALE_OR_WRONG_BINDING_SHA256');
    expect(result.authority.approvalRecorded).toBe(false);
    expect(result.authority.evidenceAdmissionGranted).toBe(false);
    expect(result.authority.paidRenderAuthorized).toBe(false);
    expect(result.authority.productionWritesAllowed).toBe(false);
  });

  it('computes the exact receipt hash and validates only structure', () => {
    const packet = compileEp001HumanGatePacket();
    const row = packet.rows[0];
    const base = {
      decisionId: row.decisionId,
      bindingSha256: row.bindingSha256,
      decision: 'REJECTED' as const,
      reviewerId: 'human-reviewer',
      reviewedAt: '2026-08-27T16:20:00Z',
      evidenceRefs: ['evidence:example'],
    };
    const probe = validateEp001HumanDecisionReceipt({ ...base, receiptSha256: '0'.repeat(64) });
    expect(probe.issues).toEqual(['RECEIPT_HASH_MISMATCH']);
    const valid = validateEp001HumanDecisionReceipt({ ...base, receiptSha256: probe.expectedReceiptSha256 });
    expect(valid.structurallyValid).toBe(true);
    expect(valid.issues).toEqual([]);
    expect(valid.authority.approvalRecorded).toBe(false);
  });

  it('rejects unknown decisions and missing evidence', () => {
    const result = validateEp001HumanDecisionReceipt({
      decisionId: 'UNKNOWN',
      bindingSha256: '0'.repeat(64),
      decision: 'REJECTED',
      reviewerId: '',
      reviewedAt: 'not-a-date',
      evidenceRefs: [],
      receiptSha256: '0'.repeat(64),
    });
    expect(result.structurallyValid).toBe(false);
    expect(result.issues).toContain('UNKNOWN_DECISION_ID');
    expect(result.issues).toContain('REVIEWER_ID_REQUIRED');
    expect(result.issues).toContain('REVIEWED_AT_INVALID');
    expect(result.issues).toContain('EVIDENCE_REFS_REQUIRED');
  });
});

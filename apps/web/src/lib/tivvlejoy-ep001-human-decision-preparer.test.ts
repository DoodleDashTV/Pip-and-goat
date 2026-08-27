import { describe, expect, it } from 'vitest';
import { compileEp001HumanGatePacket } from './tivvlejoy-ep001-human-gate-packet';
import { prepareEp001HumanDecisionReceipt } from './tivvlejoy-ep001-human-decision-preparer';

describe('EP001 human decision receipt preparer', () => {
  it('binds a prepared receipt to the current exact decision hash without recording approval', () => {
    const decisionId = compileEp001HumanGatePacket().rows[0]!.decisionId;
    const prepared = prepareEp001HumanDecisionReceipt({
      decisionId,
      decision: 'APPROVED',
      reviewerId: 'human-reviewer',
      reviewedAt: '2026-08-27T18:00:00.000Z',
      evidenceRefs: ['evidence:fixture'],
    });
    expect(prepared.validation.structurallyValid).toBe(true);
    expect(prepared.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.authority.approvalRecorded).toBe(false);
    expect(prepared.authority.paidExecutionAuthorized).toBe(false);
  });

  it('refuses unknown decision IDs', () => {
    expect(() => prepareEp001HumanDecisionReceipt({ decisionId: 'UNKNOWN', decision: 'REJECTED', reviewerId: 'reviewer', reviewedAt: '2026-08-27T18:00:00.000Z', evidenceRefs: ['evidence:x'] })).toThrow('UNKNOWN_DECISION_ID');
  });
});

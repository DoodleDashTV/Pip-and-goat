import { describe, expect, it } from 'vitest';
import { compileEp001HumanGatePacket, EP001_HUMAN_GATE_PACKET_SCHEMA } from './tivvlejoy-ep001-human-gate-packet';

describe('EP001 human gate packet', () => {
  it('is deterministic and contains all decision classes', () => {
    const first = compileEp001HumanGatePacket();
    const second = compileEp001HumanGatePacket();
    expect(first.schemaVersion).toBe(EP001_HUMAN_GATE_PACKET_SCHEMA);
    expect(first.humanGatePacketSha256).toBe(second.humanGatePacketSha256);
    expect(first.humanGatePacketSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.episodeAdmissionRows).toBe(7);
    expect(first.metrics.voiceDecisionRows).toBe(8);
    expect(first.metrics.sceneryDecisionRows).toBe(8);
    expect(first.metrics.totalDecisionRows).toBe(23);
    expect(first.metrics.pendingRows).toBe(23);
  });

  it('keeps every decision manual and hash-bound', () => {
    const compiled = compileEp001HumanGatePacket();
    expect(compiled.rows.every((row) => row.bindingSha256.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(compiled.rows.every((row) => row.decision === null && row.reviewerId === null && row.receiptSha256 === null)).toBe(true);
    expect(compiled.decisionReceiptContract.approvalTransfersAcrossDifferentHashes).toBe(false);
    expect(compiled.decisionReceiptContract.reviewerIdentityRequired).toBe(true);
    expect(compiled.decisionReceiptContract.immutableReceiptSha256Required).toBe(true);
    expect(compiled.authority.anyHumanApprovalIssued).toBe(false);
    expect(compiled.authority.evidenceAdmissionGranted).toBe(false);
    expect(compiled.authority.paidRenderAuthorized).toBe(false);
    expect(compiled.authority.autoApprovalAllowed).toBe(false);
  });

  it('performs no execution', () => {
    const compiled = compileEp001HumanGatePacket();
    expect(compiled.safety.providerCalls).toBe(0);
    expect(compiled.safety.blenderLaunched).toBe(false);
    expect(compiled.safety.paidRequests).toBe(0);
    expect(compiled.safety.productionMutations).toBe(0);
  });
});

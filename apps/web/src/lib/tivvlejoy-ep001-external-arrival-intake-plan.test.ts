import { describe, expect, it } from 'vitest';
import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalIntakePlan } from '@/lib/tivvlejoy-ep001-external-arrival-intake-plan';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';
import { EP001_HUMAN_DECISION_RECEIPT_SCHEMA } from '@/lib/tivvlejoy-ep001-human-decision-receipt';

const SHA = 'c'.repeat(64);

describe('compileEp001ExternalArrivalIntakePlan', () => {
  it('maps a Pip rig receipt to the Pip zero-cost intake queue', () => {
    const plan = compileEp001ExternalArrivalIntakePlan({
      arrivalType: 'RIG',
      candidate: {
        characterId: 'CHAR_PIP_001',
        filename: 'Pip_Final.blend',
        byteSize: 298 * 1024 * 1024,
        sha256: SHA,
        artistVersionNote: 'Final artist delivery',
      },
    });
    expect(plan.triggerId).toBe('PIP_RIG_ARRIVES');
    expect(plan.safeActions).toHaveLength(5);
    expect(plan.authority.admissionGranted).toBe(false);
    expect(plan.authority.paidExecutionAuthorized).toBe(false);
  });

  it('maps paid voice authorization only to the voice canary path', () => {
    const plan = compileEp001ExternalArrivalIntakePlan({
      arrivalType: 'PAID_AUTHORIZATION',
      candidate: {
        authorizationId: 'AUTH-VOICE-ONE-SHOT',
        scope: 'EP001_VOICE_GENERATION',
        costCeilingUsd: 1,
        oneShot: true,
        authorizationReceiptSha256: SHA,
      },
    });
    expect(plan.triggerId).toBe('VOICE_PAID_AUTHORIZATION_ARRIVES');
    expect(plan.safeActions.map((item) => item.action)).toContain('select EP001_DL_01 as canary');
    expect(plan.safeActions.map((item) => item.action)).not.toContain('batch-generate all eight lines before canary success');
  });

  it('routes a valid SHA-bound human decision receipt to the human decision handler', () => {
    const packet = compileEp001HumanGatePacket();
    const row = packet.rows[0];
    const reviewedAt = '2026-08-27T12:00:00.000Z';
    const evidenceRefs = ['review://example'];
    const canonicalReceiptBody = {
      schemaVersion: EP001_HUMAN_DECISION_RECEIPT_SCHEMA,
      episodeId: packet.episodeId,
      decisionId: row.decisionId,
      bindingSha256: row.bindingSha256,
      decision: 'REJECTED' as const,
      reviewerId: 'reviewer-test',
      reviewedAt,
      evidenceRefs,
    };
    const plan = compileEp001ExternalArrivalIntakePlan({
      arrivalType: 'HUMAN_DECISION',
      candidate: {
        decisionId: row.decisionId,
        bindingSha256: row.bindingSha256,
        decision: 'REJECTED',
        reviewerId: 'reviewer-test',
        reviewedAt,
        evidenceRefs,
        receiptSha256: sha256Canonical(canonicalReceiptBody),
      },
    });
    expect(plan.triggerId).toBe('HUMAN_DECISION_RECEIPT_ARRIVES');
    expect(plan.safeActions.map((item) => item.action)).toContain('validate receipt structure');
    expect(plan.authority.humanApprovalGranted).toBe(false);
  });

  it('maps final-render authorization to guarded preflight without launching', () => {
    const plan = compileEp001ExternalArrivalIntakePlan({
      arrivalType: 'PAID_AUTHORIZATION',
      candidate: {
        authorizationId: 'AUTH-RENDER-ONE-SHOT',
        scope: 'EP001_FINAL_RENDER',
        costCeilingUsd: 1,
        oneShot: true,
        authorizationReceiptSha256: SHA,
      },
    });
    expect(plan.triggerId).toBe('FINAL_RENDER_AUTHORIZATION_ARRIVES');
    expect(plan.safeActions.map((item) => item.action)).toContain('verify all upstream admission gates');
    expect(plan.authority.paidExecutionAuthorized).toBe(false);
    expect(plan.safety.paidRequests).toBe(0);
  });
});

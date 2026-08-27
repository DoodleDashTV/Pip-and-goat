import { describe, expect, it } from 'vitest';
import { prepareEp001PaidAuthorizationDraft } from './tivvlejoy-ep001-paid-authorization-draft';

describe('EP001 paid authorization draft', () => {
  it('can prepare valid one-shot voice metadata without authorizing spend', () => {
    const draft = prepareEp001PaidAuthorizationDraft({ authorizationId: 'VOICE-CANARY-001', scope: 'EP001_VOICE_GENERATION', costCeilingUsd: 1, oneShot: true, note: 'draft only' }, new Date('2026-08-27T18:00:00Z'));
    expect(draft.validation.valid).toBe(true);
    expect(draft.candidate.authorizationReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.explicitAuthorizationRecorded).toBe(false);
    expect(draft.authority.paidExecutionAuthorized).toBe(false);
    expect(draft.authority.providerCallAuthorized).toBe(false);
  });

  it('rejects nonpositive cost ceilings and unbounded metadata', () => {
    const draft = prepareEp001PaidAuthorizationDraft({ authorizationId: 'BAD', scope: 'EP001_FINAL_RENDER', costCeilingUsd: 0 }, new Date('2026-08-27T18:00:00Z'));
    expect(draft.validation.valid).toBe(false);
    expect(draft.validation.errors).toContain('POSITIVE_COST_CEILING_REQUIRED');
    expect(draft.validation.errors).toContain('FUTURE_EXPIRY_OR_ONE_SHOT_REQUIRED');
    expect(draft.authority.gpuLaunchAuthorized).toBe(false);
  });
});

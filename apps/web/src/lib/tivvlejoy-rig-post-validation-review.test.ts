import { describe, expect, it } from 'vitest';
import { compileRigPostValidationReview } from './tivvlejoy-rig-post-validation-review';

const base = {
  rigVersionId: '11111111-2222-3333-4444-555555555555',
  rigSourceSha256: 'a'.repeat(64),
  rigReceiptSha256: 'b'.repeat(64),
  adapterSha256: 'c'.repeat(64),
  adapterReceiptSha256: 'd'.repeat(64),
  validationJobSha256: 'e'.repeat(64),
  validationResultSha256: 'f'.repeat(64),
  deformationEvidenceSha256: '1'.repeat(64),
  inspectionEvidenceBundleSha256: '2'.repeat(64),
};

describe('rig post-validation review packet', () => {
  it('binds Pip review to its admission decision without granting approval', () => {
    const packet = compileRigPostValidationReview({ characterId: 'CHAR_PIP_001', ...base });
    expect(packet.structurallyReadyForHumanReview).toBe(true);
    expect(packet.targetDecisionId).toBe('ADMISSION:PIP_APPROVED_RIG_REQUIRED');
    expect(packet.requiredTestCount).toBe(13);
    expect(packet.reviewSubjectSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(packet.authority.humanApproved).toBe(false);
    expect(packet.authority.episodeAdmitted).toBe(false);
  });

  it('binds Goat review to its admission decision', () => {
    const packet = compileRigPostValidationReview({ characterId: 'CHAR_GOAT_001', ...base });
    expect(packet.structurallyReadyForHumanReview).toBe(true);
    expect(packet.targetDecisionId).toBe('ADMISSION:GOAT_APPROVED_RIG_REQUIRED');
    expect(packet.requiredTestCount).toBe(11);
  });

  it('fails closed on any malformed immutable identity', () => {
    const packet = compileRigPostValidationReview({ characterId: 'CHAR_PIP_001', ...base, validationResultSha256: 'bad' });
    expect(packet.structurallyReadyForHumanReview).toBe(false);
    expect(packet.errors).toContain('RIG_REVIEW_HASH_INVALID:validationResultSha256');
    expect(packet.authority.humanApproved).toBe(false);
  });
});

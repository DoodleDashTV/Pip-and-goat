import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileRigAnimationCompatibilitySuite } from '@/lib/tivvlejoy-rig-animation-compatibility-suite';

export const TIVVLEJOY_RIG_POST_VALIDATION_REVIEW_SCHEMA = 'TIVVLEJOY_RIG_POST_VALIDATION_REVIEW_V1' as const;
export type ReviewCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

export type RigPostValidationReviewInput = {
  characterId: ReviewCharacterId;
  rigVersionId: string;
  rigSourceSha256: string;
  rigReceiptSha256: string;
  adapterSha256: string;
  adapterReceiptSha256: string;
  validationJobSha256: string;
  validationResultSha256: string;
  deformationEvidenceSha256: string;
  inspectionEvidenceBundleSha256: string;
};

const SHA = /^[a-f0-9]{64}$/i;
const UUID = /^[a-f0-9-]{36}$/i;

export function compileRigPostValidationReview(input: RigPostValidationReviewInput) {
  const suite = compileRigAnimationCompatibilitySuite();
  const tests = input.characterId === 'CHAR_PIP_001' ? suite.pip : suite.goat;
  const errors: string[] = [];
  if (!UUID.test(input.rigVersionId)) errors.push('RIG_REVIEW_VERSION_ID_INVALID');
  for (const [name, value] of Object.entries({
    rigSourceSha256: input.rigSourceSha256,
    rigReceiptSha256: input.rigReceiptSha256,
    adapterSha256: input.adapterSha256,
    adapterReceiptSha256: input.adapterReceiptSha256,
    validationJobSha256: input.validationJobSha256,
    validationResultSha256: input.validationResultSha256,
    deformationEvidenceSha256: input.deformationEvidenceSha256,
    inspectionEvidenceBundleSha256: input.inspectionEvidenceBundleSha256,
  })) if (!SHA.test(value)) errors.push(`RIG_REVIEW_HASH_INVALID:${name}`);

  const normalized = {
    schemaVersion: TIVVLEJOY_RIG_POST_VALIDATION_REVIEW_SCHEMA,
    episodeId: 'EP001' as const,
    ...input,
    rigSourceSha256: input.rigSourceSha256.toLowerCase(),
    rigReceiptSha256: input.rigReceiptSha256.toLowerCase(),
    adapterSha256: input.adapterSha256.toLowerCase(),
    adapterReceiptSha256: input.adapterReceiptSha256.toLowerCase(),
    validationJobSha256: input.validationJobSha256.toLowerCase(),
    validationResultSha256: input.validationResultSha256.toLowerCase(),
    deformationEvidenceSha256: input.deformationEvidenceSha256.toLowerCase(),
    inspectionEvidenceBundleSha256: input.inspectionEvidenceBundleSha256.toLowerCase(),
    targetDecisionId: input.characterId === 'CHAR_PIP_001' ? 'ADMISSION:PIP_APPROVED_RIG_REQUIRED' as const : 'ADMISSION:GOAT_APPROVED_RIG_REQUIRED' as const,
    requiredTestCount: tests.length,
    compatibilitySuiteSha256: suite.suiteSha256,
  };
  const reviewSubjectSha256 = sha256Canonical(normalized);
  return {
    ...normalized,
    structurallyReadyForHumanReview: errors.length === 0,
    errors,
    reviewSubjectSha256,
    reviewerMustInspect: [
      'turntable likeness against approved character references',
      'neutral, idle, walk, run, turn, and jump deformation',
      'dialogue controls and mouth/beak articulation',
      'eye direction, blink and expression range',
      'prop interaction and attachment stability',
      'feet/hooves contact and sliding',
      'accessory stability and clipping',
      'deformation stress closeups at shoulders/wing roots/legs/neck/face',
      'all required compatibility-test playblasts and metrics',
      'artist rig README/control behavior where applicable',
    ],
    decisionContract: {
      allowedDecisions: ['APPROVED','REJECTED'] as const,
      reviewerIdRequired: true as const,
      reviewSubjectSha256Required: true as const,
      decisionReceiptSha256Required: true as const,
      approvalTransfersToDifferentRigHash: false as const,
    },
    authority: {
      humanApproved: false as const,
      episodeAdmitted: false as const,
      productionEnabled: false as const,
      autoApprovalAllowed: false as const,
    },
  };
}

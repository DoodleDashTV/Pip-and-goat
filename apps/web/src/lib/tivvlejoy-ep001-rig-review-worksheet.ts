import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001RigInspectionProtocol } from '@/lib/tivvlejoy-ep001-rig-inspection-protocol';

export const EP001_RIG_REVIEW_WORKSHEET_SCHEMA = 'TIVVLEJOY_EP001_RIG_REVIEW_WORKSHEET_V1' as const;

export function compileEp001RigReviewWorksheet() {
  const protocol = compileEp001RigInspectionProtocol();

  const characters = protocol.characters.map((character) => {
    const applicableChecks = protocol.checks.filter((check) => check.appliesTo.includes(character.characterId));
    return {
      characterId: character.characterId,
      displayName: character.displayName,
      state: 'WAITING_FOR_ARTIST_DELIVERY' as const,
      sourceSha256: null,
      sourceByteSize: null,
      reviewer: null,
      reviewStartedAt: null,
      reviewCompletedAt: null,
      rows: applicableChecks.map((check) => ({
        checkId: check.checkId,
        label: check.label,
        stage: check.stage,
        evidenceKind: check.evidenceKind,
        acceptanceCriterion: check.acceptanceCriterion,
        result: 'NOT_REVIEWED' as const,
        evidenceRef: null,
        notes: null,
      })),
      requiredTestPoses: character.requiredTestPoses.map((pose) => ({
        pose,
        result: 'NOT_REVIEWED' as const,
        evidenceRef: null,
        notes: null,
      })),
      humanDecision: 'NOT_ISSUED' as const,
    };
  });

  const body = {
    schemaVersion: EP001_RIG_REVIEW_WORKSHEET_SCHEMA,
    episodeId: protocol.episodeId,
    workingTitle: protocol.workingTitle,
    inspectionProtocolSha256: protocol.protocolSha256,
    purpose: 'Human-facing worksheet template for recording SHA-bound artist-rig inspection evidence after real delivery.',
    characters,
    resultVocabulary: ['NOT_REVIEWED', 'PASS', 'FAIL', 'NOT_APPLICABLE'] as const,
    completionRules: [
      'Do not enter PASS or FAIL until the real canonical source SHA-256 and exact byte size are recorded.',
      'Every PASS must point to inspectable evidence bound to the exact source SHA-256.',
      'A FAIL blocks admission for that exact artifact version until a corrected version is delivered and re-reviewed.',
      'Technical completion never implies human approval.',
      'Human approval must be an explicit separate decision after all applicable blocking checks pass.',
      'Animation execution remains blocked until the approved exact rig version is admitted.',
    ],
    authority: {
      realRigPresent: false as const,
      evidenceRecorded: false as const,
      humanVisualApprovalIssued: false as const,
      rigAdmissionGranted: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      blenderLaunched: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      paidRequests: 0 as const,
    },
  };

  return { ...body, worksheetSha256: sha256Canonical(body) };
}

export type Ep001RigReviewWorksheet = ReturnType<typeof compileEp001RigReviewWorksheet>;

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001RigDeliveryContract } from '@/lib/tivvlejoy-ep001-rig-delivery-contract';
import { compileRigArrivalChecklist } from '@/lib/tivvlejoy-real-production-unblock/rig-checklist';

export const EP001_RIG_INSPECTION_PROTOCOL_SCHEMA =
  'TIVVLEJOY_EP001_RIG_INSPECTION_PROTOCOL_V1' as const;

export const EP001_RIG_INSPECTION_STAGES = [
  'PROVENANCE',
  'STRUCTURE',
  'DEFORMATION',
  'POSE_REVIEW',
  'HUMAN_APPROVAL',
] as const;

export type Ep001RigInspectionStage = (typeof EP001_RIG_INSPECTION_STAGES)[number];
export type Ep001RigInspectionCharacter = 'PIP' | 'GOAT';

const CHECK_RULES = {
  RIG_CHECK_01: {
    stage: 'PROVENANCE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'FILE_RECEIPT',
    acceptanceCriterion: 'Canonical Blender source is present and its exact byte size is recorded.',
  },
  RIG_CHECK_02: {
    stage: 'PROVENANCE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'SHA256_RECEIPT',
    acceptanceCriterion: 'Observed SHA-256 is valid, reproducible, and bound to the received source bytes.',
  },
  RIG_CHECK_03: {
    stage: 'PROVENANCE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'SOURCE_PRESERVATION_RECEIPT',
    acceptanceCriterion: 'Original artist source remains immutable; inspection uses a non-destructive working copy.',
  },
  RIG_CHECK_04: {
    stage: 'PROVENANCE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'BLENDER_VERSION_REPORT',
    acceptanceCriterion: 'The source opens in the declared Blender version without conversion damage or missing dependencies.',
  },
  RIG_CHECK_05: {
    stage: 'STRUCTURE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'ARMATURE_REPORT',
    acceptanceCriterion: 'Armature hierarchy is inspectable, stable, and free of broken required rig relationships.',
  },
  RIG_CHECK_06: {
    stage: 'STRUCTURE',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'CONTROL_COVERAGE_REPORT',
    acceptanceCriterion: 'Every admission-required control in the EP001 delivery contract is present and addressable.',
  },
  RIG_CHECK_07: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'WEIGHT_DEFORMATION_EVIDENCE',
    acceptanceCriterion: 'Required motion ranges preserve volume and silhouette without unacceptable collapse, tearing, or clipping.',
  },
  RIG_CHECK_08: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'DIALOGUE_MOUTH_EVIDENCE',
    acceptanceCriterion: 'Pip beak or Goat jaw/mouth opens and closes cleanly for dialogue without visible intersection failure.',
  },
  RIG_CHECK_09: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'EYE_AIM_EVIDENCE',
    acceptanceCriterion: 'Both eyes and eye-aim controls track stable targets without drift, inversion, or visible mesh damage.',
  },
  RIG_CHECK_10: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'EYELID_OR_FACE_EVIDENCE',
    acceptanceCriterion: 'Required eyelid or approved facial fallback motion remains readable and deformation-safe.',
  },
  RIG_CHECK_11: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP'],
    evidenceKind: 'PIP_WING_EVIDENCE',
    acceptanceCriterion: 'Both Pip wings can raise, point, reach, carry, and gesture while preserving shoulder/chest volume and silhouette.',
  },
  RIG_CHECK_12: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'LOCOMOTION_CONTACT_EVIDENCE',
    acceptanceCriterion: 'Leg and foot/hoof controls support planted contacts, weight transfer, turns, stops, and run poses without visible slide.',
  },
  RIG_CHECK_13: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP'],
    evidenceKind: 'PIP_HALLUX_EVIDENCE',
    acceptanceCriterion: 'Pip rear hallux remains planted and anatomically coherent through required contact and balance poses.',
  },
  RIG_CHECK_14: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'ACCESSORY_STABILITY_EVIDENCE',
    acceptanceCriterion: 'Identity-critical accessories remain attached, stable, and visually consistent through required motion.',
  },
  RIG_CHECK_15: {
    stage: 'DEFORMATION',
    appliesTo: ['GOAT'],
    evidenceKind: 'GOAT_COLLAR_TAG_EVIDENCE',
    acceptanceCriterion: 'Goat collar and round tag remain attached, readable, stable, and free of unacceptable clipping.',
  },
  RIG_CHECK_16: {
    stage: 'DEFORMATION',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'PROP_ATTACHMENT_EVIDENCE',
    acceptanceCriterion: 'Episode-required prop attachment points hold the map or other assigned prop without drift or detachment.',
  },
  RIG_CHECK_17: {
    stage: 'POSE_REVIEW',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'TEST_POSE_REVIEW',
    acceptanceCriterion: 'Every character-specific required test pose is reviewed against deformation, silhouette, identity, and contact criteria.',
  },
  RIG_CHECK_18: {
    stage: 'HUMAN_APPROVAL',
    appliesTo: ['PIP', 'GOAT'],
    evidenceKind: 'HUMAN_VISUAL_APPROVAL_RECEIPT',
    acceptanceCriterion: 'A human reviewer explicitly approves the exact SHA-bound rig after all earlier checks pass.',
  },
} as const satisfies Record<
  string,
  {
    stage: Ep001RigInspectionStage;
    appliesTo: readonly Ep001RigInspectionCharacter[];
    evidenceKind: string;
    acceptanceCriterion: string;
  }
>;

export function compileEp001RigInspectionProtocol() {
  const delivery = compileEp001RigDeliveryContract();
  const checklist = compileRigArrivalChecklist();

  const checks = checklist.map((row) => {
    const rule = CHECK_RULES[row.id as keyof typeof CHECK_RULES];
    if (!rule) throw new Error(`EP001_RIG_INSPECTION_UNMAPPED_CHECK:${row.id}`);
    return {
      checkId: row.id,
      label: row.label,
      stage: rule.stage,
      appliesTo: [...rule.appliesTo],
      evidenceKind: rule.evidenceKind,
      acceptanceCriterion: rule.acceptanceCriterion,
      initialState: 'PENDING_REAL_RIG' as const,
      complete: false as const,
      autoApproval: false as const,
    };
  });

  const characters = delivery.characters.map((character) => {
    const characterChecks = checks.filter((check) => check.appliesTo.includes(character.characterId));
    return {
      characterId: character.characterId,
      displayName: character.displayName,
      canonicalSourceExtension: character.canonicalSource.requiredExtension,
      requiredControlCount: character.requiredControlCount,
      requiredTestPoseCount: character.requiredTestPoseCount,
      requiredTestPoses: character.requiredTestPoses,
      inspectionCheckCount: characterChecks.length,
      checkIds: characterChecks.map((check) => check.checkId),
      state: 'WAITING_FOR_REAL_RIG' as const,
      humanApprovalIssued: false as const,
    };
  });

  const stages = EP001_RIG_INSPECTION_STAGES.map((stage) => ({
    stage,
    checks: checks.filter((check) => check.stage === stage).map((check) => check.checkId),
    mayAutoAdvance:
      stage === 'HUMAN_APPROVAL' ? (false as const) : ('ONLY_WITH_SHA_BOUND_EVIDENCE' as const),
  }));

  const body = {
    schemaVersion: EP001_RIG_INSPECTION_PROTOCOL_SCHEMA,
    episodeId: delivery.episodeId,
    workingTitle: delivery.workingTitle,
    deliveryContractSha256: delivery.contractSha256,
    state: 'PROTOCOL_READY_REAL_RIGS_NOT_PRESENT' as const,
    stages,
    checks,
    characters,
    executionRules: [
      'Never inspect a filename as identity; bind every result to the canonical source SHA-256.',
      'Preserve the artist source and perform destructive experiments only on a working copy.',
      'A failed blocking check stops admission for that exact artifact version.',
      'Synthetic fixtures may test protocol code but cannot satisfy a real-rig check.',
      'Passing machine or Blender checks cannot issue human visual approval.',
      'Animation execution remains blocked until the exact approved rig version is admitted.',
    ],
    authority: {
      realRigPresent: false as const,
      rigAdmissionGranted: false as const,
      humanVisualApprovalIssued: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      rigBytesIncluded: false as const,
      blenderLaunched: false as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      paidRequests: 0 as const,
    },
  };

  return { ...body, protocolSha256: sha256Canonical(body) };
}

export type Ep001RigInspectionProtocol = ReturnType<typeof compileEp001RigInspectionProtocol>;

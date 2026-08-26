import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001ProductionHandoff } from '@/lib/tivvlejoy-ep001-production-handoff';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import { compileEp001RigHandoffMatrix } from '@/lib/tivvlejoy-ep001-rig-handoff';
import { compileEp001SceneryPullSheet } from '@/lib/tivvlejoy-ep001-scenery-pull-sheet';
import { sha256Canonical } from '@/lib/tivvlejoy-nightshift-production';
import { admitRigMetadata } from '@/lib/tivvlejoy-real-input-convergence/rig-arrival';

export const EP001_EVIDENCE_ADMISSION_SCHEMA = 'TIVVLEJOY_EP001_EVIDENCE_ADMISSION_V1' as const;

export type Ep001RigEvidenceCandidate = {
  characterId: 'PIP' | 'GOAT';
  artifactSha256: string;
  byteSize: number;
  extension: string;
  rigMatrixSha256: string;
  requiredControlCount: number;
  requiredTestPoseCount: number;
  hashVerified: boolean;
  structureVerified: boolean;
  inspectionReportSha256: string;
  deformationMediaSha256: string;
  humanApprovalReceiptSha256: string;
};

export type Ep001SceneryEvidenceCandidate = {
  pullSheetSha256: string;
  bindingManifestSha256: string;
  resolvedRoleCount: number;
  allSourcesHashVerified: boolean;
  allLicensesVerified: boolean;
  humanApprovalReceiptSha256: string;
};

export type Ep001VoiceLineEvidenceCandidate = {
  lineId: string;
  speaker: 'PIP' | 'GOAT';
  audioSha256: string;
  timingSha256: string;
  humanApprovalReceiptSha256: string;
};

export type Ep001VoiceEvidenceCandidate = {
  cueSheetSha256: string;
  lineReceipts: Ep001VoiceLineEvidenceCandidate[];
};

export type Ep001ApprovalEvidenceCandidate = {
  subjectSha256: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string;
  receiptSha256: string;
};

export type Ep001VisualEvidenceCandidate = Ep001ApprovalEvidenceCandidate & {
  realPlayblastSha256: string;
  pipRigSha256: string;
  goatRigSha256: string;
  reviewedShotCount: number;
};

export type Ep001PaidAuthorizationCandidate = {
  handoffSha256: string;
  authorizationId: string;
  executionId: string;
  immutableImageDigest: string;
  maxUsd: number;
  expiresAt: string;
  receiptSha256: string;
};

export type Ep001EvidenceCandidates = {
  pipRig?: Ep001RigEvidenceCandidate;
  goatRig?: Ep001RigEvidenceCandidate;
  scenery?: Ep001SceneryEvidenceCandidate;
  voices?: Ep001VoiceEvidenceCandidate;
  storyApproval?: Ep001ApprovalEvidenceCandidate;
  visualApproval?: Ep001VisualEvidenceCandidate;
  paidAuthorization?: Ep001PaidAuthorizationCandidate;
};

type EvidenceStatus = 'NOT_PRESENT' | 'REJECTED' | 'CANDIDATE_READY_FOR_MANUAL_GATE';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

function evidenceRow(input: {
  blockerCode: string;
  label: string;
  evidenceClass: string;
  bindingTargetSha256: string;
  requiredEvidence: readonly string[];
  present: boolean;
  issues: string[];
}) {
  const status: EvidenceStatus = !input.present
    ? 'NOT_PRESENT'
    : input.issues.length > 0
      ? 'REJECTED'
      : 'CANDIDATE_READY_FOR_MANUAL_GATE';
  return {
    ...input,
    status,
    blockerResolved: false as const,
    autoAccepted: false as const,
    manualGateRequired: true as const,
  };
}

function rigIssues(
  candidate: Ep001RigEvidenceCandidate | undefined,
  character: ReturnType<typeof compileEp001RigHandoffMatrix>['characters'][number],
  matrixSha256: string,
) {
  if (!candidate) return [];
  const issues: string[] = [];
  if (candidate.characterId !== character.characterId) issues.push('RIG_CHARACTER_ID_MISMATCH');
  if (candidate.rigMatrixSha256 !== matrixSha256) issues.push('RIG_MATRIX_BINDING_MISMATCH');
  const intake = admitRigMetadata({
    characterId: character.characterId,
    byteSize: candidate.byteSize,
    extension: candidate.extension,
    sha256: candidate.artifactSha256,
    evidenceClass: 'REAL_RIG_INTAKE',
  });
  if (intake.blocker) issues.push(intake.blocker);
  if (!candidate.hashVerified) issues.push('RIG_HASH_NOT_VERIFIED');
  if (!candidate.structureVerified) issues.push('RIG_STRUCTURE_NOT_VERIFIED');
  if (candidate.requiredControlCount < character.admissionRequiredControls.length)
    issues.push('RIG_REQUIRED_CONTROL_COVERAGE_INCOMPLETE');
  if (candidate.requiredTestPoseCount < character.requiredTestPoses.length)
    issues.push('RIG_REQUIRED_TEST_POSES_INCOMPLETE');
  if (!validSha256(candidate.inspectionReportSha256)) issues.push('RIG_INSPECTION_REPORT_INVALID');
  if (!validSha256(candidate.deformationMediaSha256)) issues.push('RIG_DEFORMATION_MEDIA_INVALID');
  if (!validSha256(candidate.humanApprovalReceiptSha256))
    issues.push('RIG_HUMAN_APPROVAL_RECEIPT_INVALID');
  return [...new Set(issues)];
}

export function compileEp001EvidenceAdmissionBoard(candidates: Ep001EvidenceCandidates = {}) {
  const episode = compileEp001ProductionPackage();
  const rigMatrix = compileEp001RigHandoffMatrix(episode);
  const scenery = compileEp001SceneryPullSheet(episode);
  const audio = compileEp001AudioCueSheet(episode);
  const handoff = compileEp001ProductionHandoff();
  const pipContract = rigMatrix.characters.find((character) => character.characterId === 'PIP')!;
  const goatContract = rigMatrix.characters.find((character) => character.characterId === 'GOAT')!;

  const sceneryIssues: string[] = [];
  if (candidates.scenery) {
    if (candidates.scenery.pullSheetSha256 !== scenery.pullSheetSha256)
      sceneryIssues.push('SCENERY_PULL_SHEET_BINDING_MISMATCH');
    if (!validSha256(candidates.scenery.bindingManifestSha256))
      sceneryIssues.push('SCENERY_BINDING_MANIFEST_INVALID');
    if (candidates.scenery.resolvedRoleCount !== scenery.metrics.uniqueRequiredRoleCount)
      sceneryIssues.push('SCENERY_REQUIRED_ROLE_COVERAGE_INCOMPLETE');
    if (!candidates.scenery.allSourcesHashVerified)
      sceneryIssues.push('SCENERY_SOURCE_HASHES_UNVERIFIED');
    if (!candidates.scenery.allLicensesVerified)
      sceneryIssues.push('SCENERY_LICENSE_RECEIPTS_UNVERIFIED');
    if (!validSha256(candidates.scenery.humanApprovalReceiptSha256))
      sceneryIssues.push('SCENERY_HUMAN_APPROVAL_RECEIPT_INVALID');
  }

  const voiceIssues: string[] = [];
  if (candidates.voices) {
    if (candidates.voices.cueSheetSha256 !== audio.cueSheetSha256)
      voiceIssues.push('VOICE_CUE_SHEET_BINDING_MISMATCH');
    if (candidates.voices.lineReceipts.length !== episode.dialogue.length)
      voiceIssues.push('VOICE_RECEIPT_COUNT_MISMATCH');
    const receiptIds = candidates.voices.lineReceipts.map((receipt) => receipt.lineId);
    if (new Set(receiptIds).size !== receiptIds.length)
      voiceIssues.push('VOICE_DUPLICATE_LINE_RECEIPT');
    for (const line of episode.dialogue) {
      const receipt = candidates.voices.lineReceipts.find((item) => item.lineId === line.lineId);
      if (!receipt) {
        voiceIssues.push(`VOICE_LINE_RECEIPT_MISSING:${line.lineId}`);
        continue;
      }
      if (receipt.speaker !== line.speaker)
        voiceIssues.push(`VOICE_SPEAKER_MISMATCH:${line.lineId}`);
      if (!validSha256(receipt.audioSha256))
        voiceIssues.push(`VOICE_AUDIO_HASH_INVALID:${line.lineId}`);
      if (!validSha256(receipt.timingSha256))
        voiceIssues.push(`VOICE_TIMING_HASH_INVALID:${line.lineId}`);
      if (!validSha256(receipt.humanApprovalReceiptSha256))
        voiceIssues.push(`VOICE_APPROVAL_RECEIPT_INVALID:${line.lineId}`);
    }
  }

  const storyIssues: string[] = [];
  if (candidates.storyApproval) {
    if (candidates.storyApproval.subjectSha256 !== episode.packageSha256)
      storyIssues.push('STORY_APPROVAL_BINDING_MISMATCH');
    if (candidates.storyApproval.decision !== 'APPROVED')
      storyIssues.push('STORY_APPROVAL_DECISION_NOT_APPROVED');
    if (!candidates.storyApproval.reviewerId.trim()) storyIssues.push('STORY_REVIEWER_REQUIRED');
    if (!validSha256(candidates.storyApproval.receiptSha256))
      storyIssues.push('STORY_APPROVAL_RECEIPT_INVALID');
  }

  const visualIssues: string[] = [];
  if (candidates.visualApproval) {
    if (candidates.visualApproval.subjectSha256 !== handoff.handoffSha256)
      visualIssues.push('VISUAL_APPROVAL_BINDING_MISMATCH');
    if (candidates.visualApproval.decision !== 'APPROVED')
      visualIssues.push('VISUAL_APPROVAL_DECISION_NOT_APPROVED');
    if (!candidates.visualApproval.reviewerId.trim()) visualIssues.push('VISUAL_REVIEWER_REQUIRED');
    if (!validSha256(candidates.visualApproval.receiptSha256))
      visualIssues.push('VISUAL_APPROVAL_RECEIPT_INVALID');
    if (!validSha256(candidates.visualApproval.realPlayblastSha256))
      visualIssues.push('VISUAL_REAL_PLAYBLAST_HASH_INVALID');
    if (!candidates.pipRig) visualIssues.push('VISUAL_PIP_RIG_EVIDENCE_REQUIRED');
    else if (candidates.visualApproval.pipRigSha256 !== candidates.pipRig.artifactSha256)
      visualIssues.push('VISUAL_PIP_RIG_BINDING_MISMATCH');
    if (!candidates.goatRig) visualIssues.push('VISUAL_GOAT_RIG_EVIDENCE_REQUIRED');
    else if (candidates.visualApproval.goatRigSha256 !== candidates.goatRig.artifactSha256)
      visualIssues.push('VISUAL_GOAT_RIG_BINDING_MISMATCH');
    if (candidates.visualApproval.reviewedShotCount !== episode.shots.length)
      visualIssues.push('VISUAL_SHOT_REVIEW_COVERAGE_INCOMPLETE');
  }

  const paidIssues: string[] = [];
  if (candidates.paidAuthorization) {
    if (candidates.paidAuthorization.handoffSha256 !== handoff.handoffSha256)
      paidIssues.push('PAID_AUTHORIZATION_HANDOFF_MISMATCH');
    if (!candidates.paidAuthorization.authorizationId.trim())
      paidIssues.push('PAID_AUTHORIZATION_ID_REQUIRED');
    if (!candidates.paidAuthorization.executionId.trim())
      paidIssues.push('PAID_EXECUTION_ID_REQUIRED');
    if (!IMAGE_DIGEST_PATTERN.test(candidates.paidAuthorization.immutableImageDigest))
      paidIssues.push('PAID_IMMUTABLE_IMAGE_DIGEST_INVALID');
    if (
      !Number.isFinite(candidates.paidAuthorization.maxUsd) ||
      candidates.paidAuthorization.maxUsd <= 0
    )
      paidIssues.push('PAID_COST_CEILING_INVALID');
    if (!Number.isFinite(Date.parse(candidates.paidAuthorization.expiresAt)))
      paidIssues.push('PAID_EXPIRY_INVALID');
    if (!validSha256(candidates.paidAuthorization.receiptSha256))
      paidIssues.push('PAID_AUTHORIZATION_RECEIPT_INVALID');
  }

  const rows = [
    evidenceRow({
      blockerCode: 'PIP_APPROVED_RIG_REQUIRED',
      label: 'Pip approved artist rig',
      evidenceClass: 'REAL_RIG_AND_HUMAN_APPROVAL',
      bindingTargetSha256: rigMatrix.matrixSha256,
      requiredEvidence: [
        'Canonical .blend hash and size',
        `${pipContract.admissionRequiredControls.length} required controls`,
        `${pipContract.requiredTestPoses.length} test poses`,
        'Inspection, deformation media, and human approval receipts',
      ],
      present: Boolean(candidates.pipRig),
      issues: rigIssues(candidates.pipRig, pipContract, rigMatrix.matrixSha256),
    }),
    evidenceRow({
      blockerCode: 'GOAT_APPROVED_RIG_REQUIRED',
      label: 'Goat approved artist rig',
      evidenceClass: 'REAL_RIG_AND_HUMAN_APPROVAL',
      bindingTargetSha256: rigMatrix.matrixSha256,
      requiredEvidence: [
        'Canonical .blend hash and size',
        `${goatContract.admissionRequiredControls.length} required controls`,
        `${goatContract.requiredTestPoses.length} test poses`,
        'Inspection, deformation media, and human approval receipts',
      ],
      present: Boolean(candidates.goatRig),
      issues: rigIssues(candidates.goatRig, goatContract, rigMatrix.matrixSha256),
    }),
    evidenceRow({
      blockerCode: 'APPROVED_SCENERY_BINDINGS_REQUIRED',
      label: 'Approved scenery bindings',
      evidenceClass: 'REAL_ASSET_BINDINGS_AND_LICENSE_RECEIPTS',
      bindingTargetSha256: scenery.pullSheetSha256,
      requiredEvidence: [
        `${scenery.metrics.uniqueRequiredRoleCount} resolved semantic roles`,
        'Immutable binding manifest',
        'Source hashes, license receipts, and human visual approval',
      ],
      present: Boolean(candidates.scenery),
      issues: sceneryIssues,
    }),
    evidenceRow({
      blockerCode: 'EXACT_VOICE_RECEIPTS_REQUIRED',
      label: 'Exact approved voice receipts',
      evidenceClass: 'REAL_AUDIO_TIMING_AND_HUMAN_APPROVAL',
      bindingTargetSha256: audio.cueSheetSha256,
      requiredEvidence: [
        `${episode.dialogue.length} exact line receipts`,
        'Audio and timing hashes for each line',
        'Speaker identity and human approval for each line',
      ],
      present: Boolean(candidates.voices),
      issues: [...new Set(voiceIssues)],
    }),
    evidenceRow({
      blockerCode: 'HUMAN_STORY_APPROVAL_REQUIRED',
      label: 'Human story approval',
      evidenceClass: 'HUMAN_DECISION_RECEIPT',
      bindingTargetSha256: episode.packageSha256,
      requiredEvidence: ['Approved decision', 'Reviewer identity', 'Immutable receipt hash'],
      present: Boolean(candidates.storyApproval),
      issues: storyIssues,
    }),
    evidenceRow({
      blockerCode: 'HUMAN_VISUAL_APPROVAL_REQUIRED',
      label: 'Human visual approval',
      evidenceClass: 'REAL_RIG_PLAYBLAST_AND_HUMAN_DECISION',
      bindingTargetSha256: handoff.handoffSha256,
      requiredEvidence: [
        'Real-rig playblast hash',
        'Exact Pip and Goat rig hashes',
        `${episode.shots.length}-shot review coverage`,
        'Approved human decision receipt',
      ],
      present: Boolean(candidates.visualApproval),
      issues: visualIssues,
    }),
    evidenceRow({
      blockerCode: 'PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED',
      label: 'Paid final-render authorization',
      evidenceClass: 'IMMUTABLE_COST_CAPPED_AUTHORIZATION',
      bindingTargetSha256: handoff.handoffSha256,
      requiredEvidence: [
        'Authorization and execution IDs',
        'Immutable image digest',
        'Positive cost ceiling and expiry',
        'Authorization receipt hash',
      ],
      present: Boolean(candidates.paidAuthorization),
      issues: paidIssues,
    }),
  ];

  const body = {
    schemaVersion: EP001_EVIDENCE_ADMISSION_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionHandoffSha256: handoff.handoffSha256,
    state: 'EVIDENCE_PREFLIGHT_READY_ALL_REAL_GATES_REMAIN_MANUAL' as const,
    rows,
    metrics: {
      evidenceClassCount: rows.length,
      notPresentCount: rows.filter((row) => row.status === 'NOT_PRESENT').length,
      rejectedCount: rows.filter((row) => row.status === 'REJECTED').length,
      candidateReadyCount: rows.filter((row) => row.status === 'CANDIDATE_READY_FOR_MANUAL_GATE')
        .length,
      resolvedBlockerCount: 0 as const,
    },
    runtimeRevalidationRequired: ['PAID_AUTHORIZATION_EXPIRY', 'IMMUTABLE_IMAGE_IDENTITY'] as const,
    authority: {
      evidenceInspectionAllowed: true as const,
      evidencePersistenceAllowed: false as const,
      blockerResolutionAllowed: false as const,
      rigAdmissionGranted: false as const,
      storyApprovalIssued: false as const,
      visualApprovalIssued: false as const,
      voiceProviderCallsAllowed: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      launchAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      metadataValidationOnly: true as const,
      sourceBytesRead: 0 as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      remoteStorageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, evidenceBoardSha256: sha256Canonical(body) };
}

export type Ep001EvidenceAdmissionBoard = ReturnType<typeof compileEp001EvidenceAdmissionBoard>;

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001EvidenceAdmissionBoard } from '@/lib/tivvlejoy-ep001-evidence-admission';
import { compileEp001SceneryDeepInspectionPlan } from '@/lib/tivvlejoy-ep001-scenery-deep-inspection-plan';
import { compileEp001VoiceExecutionReadiness } from '@/lib/tivvlejoy-ep001-voice-execution-readiness';

export const EP001_HUMAN_GATE_PACKET_SCHEMA = 'TIVVLEJOY_EP001_HUMAN_GATE_PACKET_V1' as const;

export function compileEp001HumanGatePacket() {
  const evidence = compileEp001EvidenceAdmissionBoard();
  const scenery = compileEp001SceneryDeepInspectionPlan();
  const voices = compileEp001VoiceExecutionReadiness();

  const voiceRows = voices.lines.map((line) => ({
    decisionId: `VOICE:${line.lineId}`,
    gateClass: 'VOICE_PERFORMANCE' as const,
    subjectLabel: `${line.lineId} · ${line.speaker}`,
    bindingSha256: sha256Canonical({
      lineId: line.lineId,
      characterId: line.characterId,
      voiceProfileVersion: line.voiceProfileVersion,
      text: line.text,
      pictureWindow: line.pictureWindow,
    }),
    reviewerMustInspect: [
      'exact generated audio candidate bound to audio SHA-256',
      'locked character voice identity',
      'pronunciation and intelligibility',
      'emotion and performance fit',
      'pacing against the locked picture window',
      'child-audience suitability',
    ],
    currentState: 'WAITING_FOR_REAL_AUDIO' as const,
    decision: null,
    reviewerId: null,
    receiptSha256: null,
  }));

  const sceneryRows = scenery.items.map((item) => ({
    decisionId: `SCENERY:${item.sourceId}`,
    gateClass: 'SCENERY_SOURCE' as const,
    subjectLabel: item.sourceId,
    bindingSha256: sha256Canonical({
      sceneryDeepInspectionPlanSha256: scenery.sceneryDeepInspectionPlanSha256,
      sourceId: item.sourceId,
      inspectionMode: item.inspectionMode,
      expectedEvidence: item.expectedEvidence,
    }),
    reviewerMustInspect: [
      'exact purchase/license evidence for this source or dependency',
      'deep-inspection evidence bound to the exact source hash',
      'materials and texture integrity',
      'scale, silhouette, density and 9:16 readability',
      'style compatibility with Pip and Goat',
      'child-audience suitability',
    ],
    currentState: 'WAITING_FOR_LICENSE_AND_INSPECTION_EVIDENCE' as const,
    decision: null,
    reviewerId: null,
    receiptSha256: null,
  }));

  const evidenceRows = evidence.rows.map((row) => ({
    decisionId: `ADMISSION:${row.blockerCode}`,
    gateClass: 'EPISODE_ADMISSION' as const,
    subjectLabel: row.label,
    bindingSha256: row.bindingTargetSha256,
    reviewerMustInspect: [...row.requiredEvidence],
    currentState: row.status,
    decision: null,
    reviewerId: null,
    receiptSha256: null,
  }));

  const rows = [...evidenceRows, ...voiceRows, ...sceneryRows];
  const body = {
    schemaVersion: EP001_HUMAN_GATE_PACKET_SCHEMA,
    episodeId: evidence.episodeId,
    state: 'HUMAN_DECISION_PACKET_READY_NO_APPROVALS_ISSUED' as const,
    evidenceAdmissionSha256: evidence.evidenceAdmissionSha256,
    sceneryDeepInspectionPlanSha256: scenery.sceneryDeepInspectionPlanSha256,
    voiceExecutionReadinessSha256: voices.voiceExecutionReadinessSha256,
    rows,
    decisionReceiptContract: {
      requiredFields: ['decisionId','bindingSha256','decision','reviewerId','reviewedAt','receiptSha256'],
      allowedDecisions: ['APPROVED','REJECTED'] as const,
      approvalTransfersAcrossDifferentHashes: false as const,
      reviewerIdentityRequired: true as const,
      immutableReceiptSha256Required: true as const,
    },
    sequencingRules: [
      'Story approval may occur before real rigs/audio, but it must bind to the exact production package hash.',
      'Voice approvals occur per exact generated audio hash; a regeneration requires a new review.',
      'Scenery source approval requires both license/provenance evidence and deep-inspection evidence.',
      'Rig approval requires exact rig SHA, completed technical inspection, deformation evidence, and test-pose review.',
      'Final visual approval occurs only after the exact approved rigs, admitted scenery, and real voice timing are represented in a real-rig playblast.',
      'Paid final-render authorization is the final spending gate and cannot be inferred from any earlier approval.',
    ],
    metrics: {
      totalDecisionRows: rows.length,
      episodeAdmissionRows: evidenceRows.length,
      voiceDecisionRows: voiceRows.length,
      sceneryDecisionRows: sceneryRows.length,
      approvedRows: 0 as const,
      rejectedRows: 0 as const,
      pendingRows: rows.length,
    },
    authority: {
      anyHumanApprovalIssued: false as const,
      evidenceAdmissionGranted: false as const,
      finalVisualApprovalIssued: false as const,
      paidRenderAuthorized: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, humanGatePacketSha256: sha256Canonical(body) };
}

export type Ep001HumanGatePacket = ReturnType<typeof compileEp001HumanGatePacket>;

import type { FirstEpisodeUnblockReport } from './types';
import type { Ep012VoiceProductionHandoff } from './ep012-voice-production-handoff';
import {
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_AUTHORIZED_REQUEST_COUNT,
} from './ep012-paid-voice-constants';
import { EP012_CANONICAL_DIALOGUE_LOCK } from './ep012-canonical-dialogue';

export type FirstEpisodeOperatorModel = {
  title: 'FIRST REAL EPISODE';
  numberOneBlocker: string;
  rigStatus: string;
  voiceReceiptStatus: string;
  sceneryRealInspectionStatus: string;
  blenderStatus: string;
  humanReviewStatus: string;
  paidRenderStatus: string;
  next5Actions: string[];
  spendBanner: 'DO NOT SPEND MONEY YET' | 'AUTHORIZATION REQUIRED';
  selectedObjectCount: number;
  selectedTotalBytes: number;
  listedObjectCount: number;
  commercialDeepInspectionReady: false;
  voiceGenerationPerformed: false;
};

export type FirstEpisodeVoiceHandoffModel = {
  evidenceClass: 'REAL_LEDGER' | 'BLOCKED';
  status: 'HANDOFF_COMPLETE' | 'BLOCKED';
  statusLabel: string;
  segmentCount: number;
  dialogueReceiptCount: number;
  characterCount: number;
  storageVerifiedCount: number;
  exactTimingSegmentCount: number;
  handoffSha256: string | null;
  voiceDependencySha256: string | null;
  productionPacketSha256: string | null;
  packetReadiness: 'PLANNING_COMPLETE' | 'BLOCKED';
  studioReadiness: 'WAITING_FOR_CHARACTER_RIGS';
  renderStatus: 'NOT_STARTED';
  remainingBlockers: string[];
  blockers: string[];
  historicalProviderRequests: number;
  providerRequestsMadeDuringHandoff: 0;
  storageObjectsReadDuringHandoff: 0;
  productionEnabled: false;
};

const CONTROL_HANDOFF_MISMATCH = 'EP012_CONTROL_HANDOFF_MISMATCH';

function isSha256(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function fallbackFirstEpisodeVoiceHandoffModel(): FirstEpisodeVoiceHandoffModel {
  return {
    evidenceClass: 'BLOCKED',
    status: 'BLOCKED',
    statusLabel: 'Voice handoff unavailable or inconsistent. Production remains blocked.',
    segmentCount: 0,
    dialogueReceiptCount: 0,
    characterCount: 0,
    storageVerifiedCount: 0,
    exactTimingSegmentCount: 0,
    handoffSha256: null,
    voiceDependencySha256: null,
    productionPacketSha256: null,
    packetReadiness: 'BLOCKED',
    studioReadiness: 'WAITING_FOR_CHARACTER_RIGS',
    renderStatus: 'NOT_STARTED',
    remainingBlockers: ['Verified EP012 voice handoff', 'Pip and Goat production rigs', 'paid render authorization', 'real media QC'],
    blockers: ['EP012_HANDOFF_UNAVAILABLE', CONTROL_HANDOFF_MISMATCH],
    historicalProviderRequests: 0,
    providerRequestsMadeDuringHandoff: 0,
    storageObjectsReadDuringHandoff: 0,
    productionEnabled: false,
  };
}

export function isFirstEpisodeVoiceHandoffModel(value: unknown): value is FirstEpisodeVoiceHandoffModel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FirstEpisodeVoiceHandoffModel>;
  if (
    !Array.isArray(candidate.remainingBlockers) ||
    !candidate.remainingBlockers.every((item) => typeof item === 'string') ||
    !Array.isArray(candidate.blockers) ||
    !candidate.blockers.every((item) => typeof item === 'string')
  ) {
    return false;
  }
  const remainingBlockers = candidate.remainingBlockers;
  const blockers = candidate.blockers;
  const commonValid =
    candidate.studioReadiness === 'WAITING_FOR_CHARACTER_RIGS' &&
    candidate.renderStatus === 'NOT_STARTED' &&
    candidate.providerRequestsMadeDuringHandoff === 0 &&
    candidate.storageObjectsReadDuringHandoff === 0 &&
    candidate.productionEnabled === false &&
    typeof candidate.statusLabel === 'string' &&
    candidate.statusLabel.length > 0 &&
    isNonnegativeInteger(candidate.segmentCount) &&
    isNonnegativeInteger(candidate.dialogueReceiptCount) &&
    isNonnegativeInteger(candidate.characterCount) &&
    isNonnegativeInteger(candidate.storageVerifiedCount) &&
    isNonnegativeInteger(candidate.exactTimingSegmentCount) &&
    isNonnegativeInteger(candidate.historicalProviderRequests);
  if (!commonValid) return false;

  if (candidate.evidenceClass === 'REAL_LEDGER' && candidate.status === 'HANDOFF_COMPLETE') {
    return (
      candidate.segmentCount === EP012_AUTHORIZED_REQUEST_COUNT &&
      candidate.dialogueReceiptCount === EP012_CANONICAL_DIALOGUE_LOCK.lines.length &&
      candidate.characterCount === EP012_AUTHORIZED_CHARACTER_COUNT &&
      candidate.storageVerifiedCount === EP012_AUTHORIZED_REQUEST_COUNT &&
      candidate.exactTimingSegmentCount === EP012_AUTHORIZED_REQUEST_COUNT &&
      candidate.historicalProviderRequests === EP012_AUTHORIZED_REQUEST_COUNT &&
      candidate.packetReadiness === 'PLANNING_COMPLETE' &&
      blockers.length === 0 &&
      remainingBlockers.length === 3 &&
      remainingBlockers.includes('Pip and Goat production rigs') &&
      remainingBlockers.includes('paid render authorization') &&
      remainingBlockers.includes('real media QC') &&
      isSha256(candidate.handoffSha256 ?? null) &&
      isSha256(candidate.voiceDependencySha256 ?? null) &&
      isSha256(candidate.productionPacketSha256 ?? null)
    );
  }

  return (
    candidate.evidenceClass === 'BLOCKED' &&
    candidate.status === 'BLOCKED' &&
    candidate.packetReadiness === 'BLOCKED' &&
    candidate.handoffSha256 === null &&
    candidate.voiceDependencySha256 === null &&
    candidate.productionPacketSha256 === null &&
    remainingBlockers.length > 0 &&
    blockers.length > 0
  );
}

export function projectEp012VoiceHandoffForProductionControl(
  handoff: Ep012VoiceProductionHandoff,
): FirstEpisodeVoiceHandoffModel {
  const voiceReason = handoff.productionPacket?.reasons.find((reason) => reason.key === 'voice');
  const characterReason = handoff.productionPacket?.reasons.find((reason) => reason.key === 'character');
  const renderReason = handoff.productionPacket?.reasons.find((reason) => reason.key === 'render');
  const qcReason = handoff.productionPacket?.reasons.find((reason) => reason.key === 'qc');
  const exactComplete =
    handoff.ok === true &&
    handoff.status === 'HANDOFF_COMPLETE' &&
    handoff.blockers.length === 0 &&
    handoff.segmentCount === EP012_AUTHORIZED_REQUEST_COUNT &&
    handoff.dialogueReceiptCount === EP012_CANONICAL_DIALOGUE_LOCK.lines.length &&
    handoff.characterCount === EP012_AUTHORIZED_CHARACTER_COUNT &&
    handoff.storageVerifiedCount === EP012_AUTHORIZED_REQUEST_COUNT &&
    handoff.exactTimingSegmentCount === EP012_AUTHORIZED_REQUEST_COUNT &&
    handoff.segmentChecks.length === EP012_AUTHORIZED_REQUEST_COUNT &&
    handoff.segmentChecks.every(
      (segment) =>
        segment.passed &&
        segment.blockers.length === 0 &&
        segment.exactTimingPresent &&
        isSha256(segment.audioSha256) &&
        isSha256(segment.receiptSha256),
    ) &&
    handoff.dialogueReceipts.length === EP012_CANONICAL_DIALOGUE_LOCK.lines.length &&
    handoff.dialogueReceipts.every((receipt) => isSha256(receipt.receiptSha256)) &&
    isSha256(handoff.handoffSha256) &&
    isSha256(handoff.voiceDependencySha256) &&
    isSha256(handoff.productionPacketSha256) &&
    handoff.productionPacket?.readiness === 'PLANNING_COMPLETE' &&
    handoff.productionPacket.productionPacketSha256 === handoff.productionPacketSha256 &&
    handoff.productionPacket.voiceDependencySha256 === handoff.voiceDependencySha256 &&
    voiceReason?.blocksRealProduction === false &&
    characterReason?.blocksRealProduction === true &&
    renderReason?.blocksRealProduction === true &&
    qcReason?.blocksRealProduction === true &&
    handoff.studioReadiness === 'WAITING_FOR_CHARACTER_RIGS' &&
    handoff.renderStatus === 'NOT_STARTED' &&
    handoff.providerContactedDuringHandoff === false &&
    handoff.providerRequestsMadeDuringHandoff === 0 &&
    handoff.storageInitializedDuringHandoff === false &&
    handoff.storageObjectsReadDuringHandoff === 0 &&
    handoff.sceneryAccessed === false &&
    handoff.commercialBytesDownloaded === 0 &&
    handoff.dialogueLockMutated === false &&
    handoff.productionEnabled === false &&
    handoff.historicalProviderRequests === EP012_AUTHORIZED_REQUEST_COUNT;

  if (!exactComplete) {
    return {
      evidenceClass: 'BLOCKED',
      status: 'BLOCKED',
      statusLabel: 'Voice handoff unavailable or inconsistent. Production remains blocked.',
      segmentCount: handoff.segmentCount,
      dialogueReceiptCount: handoff.dialogueReceiptCount,
      characterCount: handoff.characterCount,
      storageVerifiedCount: handoff.storageVerifiedCount,
      exactTimingSegmentCount: handoff.exactTimingSegmentCount,
      handoffSha256: null,
      voiceDependencySha256: null,
      productionPacketSha256: null,
      packetReadiness: 'BLOCKED',
      studioReadiness: 'WAITING_FOR_CHARACTER_RIGS',
      renderStatus: 'NOT_STARTED',
      remainingBlockers: ['Verified EP012 voice handoff', 'Pip and Goat production rigs', 'paid render authorization', 'real media QC'],
      blockers: [...new Set([...handoff.blockers, CONTROL_HANDOFF_MISMATCH])],
      historicalProviderRequests: handoff.historicalProviderRequests,
      providerRequestsMadeDuringHandoff: 0,
      storageObjectsReadDuringHandoff: 0,
      productionEnabled: false,
    };
  }

  return {
    evidenceClass: 'REAL_LEDGER',
    status: 'HANDOFF_COMPLETE',
    statusLabel: '11/11 verified voice segments are bound to 7/7 EP012 dialogue receipts.',
    segmentCount: handoff.segmentCount,
    dialogueReceiptCount: handoff.dialogueReceiptCount,
    characterCount: handoff.characterCount,
    storageVerifiedCount: handoff.storageVerifiedCount,
    exactTimingSegmentCount: handoff.exactTimingSegmentCount,
    handoffSha256: handoff.handoffSha256,
    voiceDependencySha256: handoff.voiceDependencySha256,
    productionPacketSha256: handoff.productionPacketSha256,
    packetReadiness: 'PLANNING_COMPLETE',
    studioReadiness: 'WAITING_FOR_CHARACTER_RIGS',
    renderStatus: 'NOT_STARTED',
    remainingBlockers: ['Pip and Goat production rigs', 'paid render authorization', 'real media QC'],
    blockers: [],
    historicalProviderRequests: handoff.historicalProviderRequests,
    providerRequestsMadeDuringHandoff: 0,
    storageObjectsReadDuringHandoff: 0,
    productionEnabled: false,
  };
}

export function reconcileFirstEpisodeVoiceHandoff(
  model: FirstEpisodeOperatorModel,
  handoff: Ep012VoiceProductionHandoff,
): { firstEpisode: FirstEpisodeOperatorModel; voiceHandoff: FirstEpisodeVoiceHandoffModel } {
  const voiceHandoff = projectEp012VoiceHandoffForProductionControl(handoff);
  return {
    firstEpisode: reconcileFirstEpisodeVoiceControlModel(model, voiceHandoff),
    voiceHandoff,
  };
}

export function reconcileFirstEpisodeVoiceControlModel(
  model: FirstEpisodeOperatorModel,
  voiceHandoff: FirstEpisodeVoiceHandoffModel,
): FirstEpisodeOperatorModel {
  if (!isFirstEpisodeVoiceHandoffModel(voiceHandoff) || voiceHandoff.status !== 'HANDOFF_COMPLETE') return model;

  const nonVoiceActions = model.next5Actions.filter((action) => !/voice|spoken lines?/i.test(action));
  const next5Actions = [
    'Receive and admit real Pip and Goat production rigs.',
    'Use the verified EP012 voice dependency; no further provider contact is permitted.',
    ...nonVoiceActions,
  ].filter((action, index, values) => values.indexOf(action) === index).slice(0, 5);

  return {
    ...model,
    voiceReceiptStatus: '11/11 verified segments · 7/7 dialogue receipts · 460/460 characters.',
    next5Actions,
  };
}

export function buildFirstEpisodeOperatorModel(report: FirstEpisodeUnblockReport): FirstEpisodeOperatorModel {
  return {
    title: 'FIRST REAL EPISODE',
    numberOneBlocker: report.morning.numberOneBlocker,
    rigStatus: report.morning.rigStatus,
    voiceReceiptStatus: report.morning.voiceReceiptStatus,
    sceneryRealInspectionStatus: report.morning.sceneryRealInspectionStatus,
    blenderStatus: report.morning.blenderStatus,
    humanReviewStatus: report.morning.humanReviewStatus,
    paidRenderStatus: report.morning.paidRenderStatus,
    next5Actions: report.morning.next5Actions,
    spendBanner: report.morning.spendBanner,
    selectedObjectCount: report.firstReadPlan.selectedObjectCount,
    selectedTotalBytes: report.firstReadPlan.selectedTotalBytes,
    listedObjectCount: report.firstReadPlan.listedObjectCount,
    commercialDeepInspectionReady: false,
    voiceGenerationPerformed: false,
  };
}

export function fallbackFirstEpisodeOperatorModel(): FirstEpisodeOperatorModel {
  return {
    title: 'FIRST REAL EPISODE',
    numberOneBlocker: 'Receive real Pip and Goat production rigs from the rigger.',
    rigStatus: 'NOT_PRESENT',
    voiceReceiptStatus: '7 of 7 EP012 lines missing real receipts.',
    sceneryRealInspectionStatus: 'Listing only. No commercial bytes downloaded.',
    blenderStatus: 'Not installed. Target 4.2.2. Trust pin missing.',
    humanReviewStatus: '0 approvals.',
    paidRenderStatus: 'AUTHORIZATION REQUIRED. Do not launch GPU.',
    next5Actions: [
      'Send the rigger the Pip/Goat receive list.',
      'Write or confirm the seven EP012 spoken lines.',
      'Do not download commercial scenery while cost is unknown.',
      'Pin the official Blender 4.2.2 SHA-256 before any install.',
      'Do not generate voices and do not start a paid render.',
    ],
    spendBanner: 'DO NOT SPEND MONEY YET',
    selectedObjectCount: 0,
    selectedTotalBytes: 0,
    listedObjectCount: 0,
    commercialDeepInspectionReady: false,
    voiceGenerationPerformed: false,
  };
}

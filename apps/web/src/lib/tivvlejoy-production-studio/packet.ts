import { sha256Canonical, stableSorted } from './hash';
import { PACKET_READINESS, PRODUCTION_PACKET_SCHEMA, type PacketReadiness, type VoiceReceipt, type VisualApprovalReceipt } from './types';

export type PacketShotRef = {
  shotId: string;
  locationId: string;
  cameraTemplateId?: string;
  lightingPresetId?: string;
  assemblyDependencySha256?: string | null;
  environmentDependencySha256?: string | null;
  visualApproval?: VisualApprovalReceipt | null;
  dialogueRefs?: string[];
  charactersVisible?: string[];
};

export type EpisodePacketInput = {
  episodeId: string;
  episodeVersion: string;
  productionPacketVersion?: string;
  scriptSha256: string;
  voiceReceipts?: VoiceReceipt[];
  shots: PacketShotRef[];
  approvedAssetResolutions?: Array<{ assetId: string; assetVersion: string; assetDependencySha256: string }>;
  continuityDependencySha256?: string | null;
  characterRigsResolved?: boolean;
  pipRigVersion?: string;
  goatRigVersion?: string;
  renderDependencySha256?: string | null;
  qcDependencySha256?: string | null;
};

export type DependencyReason = {
  key: string;
  sha256: string | null;
  reason: string;
  blocksRealProduction: boolean;
};

export type EpisodeProductionPacket = {
  schemaVersion: typeof PRODUCTION_PACKET_SCHEMA;
  episodeId: string;
  episodeVersion: string;
  productionPacketVersion: string;
  scriptSha256: string;
  voiceDependencySha256: string;
  environmentDependencySha256: string;
  characterDependencySha256: string;
  continuityDependencySha256: string;
  shotAssemblyDependencySha256: string;
  renderDependencySha256: string;
  qcDependencySha256: string;
  readiness: PacketReadiness;
  reasons: DependencyReason[];
  productionPacketSha256: string;
};

export function compileEpisodeProductionPacket(input: EpisodePacketInput): EpisodeProductionPacket {
  const shots = [...input.shots].sort((left, right) => left.shotId.localeCompare(right.shotId));
  const voices = [...(input.voiceReceipts ?? [])].sort((left, right) => left.dialogueRef.localeCompare(right.dialogueRef));
  const assets = [...(input.approvedAssetResolutions ?? [])].sort((left, right) => left.assetId.localeCompare(right.assetId));
  const voiceDependencySha256 = sha256Canonical({ voices: voices.map((item) => ({ ref: item.dialogueRef, sha: item.receiptSha256 })) });
  const environmentDependencySha256 = sha256Canonical({
    shots: shots.map((shot) => ({ shotId: shot.shotId, locationId: shot.locationId, env: shot.environmentDependencySha256 ?? null })),
    assets: assets.map((asset) => ({ id: asset.assetId, version: asset.assetVersion, sha: asset.assetDependencySha256 })),
  });
  const characterDependencySha256 = sha256Canonical({
    pip: input.pipRigVersion ?? 'UNRESOLVED_PRODUCTION_RIG',
    goat: input.goatRigVersion ?? 'UNRESOLVED_PRODUCTION_RIG',
    resolved: input.characterRigsResolved === true,
  });
  const continuityDependencySha256 = input.continuityDependencySha256 ?? sha256Canonical({ continuity: 'UNSET' });
  const shotAssemblyDependencySha256 = sha256Canonical({
    shots: shots.map((shot) => ({ shotId: shot.shotId, sha: shot.assemblyDependencySha256 ?? null, camera: shot.cameraTemplateId ?? null, light: shot.lightingPresetId ?? null })),
  });
  const renderDependencySha256 = input.renderDependencySha256 ?? sha256Canonical({ render: 'NOT_AUTHORIZED' });
  const qcDependencySha256 = input.qcDependencySha256 ?? sha256Canonical({ qc: 'NOT_EVALUATED' });

  const missingVoices = shots.flatMap((shot) => (shot.dialogueRefs ?? []).filter((ref) => !voices.some((voice) => voice.dialogueRef === ref)));
  const reasons: DependencyReason[] = [
    { key: 'script', sha256: input.scriptSha256, reason: 'script identity', blocksRealProduction: !input.scriptSha256 },
    { key: 'voice', sha256: voiceDependencySha256, reason: missingVoices.length ? `missing voice receipts: ${stableSorted(missingVoices).join(',')}` : 'voice receipts bound', blocksRealProduction: missingVoices.length > 0 },
    { key: 'environment', sha256: environmentDependencySha256, reason: 'world builder / approved asset resolutions', blocksRealProduction: false },
    { key: 'character', sha256: characterDependencySha256, reason: input.characterRigsResolved ? 'character rigs resolved' : 'Pip/Goat remain UNRESOLVED_PRODUCTION_RIG', blocksRealProduction: input.characterRigsResolved !== true },
    { key: 'continuity', sha256: continuityDependencySha256, reason: 'continuity ledger snapshot', blocksRealProduction: false },
    { key: 'shotAssembly', sha256: shotAssemblyDependencySha256, reason: 'shot assembly manifests', blocksRealProduction: false },
    { key: 'render', sha256: renderDependencySha256, reason: 'no paid render authorization in this packet', blocksRealProduction: true },
    { key: 'qc', sha256: qcDependencySha256, reason: 'QC not a real media evaluation', blocksRealProduction: true },
  ];

  let readiness: PacketReadiness = 'PLANNING_COMPLETE';
  if (reasons.some((item) => item.blocksRealProduction && item.key !== 'render' && item.key !== 'qc' && item.key !== 'character')) {
    readiness = missingVoices.length ? 'WAITING_FOR_DEPENDENCY' : 'BLOCKED';
  }
  if (input.characterRigsResolved === true && !missingVoices.length && input.scriptSha256) {
    readiness = 'PLANNING_COMPLETE';
  }
  if (input.characterRigsResolved === true && !reasons.some((item) => item.blocksRealProduction)) {
    readiness = 'REAL_PRODUCTION_READY';
  }
  if (input.characterRigsResolved !== true) {
    readiness = 'PLANNING_COMPLETE';
  }

  const body = {
    schemaVersion: PRODUCTION_PACKET_SCHEMA,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    productionPacketVersion: input.productionPacketVersion ?? PRODUCTION_PACKET_SCHEMA,
    scriptSha256: input.scriptSha256,
    voiceDependencySha256,
    environmentDependencySha256,
    characterDependencySha256,
    continuityDependencySha256,
    shotAssemblyDependencySha256,
    renderDependencySha256,
    qcDependencySha256,
    readiness,
    reasons,
  };
  return { ...body, productionPacketSha256: sha256Canonical(body) };
}

export const PACKET_READINESS_VALUES = PACKET_READINESS;

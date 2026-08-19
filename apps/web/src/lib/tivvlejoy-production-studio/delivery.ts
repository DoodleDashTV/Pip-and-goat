import { sha256Canonical } from './hash';
import { DELIVERY_PACKAGE_SCHEMA, type DeliveryReadiness, type QcProfileId } from './types';
import { QC_PROFILES } from './types';

export type DeliveryPackageInput = {
  episodeId: string;
  episodeVersion: string;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  productionPacketSha256: string;
  qcPassed: boolean;
  qcReceiptRef?: string | null;
  qcSha256?: string | null;
  visualApprovalPresent?: boolean;
  renderReceiptRef?: string | null;
  renderSha256?: string | null;
  audioReceiptRef?: string | null;
  audioSha256?: string | null;
  captionReceiptRef?: string | null;
  captionSha256?: string | null;
  profileId?: QcProfileId;
  durationSec?: number;
};

export type DeliveryPackage = {
  schemaVersion: typeof DELIVERY_PACKAGE_SCHEMA;
  episodeId: string;
  episodeVersion: string;
  productionPacketSha256: string;
  renderReceiptRef: string | null;
  renderSha256: string | null;
  audioReceiptRef: string | null;
  audioSha256: string | null;
  captionReceiptRef: string | null;
  captionSha256: string | null;
  qcReceiptRef: string | null;
  qcSha256: string | null;
  videoProfile: QcProfileId;
  width: number;
  height: number;
  fps: number;
  duration: number;
  title: string;
  descriptionPlaceholder: string;
  episodeNumber: number;
  seasonNumber: number;
  thumbnailRequirement: string;
  futurePlatformSlots: Array<'YOUTUBE_SHORTS' | 'TIKTOK' | 'INSTAGRAM_REELS'>;
  deliveryFiles: string[];
  readiness: DeliveryReadiness;
  autoPublished: false;
  deliveryPackageSha256: string;
};

export function compileDeliveryPackage(input: DeliveryPackageInput): DeliveryPackage {
  const profile = QC_PROFILES[input.profileId ?? 'SHORT_60'];
  let readiness: DeliveryReadiness = 'NOT_READY';
  if (!input.qcPassed || !input.qcSha256) readiness = 'QC_BLOCKED';
  else if (!input.visualApprovalPresent) readiness = 'WAITING_FOR_APPROVAL';
  else if (input.renderSha256 && input.audioSha256 && input.qcPassed) readiness = 'READY_FOR_MANUAL_RELEASE';

  const body = {
    schemaVersion: DELIVERY_PACKAGE_SCHEMA,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    productionPacketSha256: input.productionPacketSha256,
    renderReceiptRef: input.renderReceiptRef ?? null,
    renderSha256: input.renderSha256 ?? null,
    audioReceiptRef: input.audioReceiptRef ?? null,
    audioSha256: input.audioSha256 ?? null,
    captionReceiptRef: input.captionReceiptRef ?? null,
    captionSha256: input.captionSha256 ?? null,
    qcReceiptRef: input.qcReceiptRef ?? null,
    qcSha256: input.qcSha256 ?? null,
    videoProfile: profile.profileId,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    duration: input.durationSec ?? profile.durationSec,
    title: input.title,
    descriptionPlaceholder: 'Synthetic planning description. Not published.',
    episodeNumber: input.episodeNumber,
    seasonNumber: input.seasonNumber,
    thumbnailRequirement: '1080x1920 cover still with title-safe margin',
    futurePlatformSlots: ['YOUTUBE_SHORTS', 'TIKTOK', 'INSTAGRAM_REELS'] as const,
    deliveryFiles: ['video.mp4', 'audio.wav', 'captions.vtt', 'thumbnail.jpg', 'delivery-manifest.json'],
    readiness,
    autoPublished: false as const,
  };
  return { ...body, deliveryPackageSha256: sha256Canonical({ ...body, futurePlatformSlots: [...body.futurePlatformSlots] }) };
}

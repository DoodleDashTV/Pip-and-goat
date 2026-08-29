import { sha256Canonical } from './hash';

export const AUTOMATED_FINISHING_SCHEMA = 'TIVVLEJOY_AUTOMATED_FINISHING_V1' as const;

export type FinishingOverlay = {
  overlayId: string;
  kind: 'TITLE' | 'CAPTION' | 'BRAND_BUG' | 'END_CARD';
  startFrame: number;
  endFrame: number;
  /** Normalized source-frame bounds. */
  bounds: { x: number; y: number; width: number; height: number };
  text?: string;
};

export type ProtectedRegion = {
  regionId: string;
  kind: 'FACE' | 'HERO_ACTION' | 'STORY_PROP';
  startFrame: number;
  endFrame: number;
  bounds: { x: number; y: number; width: number; height: number };
};

export type DeliveryProfileId = 'VERTICAL_9_16' | 'LANDSCAPE_16_9' | 'SQUARE_1_1';

const DELIVERY_PROFILES = {
  VERTICAL_9_16: { width: 1080, height: 1920, fit: 'IDENTITY' },
  LANDSCAPE_16_9: { width: 1920, height: 1080, fit: 'CONTAIN' },
  SQUARE_1_1: { width: 1080, height: 1080, fit: 'CONTAIN' },
} as const;

export type FinishingBlocker =
  | 'SOURCE_ARTIFACT_NOT_VERIFIED'
  | 'SOURCE_HASH_INVALID'
  | 'SOURCE_VISUAL_GATE_NOT_PASS'
  | 'CAPTION_QC_NOT_PASS'
  | 'OVERLAY_TIMING_INVALID'
  | 'OVERLAY_OUT_OF_BOUNDS'
  | 'OVERLAY_PROTECTED_REGION_COLLISION'
  | 'UNREVIEWED_CROP_REQUESTED';

export type FinishingInput = {
  episodeId: string;
  source: {
    artifactPath: string;
    sha256: string;
    width: number;
    height: number;
    fps: number;
    totalFrames: number;
    verified: boolean;
    visualGate: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_RUN';
  };
  overlays: FinishingOverlay[];
  protectedRegions?: ProtectedRegion[];
  captionsQcPassed: boolean;
  deliveries: Array<{ profileId: DeliveryProfileId; framing: 'SAFE_CONTAIN' | 'REVIEWED_CROP' }>;
  /** Profile -> immutable human reframe approval receipt. */
  reviewedCropReceiptRefs?: Partial<Record<DeliveryProfileId, string>>;
};

export function compileAutomatedFinishing(input: FinishingInput) {
  const blockers = validateFinishing(input);
  const overlays = [...input.overlays].sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.overlayId.localeCompare(right.overlayId),
  );
  const reviewedCropReceipts = input.reviewedCropReceiptRefs ?? {};
  const deliveries = [...input.deliveries]
    .sort((left, right) => left.profileId.localeCompare(right.profileId))
    .map((delivery) => {
      const profile = DELIVERY_PROFILES[delivery.profileId];
      const cropReceiptRef = reviewedCropReceipts[delivery.profileId]?.trim() || null;
      const reviewedCrop = delivery.framing === 'REVIEWED_CROP' && cropReceiptRef !== null;
      return {
        ...delivery,
        width: profile.width,
        height: profile.height,
        fit: reviewedCrop ? ('CROP' as const) : profile.fit,
        preservesFullSourceFrame: !reviewedCrop,
        humanReframeReceiptRequired: delivery.framing === 'REVIEWED_CROP',
        humanReframeReceiptRef: cropReceiptRef,
      };
    });
  const body = {
    schemaVersion: AUTOMATED_FINISHING_SCHEMA,
    episodeId: input.episodeId,
    source: input.source,
    overlays,
    deliveries,
    rendererContract: {
      timing: 'FRAME_DRIVEN' as const,
      deterministic: true as const,
      wallClockAnimationAllowed: false as const,
      unseededRandomnessAllowed: false as const,
      preferredLocalRenderer: 'FFMPEG_ADAPTER' as const,
      remotionAdapter: 'NOT_INSTALLED_LICENSE_AND_ARCHITECTURE_REVIEW_REQUIRED' as const,
    },
    status:
      blockers.length === 0 ? ('READY_FOR_FREE_LOCAL_FINISHING' as const) : ('BLOCKED' as const),
    blockers,
    authority: {
      paidComputeAllowed: false as const,
      cloudCreateAllowed: false as const,
      finalApprovalIssued: false as const,
      sourceVisualApprovalInherited: input.source.visualGate === 'PASS',
    },
  };
  return { ...body, finishingManifestSha256: sha256Canonical(body) };
}

export type AutomatedFinishingManifest = ReturnType<typeof compileAutomatedFinishing>;

export function finishingFrameState(manifest: AutomatedFinishingManifest, frame: number) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= manifest.source.totalFrames) {
    throw new RangeError(`Frame ${frame} is outside 0..${manifest.source.totalFrames - 1}`);
  }
  return {
    frame,
    activeOverlayIds: manifest.overlays
      .filter((overlay) => frame >= overlay.startFrame && frame < overlay.endFrame)
      .map((overlay) => overlay.overlayId),
  };
}

function validateFinishing(input: FinishingInput): FinishingBlocker[] {
  const blockers = new Set<FinishingBlocker>();
  if (!input.source.verified) blockers.add('SOURCE_ARTIFACT_NOT_VERIFIED');
  if (!/^[a-f0-9]{64}$/.test(input.source.sha256)) blockers.add('SOURCE_HASH_INVALID');
  if (input.source.visualGate !== 'PASS') blockers.add('SOURCE_VISUAL_GATE_NOT_PASS');
  if (input.overlays.some((overlay) => overlay.kind === 'CAPTION') && !input.captionsQcPassed) {
    blockers.add('CAPTION_QC_NOT_PASS');
  }
  for (const overlay of input.overlays) {
    if (
      !Number.isInteger(overlay.startFrame) ||
      !Number.isInteger(overlay.endFrame) ||
      overlay.startFrame < 0 ||
      overlay.endFrame <= overlay.startFrame ||
      overlay.endFrame > input.source.totalFrames
    ) {
      blockers.add('OVERLAY_TIMING_INVALID');
    }
    if (!isNormalizedBox(overlay.bounds)) blockers.add('OVERLAY_OUT_OF_BOUNDS');
    for (const protectedRegion of input.protectedRegions ?? []) {
      if (
        rangesOverlap(overlay, protectedRegion) &&
        boxesOverlap(overlay.bounds, protectedRegion.bounds)
      ) {
        blockers.add('OVERLAY_PROTECTED_REGION_COLLISION');
      }
    }
  }
  if (
    input.deliveries.some(
      (delivery) =>
        delivery.framing === 'REVIEWED_CROP' &&
        !input.reviewedCropReceiptRefs?.[delivery.profileId]?.trim(),
    )
  ) {
    blockers.add('UNREVIEWED_CROP_REQUESTED');
  }
  return [...blockers].sort();
}

function isNormalizedBox(box: FinishingOverlay['bounds']): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= 1 &&
    box.y + box.height <= 1
  );
}

function rangesOverlap(
  left: Pick<FinishingOverlay, 'startFrame' | 'endFrame'>,
  right: Pick<ProtectedRegion, 'startFrame' | 'endFrame'>,
): boolean {
  return left.startFrame < right.endFrame && right.startFrame < left.endFrame;
}

function boxesOverlap(left: FinishingOverlay['bounds'], right: ProtectedRegion['bounds']): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

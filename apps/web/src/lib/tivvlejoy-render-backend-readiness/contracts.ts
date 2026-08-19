import { sha256Canonical, sha256ExactBytes, stableStringify } from './hash';
import {
  CURRENT_BACKEND_IDENTITY,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE,
  PROVEN_TEMPLATE_ID,
  PROVEN_WORKER_IMAGE_DIGEST,
} from './identity';
import type {
  AssetRenderReceipt,
  CacheEligibility,
  JobPackageInput,
  ShotDependencyInput,
  ShotVisualApprovalReceipt,
} from './types';
import { SHOT_VISUAL_APPROVAL_SCHEMA } from './types';

export function hashShotDependency(input: ShotDependencyInput): string {
  return sha256Canonical({
    camera: input.camera,
    frameStart: input.frameStart,
    frameEnd: input.frameEnd,
    pipAssetVersion: input.pipAssetVersion,
    pipRigVersion: input.pipRigVersion,
    goatAssetVersion: input.goatAssetVersion,
    goatRigVersion: input.goatRigVersion,
    animation: input.animation,
    visibleGeometry: [...input.visibleGeometry].sort(),
    environmentPreset: input.environmentPreset,
    visibleProps: [...input.visibleProps].sort(),
    materials: [...input.materials].sort(),
    styleProfile: input.styleProfile,
    lighting: input.lighting,
    worldHdri: input.worldHdri,
    renderSettings: input.renderSettings,
    resolution: input.resolution,
    fps: input.fps,
    blenderVersion: input.blenderVersion,
  });
}

export function hashAssetReceiptList(receipts: AssetRenderReceipt[]): string {
  return sha256Canonical(
    receipts
      .map((item) => ({
        assetId: item.assetId,
        assetVersion: item.assetVersion,
        assetRole: item.assetRole,
        objectKey: item.objectKey,
        sha256: item.sha256,
      }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId)),
  );
}

export function hashJobPackage(input: JobPackageInput): string {
  return sha256Canonical({
    productionId: input.productionId,
    episodeId: input.episodeId,
    shotId: input.shotId,
    frameStart: input.frameStart,
    frameEnd: input.frameEnd,
    fps: input.fps,
    resolution: input.resolution,
    renderEngine: input.renderEngine,
    renderProfile: input.renderProfile,
    blenderVersion: input.blenderVersion,
    templateId: input.templateId,
    workerImageDigest: input.workerImageDigest,
    assetReceiptList: hashAssetReceiptList(input.assetReceipts),
    shotDependencySha256: input.shotDependencySha256,
    outputDestinationIdentity: input.outputDestinationIdentity,
  });
}

export function buildWorkerManifest(input: JobPackageInput): Record<string, unknown> {
  return {
    jobId: `${input.episodeId}-${input.shotId}`,
    frameStart: input.frameStart,
    frameEnd: input.frameEnd,
    fps: input.fps,
    resolution: input.resolution,
    renderEngine: input.renderEngine,
    renderProfile: input.renderProfile,
    blenderVersion: input.blenderVersion,
    assets: input.assetReceipts
      .map((item) => ({
        assetId: item.assetId,
        assetVersion: item.assetVersion,
        objectKey: item.objectKey,
        sha256: item.sha256,
        role: item.assetRole,
      }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId)),
    outputDestinationIdentity: input.outputDestinationIdentity,
  };
}

export function hashWorkerManifest(manifest: Record<string, unknown>): string {
  return sha256ExactBytes(new TextEncoder().encode(stableStringify(manifest)));
}

export function hashLaunchIntent(input: {
  jobPackageSha256: string;
  workerManifestSha256: string;
  shotDependencySha256: string;
  templateId?: string;
  workerImageDigest?: string;
}): string {
  return sha256Canonical({
    templateId: input.templateId ?? PROVEN_TEMPLATE_ID,
    workerImageDigest: input.workerImageDigest ?? PROVEN_WORKER_IMAGE_DIGEST,
    jobPackageSha256: input.jobPackageSha256,
    workerManifestSha256: input.workerManifestSha256,
    shotDependencySha256: input.shotDependencySha256,
    gpuType: PINNED_GPU_TYPE,
    cloudType: PINNED_CLOUD_TYPE,
    gpuCount: PINNED_GPU_COUNT,
    templateReceiptHash: CURRENT_BACKEND_IDENTITY.templateReceiptHash,
  });
}

export function evaluateCacheEligibility(
  currentShotDependencySha256: string,
  cachedShotDependencySha256: string | null,
): CacheEligibility {
  if (
    cachedShotDependencySha256 &&
    cachedShotDependencySha256 === currentShotDependencySha256
  ) {
    return 'CACHE_REUSE_ELIGIBLE';
  }
  return 'CACHE_REUSE_NOT_ELIGIBLE';
}

export function acceptVisualApproval(
  approval: ShotVisualApprovalReceipt | null,
  currentShotDependencySha256: string,
): { ok: true; approval: ShotVisualApprovalReceipt } | { ok: false; code: string; reason: string } {
  if (!approval) {
    return { ok: false, code: 'BLOCKED_SHOT_UNAPPROVED', reason: 'Shot visual approval receipt is missing.' };
  }
  if (approval.schemaVersion !== SHOT_VISUAL_APPROVAL_SCHEMA) {
    return { ok: false, code: 'BLOCKED_SHOT_UNAPPROVED', reason: 'Visual approval schema is not V1.' };
  }
  if (approval.shotDependencySha256 !== currentShotDependencySha256) {
    return {
      ok: false,
      code: 'BLOCKED_VISUAL_APPROVAL_STALE',
      reason: 'Visual approval shotDependencySha256 does not match the current shot.',
    };
  }
  if (approval.hardBlockers.length !== 0) {
    return {
      ok: false,
      code: 'BLOCKED_SHOT_UNAPPROVED',
      reason: `Visual approval has hard blockers: ${approval.hardBlockers.join(',')}.`,
    };
  }
  if (approval.score < 90) {
    return {
      ok: false,
      code: 'BLOCKED_SHOT_UNAPPROVED',
      reason: `Visual score ${approval.score} is below 90.`,
    };
  }
  if (approval.result !== 'VISUALLY_APPROVED' && approval.result !== 'VISUALLY_EXCELLENT') {
    return { ok: false, code: 'BLOCKED_SHOT_UNAPPROVED', reason: `Visual result ${approval.result} is not accepted.` };
  }
  return { ok: true, approval };
}

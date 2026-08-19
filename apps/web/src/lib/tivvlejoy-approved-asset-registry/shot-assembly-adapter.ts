import type { EnvironmentSlotInput } from '@/lib/tivvlejoy-shot-assembly-manifest/engine';
import type { ResolutionState } from '@/lib/tivvlejoy-shot-assembly-manifest/types';
import { isResolutionFailure, type AssetResolutionReceipt, type ResolutionResult } from './types';

export function resolutionToEnvironmentSlot(
  resolution: ResolutionResult,
  extras: Pick<EnvironmentSlotInput, 'semanticRole' | 'qualityTier' | 'required' | 'visibilityClass'> & {
    slotId?: string;
  },
): EnvironmentSlotInput {
  if (isResolutionFailure(resolution)) {
    return {
      slotId: extras.slotId ?? resolution.slotId,
      semanticRole: extras.semanticRole,
      qualityTier: extras.qualityTier,
      required: extras.required,
      visibilityClass: extras.visibilityClass,
      approvalStatus:
        resolution.resolutionState === 'BLOCKED_QUARANTINED'
          ? 'quarantined'
          : resolution.resolutionState === 'BLOCKED_UNAPPROVED' || resolution.resolutionState === 'BLOCKED_LICENSE'
            ? 'unapproved'
            : resolution.resolutionState.startsWith('UNRESOLVED')
              ? 'missing'
              : 'unapproved',
      provenanceStatus: mapFailureProvenance(resolution.resolutionState),
      resolutionState: resolution.resolutionState,
      registrySnapshotSha256: resolution.registrySnapshotSha256,
      resolutionReceiptSha256: resolution.resolutionReceiptSha256,
      filenameSubstitution: false,
      latestUsed: false,
    };
  }
  return approvedResolutionToSlot(resolution, extras);
}

export function approvedResolutionToSlot(
  resolution: AssetResolutionReceipt,
  extras: Pick<EnvironmentSlotInput, 'semanticRole' | 'qualityTier' | 'required' | 'visibilityClass'> & {
    slotId?: string;
  },
): EnvironmentSlotInput {
  return {
    slotId: extras.slotId ?? resolution.slotId,
    semanticRole: extras.semanticRole,
    qualityTier: extras.qualityTier,
    required: extras.required,
    visibilityClass: extras.visibilityClass,
    sourceReceiptRef: resolution.sourceReceiptRef,
    sourceVersion: resolution.selectedAssetVersion,
    sourceSha256: resolution.sourceSha256,
    provenanceStatus: 'RESOLVED_APPROVED',
    approvalStatus: 'approved',
    approvedAssetId: resolution.selectedAssetId,
    approvedAssetVersion: resolution.selectedAssetVersion,
    sourceId: resolution.sourceId,
    inspectionReceiptRef: resolution.inspectionReceiptRef,
    inspectionSha256: resolution.inspectionSha256,
    approvalReceiptRef: resolution.approvalReceiptRef,
    approvalSha256: resolution.approvalSha256,
    assetDependencySha256: resolution.assetDependencySha256,
    resolutionReceiptRef: resolution.resolutionReceiptSha256,
    resolutionReceiptSha256: resolution.resolutionReceiptSha256,
    registrySnapshotSha256: resolution.registrySnapshotSha256,
    resolutionState: 'RESOLVED_APPROVED',
    filenameSubstitution: false,
    latestUsed: false,
  };
}

function mapFailureProvenance(state: string): ResolutionState | undefined {
  if (state === 'UNRESOLVED_PROVENANCE') return 'UNRESOLVED_PROVENANCE';
  if (state === 'BLOCKED_QUARANTINED') return 'BLOCKED_QUARANTINED';
  if (state === 'BLOCKED_UNAPPROVED') return 'BLOCKED_UNAPPROVED';
  if (state === 'BLOCKED_HASH_MISMATCH') return 'BLOCKED_HASH_MISMATCH';
  if (state === 'BLOCKED_CANONICAL_CONFLICT') return 'BLOCKED_CANONICAL_CONFLICT';
  if (state === 'BLOCKED_CONTINUITY_PIN_INVALID') return 'BLOCKED_CONTINUITY_PIN_INVALID';
  if (state === 'BLOCKED_LICENSE') return 'BLOCKED_LICENSE';
  if (state === 'BLOCKED_STYLE_INCOMPATIBLE') return 'BLOCKED_STYLE_INCOMPATIBLE';
  if (state === 'BLOCKED_TECHNICAL_INCOMPATIBLE') return 'BLOCKED_TECHNICAL_INCOMPATIBLE';
  if (state.startsWith('UNRESOLVED')) return 'UNRESOLVED_SOURCE';
  return 'UNRESOLVED_SOURCE';
}

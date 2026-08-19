import { isValidSha256, sha256Canonical } from './hash';
import { normalizeSemanticRole, qualitySatisfies } from './mapping';
import { compareRank, rankCandidate, requestSemanticSha256 } from './ranking';
import { findRegistryAsset, receiptsComplete } from './registry';
import {
  RESOLUTION_FAILURE_SCHEMA,
  RESOLUTION_RECEIPT_SCHEMA,
  RESOLUTION_REQUEST_SCHEMA,
  type ApprovedAssetRegistry,
  type ApprovedEnvironmentAsset,
  type AssetResolutionFailure,
  type AssetResolutionReceipt,
  type AssetResolutionRequest,
  type ResolutionFailureState,
  type ResolutionResult,
} from './types';

export function resolutionRequestHash(request: Omit<AssetResolutionRequest, 'requestSha256' | 'schemaVersion'>): string {
  return sha256Canonical({
    schemaVersion: RESOLUTION_REQUEST_SCHEMA,
    slotId: request.slotId,
    semanticRole: request.semanticRole === 'SHRUB' ? 'SHRUBS' : request.semanticRole,
    archetypeId: request.archetypeId,
    biome: request.biome,
    depth: request.depth,
    qualityTier: request.qualityTier,
    season: request.season,
    weather: request.weather,
    styleRequirement: request.styleRequirement,
    seed: request.seed,
    continuityAssetId: request.continuityAssetId ?? null,
    registrySnapshotSha256: request.registrySnapshotSha256,
  });
}

function fail(
  request: AssetResolutionRequest,
  state: ResolutionFailureState,
  reason: string,
): AssetResolutionFailure {
  const body = {
    schemaVersion: RESOLUTION_FAILURE_SCHEMA,
    slotId: request.slotId,
    requestSha256: request.requestSha256,
    registrySnapshotSha256: request.registrySnapshotSha256,
    resolutionState: state,
    selectedAssetId: null,
    reason,
    filenameUsedForSelection: false as const,
    mutableLatestUsed: false as const,
    inventedSource: false as const,
  };
  return { ...body, resolutionReceiptSha256: sha256Canonical(body) };
}

export function hardEligibility(asset: ApprovedEnvironmentAsset, request: AssetResolutionRequest): ResolutionFailureState | null {
  const role = normalizeSemanticRole(request.semanticRole);
  if (asset.approvalState === 'QUARANTINED') return 'BLOCKED_QUARANTINED';
  if (asset.approvalState === 'BLOCKED') return 'BLOCKED_UNAPPROVED';
  if (asset.approvalState !== 'APPROVED') return 'BLOCKED_UNAPPROVED';
  if (!asset.worldBuilderEligible || !asset.shotAssemblyEligible) return 'BLOCKED_UNAPPROVED';
  if (!asset.sourceReceiptRef) return 'UNRESOLVED_SOURCE_RECEIPT';
  if (!asset.sourceSha256) return 'UNRESOLVED_SOURCE_HASH';
  if (!isValidSha256(asset.sourceSha256)) return 'BLOCKED_HASH_MISMATCH';
  if (!asset.inspectionReceiptRef) return 'UNRESOLVED_INSPECTION_RECEIPT';
  if (!isValidSha256(asset.inspectionSha256)) return 'UNRESOLVED_INSPECTION_RECEIPT';
  if (!asset.approvalReceiptRef) return 'UNRESOLVED_APPROVAL_RECEIPT';
  if (!isValidSha256(asset.approvalSha256)) return 'UNRESOLVED_APPROVAL_RECEIPT';
  if (asset.provenanceState !== 'RESOLVED') return 'UNRESOLVED_PROVENANCE';
  if (asset.licenseState === 'BLOCKED') return 'BLOCKED_LICENSE';
  if (asset.licenseState !== 'APPROVED_INTERNAL') return 'UNRESOLVED_PROVENANCE';
  if (!asset.semanticRoles.includes(role)) return 'UNRESOLVED_NO_ELIGIBLE_ASSET';
  if (
    asset.biomeTags.length &&
    !asset.biomeTags.includes(request.biome) &&
    !asset.biomeTags.includes('generic') &&
    request.biome !== 'generic'
  ) {
    return 'UNRESOLVED_NO_ELIGIBLE_ASSET';
  }
  if (!asset.depthEligibility.includes(request.depth)) return 'UNRESOLVED_NO_ELIGIBLE_ASSET';
  if (!qualitySatisfies(asset.qualityEligibility, request.qualityTier)) return 'UNRESOLVED_NO_ELIGIBLE_ASSET';
  if (asset.styleCompatibility === 'INCOMPATIBLE') return 'BLOCKED_STYLE_INCOMPATIBLE';
  if (asset.blenderCompatibility === 'INCOMPATIBLE') return 'BLOCKED_TECHNICAL_INCOMPATIBLE';
  if (asset.canonicalState === 'DUPLICATE' || asset.canonicalState === 'ARCHIVAL') return 'UNRESOLVED_NO_ELIGIBLE_ASSET';
  if (asset.lifecycleState === 'QUARANTINED') return 'BLOCKED_QUARANTINED';
  if (asset.lifecycleState.startsWith('BLOCKED_')) return 'BLOCKED_UNAPPROVED';
  if (asset.provider === 'BOTANIQ_IF_APPROVED') return 'BLOCKED_UNAPPROVED';
  if (!receiptsComplete(asset)) return 'UNRESOLVED_SOURCE_RECEIPT';
  return null;
}

export function resolveApprovedAsset(registry: ApprovedAssetRegistry, request: AssetResolutionRequest): ResolutionResult {
  const role = normalizeSemanticRole(request.semanticRole);
  const semanticHash = requestSemanticSha256(request);

  if (request.continuityAssetId) {
    const pinned = findRegistryAsset(registry, request.continuityAssetId);
    if (!pinned) return fail(request, 'BLOCKED_CONTINUITY_PIN_INVALID', 'continuity asset is not in this registry snapshot');
    const pinBlock = hardEligibility(pinned, { ...request, semanticRole: role });
    if (pinBlock) return fail(request, 'BLOCKED_CONTINUITY_PIN_INVALID', `continuity pin invalid: ${pinBlock}`);
    return succeed(pinned, request, semanticHash);
  }

  const candidateIds = registry.indexes.bySemanticRole[role] ?? [];
  const candidates: ApprovedEnvironmentAsset[] = [];
  for (const key of candidateIds) {
    const [assetId] = key.split('::');
    const asset = assetId ? findRegistryAsset(registry, assetId) : undefined;
    if (!asset) continue;
    if (hardEligibility(asset, { ...request, semanticRole: role }) === null) {
      if (asset.canonicalState === 'ALTERNATE_APPROVED' && !asset.fallbackEligible) continue;
      candidates.push(asset);
    }
  }

  const conflicted = candidates.some((asset) => registry.conflictedCanonicalGroups.includes(asset.canonicalGroupId));
  if (conflicted) {
    return fail(request, 'BLOCKED_CANONICAL_CONFLICT', 'two PRIMARY assets share a canonical group');
  }

  const fallbackOnly = candidates.filter((asset) => {
    if (asset.canonicalState === 'ALTERNATE_APPROVED') {
      const primary = registry.assets.find(
        (item) =>
          item.canonicalGroupId === asset.canonicalGroupId &&
          item.canonicalState === 'PRIMARY' &&
          hardEligibility(item, { ...request, semanticRole: role }) === null,
      );
      return !primary;
    }
    return true;
  });

  if (!fallbackOnly.length) {
    const known = registry.assets.find((asset) => asset.semanticRoles.includes(role));
    if (known) {
      const reason = hardEligibility(known, { ...request, semanticRole: role });
      if (reason) return fail(request, reason, reason);
    }
    return fail(request, 'UNRESOLVED_NO_ELIGIBLE_ASSET', 'no eligible approved asset');
  }

  const ranked = fallbackOnly
    .map((asset) => ({ asset, rank: rankCandidate(asset, request, semanticHash) }))
    .sort((left, right) => compareRank(left.rank, right.rank) || left.asset.assetId.localeCompare(right.asset.assetId));
  return succeed(ranked[0]!.asset, request, semanticHash);
}

function succeed(
  asset: ApprovedEnvironmentAsset,
  request: AssetResolutionRequest,
  semanticHash: string,
): AssetResolutionReceipt {
  const rankTuple = rankCandidate(asset, request, semanticHash);
  const body = {
    schemaVersion: RESOLUTION_RECEIPT_SCHEMA,
    slotId: request.slotId,
    requestSha256: request.requestSha256,
    registrySnapshotSha256: request.registrySnapshotSha256,
    selectedAssetId: asset.assetId,
    selectedAssetVersion: asset.assetVersion,
    sourceId: asset.sourceId,
    sourceReceiptRef: asset.sourceReceiptRef,
    sourceSha256: asset.sourceSha256,
    inspectionReceiptRef: asset.inspectionReceiptRef,
    inspectionSha256: asset.inspectionSha256,
    approvalReceiptRef: asset.approvalReceiptRef,
    approvalSha256: asset.approvalSha256,
    assetDependencySha256: asset.assetDependencySha256,
    rankTuple,
    tieBreakSha256: rankTuple[10],
    resolutionState: 'RESOLVED_APPROVED' as const,
    filenameUsedForSelection: false as const,
    mutableLatestUsed: false as const,
  };
  return { ...body, resolutionReceiptSha256: sha256Canonical(body) };
}

export function makeResolutionRequest(
  input: Omit<AssetResolutionRequest, 'schemaVersion' | 'requestSha256'>,
): AssetResolutionRequest {
  const draft = { ...input, schemaVersion: RESOLUTION_REQUEST_SCHEMA };
  return { ...draft, requestSha256: resolutionRequestHash(draft) };
}

import { isValidSha256, sha256Canonical } from './hash';
import { APPROVED_ASSET_REGISTRY_SCHEMA, APPROVED_ENVIRONMENT_ASSET_SCHEMA, type ApprovedAssetRegistry, type ApprovedEnvironmentAsset } from './types';

export function assetDependencySha256(asset: Pick<
  ApprovedEnvironmentAsset,
  | 'assetId'
  | 'assetVersion'
  | 'sourceId'
  | 'sourceSha256'
  | 'inspectionSha256'
  | 'approvalSha256'
  | 'semanticRoles'
  | 'coverageCategories'
  | 'archetypeCompatibility'
  | 'biomeTags'
  | 'depthEligibility'
  | 'qualityEligibility'
  | 'styleCompatibility'
  | 'blenderCompatibility'
  | 'canonicalGroupId'
  | 'canonicalState'
>): string {
  return sha256Canonical({
    schema: APPROVED_ENVIRONMENT_ASSET_SCHEMA,
    assetId: asset.assetId,
    assetVersion: asset.assetVersion,
    sourceId: asset.sourceId,
    sourceSha256: asset.sourceSha256,
    inspectionSha256: asset.inspectionSha256,
    approvalSha256: asset.approvalSha256,
    semanticRoles: [...asset.semanticRoles].sort(),
    coverageCategories: [...asset.coverageCategories].sort(),
    archetypeCompatibility: [...asset.archetypeCompatibility].sort(),
    biomeTags: [...asset.biomeTags].sort(),
    depthEligibility: [...asset.depthEligibility].sort(),
    qualityEligibility: [...asset.qualityEligibility].sort(),
    styleCompatibility: asset.styleCompatibility,
    blenderCompatibility: asset.blenderCompatibility,
    canonicalGroupId: asset.canonicalGroupId,
    canonicalState: asset.canonicalState,
  });
}

function assetKey(asset: Pick<ApprovedEnvironmentAsset, 'assetId' | 'assetVersion'>): string {
  return `${asset.assetId}::${asset.assetVersion}`;
}

export function buildApprovedAssetRegistry(input: {
  assets: ApprovedEnvironmentAsset[];
  generatedFromAuditSha256?: string | null;
  registryVersion?: string;
}): ApprovedAssetRegistry {
  const assets = [...input.assets]
    .map((asset) => ({
      ...asset,
      assetDependencySha256: assetDependencySha256(asset),
    }))
    .sort((left, right) => assetKey(left).localeCompare(assetKey(right)));

  const byCanonicalGroup: Record<string, string[]> = {};
  const bySemanticRole: Record<string, string[]> = {};
  const byArchetype: Record<string, string[]> = {};
  for (const asset of assets) {
    (byCanonicalGroup[asset.canonicalGroupId] ??= []).push(assetKey(asset));
    for (const role of asset.semanticRoles) {
      (bySemanticRole[role] ??= []).push(assetKey(asset));
    }
    for (const archetype of asset.archetypeCompatibility) {
      (byArchetype[archetype] ??= []).push(assetKey(asset));
    }
  }
  for (const key of Object.keys(bySemanticRole)) bySemanticRole[key]!.sort();
  for (const key of Object.keys(byArchetype)) byArchetype[key]!.sort();
  for (const key of Object.keys(byCanonicalGroup)) byCanonicalGroup[key]!.sort();

  const conflictedCanonicalGroups = Object.entries(byCanonicalGroup)
    .filter(([groupId]) => {
      const primaries = assets.filter(
        (asset) =>
          asset.canonicalGroupId === groupId &&
          asset.canonicalState === 'PRIMARY' &&
          asset.approvalState === 'APPROVED' &&
          asset.worldBuilderEligible &&
          asset.shotAssemblyEligible,
      );
      return primaries.length > 1;
    })
    .map(([groupId]) => groupId)
    .sort();

  const registrySha256 = sha256Canonical({
    schemaVersion: APPROVED_ASSET_REGISTRY_SCHEMA,
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      assetVersion: asset.assetVersion,
      assetDependencySha256: asset.assetDependencySha256,
      canonicalGroupId: asset.canonicalGroupId,
      canonicalState: asset.canonicalState,
      approvalState: asset.approvalState,
    })),
    conflictedCanonicalGroups,
    filenameSelectionAllowed: false,
    mutableLatestAllowed: false,
  });

  return {
    schemaVersion: APPROVED_ASSET_REGISTRY_SCHEMA,
    registryVersion: input.registryVersion ?? APPROVED_ASSET_REGISTRY_SCHEMA,
    generatedFromAuditSha256: input.generatedFromAuditSha256 ?? null,
    assets,
    registrySha256,
    filenameSelectionAllowed: false,
    mutableLatestAllowed: false,
    conflictedCanonicalGroups,
    indexes: { bySemanticRole, byArchetype, byCanonicalGroup },
  };
}

export function findRegistryAsset(registry: ApprovedAssetRegistry, assetId: string): ApprovedEnvironmentAsset | undefined {
  return registry.assets.find((asset) => asset.assetId === assetId);
}

export function receiptsComplete(asset: ApprovedEnvironmentAsset): boolean {
  return (
    Boolean(asset.sourceReceiptRef) &&
    isValidSha256(asset.sourceSha256) &&
    Boolean(asset.inspectionReceiptRef) &&
    isValidSha256(asset.inspectionSha256) &&
    Boolean(asset.approvalReceiptRef) &&
    isValidSha256(asset.approvalSha256)
  );
}

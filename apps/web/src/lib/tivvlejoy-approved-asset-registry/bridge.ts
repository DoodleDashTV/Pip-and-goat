import type { BuiltEnvironment } from '@/lib/tivvlejoy-world-builder/engine';
import { mapClassificationToCategories, normalizeSemanticRole } from './mapping';
import { makeResolutionRequest, resolveApprovedAsset } from './resolver';
import {
  BRIDGE_SCHEMA,
  RESOLVED_ASSET_SLOT_SCHEMA,
  type ApprovedAssetRegistry,
  type ApprovedAuditSourceInput,
  type ProductionSemanticRole,
  type ResolutionResult,
} from './types';

export function adaptAuditSource(input: ApprovedAuditSourceInput): ApprovedAuditSourceInput {
  return { ...input };
}

export function storeOnlyCannotResolve(source: ApprovedAuditSourceInput): boolean {
  return source.activation === 'STORE_ONLY' && !source.worldBuilderEligible;
}

const ROLE_BY_ARCHETYPE: Partial<Record<string, ProductionSemanticRole>> = {
  BAKERY_EXTERIOR: 'BUILDING_HERO',
  BAKERY_INTERIOR: 'INTERIOR_SHELL',
  FOREST_PATH: 'TREE_HERO',
  MOUNTAIN_OVERLOOK: 'MOUNTAIN_BACKGROUND',
  RIVERBANK: 'WATER',
  SNOW_VILLAGE: 'BACKGROUND_FILL',
};

export function worldBuilderSemanticRequests(env: BuiltEnvironment) {
  const role = ROLE_BY_ARCHETYPE[env.input.archetypeId] ?? 'BACKGROUND_FILL';
  const depth = role.includes('BACKGROUND') || role === 'SKY' ? 'BACKGROUND' : role === 'INTERIOR_SHELL' ? 'MIDGROUND' : 'MIDGROUND';
  const quality = env.input.qualityTarget;
  return [
    {
      slotId: `${env.input.archetypeId}_${role}`,
      semanticRole: role,
      archetypeId: env.input.archetypeId,
      biome: env.blueprint.biome,
      depth: depth as 'FOREGROUND' | 'MIDGROUND' | 'BACKGROUND',
      qualityTier: quality,
      season: env.input.season,
      weather: env.input.weather === 'RAIN' || env.input.weather === 'SNOW' || env.input.weather === 'FOG' ? env.input.weather : 'CLEAR',
    },
  ];
}

export function resolveWorldBuilderEnvironmentAssets(
  env: BuiltEnvironment,
  registry: ApprovedAssetRegistry,
  options: { seed?: number; continuityBySlot?: Record<string, string> } = {},
) {
  const requests = worldBuilderSemanticRequests(env);
  const resolutions = requests.map((item) => {
    const request = makeResolutionRequest({
      ...item,
      styleRequirement: 'TIVVLEJOY_STORYBOOK',
      seed: options.seed ?? env.input.seed,
      continuityAssetId: options.continuityBySlot?.[item.slotId],
      registrySnapshotSha256: registry.registrySha256,
    });
    return resolveApprovedAsset(registry, request);
  });
  return {
    schemaVersion: BRIDGE_SCHEMA,
    locationInstanceId: `LOC_${env.input.locationId}_${env.input.archetypeId}`,
    environmentDependencySha256: env.environmentDependencySha256,
    registrySnapshotSha256: registry.registrySha256,
    nativeProceduralUsed: env.vegetation.provider === 'NATIVE_BLENDER',
    approvedLibraryUsed: resolutions.some((item) => item.selectedAssetId),
    botaniqActivated: false as const,
    geoScatterIntegrated: false as const,
    gafferActivated: false as const,
    physicalStarlightActivated: false as const,
    slots: resolutions.map((resolution, index) => toResolvedSlot(requests[index]!.slotId, resolution)),
    resolutions,
  };
}

export function toResolvedSlot(slotId: string, resolution: ResolutionResult) {
  return {
    schemaVersion: RESOLVED_ASSET_SLOT_SCHEMA,
    slotId,
    resolutionState: resolution.resolutionState,
    approvedAssetId: resolution.selectedAssetId,
    approvedAssetVersion: 'selectedAssetVersion' in resolution ? resolution.selectedAssetVersion : null,
    sourceId: 'sourceId' in resolution ? resolution.sourceId : null,
    sourceReceiptRef: 'sourceReceiptRef' in resolution ? resolution.sourceReceiptRef : null,
    sourceSha256: 'sourceSha256' in resolution ? resolution.sourceSha256 : null,
    inspectionReceiptRef: 'inspectionReceiptRef' in resolution ? resolution.inspectionReceiptRef : null,
    inspectionSha256: 'inspectionSha256' in resolution ? resolution.inspectionSha256 : null,
    approvalReceiptRef: 'approvalReceiptRef' in resolution ? resolution.approvalReceiptRef : null,
    approvalSha256: 'approvalSha256' in resolution ? resolution.approvalSha256 : null,
    assetDependencySha256: 'assetDependencySha256' in resolution ? resolution.assetDependencySha256 : null,
    resolutionReceiptSha256: resolution.resolutionReceiptSha256,
    registrySnapshotSha256: resolution.registrySnapshotSha256,
    filenameUsedForSelection: false as const,
    mutableLatestUsed: false as const,
  };
}

export function categoryMappingFromRoles(roles: string[], kind: string) {
  return mapClassificationToCategories({ roles: roles.map((role) => (role === 'SHRUB' ? 'SHRUBS' : role)), kind });
}

export { normalizeSemanticRole };

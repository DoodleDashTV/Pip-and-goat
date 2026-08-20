import { REGISTRY_BRIDGE_SCHEMA, WORLD_BUILDER_REFRESH_SCHEMA, type LibraryAnalysisClass, type ProductionSemanticRole } from './types';
import { evaluateSceneryLongevity, type SceneryLongevityReport } from '@/lib/tivvlejoy-scenery-longevity';
import { SPECIALTY_STORY_ROLES } from '@/lib/tivvlejoy-scenery-longevity/types';
import type { ProductionLibrary } from './library';
import { findApprovedAssets } from './library';

export type RegistryBridgeRecord = {
  schemaVersion: typeof REGISTRY_BRIDGE_SCHEMA;
  assetId: string;
  assetVersion: string;
  sourceId: string;
  sourceReceiptRef: string;
  sourceSha256: string | null;
  inspectionReceiptRef: string;
  inspectionSha256: string;
  approvalReceiptRef: string;
  approvalSha256: string;
  semanticRoles: ProductionSemanticRole[];
  archetypeCompatibility: string[];
  qualityEligibility: Array<'HERO' | 'SUPPORTING' | 'BACKGROUND'>;
  depthEligibility: Array<'FOREGROUND' | 'MIDGROUND' | 'BACKGROUND'>;
  canonicalGroupId: string;
  canonicalState: string;
  worldBuilderEligible: boolean;
  shotAssemblyEligible: boolean;
  assetDependencySha256: string;
  filenameUsedForSelection: false;
};

export type WorldBuilderRefresh = {
  schemaVersion: typeof WORLD_BUILDER_REFRESH_SCHEMA;
  semanticRoleCapacity: Record<string, number>;
  heroLocationAvailability: number;
  interiorCapacity: number;
  backgroundCapacity: number;
  mountainCapacity: number;
  vegetationCapacity: number;
  propCapacity: number;
  resolverSourceChanged: false;
};

export function refreshWorldBuilderFromLibrary(library: ProductionLibrary): WorldBuilderRefresh {
  const approved = library.records.filter((item) => item.worldBuilderEligible && item.approvalSha256);
  const roleCapacity: Record<string, number> = {};
  for (const record of approved) {
    for (const role of record.semanticRoles) {
      roleCapacity[role] = (roleCapacity[role] ?? 0) + 1;
    }
  }
  return {
    schemaVersion: WORLD_BUILDER_REFRESH_SCHEMA,
    semanticRoleCapacity: roleCapacity,
    heroLocationAvailability: approved.filter((item) => item.quality.includes('HERO') && item.semanticRoles.some((role) => role.endsWith('_HERO') || role === 'INTERIOR_SHELL')).length,
    interiorCapacity: findApprovedAssets(library, { role: 'INTERIOR_SHELL' }).length,
    backgroundCapacity: approved.filter((item) => item.quality.includes('BACKGROUND') || item.semanticRoles.includes('BACKGROUND_FILL')).length,
    mountainCapacity: approved.filter((item) => item.semanticRoles.some((role) => role.startsWith('MOUNTAIN_'))).length,
    vegetationCapacity: approved.filter((item) =>
      item.semanticRoles.some((role) =>
        role.startsWith('TREE_') || ['GRASS', 'FLOWERS', 'SHRUBS', 'GROUND_COVER', 'VINES', 'REEDS', 'FOREST_UNDERSTORY'].includes(role),
      ),
    ).length,
    propCapacity: approved.filter((item) => item.semanticRoles.some((role) => role === 'STREET_PROP' || role === 'STORY_PROP' || role === 'INTERIOR_PROP')).length,
    resolverSourceChanged: false,
  };
}

export function refreshLongevityFromLibrary(input: {
  library: ProductionLibrary;
  requestedEpisodeCount: number;
  plannedHeroRoles?: string[];
}): {
  analysisClass: LibraryAnalysisClass;
  report: SceneryLongevityReport;
  claimsProductionCapacityFromUnapproved: false;
} {
  const approvedCount = input.library.records.filter((item) => item.approvalSha256 && item.worldBuilderEligible).length;
  const analysisClass: LibraryAnalysisClass = approvedCount ? 'REAL_APPROVED_LIBRARY_ANALYSIS' : 'SYNTHETIC_PLANNING_ANALYSIS';
  const report = evaluateSceneryLongevity({
    requestedEpisodeCount: input.requestedEpisodeCount,
    evidenceClass: approvedCount ? 'APPROVED_PRODUCTION_PLAN' : 'SYNTHETIC_PREVIEW',
    plannedEpisodeRequirements: (input.plannedHeroRoles ?? []).map((role, index) => ({
      episodeId: `plan-${index + 1}`,
      requiredHeroRoles: [role],
      storyPurpose: role,
    })),
  });
  return { analysisClass, report, claimsProductionCapacityFromUnapproved: false };
}

export function genuineSemanticGaps(input: {
  plannedStoryRoles: readonly string[];
  library: ProductionLibrary;
}): string[] {
  return input.plannedStoryRoles.filter((role) => {
    if (!SPECIALTY_STORY_ROLES.includes(role as (typeof SPECIALTY_STORY_ROLES)[number]) && !role.endsWith('_HERO')) {
      return false;
    }
    return !input.library.records.some(
      (item) => item.approvalSha256 && item.worldBuilderEligible && item.semanticRoles.includes(role as ProductionSemanticRole),
    );
  });
}

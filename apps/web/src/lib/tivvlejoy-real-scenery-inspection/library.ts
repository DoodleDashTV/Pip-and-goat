import { PRODUCTION_LIBRARY_SCHEMA, type LibraryCategory, type ProductionSemanticRole, type QualityTier } from './types';

export type ProductionLibraryRecord = {
  assetId: string;
  assetVersion: string;
  category: LibraryCategory;
  semanticRoles: ProductionSemanticRole[];
  archetypes: string[];
  quality: QualityTier[];
  sourceId: string;
  inspectionSha256: string;
  approvalSha256: string | null;
  worldBuilderEligible: boolean;
};

export type ProductionLibrary = {
  schemaVersion: typeof PRODUCTION_LIBRARY_SCHEMA;
  records: ProductionLibraryRecord[];
  indexes: {
    byRole: Map<ProductionSemanticRole, ProductionLibraryRecord[]>;
    byArchetype: Map<string, ProductionLibraryRecord[]>;
    byCategory: Map<LibraryCategory, ProductionLibraryRecord[]>;
    byAssetId: Map<string, ProductionLibraryRecord>;
  };
  binaryFilesInGit: false;
};

export function buildProductionLibrary(records: readonly ProductionLibraryRecord[]): ProductionLibrary {
  const sorted = [...records].sort((left, right) => `${left.assetId}:${left.assetVersion}`.localeCompare(`${right.assetId}:${right.assetVersion}`));
  const byRole = new Map<ProductionSemanticRole, ProductionLibraryRecord[]>();
  const byArchetype = new Map<string, ProductionLibraryRecord[]>();
  const byCategory = new Map<LibraryCategory, ProductionLibraryRecord[]>();
  const byAssetId = new Map<string, ProductionLibraryRecord>();
  for (const record of sorted) {
    byAssetId.set(`${record.assetId}:${record.assetVersion}`, record);
    (byCategory.get(record.category) ?? byCategory.set(record.category, []).get(record.category)!).push(record);
    for (const role of record.semanticRoles) {
      (byRole.get(role) ?? byRole.set(role, []).get(role)!).push(record);
    }
    for (const archetype of record.archetypes) {
      (byArchetype.get(archetype) ?? byArchetype.set(archetype, []).get(archetype)!).push(record);
    }
  }
  return {
    schemaVersion: PRODUCTION_LIBRARY_SCHEMA,
    records: sorted,
    indexes: { byRole, byArchetype, byCategory, byAssetId },
    binaryFilesInGit: false,
  };
}

export function findApprovedAssets(
  library: ProductionLibrary,
  query: { role?: ProductionSemanticRole; archetype?: string; quality?: QualityTier },
): ProductionLibraryRecord[] {
  let pool = library.records.filter((item) => item.category.startsWith('APPROVED_') && item.worldBuilderEligible);
  if (query.role) {
    pool = library.indexes.byRole.get(query.role)?.filter((item) => item.worldBuilderEligible) ?? [];
  }
  if (query.archetype) pool = pool.filter((item) => item.archetypes.includes(query.archetype!));
  if (query.quality) pool = pool.filter((item) => item.quality.includes(query.quality!));
  return pool;
}

export function findByFilename(_library: ProductionLibrary, _filename: string): never {
  throw new Error('findByFilename is not a production resolver.');
}

export function categoryFor(input: {
  approved: boolean;
  blocked: boolean;
  archival: boolean;
  quality: readonly QualityTier[];
  roles: readonly ProductionSemanticRole[];
}): LibraryCategory {
  if (input.blocked) return 'BLOCKED';
  if (input.archival) return 'ARCHIVAL';
  if (!input.approved) return 'AWAITING_REVIEW';
  if (input.roles.includes('SKY')) return 'APPROVED_SKY';
  if (input.roles.includes('INTERIOR_SHELL') || input.roles.includes('INTERIOR_PROP')) return 'APPROVED_INTERIOR';
  if (input.roles.some((role) => role.startsWith('TREE_') || ['GRASS', 'FLOWERS', 'SHRUBS', 'GROUND_COVER', 'VINES', 'REEDS', 'FOREST_UNDERSTORY'].includes(role))) {
    return 'APPROVED_VEGETATION';
  }
  if (input.roles.some((role) => role === 'STREET_PROP' || role === 'STORY_PROP' || role === 'SIGNAGE')) return 'APPROVED_PROP';
  if (input.quality.includes('HERO')) return 'APPROVED_HERO';
  if (input.quality.includes('SUPPORTING')) return 'APPROVED_SUPPORTING';
  return 'APPROVED_BACKGROUND';
}

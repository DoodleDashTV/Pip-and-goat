import {
  COVERAGE_CATEGORIES,
  PRODUCTION_SEMANTIC_ROLES,
  ROLE_ALIASES,
  SOURCE_CATEGORY_MAPPING_SCHEMA,
  type CoverageCategory,
  type ProductionSemanticRole,
} from './types';

export function normalizeSemanticRole(role: string): ProductionSemanticRole {
  const aliased = role === 'SHRUB' ? ROLE_ALIASES.SHRUB : role;
  if ((PRODUCTION_SEMANTIC_ROLES as readonly string[]).includes(aliased)) {
    return aliased as ProductionSemanticRole;
  }
  throw new Error(`Unknown production semantic role: ${role}`);
}

export function mapClassificationToCategories(input: {
  roles: readonly string[];
  kind: string;
}): { schemaVersion: typeof SOURCE_CATEGORY_MAPPING_SCHEMA; roles: ProductionSemanticRole[]; categories: CoverageCategory[] } {
  const roles = input.roles.map((role) => normalizeSemanticRole(role));
  const categories = new Set<CoverageCategory>();
  for (const role of roles) {
    if (role.startsWith('BUILDING_') || role === 'INTERIOR_SHELL') categories.add('architecture');
    if (role === 'INTERIOR_SHELL' || role === 'INTERIOR_PROP') categories.add('interiors');
    if (
      role.startsWith('TREE_') ||
      role === 'GRASS' ||
      role === 'FLOWERS' ||
      role === 'SHRUBS' ||
      role === 'GROUND_COVER' ||
      role === 'FOREST_UNDERSTORY' ||
      role === 'VINES' ||
      role === 'REEDS'
    ) {
      categories.add('vegetation');
    }
    if (role === 'PATH') categories.add('roads_paths');
    if (role === 'TERRAIN_SURFACE' || role === 'ROCK' || role.startsWith('MOUNTAIN_')) categories.add('terrain');
    if (role.startsWith('MOUNTAIN_') || role === 'BACKGROUND_FILL' || role === 'SKY') categories.add('backgrounds');
    if (role === 'WATER') categories.add('water');
    if (role === 'SIGNAGE') categories.add('story_signage');
    if (role === 'STREET_PROP' || role === 'STORY_PROP' || role === 'INTERIOR_PROP' || role === 'FOREGROUND_FRAME') {
      categories.add('props');
    }
    if (role === 'SKY') categories.add('lighting');
    if (role === 'BUILDING_HERO' || role === 'MOUNTAIN_HERO' || role === 'TREE_HERO') categories.add('hero_locations');
  }
  return {
    schemaVersion: SOURCE_CATEGORY_MAPPING_SCHEMA,
    roles,
    categories: COVERAGE_CATEGORIES.filter((item) => categories.has(item)),
  };
}

export function qualitySatisfies(assetQuality: readonly string[], requested: 'HERO' | 'SUPPORTING' | 'BACKGROUND'): boolean {
  if (requested === 'BACKGROUND') return assetQuality.some((item) => item === 'HERO' || item === 'SUPPORTING' || item === 'BACKGROUND');
  if (requested === 'SUPPORTING') return assetQuality.some((item) => item === 'HERO' || item === 'SUPPORTING');
  return assetQuality.includes('HERO');
}

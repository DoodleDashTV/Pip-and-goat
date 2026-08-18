import { z } from 'zod';

export const SCENERY_SCHEMA_VERSION = 'TIVVLEJOY_SCENERY_FOUNDATION_V1';
export const DEFAULT_SCENERY_SEED = 4170179;
export const SUPPORTED_BLENDER_VERSION = '4.2.2';
export const PIP_CHARACTER_ID = 'CHAR_PIP_001' as const;
export const GOAT_CHARACTER_ID = 'CHAR_GOAT_001' as const;

export const SOURCE_STATUSES = [
  'registered',
  'source_unavailable',
  'awaiting_inspection',
  'inspected',
  'normalized',
  'quarantined',
  'approved',
] as const;
export const SourceStatusSchema = z.enum(SOURCE_STATUSES);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const COMPATIBILITY_STATUSES = [
  'unknown',
  'compatible',
  'needs_relink',
  'unsupported',
  'incompatible',
] as const;
export const CompatibilityStatusSchema = z.enum(COMPATIBILITY_STATUSES);

export const ASSET_TYPES = [
  'building',
  'prop',
  'vegetation',
  'terrain',
  'water',
  'path',
  'sky',
  'hdri',
  'scatter',
  'swarm',
  'lighting',
] as const;
export const AssetTypeSchema = z.enum(ASSET_TYPES);

export const BIOMES = ['forest', 'village', 'creek', 'clearing', 'trail', 'mixed'] as const;
export const BiomeSchema = z.enum(BIOMES);

export const TEXTURE_TIERS = ['1024', '2048', '4096'] as const;
export const TextureTierSchema = z.enum(TEXTURE_TIERS);
export type TextureTier = z.infer<typeof TextureTierSchema>;

export const APPROVAL_STATUSES = ['unapproved', 'fixture_only', 'approved', 'quarantined'] as const;
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ORIGIN_POLICIES = ['ground_bottom', 'world_origin', 'geometry_center'] as const;
export const OriginPolicySchema = z.enum(ORIGIN_POLICIES);
export type OriginPolicy = z.infer<typeof OriginPolicySchema>;

export const ROTATION_POLICIES = ['yaw_only', 'free', 'locked'] as const;
export const RotationPolicySchema = z.enum(ROTATION_POLICIES);
export type RotationPolicy = z.infer<typeof RotationPolicySchema>;

export const PLACEMENT_MODES = ['grounded', 'floating_allowed', 'attached', 'volume'] as const;
export const PlacementModeSchema = z.enum(PLACEMENT_MODES);
export type PlacementMode = z.infer<typeof PlacementModeSchema>;
export const LAYER_ROLES = ['foreground', 'midground', 'background', 'sky', 'stage'] as const;
export const LayerRoleSchema = z.enum(LAYER_ROLES);
export type LayerRole = z.infer<typeof LayerRoleSchema>;

export const RECIPE_IDS = [
  'forest_village_day',
  'forest_trail_day',
  'village_square_day',
  'cabin_exterior_day',
  'creek_clearing_day',
  'magical_clearing_night',
] as const;
export const RecipeIdSchema = z.enum(RECIPE_IDS);
export type RecipeId = z.infer<typeof RecipeIdSchema>;

export const SCENERY_ROLES = [
  'cabin',
  'path',
  'tree',
  'tree_left',
  'tree_right',
  'rock',
  'flower',
  'creek',
  'butterfly',
  'firefly',
  'sky',
  'hdri',
  'grass',
  'fence',
  'table',
  'chair',
] as const;
export const SceneryRoleSchema = z.enum(SCENERY_ROLES);
export type SceneryRole = z.infer<typeof SceneryRoleSchema>;

export class SceneryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SceneryError';
  }
}

export function assertNoLegacyBrand(text: string): void {
  const compact = String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
  if (compact.includes('doodledash')) {
    throw new SceneryError('TivvleJoy scenery copy cannot include legacy-brand wording.', 'LEGACY_BRAND_REFUSED');
  }
}

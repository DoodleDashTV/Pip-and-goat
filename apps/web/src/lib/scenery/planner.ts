import { z } from 'zod';
import { assetsForRole, catalogById, type AssetCatalog, type CatalogAsset } from './catalog';
import { getRecipe, type SceneryRecipe } from './recipes';
import { resolveTextureTier, type TextureTierDecision } from './texture-policy';
import {
  DEFAULT_SCENERY_SEED,
  GOAT_CHARACTER_ID,
  LAYER_ROLES,
  PIP_CHARACTER_ID,
  RECIPE_IDS,
  SCENERY_SCHEMA_VERSION,
  SceneryError,
  TEXTURE_TIERS,
  type LayerRole,
  type RecipeId,
  type SceneryRole,
  type TextureTier,
} from './types';

export const SceneBriefSchema = z.object({
  recipe: z.enum(RECIPE_IDS),
  storyPurpose: z.string().min(1),
  mood: z.string().min(1),
  timeOfDay: z.enum(['morning', 'midday', 'afternoon', 'golden_hour', 'night']),
  characters: z.array(z.string().min(1)).min(1),
  requiredFeatures: z.array(z.string().min(1)),
  effects: z.array(z.string()),
  durationSeconds: z.number().positive(),
  aspectRatio: z.literal('9:16'),
  seed: z.number().int(),
  textureTier: z.enum(TEXTURE_TIERS).optional(),
  memoryBudgetMb: z.number().positive().optional(),
  shotKind: z.enum(['preview', 'distant', 'standard', 'hero_closeup']).optional(),
});

export type SceneBrief = z.infer<typeof SceneBriefSchema>;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlannedPlacement {
  assetId: string;
  role: SceneryRole;
  layer: LayerRole;
  position: Vec3;
  rotationEuler: Vec3;
  scale: number;
  grounded: boolean;
}

export interface ScenePlan {
  schemaVersion: typeof SCENERY_SCHEMA_VERSION;
  planner: 'TIVVLEJOY_SCENERY_PLANNER_V1';
  recipeId: RecipeId;
  storyPurpose: string;
  mood: string;
  timeOfDay: SceneBrief['timeOfDay'];
  characters: string[];
  aspectRatio: '9:16';
  seed: number;
  placements: PlannedPlacement[];
  characterStage: SceneryRecipe['characterPerformanceZone'];
  camera: {
    position: Vec3;
    target: Vec3;
    aspectRatio: '9:16';
    focalLengthMm: number;
    safeFrame: { left: number; right: number; top: number; bottom: number };
  };
  safeMovementPaths: Array<{ id: string; points: Vec3[] }>;
  skyPreset: string;
  hdriPreset: string;
  lighting: SceneryRecipe['lightingPreset'];
  atmosphere: string;
  scatter: {
    vegetationDensity: SceneryRecipe['vegetationDensity'];
    rockDensity: SceneryRecipe['rockDensity'];
    constrained: true;
    seed: number;
  };
  textureTier: TextureTier;
  textureDecision: TextureTierDecision;
  resourceEstimate: {
    triangleCount: number;
    estimatedMemoryMb: number;
    complexity: 'low' | 'medium' | 'high';
  };
  provenance: {
    catalogGeneratedAt: string;
    sourceIds: string[];
    assetIds: string[];
    purchasedBytesInspected: false;
    fixtureOnly: boolean;
  };
  missingPrerequisites: string[];
  rendered: false;
}

const ROLE_LAYOUT: Record<
  SceneryRole,
  { position: Vec3; rotationY: number; layer: LayerRole; scale: number }
> = {
  cabin: { position: { x: 0.55, y: 0, z: -6.8 }, rotationY: 8, layer: 'midground', scale: 1 },
  path: { position: { x: 0, y: 0, z: -1.2 }, rotationY: 0, layer: 'stage', scale: 1 },
  tree: { position: { x: 0, y: 0, z: -10 }, rotationY: 6, layer: 'background', scale: 1.05 },
  tree_left: { position: { x: -4.4, y: 0, z: -3.6 }, rotationY: -12, layer: 'midground', scale: 1 },
  tree_right: { position: { x: 4.5, y: 0, z: -3.3 }, rotationY: 14, layer: 'midground', scale: 1.02 },
  rock: { position: { x: -2.6, y: 0, z: -4.7 }, rotationY: 22, layer: 'midground', scale: 1 },
  flower: { position: { x: -2.1, y: 0, z: 3.5 }, rotationY: 18, layer: 'foreground', scale: 1 },
  creek: { position: { x: -6.9, y: 0, z: 3.1 }, rotationY: 90, layer: 'midground', scale: 1 },
  butterfly: { position: { x: 2.15, y: 1.05, z: 3.4 }, rotationY: 30, layer: 'foreground', scale: 1 },
  firefly: { position: { x: 2.2, y: 1.2, z: -2.4 }, rotationY: 40, layer: 'midground', scale: 1 },
  sky: { position: { x: 0, y: 8, z: 0 }, rotationY: 0, layer: 'sky', scale: 1 },
  hdri: { position: { x: 0, y: 0, z: 0 }, rotationY: 0, layer: 'sky', scale: 1 },
  grass: { position: { x: 0, y: 0, z: -2 }, rotationY: 5, layer: 'stage', scale: 1 },
  fence: { position: { x: 3.8, y: 0, z: -6.2 }, rotationY: 90, layer: 'midground', scale: 1 },
  table: { position: { x: 3.1, y: 0, z: -1.8 }, rotationY: -18, layer: 'midground', scale: 1 },
  chair: { position: { x: 3.4, y: 0, z: -1.1 }, rotationY: -40, layer: 'midground', scale: 1 },
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function jitter(rng: () => number, base: number, amount: number): number {
  return round6(base + (rng() - 0.5) * amount);
}

function parseBrief(value: unknown): SceneBrief {
  const parsed = SceneBriefSchema.safeParse(value);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid scene brief. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_BRIEF',
    );
  }
  return parsed.data;
}

function effectToRole(effect: string): SceneryRole | null {
  if (effect === 'butterflies') return 'butterfly';
  if (effect === 'fireflies') return 'firefly';
  return null;
}

function rolesForBrief(recipe: SceneryRecipe, brief: SceneBrief): SceneryRole[] {
  const roles = new Set<SceneryRole>(recipe.requiredRoles);
  for (const feature of brief.requiredFeatures) {
    if ((recipe.requiredRoles as string[]).includes(feature) || (recipe.optionalRoles as string[]).includes(feature)) {
      roles.add(feature as SceneryRole);
    }
  }
  for (const effect of brief.effects) {
    const role = effectToRole(effect);
    if (role && ((recipe.optionalRoles as string[]).includes(role) || (recipe.swarmEffects as string[]).includes(effect))) {
      roles.add(role);
    }
  }
  if (recipe.optionalRoles.includes('grass') && recipe.vegetationDensity !== 'sparse') {
    roles.add('grass');
  }
  return [...roles].sort();
}

function selectAsset(
  catalog: AssetCatalog,
  role: SceneryRole,
  brief: SceneBrief,
  used: Set<string>,
): CatalogAsset {
  const matches = assetsForRole(catalog, role)
    .filter((asset) => !used.has(asset.assetId))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  const timeFiltered =
    role === 'sky' || role === 'hdri'
      ? matches.filter((asset) =>
          brief.timeOfDay === 'night' ? asset.biome === 'clearing' || asset.tags.includes('night') : asset.biome !== 'clearing' || matches.length === 1,
        )
      : matches;
  const pool = timeFiltered.length ? timeFiltered : matches;
  if (!pool.length) {
    throw new SceneryError(`Missing required recipe role: ${role}`, 'MISSING_ROLE');
  }
  return pool[0]!;
}

function complexity(triangles: number, memoryMb: number): 'low' | 'medium' | 'high' {
  if (triangles > 180_000 || memoryMb > 1000) return 'high';
  if (triangles > 80_000 || memoryMb > 400) return 'medium';
  return 'low';
}

export function planSceneryScene(catalog: AssetCatalog, briefInput: unknown): ScenePlan {
  const brief = parseBrief(briefInput);
  if (brief.seed === undefined || Number.isNaN(brief.seed)) {
    throw new SceneryError('A deterministic seed is required.', 'MISSING_SEED');
  }
  const recipe = getRecipe(brief.recipe);
  const rng = mulberry32(brief.seed);
  const roles = rolesForBrief(recipe, brief);
  const used = new Set<string>();
  const placements: PlannedPlacement[] = [];

  for (const role of roles) {
    const asset = selectAsset(catalog, role, brief, used);
    used.add(asset.assetId);
    const layout = ROLE_LAYOUT[role];
    const grounded = asset.placementMode === 'grounded';
    const position = {
      x: jitter(rng, layout.position.x, role === 'path' || role === 'sky' || role === 'hdri' ? 0 : 0.28),
      y: grounded ? 0 : layout.position.y,
      z: jitter(rng, layout.position.z, role === 'path' || role === 'sky' || role === 'hdri' ? 0 : 0.22),
    };
    const rotationY = asset.rotationPolicy === 'locked' ? 0 : jitter(rng, layout.rotationY, 7);
    const scale = jitter(rng, layout.scale, 0.08);
    placements.push({
      assetId: asset.assetId,
      role,
      layer: layout.layer,
      position,
      rotationEuler: { x: 0, y: rotationY, z: 0 },
      scale,
      grounded,
    });
  }

  const selected = placements.map((item) => catalogById(catalog).get(item.assetId)!);
  const shotKind = brief.shotKind ?? 'standard';
  const requestedTier = brief.textureTier ?? recipe.textureTier;
  const textureDecision = resolveTextureTier(
    {
      requestedTier,
      memoryBudgetMb: brief.memoryBudgetMb ?? recipe.performanceBudget.maxMemoryMb,
      shotKind,
    },
    selected.filter((asset) => asset.assetType !== 'sky' && asset.assetType !== 'hdri').length,
  );
  const triangleCount = selected.reduce((sum, asset) => sum + asset.triangleCount, 0);
  const missingPrerequisites = [
    'Purchased Village, Sky, Forest, and Nature source files are source_unavailable.',
    'Normalized purchased scenery assets are not present.',
    'Real Blender inspection was not run.',
    'Real Blender assembly remains blocked.',
  ];

  return {
    schemaVersion: SCENERY_SCHEMA_VERSION,
    planner: 'TIVVLEJOY_SCENERY_PLANNER_V1',
    recipeId: recipe.recipeId,
    storyPurpose: brief.storyPurpose,
    mood: brief.mood,
    timeOfDay: brief.timeOfDay,
    characters: brief.characters,
    aspectRatio: '9:16',
    seed: brief.seed,
    placements,
    characterStage: recipe.characterPerformanceZone,
    camera: {
      position: { x: 0, y: 1.55, z: 11.4 },
      target: { x: 0.15, y: 1.05, z: -3.2 },
      aspectRatio: '9:16',
      focalLengthMm: 35,
      safeFrame: { left: 0.08, right: 0.08, top: 0.12, bottom: 0.18 },
    },
    safeMovementPaths: [
      {
        id: 'pip_goat_path',
        points: [
          { x: 0, y: 0, z: 1.4 },
          { x: 0.1, y: 0, z: -1.2 },
          { x: 0.25, y: 0, z: -4.4 },
        ],
      },
    ],
    skyPreset: recipe.skyPreset,
    hdriPreset: recipe.hdriPreset,
    lighting: recipe.lightingPreset,
    atmosphere: recipe.atmosphere,
    scatter: {
      vegetationDensity: recipe.vegetationDensity,
      rockDensity: recipe.rockDensity,
      constrained: true,
      seed: brief.seed,
    },
    textureTier: textureDecision.selectedTier,
    textureDecision,
    resourceEstimate: {
      triangleCount,
      estimatedMemoryMb: textureDecision.estimatedMemoryMb,
      complexity: complexity(triangleCount, textureDecision.estimatedMemoryMb),
    },
    provenance: {
      catalogGeneratedAt: catalog.generatedAt,
      sourceIds: [...new Set(selected.map((asset) => asset.sourceId))].sort(),
      assetIds: placements.map((item) => item.assetId).sort(),
      purchasedBytesInspected: false,
      fixtureOnly: selected.every((asset) => asset.approvalStatus === 'fixture_only'),
    },
    missingPrerequisites,
    rendered: false,
  };
}

export function serializeScenePlan(plan: ScenePlan): string {
  return `${JSON.stringify(plan, Object.keys(plan).sort(), 2)}\n`;
}

export { DEFAULT_SCENERY_SEED, PIP_CHARACTER_ID, GOAT_CHARACTER_ID, LAYER_ROLES };

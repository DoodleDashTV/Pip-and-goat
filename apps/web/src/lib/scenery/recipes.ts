import { z } from 'zod';
import { BoundsMetersSchema } from './catalog';
import {
  BIOMES,
  DEFAULT_SCENERY_SEED,
  RECIPE_IDS,
  SCENERY_ROLES,
  SCENERY_SCHEMA_VERSION,
  SceneryError,
  TEXTURE_TIERS,
  type RecipeId,
  type SceneryRole,
} from './types';

export const LightingPresetSchema = z.object({
  key: z.string().min(1),
  fill: z.string().min(1),
  rim: z.string().min(1),
});

export const PerformanceBudgetSchema = z.object({
  maxTriangles: z.number().int().positive(),
  maxMemoryMb: z.number().positive(),
});

export const SceneryRecipeSchema = z.object({
  schemaVersion: z.literal(SCENERY_SCHEMA_VERSION),
  recipeId: z.enum(RECIPE_IDS),
  displayName: z.string().min(1),
  biome: z.enum(BIOMES),
  timeOfDay: z.enum(['morning', 'midday', 'afternoon', 'golden_hour', 'night']),
  requiredRoles: z.array(z.enum(SCENERY_ROLES)).min(1),
  optionalRoles: z.array(z.enum(SCENERY_ROLES)),
  stageDimensions: z.object({
    widthMeters: z.number().positive(),
    depthMeters: z.number().positive(),
    heightMeters: z.number().positive(),
  }),
  characterPerformanceZone: BoundsMetersSchema,
  cameraSafeZone: BoundsMetersSchema,
  foregroundRules: z.array(z.string().min(1)).min(1),
  midgroundRules: z.array(z.string().min(1)).min(1),
  backgroundRules: z.array(z.string().min(1)).min(1),
  pathRequirements: z.array(z.string().min(1)),
  buildingRequirements: z.array(z.string().min(1)),
  vegetationDensity: z.enum(['sparse', 'medium', 'lush']),
  rockDensity: z.enum(['none', 'sparse', 'medium']),
  waterBehavior: z.enum(['none', 'still', 'creek', 'reflective']),
  skyPreset: z.string().min(1),
  hdriPreset: z.string().min(1),
  lightingPreset: LightingPresetSchema,
  atmosphere: z.string().min(1),
  swarmEffects: z.array(z.enum(['butterflies', 'fireflies', 'none'])),
  textureTier: z.enum(TEXTURE_TIERS),
  performanceBudget: PerformanceBudgetSchema,
  defaultSeed: z.number().int(),
});

export type SceneryRecipe = z.infer<typeof SceneryRecipeSchema>;

function recipe(input: Omit<SceneryRecipe, 'schemaVersion' | 'defaultSeed'>): SceneryRecipe {
  return SceneryRecipeSchema.parse({
    ...input,
    schemaVersion: SCENERY_SCHEMA_VERSION,
    defaultSeed: DEFAULT_SCENERY_SEED,
  });
}

const DAY_LIGHT = {
  key: 'tivvlejoy_key_warm_sun',
  fill: 'tivvlejoy_fill_sky',
  rim: 'tivvlejoy_rim_leaf',
} as const;

const NIGHT_LIGHT = {
  key: 'tivvlejoy_key_moon',
  fill: 'tivvlejoy_fill_cool',
  rim: 'tivvlejoy_rim_firefly',
} as const;

const STAGE = { widthMeters: 16, depthMeters: 22, heightMeters: 8 } as const;
const CHARACTER_ZONE = {
  minX: -1.6,
  maxX: 1.6,
  minY: 0,
  maxY: 2.2,
  minZ: -1.4,
  maxZ: 1.6,
} as const;
const CAMERA_SAFE = {
  minX: -2.4,
  maxX: 2.4,
  minY: 0.4,
  maxY: 2.4,
  minZ: 6,
  maxZ: 13,
} as const;

export const SCENERY_RECIPES: SceneryRecipe[] = [
  recipe({
    recipeId: 'forest_village_day',
    displayName: 'Forest Village Day',
    biome: 'mixed',
    timeOfDay: 'morning',
    requiredRoles: ['cabin', 'path', 'tree_left', 'tree_right', 'rock', 'flower', 'creek', 'sky', 'hdri'],
    optionalRoles: ['butterfly', 'grass'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: [
      'Keep flowers and low plants at the sides of the 9:16 frame.',
      'Do not place props in front of Pip and Goat faces.',
    ],
    midgroundRules: [
      'Cabin is the focal point at the end of the path.',
      'Rocks sit beside the path, never on the walkable center.',
    ],
    backgroundRules: ['Trees frame left and right and stay clear of the character stage.'],
    pathRequirements: ['One clear walkable path from the camera toward the cabin.'],
    buildingRequirements: ['One level cabin. No tilt. Leave a performance apron in front.'],
    vegetationDensity: 'medium',
    rockDensity: 'sparse',
    waterBehavior: 'creek',
    skyPreset: 'skymachine_day_clear',
    hdriPreset: 'forest_morning_hdri',
    lightingPreset: DAY_LIGHT,
    atmosphere: 'light morning haze',
    swarmEffects: ['butterflies'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 240_000, maxMemoryMb: 1400 },
  }),
  recipe({
    recipeId: 'forest_trail_day',
    displayName: 'Forest Trail Day',
    biome: 'trail',
    timeOfDay: 'morning',
    requiredRoles: ['path', 'tree_left', 'tree_right', 'rock', 'grass', 'sky', 'hdri'],
    optionalRoles: ['flower', 'butterfly'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: ['Trail edges may hold grass only. Keep the center clear.'],
    midgroundRules: ['Trees recede along the trail to guide the eye.'],
    backgroundRules: ['Distant trees stay smaller and uncluttered.'],
    pathRequirements: ['A single walkable trail through the stage.'],
    buildingRequirements: [],
    vegetationDensity: 'lush',
    rockDensity: 'sparse',
    waterBehavior: 'none',
    skyPreset: 'skymachine_day_clear',
    hdriPreset: 'forest_morning_hdri',
    lightingPreset: DAY_LIGHT,
    atmosphere: 'filtered canopy light',
    swarmEffects: ['none'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 200_000, maxMemoryMb: 1200 },
  }),
  recipe({
    recipeId: 'village_square_day',
    displayName: 'Village Square Day',
    biome: 'village',
    timeOfDay: 'midday',
    requiredRoles: ['cabin', 'path', 'fence', 'table', 'chair', 'sky', 'hdri'],
    optionalRoles: ['flower', 'grass'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: ['Keep the square open. Side flowers only.'],
    midgroundRules: ['Table and chairs sit off the walkable path.'],
    backgroundRules: ['Cabin and fence read as the village edge.'],
    pathRequirements: ['A clear crossing through the square.'],
    buildingRequirements: ['One level cabin facing the square.'],
    vegetationDensity: 'sparse',
    rockDensity: 'none',
    waterBehavior: 'none',
    skyPreset: 'skymachine_day_clear',
    hdriPreset: 'village_noon_hdri',
    lightingPreset: DAY_LIGHT,
    atmosphere: 'clear midday',
    swarmEffects: ['none'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 180_000, maxMemoryMb: 1100 },
  }),
  recipe({
    recipeId: 'cabin_exterior_day',
    displayName: 'Cabin Exterior Day',
    biome: 'village',
    timeOfDay: 'morning',
    requiredRoles: ['cabin', 'path', 'tree_left', 'tree_right', 'flower', 'sky', 'hdri'],
    optionalRoles: ['rock', 'grass'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: ['Low flowers frame the apron. Faces stay clear.'],
    midgroundRules: ['Cabin sits level with a performance apron.'],
    backgroundRules: ['Side trees frame the cabin, not the faces.'],
    pathRequirements: ['A short path to the cabin door.'],
    buildingRequirements: ['One cabin. Keep it level and readable.'],
    vegetationDensity: 'medium',
    rockDensity: 'sparse',
    waterBehavior: 'none',
    skyPreset: 'skymachine_day_clear',
    hdriPreset: 'forest_morning_hdri',
    lightingPreset: DAY_LIGHT,
    atmosphere: 'warm porch light',
    swarmEffects: ['none'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 190_000, maxMemoryMb: 1200 },
  }),
  recipe({
    recipeId: 'creek_clearing_day',
    displayName: 'Creek Clearing Day',
    biome: 'creek',
    timeOfDay: 'morning',
    requiredRoles: ['creek', 'rock', 'flower', 'tree_left', 'tree_right', 'sky', 'hdri'],
    optionalRoles: ['butterfly', 'path', 'grass'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: ['Flowers sit on the near bank, off the performance zone.'],
    midgroundRules: ['Creek crosses midground without flooding the stage.'],
    backgroundRules: ['Trees hold the far bank.'],
    pathRequirements: ['Optional bank path stays walkable and dry.'],
    buildingRequirements: [],
    vegetationDensity: 'medium',
    rockDensity: 'medium',
    waterBehavior: 'creek',
    skyPreset: 'skymachine_day_clear',
    hdriPreset: 'creek_morning_hdri',
    lightingPreset: DAY_LIGHT,
    atmosphere: 'bright water sparkle',
    swarmEffects: ['butterflies'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 210_000, maxMemoryMb: 1300 },
  }),
  recipe({
    recipeId: 'magical_clearing_night',
    displayName: 'Magical Clearing Night',
    biome: 'clearing',
    timeOfDay: 'night',
    requiredRoles: ['tree_left', 'tree_right', 'flower', 'firefly', 'sky', 'hdri'],
    optionalRoles: ['rock', 'grass', 'path'],
    stageDimensions: STAGE,
    characterPerformanceZone: CHARACTER_ZONE,
    cameraSafeZone: CAMERA_SAFE,
    foregroundRules: ['Keep the moonlit apron open for dialogue.'],
    midgroundRules: ['Soft flower clusters, no clutter around faces.'],
    backgroundRules: ['Trees silhouette against the night sky.'],
    pathRequirements: ['Optional faint path, still walkable.'],
    buildingRequirements: [],
    vegetationDensity: 'medium',
    rockDensity: 'sparse',
    waterBehavior: 'none',
    skyPreset: 'skymachine_night_clear',
    hdriPreset: 'clearing_night_hdri',
    lightingPreset: NIGHT_LIGHT,
    atmosphere: 'cool night mist',
    swarmEffects: ['fireflies'],
    textureTier: '2048',
    performanceBudget: { maxTriangles: 200_000, maxMemoryMb: 1200 },
  }),
];

export function parseRecipe(value: unknown): SceneryRecipe {
  const parsed = SceneryRecipeSchema.safeParse(value);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid scenery recipe. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_RECIPE',
    );
  }
  return parsed.data;
}

export function getRecipe(recipeId: RecipeId): SceneryRecipe {
  const found = SCENERY_RECIPES.find((item) => item.recipeId === recipeId);
  if (!found) {
    throw new SceneryError(`Unknown scenery recipe: ${recipeId}`, 'INVALID_RECIPE');
  }
  return found;
}

export function listRecipes(): SceneryRecipe[] {
  return SCENERY_RECIPES.map((item) => ({ ...item, requiredRoles: [...item.requiredRoles] }));
}

export function recipeRequiresRole(recipe: SceneryRecipe, role: SceneryRole): boolean {
  return recipe.requiredRoles.includes(role);
}

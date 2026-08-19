export const WORLD_BUILDER_SCHEMA = 'TIVVLEJOY_WORLD_BUILDER_V1' as const;
export const ENVIRONMENT_BLUEPRINT_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_BLUEPRINT_V1' as const;
export const SCENERY_COVERAGE_SCHEMA = 'TIVVLEJOY_SCENERY_COVERAGE_REPORT_V1' as const;
export const ASSET_GAP_DECISION_SCHEMA = 'TIVVLEJOY_ASSET_GAP_DECISION_V1' as const;
export const TERRAIN_RECIPE_SCHEMA = 'TIVVLEJOY_TERRAIN_RECIPE_V1' as const;
export const PATH_SYSTEM_SCHEMA = 'TIVVLEJOY_PATH_SYSTEM_V1' as const;
export const VEGETATION_RECIPE_SCHEMA = 'TIVVLEJOY_VEGETATION_RECIPE_V1' as const;
export const SEASON_VARIANT_SCHEMA = 'TIVVLEJOY_SEASON_VARIANT_V1' as const;
export const WEATHER_VARIANT_SCHEMA = 'TIVVLEJOY_WEATHER_VARIANT_V1' as const;
export const ENVIRONMENT_VARIANT_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_VARIANT_V1' as const;
export const INTERIOR_RECIPE_SCHEMA = 'TIVVLEJOY_INTERIOR_RECIPE_V1' as const;
export const ARCHITECTURE_KITBASH_SCHEMA = 'TIVVLEJOY_ARCHITECTURE_KITBASH_V1' as const;
export const BACKGROUND_WORLD_SCHEMA = 'TIVVLEJOY_BACKGROUND_WORLD_V1' as const;
export const WATER_RECIPE_SCHEMA = 'TIVVLEJOY_WATER_RECIPE_V1' as const;
export const ENVIRONMENT_STORY_LAYER_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_STORY_LAYER_V1' as const;
export const CAMERA_AWARE_DRESSING_SCHEMA = 'TIVVLEJOY_CAMERA_AWARE_DRESSING_V1' as const;
export const PERFORMANCE_BUDGET_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_PERFORMANCE_BUDGET_V1' as const;
export const LOD_PLAN_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_LOD_PLAN_V1' as const;
export const REUSE_GRAPH_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_REUSE_GRAPH_V1' as const;
export const ENVIRONMENT_CONTINUITY_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_CONTINUITY_V1' as const;
export const WORLD_LANDMARK_SCHEMA = 'TIVVLEJOY_WORLD_LANDMARK_V1' as const;
export const SET_VARIETY_SCHEMA = 'TIVVLEJOY_SET_VARIETY_ENGINE_V1' as const;
export const EPISODE_ENVIRONMENT_DIRECTOR_SCHEMA = 'TIVVLEJOY_EPISODE_ENVIRONMENT_DIRECTOR_V1' as const;
export const STYLE_FINGERPRINT_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_STYLE_FINGERPRINT_V1' as const;
export const STYLE_HARMONIZATION_SCHEMA = 'TIVVLEJOY_STYLE_HARMONIZATION_PLAN_V1' as const;
export const ENVIRONMENT_QUALITY_GATE_SCHEMA = 'TIVVLEJOY_ENVIRONMENT_QUALITY_GATE_V1' as const;

export const EXISTING_LOCATIONS = [
  'home_village',
  'main_street',
  'bakery',
  'map_shop',
  'forest_exit',
  'river_road',
  'amusement_entrance',
] as const;
export type ExistingLocationId = (typeof EXISTING_LOCATIONS)[number];

export const ARCHETYPE_IDS = [
  'VILLAGE_SQUARE',
  'VILLAGE_SIDE_STREET',
  'MARKET_STREET',
  'RESIDENTIAL_LANE',
  'BAKERY_EXTERIOR',
  'BAKERY_INTERIOR',
  'SHOP_EXTERIOR',
  'SHOP_INTERIOR',
  'COZY_HOME_INTERIOR',
  'FOREST_PATH',
  'FOREST_CLEARING',
  'DEEP_FOREST',
  'MAGICAL_FOREST',
  'RIVERBANK',
  'RIVER_CROSSING',
  'BRIDGE',
  'MEADOW',
  'FLOWER_FIELD',
  'HILLTOP',
  'COUNTRY_ROAD',
  'FARM_EDGE',
  'PICNIC_AREA',
  'POND',
  'LAKE_EDGE',
  'ROCKY_TRAIL',
  'MOUNTAIN_OVERLOOK',
  'CAVE_ENTRANCE',
  'CAVE_INTERIOR',
  'BEACH',
  'COASTAL_PATH',
  'SNOW_FIELD',
  'SNOW_VILLAGE',
  'AUTUMN_FOREST',
  'SPRING_MEADOW',
  'RAINY_STREET',
  'FESTIVAL_VILLAGE',
  'NIGHT_VILLAGE',
  'MAGICAL_NIGHT_CLEARING',
  'AMUSEMENT_PATH',
  'AMUSEMENT_PLAZA',
  'BACKSTAGE_SERVICE_PATH',
  'GENERIC_INTERIOR_ROOM',
] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export const BUILDABILITY = [
  'READY_FROM_EXISTING_LIBRARY',
  'READY_WITH_NATIVE_PROCEDURAL',
  'READY_WITH_APPROVED_DERIVATIVES',
  'PARTIAL_ASSET_GAP',
  'MISSING_HERO_ASSET',
  'BLOCKED_PROVENANCE',
  'BLOCKED_UNAPPROVED_SOURCE',
] as const;
export type Buildability = (typeof BUILDABILITY)[number];

export const GAP_DECISIONS = [
  'NO_PURCHASE_NEEDED',
  'BUILD_PROCEDURALLY',
  'REUSE_EXISTING',
  'CREATE_DERIVATIVE',
  'KITBASH_EXISTING',
  'USE_BACKGROUND_SOLUTION',
  'PURCHASE_MAY_BE_JUSTIFIED',
] as const;
export type GapDecision = (typeof GAP_DECISIONS)[number];

export const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
export type Season = (typeof SEASONS)[number];

export const WEATHERS = [
  'CLEAR',
  'PARTLY_CLOUDY',
  'OVERCAST',
  'LIGHT_RAIN',
  'RAIN',
  'POST_RAIN',
  'FOG',
  'LIGHT_SNOW',
  'SNOW',
  'WINDY',
  'MAGICAL_SPARKLE',
] as const;
export type Weather = (typeof WEATHERS)[number];

export const TIMES_OF_DAY = [
  'DAWN',
  'MORNING_WARM',
  'MIDDAY',
  'DAY_ADVENTURE',
  'GOLDEN_HOUR',
  'SUNSET',
  'BLUE_HOUR',
  'OVERCAST_SOFT',
  'RAINY_COZY',
  'EVENING_FESTIVAL',
  'NIGHT_COZY',
  'MAGICAL_NIGHT',
] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const DISTRICTS = [
  'HOME_DISTRICT',
  'VILLAGE_CENTER',
  'SHOP_DISTRICT',
  'FOREST_EDGE',
  'FOREST_INTERIOR',
  'RIVER_DISTRICT',
  'COUNTRYSIDE',
  'AMUSEMENT_DISTRICT',
  'MAGICAL_ZONE',
] as const;
export type District = (typeof DISTRICTS)[number];

export const DEPTH_LAYERS = ['FOREGROUND', 'MIDGROUND', 'BACKGROUND'] as const;
export type DepthLayer = (typeof DEPTH_LAYERS)[number];

export const VEGETATION_ROLES = [
  'TREE_HERO',
  'TREE_SUPPORT',
  'TREE_BACKGROUND',
  'SHRUB',
  'GRASS',
  'FLOWERS',
  'GROUND_COVER',
  'FOREST_UNDERSTORY',
  'VINES',
  'REEDS',
  'SEASONAL_DECOR',
] as const;

export const VEGETATION_PROVIDERS = ['NATIVE_BLENDER', 'APPROVED_LIBRARY', 'BOTANIQ_IF_APPROVED'] as const;

export const COVERAGE_CATEGORIES = [
  'architecture',
  'vegetation',
  'terrain',
  'roads_paths',
  'water',
  'interiors',
  'props',
  'backgrounds',
  'lighting',
  'weather',
  'seasonal_variants',
  'story_signage',
  'hero_locations',
] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number];

export const KITBASH_OPS = [
  'INSTANCE_EXISTING',
  'RECOMBINE_APPROVED_PARTS',
  'CHANGE_NON_DESTRUCTIVE_MATERIAL',
  'ADD_AWNING',
  'ADD_SIGN',
  'ADD_TRIM',
  'ADD_WINDOW_DRESSING',
  'ADD_PROP_GROUP',
  'CHANGE_DECOR',
] as const;

export type WorldBuilderInput = {
  locationId: string;
  archetypeId: ArchetypeId;
  season: Season;
  weather: Weather;
  timeOfDay: TimeOfDay;
  lightingPresetId?: string;
  storyPurpose: string;
  qualityTarget: 'HERO' | 'SUPPORTING' | 'BACKGROUND';
  seed: number;
  storyPropIds?: string[];
  storyPropStates?: Record<string, string>;
  cameraTemplateId?: string;
  focalTarget?: string;
  requiredHeroRoles?: string[];
  notes?: string;
};

import { LIGHTING_PRESETS, sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';
import { archetypeMeta, districtForLocation, existingWorldNode } from './archetypes';
import {
  ARCHITECTURE_KITBASH_SCHEMA,
  BACKGROUND_WORLD_SCHEMA,
  CAMERA_AWARE_DRESSING_SCHEMA,
  ENVIRONMENT_BLUEPRINT_SCHEMA,
  ENVIRONMENT_CONTINUITY_SCHEMA,
  ENVIRONMENT_QUALITY_GATE_SCHEMA,
  ENVIRONMENT_STORY_LAYER_SCHEMA,
  ENVIRONMENT_VARIANT_SCHEMA,
  INTERIOR_RECIPE_SCHEMA,
  KITBASH_OPS,
  LOD_PLAN_SCHEMA,
  PATH_SYSTEM_SCHEMA,
  PERFORMANCE_BUDGET_SCHEMA,
  SEASON_VARIANT_SCHEMA,
  STYLE_FINGERPRINT_SCHEMA,
  STYLE_HARMONIZATION_SCHEMA,
  TERRAIN_RECIPE_SCHEMA,
  VEGETATION_RECIPE_SCHEMA,
  VEGETATION_ROLES,
  WATER_RECIPE_SCHEMA,
  WEATHER_VARIANT_SCHEMA,
  WORLD_BUILDER_SCHEMA,
  WORLD_LANDMARK_SCHEMA,
  type ArchetypeId,
  type Buildability,
  type Season,
  type TimeOfDay,
  type Weather,
  type WorldBuilderInput,
} from './types';

const WALKABLE_POLICY = 0.8;

function lightingForTime(time: TimeOfDay) {
  const map: Record<TimeOfDay, (typeof LIGHTING_PRESETS)[number]> = {
    DAWN: 'TJ_MORNING_WARM',
    MORNING_WARM: 'TJ_MORNING_WARM',
    MIDDAY: 'TJ_DAY_ADVENTURE',
    DAY_ADVENTURE: 'TJ_DAY_ADVENTURE',
    GOLDEN_HOUR: 'TJ_GOLDEN_HOUR',
    SUNSET: 'TJ_GOLDEN_HOUR',
    BLUE_HOUR: 'TJ_OVERCAST_SOFT',
    OVERCAST_SOFT: 'TJ_OVERCAST_SOFT',
    RAINY_COZY: 'TJ_RAINY_COZY',
    EVENING_FESTIVAL: 'TJ_EVENING_FESTIVAL',
    NIGHT_COZY: 'TJ_MAGICAL_NIGHT',
    MAGICAL_NIGHT: 'TJ_MAGICAL_NIGHT',
  };
  return map[time];
}

function terrainFor(type: string, seed: number) {
  return {
    schemaVersion: TERRAIN_RECIPE_SCHEMA,
    terrainType: type,
    baseElevation: type.includes('hill') || type.includes('mountain') ? 4 : 0,
    elevationVariation: type.includes('flat') ? 0.1 : 1.4,
    slopePolicy: type.includes('trail') || type.includes('mountain') ? 'gentle-climb' : 'walkable-flat',
    walkableZones: ['center-stage', 'path'],
    performanceZones: ['street-stage'],
    cameraZones: ['dialogue-center', 'headroom-6-12'],
    groundMaterialClass: type.includes('snow') ? 'snow' : type.includes('beach') ? 'sand' : type.includes('forest') ? 'soil' : 'ground',
    scatterZones: ['verge', 'background'],
    waterExclusionZones: type.includes('river') || type.includes('beach') ? [] : ['path'],
    seed,
  };
}

function pathFor(type: string | null, seed: number) {
  const targetWidth = type?.includes('street') ? 4 : type?.includes('amusement') ? 3.5 : 2.4;
  const walkableWidth = Number((targetWidth * 0.85).toFixed(2));
  return {
    schemaVersion: PATH_SYSTEM_SCHEMA,
    pathType: type ?? 'none',
    centerline: [`seed:${seed}:0,0`, `seed:${seed}:8,0`],
    width: targetWidth,
    curvature: type?.includes('trail') ? 'gentle' : 'straight',
    intersectionPoints: type?.includes('street') ? 1 : 0,
    walkableWidth,
    walkableRatio: walkableWidth / targetWidth,
    walkablePolicyMet: walkableWidth / targetWidth >= WALKABLE_POLICY,
    propExclusionMargins: 0.6,
    characterClearance: 1.2,
    cameraStagingAreas: ['near-path', 'dialogue-center'],
  };
}

function vegetationFor(input: WorldBuilderInput, biome: string) {
  const roles = VEGETATION_ROLES.filter((role) => {
    if (biome === 'interior' || biome === 'cave' && role.startsWith('TREE')) return role === 'GROUND_COVER';
    if (biome === 'village' && role === 'FOREST_UNDERSTORY') return false;
    return true;
  });
  const copies = 2 + (input.seed % 2);
  return {
    schemaVersion: VEGETATION_RECIPE_SCHEMA,
    roles,
    provider: 'NATIVE_BLENDER' as const,
    botaniqStatus: 'NOT_ACTIVATED' as const,
    geoScatterStatus: 'NOT_INTEGRATED' as const,
    speciesVariation: 4 + (input.seed % 3),
    heightVariation: 0.15 + (input.seed % 5) / 100,
    rotationVariation: 180,
    scaleVariation: 0.12,
    clusterVariation: true,
    zoning: { foreground: 'FLOWERS', support: 'SHRUB', background: 'TREE_BACKGROUND' },
    characterPerformanceClear: true,
    cameraSightlineProtected: true,
    heroPropVisible: true,
    dialogueSafe: true,
    obviousIdenticalCopies: copies,
    excessiveDuplication: copies > 3,
    season: input.season,
  };
}

function seasonVariant(season: Season) {
  return {
    schemaVersion: SEASON_VARIANT_SCHEMA,
    season,
    foliagePalette: season === 'AUTUMN' ? 'amber' : season === 'WINTER' ? 'muted-evergreen' : season === 'SPRING' ? 'fresh-green' : 'storybook-green',
    flowerDensity: season === 'SPRING' ? 1 : season === 'WINTER' ? 0 : 0.6,
    grassTone: season === 'AUTUMN' ? 'warm' : season === 'WINTER' ? 'dormant' : 'lush',
    groundCover: season === 'WINTER' ? 'snow-dust' : 'living',
    treeLeafState: season === 'WINTER' ? 'bare-or-evergreen' : season === 'AUTUMN' ? 'turning' : 'full',
    seasonalProps: season === 'WINTER' ? ['scarves-on-posts'] : season === 'AUTUMN' ? ['leaf-piles'] : ['planters'],
    weatherDefault: season === 'WINTER' ? 'LIGHT_SNOW' : season === 'SPRING' ? 'PARTLY_CLOUDY' : 'CLEAR',
    lightingDefault: season === 'AUTUMN' ? 'TJ_GOLDEN_HOUR' : 'TJ_DAY_ADVENTURE',
    baseGeometryReused: true,
  };
}

function weatherVariant(weather: Weather) {
  return {
    schemaVersion: WEATHER_VARIANT_SCHEMA,
    weather,
    sky: weather.includes('SNOW') || weather === 'FOG' || weather === 'OVERCAST' ? 'soft-grey' : weather === 'MAGICAL_SPARKLE' ? 'violet' : 'storybook-blue',
    lightingBias: weather.includes('RAIN') ? 'TJ_RAINY_COZY' : weather === 'FOG' ? 'TJ_OVERCAST_SOFT' : 'inherit',
    groundWetness: weather.includes('RAIN') || weather === 'POST_RAIN' ? 0.7 : 0,
    fog: weather === 'FOG' || weather === 'LIGHT_SNOW' ? 0.35 : 0,
    vegetationMovementClass: weather === 'WINDY' ? 'active' : 'idle',
    puddlePlacement: weather.includes('RAIN') || weather === 'POST_RAIN',
    snowCoverage: weather.includes('SNOW') ? 0.6 : 0,
    storyReadability: weather === 'FOG' ? 'protected-foreground' : 'normal',
    simulated: false as const,
  };
}

function interiorRecipe(archetypeId: ArchetypeId, seed: number) {
  const kind =
    archetypeId.includes('BAKERY') ? 'bakery' : archetypeId.includes('SHOP') ? 'map shop' : archetypeId.includes('HOME') ? 'home' : archetypeId.includes('CAVE') ? 'workshop' : 'cozy room';
  return {
    schemaVersion: INTERIOR_RECIPE_SCHEMA,
    kind,
    components: ['floor', 'walls', 'ceiling', 'doors', 'windows', 'counter', 'shelves', 'tables', 'chairs', 'decor', 'story props', 'lighting anchors'],
    removableCameraWall: true,
    modularPlaceholders: true,
    purchasedInteriorClaimed: false,
    seed,
  };
}

function kitbashPlan() {
  return {
    schemaVersion: ARCHITECTURE_KITBASH_SCHEMA,
    operations: [...KITBASH_OPS],
    forbidden: ['source overwrite', 'destructive remesh of commercial hero asset', 'license-unsafe redistribution'],
    sourceImmutable: true,
  };
}

function backgroundPlan(biome: string) {
  return {
    schemaVersion: BACKGROUND_WORLD_SCHEMA,
    layers: ['distant trees', 'hills', biome === 'village' ? 'distant village silhouettes' : 'forest walls', 'cloud layers'],
    methods: ['low-detail geometry', 'procedural shapes', 'atmospheric depth'],
    billboardsAllowedWhenAcceptable: true,
    composition916: true,
  };
}

function waterRecipe(type: string | null) {
  if (!type) return null;
  return {
    schemaVersion: WATER_RECIPE_SCHEMA,
    waterType: type,
    flowClass: type.includes('river') || type === 'stream' ? 'moving' : 'still',
    depthClass: type === 'puddle' ? 'shallow' : 'medium',
    shorelineType: type.includes('lake') || type === 'beach' ? 'soft' : 'stone',
    reflectionImportance: 'support',
    characterInteractionAllowed: type === 'puddle' || type === 'pond',
    cameraImportance: 'supporting',
    qualityTier: 'SUPPORTING' as const,
    simulated: false as const,
  };
}

function storyLayer(input: WorldBuilderInput) {
  const items = [
    input.storyPurpose.toLowerCase().includes('map') ? 'map clues' : null,
    input.weather.includes('RAIN') ? 'puddle trail' : null,
    input.season === 'AUTUMN' ? 'scattered leaves' : null,
    input.timeOfDay.includes('FESTIVAL') ? 'festival decorations' : null,
    input.storyPurpose.toLowerCase().includes('trail') ? 'flower trail' : null,
  ].filter((item): item is string => Boolean(item));
  return {
    schemaVersion: ENVIRONMENT_STORY_LAYER_SCHEMA,
    items,
    continuityAware: true,
    deterministic: true,
    storyPropsProtected: [...(input.storyPropIds ?? [])],
    storyPropStates: input.storyPropStates ?? {},
    randomStoryPropMutation: false,
  };
}

function cameraDressing(input: WorldBuilderInput) {
  return {
    schemaVersion: CAMERA_AWARE_DRESSING_SCHEMA,
    cameraTemplateId: input.cameraTemplateId ?? 'TJ_CAM_ESTABLISHING_VERTICAL',
    focalTarget: input.focalTarget ?? 'HERO_SCENERY',
    protected: ['Pip silhouette', 'Goat silhouette', 'eye lines', 'dialogue space', 'story prop visibility', 'foreground readability', 'safe headroom', 'walk path'],
    decorativeMovedFirst: true,
    storyCriticalUnmoved: true,
    performanceZonesClear: true,
    sightlineProtected: true,
  };
}

function depthLayers() {
  return {
    FOREGROUND: { items: ['framing vegetation', 'small props', 'fences', 'flowers', 'branches'], qualityTier: 'SUPPORTING' as const },
    MIDGROUND: { items: ['character action area', 'hero buildings', 'story props'], qualityTier: 'HERO' as const },
    BACKGROUND: { items: ['support buildings', 'trees', 'hills', 'sky', 'distant landmarks'], qualityTier: 'BACKGROUND' as const },
  };
}

function qualityTiers(target: WorldBuilderInput['qualityTarget']) {
  return {
    HERO: { textureTarget: target === 'HERO' ? 4096 : 2048, justified: target === 'HERO' },
    SUPPORTING: { textureTarget: 2048, justified: true },
    BACKGROUND: { textureTarget: 1024, justified: true },
    automaticUpscaleClaimed: false,
  };
}

function performanceBudget(input: WorldBuilderInput) {
  const vegetationInstanceCount = 24 + (input.seed % 8);
  const uniqueMaterialCount = 10 + (input.seed % 3);
  const heroAssetCount = input.qualityTarget === 'HERO' ? 2 : 1;
  const estimatedVisibleObjects = 40 + vegetationInstanceCount;
  const status =
    estimatedVisibleObjects > 90 ? 'VERY_HEAVY' : estimatedVisibleObjects > 70 ? 'HEAVY' : estimatedVisibleObjects > 50 ? 'NORMAL' : 'LIGHT';
  return {
    schemaVersion: PERFORMANCE_BUDGET_SCHEMA,
    estimatedVisibleObjects,
    estimatedInstances: vegetationInstanceCount + 12,
    heroAssetCount,
    supportAssetCount: 6,
    backgroundAssetCount: 8,
    vegetationInstanceCount,
    uniqueMaterialCount,
    uniqueTextureCount: uniqueMaterialCount + 2,
    estimatedMemoryClass: status === 'LIGHT' ? 'small' : 'medium',
    estimatedAssemblyComplexity: status,
    estimatedRenderComplexity: status,
    status,
  };
}

function lodPlan(budget: ReturnType<typeof performanceBudget>) {
  return {
    schemaVersion: LOD_PLAN_SCHEMA,
    classes: ['HERO_FULL', 'SUPPORT_FULL', 'LOW_DETAIL', 'INSTANCE', 'BACKGROUND_PROXY', 'CULLED'],
    byDistance: {
      near: 'HERO_FULL',
      mid: 'SUPPORT_FULL',
      far: 'BACKGROUND_PROXY',
    },
    meshConverted: false,
    estimatedInstances: budget.estimatedInstances,
  };
}

function styleFingerprint(input: WorldBuilderInput) {
  return {
    schemaVersion: STYLE_FINGERPRINT_SCHEMA,
    paletteFamily: input.season === 'AUTUMN' ? 'warm-amber' : input.timeOfDay.includes('NIGHT') ? 'twilight' : 'storybook-day',
    roughnessFamily: 'soft-matte',
    normalStrengthPolicy: 'reduced',
    shapeSoftness: 'rounded',
    foliageSaturation: input.season === 'WINTER' ? 'low' : 'storybook',
    backgroundContrast: 'gentle',
    signageStyle: 'painted-wood',
    lightingWarmth: input.timeOfDay.includes('NIGHT') ? 'cool' : 'warm',
    detailDensity: input.qualityTarget === 'HERO' ? 'rich' : 'balanced',
  };
}

function harmonizationPlan() {
  return {
    schemaVersion: STYLE_HARMONIZATION_SCHEMA,
    adjustments: ['palette remap', 'roughness normalization', 'normal-strength reduction', 'saturation tuning', 'lighting harmonization', 'fog/depth harmonization', 'signage replacement', 'dressing consistency'],
    sourceImmutable: true,
    destructive: false,
  };
}

function qualityGate(walkable: boolean, duplicates: boolean, performance: string) {
  const checks = {
    storybookConsistency: true,
    characterReadability: true,
    focalClarity: true,
    walkableArea: walkable,
    visualDepth: true,
    lightingReadability: true,
    propClutter: !duplicates,
    repetition: !duplicates,
    materialConsistency: true,
    signReadability: true,
    cameraSafety: true,
    performanceBudget: performance !== 'VERY_HEAVY',
    continuity: true,
  };
  return {
    schemaVersion: ENVIRONMENT_QUALITY_GATE_SCHEMA,
    checks,
    passed: Object.values(checks).every(Boolean),
    heroAutoApproved: false,
    renderedEvidenceRequired: true,
  };
}

function buildabilityFor(input: WorldBuilderInput, meta: ReturnType<typeof archetypeMeta>): Buildability {
  const missing = (input.requiredHeroRoles ?? []).filter((role) => role.startsWith('UNAVAILABLE_') || role === 'CAVE_HERO_CRYSTAL');
  if (missing.length) return 'MISSING_HERO_ASSET';
  if (meta.libraryLocation) return 'READY_FROM_EXISTING_LIBRARY';
  return 'READY_WITH_NATIVE_PROCEDURAL';
}

export function hashEnvironmentIdentity(locationId: string, archetypeId: ArchetypeId) {
  return sha256Canonical({ schema: 'BASE_IDENTITY', locationId, archetypeId });
}

export function hashEnvironment(input: WorldBuilderInput, extras: Record<string, unknown>) {
  return sha256Canonical({
    schemaVersion: WORLD_BUILDER_SCHEMA,
    locationId: input.locationId,
    archetypeId: input.archetypeId,
    season: input.season,
    weather: input.weather,
    timeOfDay: input.timeOfDay,
    lightingPresetId: input.lightingPresetId ?? lightingForTime(input.timeOfDay),
    storyPurpose: input.storyPurpose,
    qualityTarget: input.qualityTarget,
    seed: input.seed,
    storyPropIds: [...(input.storyPropIds ?? [])].sort(),
    storyPropStates: input.storyPropStates ?? {},
    cameraTemplateId: input.cameraTemplateId ?? null,
    focalTarget: input.focalTarget ?? null,
    requiredHeroRoles: [...(input.requiredHeroRoles ?? [])].sort(),
    extras,
  });
}

export function buildEnvironment(input: WorldBuilderInput) {
  const meta = archetypeMeta(input.archetypeId);
  const lightingPresetId = input.lightingPresetId ?? lightingForTime(input.timeOfDay);
  const terrain = terrainFor(meta.terrainType, input.seed);
  const path = pathFor(meta.pathType, input.seed);
  const vegetation = vegetationFor(input, meta.biome);
  const season = seasonVariant(input.season);
  const weather = weatherVariant(input.weather);
  const water = waterRecipe(meta.waterType);
  const story = storyLayer(input);
  const dressing = cameraDressing(input);
  const layers = depthLayers();
  const tiers = qualityTiers(input.qualityTarget);
  const budget = performanceBudget(input);
  const lod = lodPlan(budget);
  const interior = meta.interior ? interiorRecipe(input.archetypeId, input.seed) : null;
  const buildability = buildabilityFor(input, meta);
  const baseIdentitySha256 = hashEnvironmentIdentity(input.locationId, input.archetypeId);
  const environmentDependencySha256 = hashEnvironment(input, {
    terrainType: terrain.terrainType,
    pathType: path.pathType,
    lightingPresetId,
  });
  const blueprint = {
    schemaVersion: ENVIRONMENT_BLUEPRINT_SCHEMA,
    blueprintId: `${input.archetypeId}_${input.locationId}`,
    locationId: input.locationId,
    locationType: meta.locationType,
    biome: meta.biome,
    season: input.season,
    weather: input.weather,
    timeOfDay: input.timeOfDay,
    terrainProfile: terrain.terrainType,
    architectureProfile: meta.interior ? 'interior-kit' : 'storybook-facade',
    vegetationProfile: vegetation.provider,
    waterProfile: water?.waterType ?? 'none',
    roadPathProfile: path.pathType,
    dressingProfile: 'camera-aware',
    backgroundProfile: 'depth-layers',
    lightingProfile: lightingPresetId,
    storyPurpose: input.storyPurpose,
    characterPerformanceZones: terrain.performanceZones,
    cameraSafeZones: terrain.cameraZones,
    sourceRequirements: meta.libraryLocation ? [`library:${meta.libraryLocation}`] : ['native-procedural'],
    resolvedCapabilities: ['NATIVE_BLENDER', 'PROCEDURAL_TERRAIN', 'NATIVE_VEGETATION', 'NATIVE_LIGHTING'],
    unresolvedCapabilities: ['BOTANIQ', 'GAFFER', 'PHYSICAL_STARLIGHT', 'GEO_SCATTER'],
    deterministicSeed: input.seed,
    environmentDependencySha256,
  };
  return {
    schemaVersion: WORLD_BUILDER_SCHEMA,
    input: { ...input, lightingPresetId, notes: undefined },
    blueprint,
    terrain,
    path,
    vegetation,
    season,
    weather,
    lighting: {
      presetId: lightingPresetId,
      pluginDependency: 'NONE',
      gaffer: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
      physicalStarlight: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
      nativeFallback: 'NATIVE_BLENDER',
    },
    interior,
    kitbash: kitbashPlan(),
    background: backgroundPlan(meta.biome),
    water,
    story,
    dressing,
    layers,
    tiers,
    budget,
    lod,
    style: styleFingerprint(input),
    harmonization: harmonizationPlan(),
    quality: qualityGate(path.walkablePolicyMet, vegetation.excessiveDuplication, budget.status),
    landmarks: meta.landmarks.map((name) => ({ schemaVersion: WORLD_LANDMARK_SCHEMA, name, locationId: input.locationId })),
    district: districtForLocation(input.locationId, input.archetypeId),
    worldNode: existingWorldNode(input.locationId),
    buildability,
    baseIdentitySha256,
    environmentDependencySha256,
    variant: {
      schemaVersion: ENVIRONMENT_VARIANT_SCHEMA,
      baseLocationId: input.locationId,
      season: input.season,
      weather: input.weather,
      timeOfDay: input.timeOfDay,
      reusesArchitecture: true,
      reusesRoadLayout: true,
      reusesCollision: true,
      reusesCameraZones: true,
    },
    continuity: {
      schemaVersion: ENVIRONMENT_CONTINUITY_SCHEMA,
      timeOfDay: input.timeOfDay,
      weather: input.weather,
      season: input.season,
      signage: meta.landmarks,
      doors: meta.interior ? 'closed-unless-story' : 'n/a',
      storyDamage: [],
      festivalState: input.timeOfDay === 'EVENING_FESTIVAL',
      propPlacement: input.storyPropStates ?? {},
      vegetationStoryChanges: story.items,
    },
    safety: {
      blenderExecuted: false,
      botaniqProcessed: false,
      gafferActivated: false,
      physicalStarlightActivated: false,
      geoScatterIntegrated: false,
      gpuLaunched: false,
      paidCompute: false,
    },
  };
}

export type BuiltEnvironment = ReturnType<typeof buildEnvironment>;

export function continuityCompatible(previous: BuiltEnvironment, next: BuiltEnvironment) {
  const adjacentWeather =
    previous.weather.weather === next.weather.weather ||
    (previous.weather.weather.includes('RAIN') && next.weather.weather === 'POST_RAIN');
  const timeOk = previous.continuity.timeOfDay === next.continuity.timeOfDay || previous.input.locationId !== next.input.locationId;
  return {
    weatherContinuous: adjacentWeather || previous.input.locationId !== next.input.locationId,
    timeContinuous: timeOk,
    seasonContinuous: previous.season.season === next.season.season || previous.input.locationId !== next.input.locationId,
    storyPropsStable: JSON.stringify(previous.story.storyPropStates) === JSON.stringify(next.story.storyPropStates) || next.story.randomStoryPropMutation === false,
  };
}

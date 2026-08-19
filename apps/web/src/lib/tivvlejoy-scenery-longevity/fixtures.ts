import { SELECTABLE_SYNTHETIC_ASSETS, SYNTHETIC_APPROVED_ASSETS, syntheticRegistry } from '@/lib/tivvlejoy-approved-asset-registry/synthetic-fixtures';
import { buildApprovedAssetRegistry } from '@/lib/tivvlejoy-approved-asset-registry/registry';
import { ARCHETYPE_IDS, EXISTING_LOCATIONS } from '@/lib/tivvlejoy-world-builder/types';
import { evaluateSceneryLongevity } from './evaluate';
import type { EpisodeUsageRecord, PlannedEpisodeRequirement, SceneryLongevityInput } from './types';

const TIVVLEJOY_LOCATIONS = [
  { locationId: 'home_village', archetypeId: 'VILLAGE_SQUARE' },
  { locationId: 'main_street', archetypeId: 'MARKET_STREET' },
  { locationId: 'bakery', archetypeId: 'BAKERY_EXTERIOR' },
  { locationId: 'map_shop', archetypeId: 'SHOP_EXTERIOR' },
  { locationId: 'forest_exit', archetypeId: 'FOREST_PATH' },
  { locationId: 'river_road', archetypeId: 'RIVERBANK' },
  { locationId: 'amusement_entrance', archetypeId: 'AMUSEMENT_PLAZA' },
] as const;

export function identicalBakeryHistory(count: number): EpisodeUsageRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    episodeId: `EP_IDENTICAL_${index + 1}`,
    locationId: 'bakery',
    archetypeId: 'BAKERY_EXTERIOR',
    season: 'SUMMER',
    weather: 'CLEAR',
    timeOfDay: 'MORNING_WARM',
    lightingFamily: 'DAY',
    heroAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
    supportingFamilies: ['CANON_SIGNAGE'],
    interiorShellId: null,
    backgroundFamily: 'VILLAGE_SKY',
    terrainFamily: 'STREET',
    pathFamily: 'COBBLE',
    dressingState: 'DEFAULT',
    originalFilename: 'bakery-hero.blend',
    displayLabel: `Bakery ${index + 1}`,
  }));
}

export function majorVariantBakeryHistory(): EpisodeUsageRecord[] {
  return [
    {
      episodeId: 'EP_BAKERY_MORNING',
      locationId: 'bakery',
      archetypeId: 'BAKERY_EXTERIOR',
      season: 'SUMMER',
      weather: 'CLEAR',
      timeOfDay: 'MORNING_WARM',
      heroAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
      backgroundFamily: 'VILLAGE_SKY',
      dressingState: 'DEFAULT',
    },
    {
      episodeId: 'EP_FOREST_RAIN',
      locationId: 'forest_exit',
      archetypeId: 'FOREST_PATH',
      season: 'AUTUMN',
      weather: 'RAIN',
      timeOfDay: 'OVERCAST_SOFT',
      heroAssetIds: ['AA_FOREST_HERO_TREE'],
      backgroundFamily: 'FOREST_CANOPY',
      dressingState: 'WET_LEAVES',
    },
    {
      episodeId: 'EP_MOUNTAIN_SUNSET',
      locationId: 'forest_exit',
      archetypeId: 'MOUNTAIN_OVERLOOK',
      season: 'SUMMER',
      weather: 'CLEAR',
      timeOfDay: 'SUNSET',
      heroAssetIds: ['AA_MOUNTAIN_HERO'],
      backgroundFamily: 'MOUNTAIN_RANGE',
      dressingState: 'GOLDEN',
    },
    {
      episodeId: 'EP_FESTIVAL',
      locationId: 'home_village',
      archetypeId: 'FESTIVAL_VILLAGE',
      season: 'SUMMER',
      weather: 'CLEAR',
      timeOfDay: 'EVENING_FESTIVAL',
      heroAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
      backgroundFamily: 'FESTIVAL_LIGHTS',
      dressingState: 'FESTIVAL',
    },
    {
      episodeId: 'EP_BAKERY_SNOW_NIGHT',
      locationId: 'bakery',
      archetypeId: 'BAKERY_EXTERIOR',
      season: 'WINTER',
      weather: 'SNOW',
      timeOfDay: 'NIGHT_COZY',
      heroAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
      backgroundFamily: 'SNOW_SKY',
      dressingState: 'SNOW_DECOR',
    },
  ];
}

export function mixedTivvleJoyHistory(count: number): EpisodeUsageRecord[] {
  const seasons = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
  const weathers = ['CLEAR', 'RAIN', 'SNOW', 'FOG'] as const;
  const times = ['MORNING_WARM', 'GOLDEN_HOUR', 'NIGHT_COZY', 'MAGICAL_NIGHT'] as const;
  return Array.from({ length: count }, (_, index) => {
    const place = TIVVLEJOY_LOCATIONS[index % TIVVLEJOY_LOCATIONS.length]!;
    return {
      episodeId: `EP_MIX_${index + 1}`,
      locationId: place.locationId,
      archetypeId: place.archetypeId,
      season: seasons[index % seasons.length]!,
      weather: weathers[index % weathers.length]!,
      timeOfDay: times[index % times.length]!,
      heroAssetIds: place.locationId === 'forest_exit' ? ['AA_FOREST_HERO_TREE'] : ['AA_VILLAGE_HERO_BUILDING'],
      backgroundFamily: place.locationId === 'river_road' ? 'RIVER_MIST' : place.locationId === 'forest_exit' ? 'FOREST_CANOPY' : 'VILLAGE_SKY',
      terrainFamily: place.locationId,
      pathFamily: place.locationId,
      dressingState: `${place.locationId}_${seasons[index % seasons.length]}`,
    };
  });
}

export function sameHeroVaryingBackgroundHistory(count: number): EpisodeUsageRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    episodeId: `EP_HERO_${index + 1}`,
    locationId: 'bakery',
    archetypeId: 'BAKERY_EXTERIOR',
    season: index % 2 === 0 ? 'SUMMER' : 'AUTUMN',
    weather: index % 2 === 0 ? 'CLEAR' : 'RAIN',
    timeOfDay: index % 2 === 0 ? 'MORNING_WARM' : 'GOLDEN_HOUR',
    heroAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
    supportingFamilies: ['CANON_FLOWERS', 'CANON_GRASS'],
    backgroundFamily: `BG_${index}`,
    dressingState: `PROPS_${index}`,
  }));
}

export function caveSpecialtyPlan(): PlannedEpisodeRequirement[] {
  return [
    {
      episodeId: 'EP_CAVE',
      locationId: 'forest_exit',
      archetypeId: 'CAVE_INTERIOR',
      requiredHeroRoles: ['CAVE_HERO_CRYSTAL'],
      storyPurpose: 'find the crystal chamber',
      nativeProceduralSufficient: false,
      derivativeSufficient: false,
      kitbashSufficient: false,
      backgroundSubstitutionSufficient: false,
      rewriteSufficient: false,
    },
  ];
}

export function defaultLongevityInput(overrides: Partial<SceneryLongevityInput> = {}): SceneryLongevityInput {
  return {
    requestedEpisodeCount: 60,
    worldBuilderLocations: EXISTING_LOCATIONS,
    worldBuilderArchetypes: ARCHETYPE_IDS,
    approvedAssetRegistry: syntheticRegistry(),
    episodeUsageHistory: mixedTivvleJoyHistory(12),
    plannedEpisodeRequirements: [],
    evidenceClass: 'SYNTHETIC_PREVIEW',
    recentWindowSize: 10,
    ...overrides,
  };
}

export function productionStyleLongevityInput(overrides: Partial<SceneryLongevityInput> = {}): SceneryLongevityInput {
  return defaultLongevityInput({
    evidenceClass: 'APPROVED_PRODUCTION_PLAN',
    episodeUsageHistory: mixedTivvleJoyHistory(20),
    plannedEpisodeRequirements: mixedTivvleJoyHistory(20).map((item) => ({
      episodeId: item.episodeId,
      locationId: item.locationId,
      archetypeId: item.archetypeId,
      requiredHeroRoles: item.locationId === 'bakery' ? ['BUILDING_HERO'] : [],
      storyPurpose: 'season plan',
    })),
    ...overrides,
  });
}

export function evaluateDefaultTarget(requestedEpisodeCount: number) {
  return evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount }));
}

export function selectableOnlyRegistry() {
  return buildApprovedAssetRegistry({ assets: SELECTABLE_SYNTHETIC_ASSETS });
}

export function futureInteriorAsset() {
  return SYNTHETIC_APPROVED_ASSETS.tavernShell;
}

export { TIVVLEJOY_LOCATIONS, SYNTHETIC_APPROVED_ASSETS, syntheticRegistry };

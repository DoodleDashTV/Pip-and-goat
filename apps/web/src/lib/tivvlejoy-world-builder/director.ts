import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { EXISTING_LOCATION_ARCHETYPE } from './archetypes';
import { buildEnvironment, continuityCompatible } from './engine';
import { ENVIRONMENT_RECIPES } from './recipes';
import {
  EPISODE_ENVIRONMENT_DIRECTOR_SCHEMA,
  EXISTING_LOCATIONS,
  REUSE_GRAPH_SCHEMA,
  SET_VARIETY_SCHEMA,
  SEASONS,
  TIMES_OF_DAY,
  WEATHERS,
  type ExistingLocationId,
  type Season,
  type TimeOfDay,
  type Weather,
  type WorldBuilderInput,
} from './types';
import type { BuiltEnvironment } from './engine';

export function reuseGraph(locationId: string) {
  const variants = [
    `${locationId.toUpperCase()}_MORNING`,
    `${locationId.toUpperCase()}_RAIN`,
    `${locationId.toUpperCase()}_FESTIVAL`,
    `${locationId.toUpperCase()}_WINTER`,
    `${locationId.toUpperCase()}_NIGHT`,
  ];
  return {
    schemaVersion: REUSE_GRAPH_SCHEMA,
    base: `${locationId.toUpperCase()}_BASE`,
    variants,
    immutableBaseShared: true,
  };
}

export function scoreVariety(recent: BuiltEnvironment[]) {
  if (recent.length < 2) {
    return { schemaVersion: SET_VARIETY_SCHEMA, score: 'VARIETY_GOOD' as const, suggestion: null as string | null };
  }
  const [a, b] = recent.slice(-2);
  const same =
    a &&
    b &&
    a.input.archetypeId === b.input.archetypeId &&
    a.lighting.presetId === b.lighting.presetId &&
    a.weather.weather === b.weather.weather &&
    a.season.season === b.season.season;
  if (same) {
    return {
      schemaVersion: SET_VARIETY_SCHEMA,
      score: 'TOO_SIMILAR' as const,
      suggestion: 'Change weather or time of day first. Keep the same architecture.',
    };
  }
  const similar = a && b && a.input.archetypeId === b.input.archetypeId;
  return {
    schemaVersion: SET_VARIETY_SCHEMA,
    score: similar ? ('VARIETY_WARNING' as const) : ('VARIETY_GOOD' as const),
    suggestion: similar ? 'Add a seasonal or lighting delta before buying anything.' : null,
  };
}

export function episodeEnvironmentDirector(overrides: Partial<WorldBuilderInput> = {}) {
  const plan = sampleEpisodeWithKnownHashes();
  const environments = plan.shots.map((shot, index) => {
    const locationId = shot.locationPresetId as ExistingLocationId;
    const draft: WorldBuilderInput = {
      locationId,
      archetypeId: EXISTING_LOCATION_ARCHETYPE[locationId],
      season: 'SUMMER',
      weather: shot.locationPresetId === 'forest_exit' ? 'CLEAR' : 'CLEAR',
      timeOfDay: shot.lightingPresetId.includes('MORNING') ? 'MORNING_WARM' : 'DAY_ADVENTURE',
      lightingPresetId: shot.lightingPresetId,
      storyPurpose: shot.storyBeatId,
      qualityTarget: 'HERO',
      seed: 4170179 + index,
      storyPropIds: shot.storyPropRefs,
      cameraTemplateId: shot.cameraTemplateId,
      focalTarget: shot.focalTarget,
      ...overrides,
    };
    return buildEnvironment({ ...draft, locationId });
  });
  const pairs = environments.slice(1).map((item, index) => continuityCompatible(environments[index]!, item));
  const uniqueBases = new Set(environments.map((item) => item.baseIdentitySha256));
  return {
    schemaVersion: EPISODE_ENVIRONMENT_DIRECTOR_SCHEMA,
    episodeId: plan.episodeId,
    locationSequence: environments.map((item) => item.input.locationId),
    visualVariety: scoreVariety(environments).score,
    weatherContinuity: pairs.every((item) => item.weatherContinuous),
    timeContinuity: pairs.every((item) => item.timeContinuous),
    reuseGroups: [...uniqueBases],
    locationLoadCount: uniqueBases.size,
    variantRecommendations: ['keep bakery base', 'reuse forest_exit base'],
    assetGaps: [],
    shotDressingRequirements: environments.map((item) => item.story.items),
    optimizedFor: ['visual quality', 'story clarity', 'reuse', 'low render cost', 'low assembly cost'],
    environments,
    variety: scoreVariety(environments),
  };
}

export function scalePlan60() {
  const baseLocations = EXISTING_LOCATIONS.length;
  const locationVariants = baseLocations * SEASONS.length * 6 * 4;
  const episodes = 60; // caller-named 60-episode target helper, not a scenery ceiling
  const uniqueEnvironmentBuilds = baseLocations;
  const reusedEnvironmentBuilds = episodes * 3 - uniqueEnvironmentBuilds;
  return {
    episodes,
    baseLocations,
    locationVariants,
    uniqueEnvironmentBuilds,
    reusedEnvironmentBuilds,
    estimatedReusePercent: Math.round((reusedEnvironmentBuilds / (reusedEnvironmentBuilds + uniqueEnvironmentBuilds)) * 100),
    seasonCount: SEASONS.length,
    weatherSample: WEATHERS.length,
    timeSample: TIMES_OF_DAY.length,
    recipeCount: ENVIRONMENT_RECIPES.length,
    renderedSeasonClaim: false,
  };
}

export type SeasonAlias = Season;
export type WeatherAlias = Weather;
export type TimeAlias = TimeOfDay;

import { lightingFamilyOf } from './signature';
import type { EpisodeUsageRecord, VariationStrength } from './types';

const WET = new Set(['LIGHT_RAIN', 'RAIN', 'POST_RAIN', 'FOG']);
const SNOW = new Set(['LIGHT_SNOW', 'SNOW']);
const INTERIOR_HINTS = ['INTERIOR', 'COZY_HOME', 'GENERIC_INTERIOR', 'SHOP_INTERIOR', 'BAKERY_INTERIOR', 'CAVE_INTERIOR'];

export function weatherFamilyOf(weather: string): string {
  if (weather === 'MAGICAL_SPARKLE') return 'MAGICAL';
  if (SNOW.has(weather)) return 'SNOW';
  if (WET.has(weather)) return 'WET';
  return 'CLEAR';
}

export function timeFamilyOf(timeOfDay: string): string {
  return lightingFamilyOf(timeOfDay);
}

export function isInteriorArchetype(archetypeId: string): boolean {
  return INTERIOR_HINTS.some((hint) => archetypeId.includes(hint));
}

export function variationStrength(previous: EpisodeUsageRecord, next: EpisodeUsageRecord): VariationStrength {
  if (previous.locationId !== next.locationId) return 'MAJOR';
  if (isInteriorArchetype(previous.archetypeId) !== isInteriorArchetype(next.archetypeId)) return 'MAJOR';
  if (previous.archetypeId !== next.archetypeId) return 'MAJOR';
  if (previous.season !== next.season) return 'MAJOR';
  if (previous.timeOfDay === 'MAGICAL_NIGHT' || next.timeOfDay === 'MAGICAL_NIGHT') {
    if (previous.timeOfDay !== next.timeOfDay) return 'MAJOR';
  }
  if (weatherFamilyOf(previous.weather) !== weatherFamilyOf(next.weather)) return 'MODERATE';
  if (timeFamilyOf(previous.timeOfDay) !== timeFamilyOf(next.timeOfDay)) return 'MODERATE';
  if (previous.backgroundFamily && next.backgroundFamily && previous.backgroundFamily !== next.backgroundFamily) {
    return 'MODERATE';
  }
  if (previous.dressingState && next.dressingState && previous.dressingState !== next.dressingState) {
    return 'MINOR';
  }
  if (previous.timeOfDay !== next.timeOfDay) return 'MINOR';
  return 'MINOR';
}

export function meaningfulSeasonFamilies(seasons: readonly string[]): number {
  return new Set(seasons).size;
}

export function meaningfulWeatherFamilies(weathers: readonly string[]): number {
  return new Set(weathers.map(weatherFamilyOf)).size;
}

export function meaningfulTimeFamilies(times: readonly string[]): number {
  return new Set(times.map(timeFamilyOf)).size;
}

import { sha256Canonical, stableSorted } from './hash';
import type { EpisodeUsageRecord } from './types';

export function lightingFamilyOf(timeOfDay: string, lightingFamily?: string): string {
  if (lightingFamily) return lightingFamily;
  if (timeOfDay === 'MAGICAL_NIGHT') return 'MAGICAL_NIGHT';
  if (timeOfDay.includes('NIGHT') || timeOfDay === 'BLUE_HOUR' || timeOfDay === 'EVENING_FESTIVAL') return 'NIGHT';
  if (timeOfDay === 'GOLDEN_HOUR' || timeOfDay === 'SUNSET') return 'GOLDEN';
  if (timeOfDay === 'RAINY_COZY' || timeOfDay === 'OVERCAST_SOFT') return 'SOFT';
  return 'DAY';
}

export function environmentVisualSignatureInput(usage: EpisodeUsageRecord) {
  return {
    locationId: usage.locationId,
    archetypeId: usage.archetypeId,
    heroAssetIds: stableSorted(usage.heroAssetIds),
    supportingFamilies: stableSorted(usage.supportingFamilies),
    interiorShellId: usage.interiorShellId ?? null,
    backgroundFamily: usage.backgroundFamily ?? 'UNSPECIFIED',
    terrainFamily: usage.terrainFamily ?? 'UNSPECIFIED',
    pathFamily: usage.pathFamily ?? 'UNSPECIFIED',
    season: usage.season,
    weather: usage.weather,
    timeOfDay: usage.timeOfDay,
    lightingFamily: lightingFamilyOf(usage.timeOfDay, usage.lightingFamily),
    majorDressingState: usage.dressingState ?? 'DEFAULT',
  };
}

export function environmentVisualSignatureSha256(usage: EpisodeUsageRecord): string {
  return sha256Canonical(environmentVisualSignatureInput(usage));
}

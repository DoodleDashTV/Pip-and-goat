import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';
import type { BuiltEnvironment } from './engine';

export function shotAssemblyEnvironmentAdapter(env: BuiltEnvironment) {
  const slots = env.vegetation.roles.map((role, index) => ({
    slotId: `${env.input.archetypeId}_${role}`,
    semanticRole: role,
    qualityTier: index === 0 ? 'HERO' : index < 3 ? 'SUPPORTING' : 'BACKGROUND',
    providerPreference: 'NATIVE_BLENDER',
    sourceReceiptRef: 'UNRESOLVED',
  }));
  return {
    locationInstanceId: `LOC_${env.input.locationId}_${env.input.archetypeId}`,
    environmentDependencySha256: env.environmentDependencySha256,
    environmentAssetSlots: slots,
    terrainRecipe: env.terrain,
    vegetationRecipe: env.vegetation,
    lightingBinding: env.lighting,
    dressingDelta: {
      season: env.season.season,
      weather: env.weather.weather,
      storyItems: env.story.items,
      storyPropsProtected: env.story.storyPropsProtected,
    },
    backgroundPlan: env.background,
    LODPlan: env.lod,
    adapterHash: sha256Canonical({
      locationInstanceId: `LOC_${env.input.locationId}_${env.input.archetypeId}`,
      environmentDependencySha256: env.environmentDependencySha256,
      lighting: env.lighting.presetId,
      season: env.season.season,
      weather: env.weather.weather,
    }),
    materialized: false,
  };
}

export function environmentChangeImpact(
  previous: BuiltEnvironment,
  next: BuiltEnvironment,
  shots: Array<{ shotId: string; locationId: string; season?: string; weather?: string }>,
) {
  const baseChanged = previous.baseIdentitySha256 !== next.baseIdentitySha256;
  const dressingChanged = previous.environmentDependencySha256 !== next.environmentDependencySha256;
  const affected = shots.filter((shot) => {
    if (baseChanged) return shot.locationId === next.input.locationId;
    if (!dressingChanged) return false;
    if (previous.input.locationId !== next.input.locationId) return shot.locationId === next.input.locationId;
    if (previous.season.season !== next.season.season) return shot.locationId === next.input.locationId && shot.season === next.season.season;
    if (previous.weather.weather !== next.weather.weather) return shot.locationId === next.input.locationId && (shot.weather ?? next.weather.weather) === next.weather.weather;
    return shot.locationId === next.input.locationId;
  });
  return {
    affectedShotIds: affected.map((item) => item.shotId),
    baseChanged,
    dressingChanged,
  };
}

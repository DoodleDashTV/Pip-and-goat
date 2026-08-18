import { SceneryError } from '../types';
import type { TextureTier } from '../types';

export const TEXTURE_TIER_ROLES = {
  '1024': 'preview_distant',
  '2048': 'standard_final',
  '4096': 'hero_closeup',
} as const;

export function selectMaterializedTextureTier(selected: TextureTier, available: TextureTier[]): TextureTier {
  if (!available.includes(selected)) {
    throw new SceneryError(`Texture tier ${selected} is not available to materialize.`, 'TEXTURE_TIER_UNAVAILABLE');
  }
  return selected;
}

export function assertSingleTextureTierMaterialized(materialized: TextureTier[]): TextureTier {
  const unique = [...new Set(materialized)];
  if (unique.length !== 1) {
    throw new SceneryError(
      'Ordinary scene assembly may materialize only one texture tier. Do not preload 1024, 2048, and 4096 together.',
      'TEXTURE_TIER_PRELOAD_REFUSED',
    );
  }
  return unique[0]!;
}

import { normalizeInventoryFilename } from './inventory';

/**
 * Giveaway_World Shaders.zip is one of the confirmed 14 official downloads.
 * Unofficial lookalikes still go through normal unexpected-filename review.
 */
const WORLD_SHADERS_MARKERS = ['world shaders', 'world-shaders', 'world_shaders', 'worldshader'];

export function looksLikeWorldShadersGiveaway(filename: string): boolean {
  const normalized = normalizeInventoryFilename(filename);
  return WORLD_SHADERS_MARKERS.some((marker) =>
    normalized.includes(marker.replace(/[\s_-]+/g, ' ')),
  );
}

export function shouldExcludeWorldShadersGiveaway(input: {
  filename: string;
  approvedManifestFilenames?: readonly string[];
}): boolean {
  void input;
  return false;
}

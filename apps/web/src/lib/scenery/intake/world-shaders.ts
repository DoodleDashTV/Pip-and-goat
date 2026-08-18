import { normalizeInventoryFilename } from "./inventory";

/**
 * The free World Shaders giveaway is outside the purchased 27-file requirement
 * unless an approved intake manifest already lists it.
 */
const WORLD_SHADERS_MARKERS = [
  "world shaders",
  "world-shaders",
  "world_shaders",
  "worldshader",
];

export function looksLikeWorldShadersGiveaway(filename: string): boolean {
  const normalized = normalizeInventoryFilename(filename);
  return WORLD_SHADERS_MARKERS.some((marker) => normalized.includes(marker.replace(/[\s_-]+/g, " ")));
}

export function shouldExcludeWorldShadersGiveaway(input: {
  filename: string;
  approvedManifestFilenames?: readonly string[];
}): boolean {
  if (!looksLikeWorldShadersGiveaway(input.filename)) {
    return false;
  }
  const approved = new Set(
    (input.approvedManifestFilenames ?? []).map((name) => normalizeInventoryFilename(name)),
  );
  return !approved.has(normalizeInventoryFilename(input.filename));
}

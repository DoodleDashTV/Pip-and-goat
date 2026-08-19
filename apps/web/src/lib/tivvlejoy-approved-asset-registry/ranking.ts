import { RESOLVER_VERSION, sha256Canonical } from './hash';
import { qualitySatisfies } from './mapping';
import type { ApprovedEnvironmentAsset, AssetResolutionRequest, RankTuple } from './types';

export function requestSemanticSha256(request: Pick<AssetResolutionRequest, 'semanticRole' | 'archetypeId' | 'biome' | 'depth' | 'qualityTier' | 'season' | 'weather' | 'styleRequirement'>): string {
  return sha256Canonical({
    semanticRole: request.semanticRole === 'SHRUB' ? 'SHRUBS' : request.semanticRole,
    archetypeId: request.archetypeId,
    biome: request.biome,
    depth: request.depth,
    qualityTier: request.qualityTier,
    season: request.season,
    weather: request.weather,
    styleRequirement: request.styleRequirement,
  });
}

export function tieBreakSha256(input: {
  requestSemanticSha256: string;
  seed: number;
  assetId: string;
  assetVersion: string;
}): string {
  return sha256Canonical({
    resolverVersion: RESOLVER_VERSION,
    requestSemanticSha256: input.requestSemanticSha256,
    seed: input.seed,
    assetId: input.assetId,
    assetVersion: input.assetVersion,
  });
}

export function compareRank(a: RankTuple, b: RankTuple): number {
  for (let index = 0; index < 10; index += 1) {
    const left = a[index] as number;
    const right = b[index] as number;
    if (left !== right) return left - right;
  }
  return a[10].localeCompare(b[10]);
}

export function rankCandidate(
  asset: ApprovedEnvironmentAsset,
  request: AssetResolutionRequest,
  requestSemanticHash: string,
): RankTuple {
  const continuity = request.continuityAssetId === asset.assetId ? 0 : 1;
  const canonical = asset.canonicalState === 'PRIMARY' ? 0 : 1;
  const archetype = asset.archetypeCompatibility.includes(request.archetypeId)
    ? 0
    : asset.archetypeCompatibility.some((item) => item === 'GENERIC' || item.startsWith(request.archetypeId.split('_')[0] ?? ''))
      ? 1
      : 2;
  const biome = asset.biomeTags.includes(request.biome) ? 0 : 1;
  const depth = asset.depthEligibility.includes(request.depth) ? 0 : 1;
  const quality = asset.qualityEligibility.includes(request.qualityTier) ? 0 : qualitySatisfies(asset.qualityEligibility, request.qualityTier) ? 1 : 2;
  const style = asset.styleCompatibility === 'EXACT' ? 0 : 1;
  const season = asset.seasonCompatibility.includes('ANY') || asset.seasonCompatibility.includes(request.season) ? 0 : 1;
  const weather = asset.weatherCompatibility.includes('ANY') || asset.weatherCompatibility.includes(request.weather as 'CLEAR') ? 0 : 1;
  const complexity = request.depth === 'BACKGROUND' || request.qualityTier === 'BACKGROUND' ? asset.complexityClass : asset.complexityClass;
  const tie = tieBreakSha256({
    requestSemanticSha256: requestSemanticHash,
    seed: request.seed,
    assetId: asset.assetId,
    assetVersion: asset.assetVersion,
  });
  return [continuity, canonical, archetype, biome, depth, quality, style, season, weather, complexity, tie];
}

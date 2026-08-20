import { simulateSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import type { ProductionLibrary } from './library';

export type SeasonCoverageReport = {
  environmentSlotsRequested: number;
  approvedSlotsResolved: number;
  nativeProceduralSlots: number;
  unresolvedSlots: number;
  heroShortages: number;
  interiorShortages: number;
  backgroundShortages: number;
  specialtyGaps: string[];
  syntheticFixtureResultsAreNotRealLibraryCoverage: true;
};

export function simulateApprovedLibraryCoverage(input: {
  library: ProductionLibrary;
  episodeCount?: number;
}): SeasonCoverageReport {
  const season = simulateSeason({ episodeCount: input.episodeCount ?? 60, shotsPerEpisode: 12 });
  let requested = 0;
  let resolved = 0;
  let native = 0;
  let unresolved = 0;
  let heroShortages = 0;
  let interiorShortages = 0;
  let backgroundShortages = 0;
  const specialty = new Set<string>();
  for (const episode of season.episodes) {
    for (const shot of episode.shots) {
      requested += 1;
      const role =
        shot.locationId.includes('forest')
          ? 'TREE_HERO'
          : shot.locationId.includes('river')
            ? 'WATER'
            : shot.locationId.includes('mountain') || shot.locationId.includes('overlook')
              ? 'MOUNTAIN_BACKGROUND'
              : 'BUILDING_HERO';
      const approved = input.library.records.some(
        (item) => item.worldBuilderEligible && item.approvalSha256 && item.semanticRoles.includes(role as never),
      );
      if (approved) resolved += 1;
      else if (role === 'WATER' || role === 'TREE_HERO') native += 1;
      else unresolved += 1;
      if (!approved && role.endsWith('_HERO')) heroShortages += 1;
      if (shot.locationId.includes('bakery') || shot.locationId.includes('shop')) interiorShortages += 1;
      if (!approved && role === 'MOUNTAIN_BACKGROUND') backgroundShortages += 1;
      if (shot.locationId.includes('amusement')) specialty.add('AMUSEMENT_RIDE_HERO');
    }
  }
  return {
    environmentSlotsRequested: requested,
    approvedSlotsResolved: resolved,
    nativeProceduralSlots: native,
    unresolvedSlots: unresolved,
    heroShortages,
    interiorShortages,
    backgroundShortages,
    specialtyGaps: [...specialty],
    syntheticFixtureResultsAreNotRealLibraryCoverage: true,
  };
}

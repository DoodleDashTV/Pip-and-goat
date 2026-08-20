import { sha256Canonical } from './hash';
import { PACE_PROFILES, SHOWRUNNER_SCHEMA, type PaceProfile } from './types';

export type EpisodeCreativeIntent = {
  schemaVersion: typeof SHOWRUNNER_SCHEMA;
  episodeId: string;
  seasonId: string;
  episodeNumber: number;
  episodeGoal: string;
  storyProblem: string;
  openingHook: string;
  mainQuestion: string;
  emotionalArc: string;
  comedyGoal: string;
  adventureGoal: string;
  discoveryGoal: string;
  characterGrowthGoal: string;
  PipGoal: string;
  GoatGoal: string;
  primaryLocationPurpose: string;
  secondaryLocationPurpose: string;
  heroPropPurpose: string;
  openingImageIntent: string;
  midpointIntent: string;
  climaxIntent: string;
  endingButtonIntent: string;
  callForward: string | null;
  callback: string | null;
  paceProfile: PaceProfile;
  energyProfile: 'LOW' | 'MEDIUM' | 'HIGH';
  dialogueDensityTarget: 'SPARSE' | 'BALANCED' | 'DENSE';
  visualNoveltyTarget: 'FAMILIAR' | 'MIXED' | 'NOVEL';
  synthetic: true;
  episodeCreativeIntentSha256: string;
};

const GOALS = [
  'Find a missing bakery delivery',
  'Help a neighbor read a weatherworn map',
  'Follow a trail of bells into the woods',
  'Return a borrowed scarf before festival lights',
  'Discover why the river path is quieter today',
] as const;

export function paceForEpisode(episodeNumber: number): PaceProfile {
  return PACE_PROFILES[(episodeNumber - 1) % PACE_PROFILES.length]!;
}

export function buildEpisodeCreativeIntent(input: {
  episodeId: string;
  seasonId?: string;
  episodeNumber: number;
  primaryLocation?: string;
  secondaryLocation?: string;
  heroProp?: string;
}): EpisodeCreativeIntent {
  const seasonId = input.seasonId ?? 'S01';
  const goal = GOALS[(input.episodeNumber - 1) % GOALS.length]!;
  const paceProfile = paceForEpisode(input.episodeNumber);
  const energyProfile = paceProfile === 'CALM_DISCOVERY' || paceProfile === 'EMOTIONAL_HOLD' ? 'LOW' : paceProfile === 'FAST_COMEDY' || paceProfile === 'ACTION_BURST' ? 'HIGH' : 'MEDIUM';
  const body = {
    schemaVersion: SHOWRUNNER_SCHEMA,
    episodeId: input.episodeId,
    seasonId,
    episodeNumber: input.episodeNumber,
    episodeGoal: goal,
    storyProblem: `Pip and Goat cannot finish "${goal.toLowerCase()}" until they understand the next clue.`,
    openingHook: `An unexpected detail appears before the pair leave ${input.primaryLocation ?? 'the village'}.`,
    mainQuestion: `Can Pip and Goat solve the problem without rushing past what the place is trying to show them?`,
    emotionalArc: 'curious-warm-relieved',
    comedyGoal: 'Gentle mix-up, never mean-spirited.',
    adventureGoal: 'A short walk that still feels like a journey.',
    discoveryGoal: 'One new readable fact about the world.',
    characterGrowthGoal: 'Pip notices; Goat steadies.',
    PipGoal: 'Notice the clue and share it clearly.',
    GoatGoal: 'Keep the pair moving without discarding the clue.',
    primaryLocationPurpose: `Establish ${input.primaryLocation ?? 'home'} as a safe starting world.`,
    secondaryLocationPurpose: `Use ${input.secondaryLocation ?? 'the path'} to change what the pair know.`,
    heroPropPurpose: `Make ${input.heroProp ?? 'the map'} readable at the decision beat.`,
    openingImageIntent: 'A vertical location portrait before faces.',
    midpointIntent: 'The clue is confirmed, not solved.',
    climaxIntent: 'A shared reaction to the revealed fact.',
    endingButtonIntent: 'A short hold that lets the discovery land.',
    callForward: input.episodeNumber < 60 ? `EP${String(input.episodeNumber + 1).padStart(3, '0')} may reuse the discovered fact.` : null,
    callback: input.episodeNumber > 1 ? `A quiet nod to EP${String(input.episodeNumber - 1).padStart(3, '0')}.` : null,
    paceProfile,
    energyProfile,
    dialogueDensityTarget: energyProfile === 'HIGH' ? 'DENSE' : energyProfile === 'LOW' ? 'SPARSE' : 'BALANCED',
    visualNoveltyTarget: input.episodeNumber % 5 === 0 ? 'NOVEL' : input.episodeNumber % 3 === 0 ? 'MIXED' : 'FAMILIAR',
    synthetic: true as const,
  };
  return { ...body, episodeCreativeIntentSha256: sha256Canonical(body) };
}

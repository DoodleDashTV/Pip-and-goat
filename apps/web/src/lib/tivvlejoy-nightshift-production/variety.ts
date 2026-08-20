import { sha256Canonical } from './hash';
import { EPISODE_VARIETY_SCHEMA, SEASON_BIBLE_SCHEMA, type ShotIntent } from './types';
import type { EpisodeDirectorPackage } from './specs';

export type SeasonBible = {
  schemaVersion: typeof SEASON_BIBLE_SCHEMA;
  locations: string[];
  recurringProps: string[];
  pipTraits: string[];
  goatTraits: string[];
  relationships: string[];
  ongoingMysteries: string[];
  mapState: string;
  knownInformation: string[];
  locationDiscoveries: string[];
  recurringJokes: string[];
  visualMotifs: string[];
  authoritativeCanonInvented: false;
  bibleSha256: string;
};

export type EpisodeKnowledge = {
  episodeId: string;
  pipKnows: string[];
  goatKnows: string[];
  audienceKnows: string[];
  hidden: string[];
};

export type VarietyReport = {
  schemaVersion: typeof EPISODE_VARIETY_SCHEMA;
  cameraVariety: number;
  shotSizeDistribution: Record<string, number>;
  cameraMotionDistribution: Record<string, number>;
  locationRepetitionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  storyStructureRepetitionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  audioDensity: number;
  captionWarnings: number;
  continuityWarnings: number;
  fingerprints: string[];
  similarPairs: Array<{ left: string; right: string; score: number }>;
  reportSha256: string;
};

export function buildSeasonBible(locations: string[]): SeasonBible {
  const body = {
    schemaVersion: SEASON_BIBLE_SCHEMA,
    locations: [...new Set(locations)].sort(),
    recurringProps: ['map', 'scarf', 'backpack'],
    pipTraits: ['notices small details', 'asks the next question'],
    goatTraits: ['steadies the pair', 'waits before answering'],
    relationships: ['Pip and Goat travel together'],
    ongoingMysteries: ['What the map is trying to show'],
    mapState: 'partially readable',
    knownInformation: ['The village is home'],
    locationDiscoveries: [],
    recurringJokes: ['Goat waits one extra beat'],
    visualMotifs: ['warm bakery light', 'vertical path'],
    authoritativeCanonInvented: false as const,
  };
  return { ...body, bibleSha256: sha256Canonical(body) };
}

export function knowledgeAfter(packages: EpisodeDirectorPackage[]): EpisodeKnowledge[] {
  const known: string[] = [];
  return packages
    .slice()
    .sort((left, right) => left.episodeId.localeCompare(right.episodeId))
    .map((pack) => {
      const discovery = pack.intent.discoveryGoal;
      const hidden = pack.intent.callForward ? [pack.intent.callForward] : [];
      const row = {
        episodeId: pack.episodeId,
        pipKnows: [...known, discovery],
        goatKnows: [...known, discovery],
        audienceKnows: [...known, discovery],
        hidden,
      };
      known.push(discovery);
      return row;
    });
}

export function episodeFingerprint(pack: EpisodeDirectorPackage): string {
  const cameras = pack.finalShotSpecs.map((spec) => spec.cameraSha256.slice(0, 8));
  const beats = pack.beats.map((beat) => beat.beatType);
  const locations = pack.beats.map((beat) => beat.location);
  const durations = pack.timings.map((item) => Math.round(item.durationFrames / 15));
  const music = pack.music.map((item) => item.role);
  return sha256Canonical({ cameras, beats, locations, durations, music, focus: pack.intent.PipGoal });
}

export function evaluateVariety(packages: EpisodeDirectorPackage[]): VarietyReport {
  const shotSizeDistribution: Record<string, number> = {};
  const cameraMotionDistribution: Record<string, number> = {};
  const locationRuns: string[] = [];
  for (const pack of packages) {
    locationRuns.push(pack.beats.map((beat) => beat.location).join('>'));
    for (const spec of pack.finalShotSpecs) {
      shotSizeDistribution[spec.shotSize] = (shotSizeDistribution[spec.shotSize] ?? 0) + 1;
      cameraMotionDistribution[spec.cameraMotion] = (cameraMotionDistribution[spec.cameraMotion] ?? 0) + 1;
    }
  }
  const fingerprints = packages.map((pack) => episodeFingerprint(pack));
  const similarPairs: VarietyReport['similarPairs'] = [];
  for (let i = 0; i < packages.length; i += 1) {
    for (let j = i + 1; j < packages.length; j += 1) {
      const score = similarity(packages[i]!, packages[j]!);
      if (score >= 0.82) similarPairs.push({ left: packages[i]!.episodeId, right: packages[j]!.episodeId, score });
    }
  }
  const uniqueCameras = new Set(packages.flatMap((pack) => pack.finalShotSpecs.map((spec) => spec.cameraSha256))).size;
  const locationRepetitionRisk: VarietyReport['locationRepetitionRisk'] =
    locationRuns.filter((row, index, all) => all.indexOf(row) !== index).length > 2 ? 'HIGH' : uniqueCameras < packages.length ? 'MEDIUM' : 'LOW';
  const storyStructureRepetitionRisk: VarietyReport['storyStructureRepetitionRisk'] =
    similarPairs.length > 4 ? 'HIGH' : similarPairs.length > 0 ? 'MEDIUM' : 'LOW';
  const audioDensity = packages.reduce((sum, pack) => sum + pack.sfx.length + pack.music.length, 0) / Math.max(1, packages.length);
  const body = {
    schemaVersion: EPISODE_VARIETY_SCHEMA,
    cameraVariety: uniqueCameras,
    shotSizeDistribution,
    cameraMotionDistribution,
    locationRepetitionRisk,
    storyStructureRepetitionRisk,
    audioDensity,
    captionWarnings: 0,
    continuityWarnings: packages.reduce((sum, pack) => sum + pack.screenDirection.facts.filter((fact) => fact.state !== 'VALID').length, 0),
    fingerprints,
    similarPairs,
  };
  return { ...body, reportSha256: sha256Canonical(body) };
}

export function similarity(left: EpisodeDirectorPackage, right: EpisodeDirectorPackage): number {
  const leftBeats = left.beats.map((item) => item.beatType).join(',');
  const rightBeats = right.beats.map((item) => item.beatType).join(',');
  const leftLoc = left.beats.map((item) => item.location).join(',');
  const rightLoc = right.beats.map((item) => item.location).join(',');
  const beatScore = leftBeats === rightBeats ? 0.5 : 0.1;
  const locScore = leftLoc === rightLoc ? 0.5 : 0.1;
  return Number((beatScore + locScore).toFixed(2));
}

export function flagRepeatedLocations(sequence: string[]): boolean {
  if (sequence.length < 3) return false;
  return sequence.every((item) => item === sequence[0]);
}

export function flagRepeatedCameras(intents: ShotIntent[]): boolean {
  return intents.length >= 8 && new Set(intents).size === 1;
}

export function checkSeasonArc(packages: EpisodeDirectorPackage[]): string[] {
  const warnings: string[] = [];
  const seenReveals = new Set<string>();
  const openings = new Set<string>();
  const endings = new Set<string>();
  for (const pack of packages) {
    const reveal = pack.intent.discoveryGoal;
    if (seenReveals.has(reveal)) warnings.push(`duplicate reveal:${pack.episodeId}`);
    seenReveals.add(reveal);
    if (openings.has(pack.intent.openingHook)) warnings.push(`repetitive opening:${pack.episodeId}`);
    openings.add(pack.intent.openingHook);
    if (endings.has(pack.intent.endingButtonIntent)) warnings.push(`repetitive ending:${pack.episodeId}`);
    endings.add(pack.intent.endingButtonIntent);
  }
  return warnings;
}

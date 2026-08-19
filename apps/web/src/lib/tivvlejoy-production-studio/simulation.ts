import { sha256Canonical } from './hash';
import { EXISTING_LOCATIONS } from '@/lib/tivvlejoy-world-builder/types';
import { hashContinuityFact } from './continuity';
import { SEASON_SIMULATION_SCHEMA, type ContinuityFact, type VoiceReceipt } from './types';

const LOCATIONS = [...EXISTING_LOCATIONS, 'new_meadow', 'new_overlook'] as const;
const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
const WEATHERS = ['CLEAR', 'RAIN', 'SNOW', 'FOG'] as const;
const TIMES = ['MORNING_WARM', 'GOLDEN_HOUR', 'NIGHT_COZY'] as const;
const LIGHTS = ['DAY', 'GOLDEN', 'NIGHT'] as const;

export type SimulatedShot = {
  episodeId: string;
  shotId: string;
  locationId: string;
  season: string;
  weather: string;
  timeOfDay: string;
  lightingFamily: string;
  dialogueRef: string;
  charactersVisible: string[];
  approvedAssetIds: string[];
  environmentDependencySha256: string;
  assemblyDependencySha256: string;
  locationSha256: string;
};

export type SimulatedEpisode = {
  episodeId: string;
  episodeNumber: number;
  scriptSha256: string;
  shots: SimulatedShot[];
  voiceReceipts: VoiceReceipt[];
};

export type SimulatedSeason = {
  schemaVersion: typeof SEASON_SIMULATION_SCHEMA;
  episodeCount: number;
  shotCount: number;
  episodes: SimulatedEpisode[];
  continuityFacts: ContinuityFact[];
  synthetic: true;
  note: string;
};

export function simulateSeason(input: { episodeCount?: number; shotsPerEpisode?: number; seed?: number } = {}): SimulatedSeason {
  const episodeCount = input.episodeCount ?? 60;
  const shotsPerEpisode = input.shotsPerEpisode ?? 12;
  const seed = input.seed ?? 4170179;
  const episodes: SimulatedEpisode[] = [];
  const facts: ContinuityFact[] = [];
  for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber += 1) {
    const episodeId = `EP${String(episodeNumber).padStart(3, '0')}`;
    const shots: SimulatedShot[] = [];
    const voiceReceipts: VoiceReceipt[] = [];
    for (let shotIndex = 1; shotIndex <= shotsPerEpisode; shotIndex += 1) {
      const shotId = `${episodeId}_SH${String(shotIndex).padStart(2, '0')}`;
      const locationId = LOCATIONS[(episodeNumber + shotIndex + seed) % LOCATIONS.length]!;
      const season = SEASONS[episodeNumber % SEASONS.length]!;
      const weather = WEATHERS[(episodeNumber + shotIndex) % WEATHERS.length]!;
      const timeOfDay = TIMES[shotIndex % TIMES.length]!;
      const lightingFamily = LIGHTS[shotIndex % LIGHTS.length]!;
      const dialogueRef = `DL_${episodeId}_${shotIndex}`;
      const approvedAssetIds = locationId.includes('forest')
        ? ['AA_FOREST_HERO_TREE']
        : locationId.includes('river')
          ? ['AA_RIVER_WATER']
          : locationId.includes('mountain') || locationId.includes('overlook')
            ? ['AA_MOUNTAIN_BACKGROUND']
            : ['AA_VILLAGE_HERO_BUILDING'];
      const environmentDependencySha256 = sha256Canonical({ locationId, season, weather, timeOfDay, lightingFamily, approvedAssetIds });
      const assemblyDependencySha256 = sha256Canonical({ shotId, environmentDependencySha256 });
      const locationSha256 = sha256Canonical({ locationId, season });
      shots.push({
        episodeId,
        shotId,
        locationId,
        season,
        weather,
        timeOfDay,
        lightingFamily,
        dialogueRef,
        charactersVisible: shotIndex % 5 === 0 ? ['GOAT'] : ['PIP', 'GOAT'],
        approvedAssetIds,
        environmentDependencySha256,
        assemblyDependencySha256,
        locationSha256,
      });
      voiceReceipts.push({
        dialogueRef,
        receiptRef: `VOICE_${dialogueRef}`,
        receiptSha256: sha256Canonical({ dialogueRef, seed }),
        characterId: shotIndex % 5 === 0 ? 'GOAT' : 'PIP',
      });
      if (locationId === 'bakery' && shotIndex === 1) {
        const fact = {
          continuityFactId: `SIGN::BAKERY::${episodeId}`,
          continuityVersion: '1',
          topic: 'SIGNAGE',
          subjectId: 'BAKERY_SIGN',
          state: 'PIP_AND_GOAT_BAKERY',
          effectiveEpisode: episodeId,
          effectiveShot: shotId,
          source: 'season-sim',
          dependencySha256: '',
        };
        facts.push({ ...fact, dependencySha256: hashContinuityFact(fact) });
      }
      if (shotIndex === 3) {
        const fact = {
          continuityFactId: `MAP::${shotId}`,
          continuityVersion: '1',
          topic: 'PROP_CARRIER',
          subjectId: 'STORY_MAP',
          state: 'PIP',
          effectiveEpisode: episodeId,
          effectiveShot: shotId,
          source: 'season-sim',
          dependencySha256: '',
        };
        facts.push({ ...fact, dependencySha256: hashContinuityFact(fact) });
      }
    }
    episodes.push({
      episodeId,
      episodeNumber,
      scriptSha256: sha256Canonical({ episodeId, seed }),
      shots,
      voiceReceipts,
    });
  }
  return {
    schemaVersion: SEASON_SIMULATION_SCHEMA,
    episodeCount,
    shotCount: episodes.reduce((sum, episode) => sum + episode.shots.length, 0),
    episodes,
    continuityFacts: facts,
    synthetic: true as const,
    note: 'PREVIEW / SYNTHETIC PRODUCTION DATA',
  };
}

export function locationUsage(episodes: SimulatedEpisode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const episode of episodes) {
    for (const shot of episode.shots) counts[shot.locationId] = (counts[shot.locationId] ?? 0) + 1;
  }
  return counts;
}

export function shotsUsingAsset(episodes: SimulatedEpisode[], assetId: string): string[] {
  return episodes.flatMap((episode) => episode.shots.filter((shot) => shot.approvedAssetIds.includes(assetId)).map((shot) => shot.shotId)).sort();
}

export function shotsUsingVoice(episodes: SimulatedEpisode[], dialogueRef: string): string[] {
  return episodes.flatMap((episode) => episode.shots.filter((shot) => shot.dialogueRef === dialogueRef).map((shot) => shot.shotId)).sort();
}

export function shotsUsingLocation(episodes: SimulatedEpisode[], locationId: string): string[] {
  return episodes.flatMap((episode) => episode.shots.filter((shot) => shot.locationId === locationId).map((shot) => shot.shotId)).sort();
}

import { simulateSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import { compileDirectedEpisode } from './compile';
import { evaluateMasterReadiness } from './readiness';
import { NIGHTSHIFT_SYNTHETIC_BANNER } from './safety';
import { forecastSeasonCost } from './cost';

export type NightshiftConsoleModel = {
  banner: typeof NIGHTSHIFT_SYNTHETIC_BANNER;
  studioReadiness: string;
  directing: { ready: number; blocked: number; waitingHuman: number };
  editorial: { totalFrames: number; shots: number; qcWarnings: number };
  audio: { sfx: number; music: number; captions: number };
  review: { open: number; approved: number };
  cost: { preview: number; review: number; final: number };
  nextSafeActions: string[];
  episodes: Array<{
    episodeId: string;
    intent: string;
    shots: number;
    beats: number;
    timelineFrames: number;
    packageSha256: string;
  }>;
};

let cached: NightshiftConsoleModel | null = null;

export function buildNightshiftConsoleModel(previewEpisodes = 3): NightshiftConsoleModel {
  if (cached) return cached;
  const season = simulateSeason({ episodeCount: previewEpisodes, shotsPerEpisode: 12 });
  const compiled = season.episodes.map((episode) => compileDirectedEpisode(episode));
  const readiness = evaluateMasterReadiness({ softwareLayers: ['DIRECTING', 'EDITORIAL', 'ANIMATION', 'ASSET'] });
  const cost = forecastSeasonCost(60, 12);
  cached = {
    banner: NIGHTSHIFT_SYNTHETIC_BANNER,
    studioReadiness: readiness.state,
    directing: { ready: compiled.length, blocked: readiness.blockers.length, waitingHuman: readiness.blockers.length },
    editorial: {
      totalFrames: compiled.reduce((sum, item) => sum + item.directorPackage.editorial.totalFrames, 0),
      shots: compiled.reduce((sum, item) => sum + item.compiledShots.length, 0),
      qcWarnings: compiled.filter((item) => !item.editRhythmPassed || !item.captionQcPassed).length,
    },
    audio: {
      sfx: compiled.reduce((sum, item) => sum + item.directorPackage.sfx.length, 0),
      music: compiled.reduce((sum, item) => sum + item.directorPackage.music.length, 0),
      captions: compiled.reduce((sum, item) => sum + item.directorPackage.captions.length, 0),
    },
    review: { open: compiled.reduce((sum, item) => sum + item.directorPackage.reviews.length, 0), approved: 0 },
    cost: { preview: cost.PREVIEW.estimatedCost, review: cost.REVIEW.estimatedCost, final: cost.FINAL.estimatedCost },
    nextSafeActions: readiness.nextSafeActions,
    episodes: compiled.map((item) => ({
      episodeId: item.episodeId,
      intent: item.directorPackage.intent.episodeGoal,
      shots: item.compiledShots.length,
      beats: item.directorPackage.beats.length,
      timelineFrames: item.directorPackage.editorial.totalFrames,
      packageSha256: item.directorPackage.episodeDirectorPackageSha256,
    })),
  };
  return cached;
}

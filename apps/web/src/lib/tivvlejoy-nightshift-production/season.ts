import { simulateSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import { compileDirectedEpisode, type CompiledEpisode } from './compile';
import { evaluateVariety, type VarietyReport } from './variety';
import { evaluateMasterReadiness } from './readiness';
import { sha256Canonical } from './hash';

export type NightshiftSeasonSimulation = {
  episodes: number;
  shots: number;
  storyBeats: number;
  cameraPlans: number;
  stagingPlans: number;
  performancePlans: number;
  lightingPlans: number;
  vfxEvents: number;
  editorialClips: number;
  dialogueEvents: number;
  sfxEvents: number;
  ambienceEvents: number;
  musicCues: number;
  captionCues: number;
  reviewItems: number;
  revisionRequests: number;
  finalShotSpecs: number;
  directorPackages: number;
  productionPackets: number;
  compileMs: number;
  timelineMs: number;
  variety: VarietyReport;
  readinessState: string;
  compiled: CompiledEpisode[];
  simulationSha256: string;
};

export function simulateNightshiftSeason(input: { episodeCount?: number; shotsPerEpisode?: number } = {}): NightshiftSeasonSimulation {
  const started = Date.now();
  const season = simulateSeason({ episodeCount: input.episodeCount ?? 60, shotsPerEpisode: input.shotsPerEpisode ?? 12 });
  const compiled = season.episodes.map((episode) => compileDirectedEpisode(episode));
  const timelineMs = compiled.reduce((sum, item) => sum + item.compileMs, 0);
  const packages = compiled.map((item) => item.directorPackage);
  const variety = evaluateVariety(packages);
  const readiness = evaluateMasterReadiness({
    packages,
    softwareLayers: ['DIRECTING', 'ANIMATION', 'EDITORIAL', 'ASSET'],
  });
  const metrics = {
    episodes: compiled.length,
    shots: compiled.reduce((sum, item) => sum + item.compiledShots.length, 0),
    storyBeats: packages.reduce((sum, item) => sum + item.beats.length, 0),
    cameraPlans: packages.reduce((sum, item) => sum + item.finalShotSpecs.length, 0),
    stagingPlans: packages.reduce((sum, item) => sum + item.finalShotSpecs.length, 0),
    performancePlans: packages.reduce((sum, item) => sum + item.performanceNotes.length, 0),
    lightingPlans: packages.reduce((sum, item) => sum + item.finalShotSpecs.length, 0),
    vfxEvents: packages.reduce((sum, item) => sum + item.finalShotSpecs.filter((spec) => spec.vfxSha256).length, 0),
    editorialClips: packages.reduce((sum, item) => sum + item.editorial.tracks.reduce((trackSum, track) => trackSum + track.clips.length, 0), 0),
    dialogueEvents: packages.reduce((sum, item) => sum + item.dialogue.length, 0),
    sfxEvents: packages.reduce((sum, item) => sum + item.sfx.length, 0),
    ambienceEvents: packages.reduce((sum, item) => sum + item.ambience.length, 0),
    musicCues: packages.reduce((sum, item) => sum + item.music.length, 0),
    captionCues: packages.reduce((sum, item) => sum + item.captions.length, 0),
    reviewItems: packages.reduce((sum, item) => sum + item.reviews.length, 0),
    revisionRequests: packages.reduce((sum, item) => sum + item.revisions.length, 0),
    finalShotSpecs: packages.reduce((sum, item) => sum + item.finalShotSpecs.length, 0),
    directorPackages: packages.length,
    productionPackets: compiled.length,
    compileMs: Date.now() - started,
    timelineMs,
    variety,
    readinessState: readiness.state,
  };
  return {
    ...metrics,
    compiled,
    simulationSha256: sha256Canonical({
      episodes: metrics.episodes,
      shots: metrics.shots,
      packages: packages.map((item) => item.episodeDirectorPackageSha256),
    }),
  };
}

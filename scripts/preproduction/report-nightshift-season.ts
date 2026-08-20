/**
 * Zero-cost nightshift season metrics. Synthetic fixtures only.
 * Does not authorize spend, render, or approval.
 */
import { simulateNightshiftSeason } from '../../apps/web/src/lib/tivvlejoy-nightshift-production/season';
import { evaluateChangeImpact } from '../../apps/web/src/lib/tivvlejoy-nightshift-production/impact';
import { nightshiftSafetyReport } from '../../apps/web/src/lib/tivvlejoy-nightshift-production/safety';
import { createMemoryStore } from '../../apps/web/src/lib/tivvlejoy-production-persistence';
import { persistDirectorPackage, restoreDirectorHashes } from '../../apps/web/src/lib/tivvlejoy-nightshift-production/persist';

const compileStarted = Date.now();
const sim = simulateNightshiftSeason({ episodeCount: 60, shotsPerEpisode: 12 });
const compileMs = Date.now() - compileStarted;

const persistStarted = Date.now();
const store = createMemoryStore({ workspaceId: 'ws_metrics' });
persistDirectorPackage(store, sim.compiled[0]!.directorPackage);
const persistMs = Date.now() - persistStarted;

const reloadStarted = Date.now();
const reloaded = createMemoryStore({ workspaceId: 'ws_metrics_reload' });
reloaded.replaceState(store.view());
const hashesMatch = JSON.stringify(restoreDirectorHashes(reloaded)) === JSON.stringify(restoreDirectorHashes(store));
const reloadMs = Date.now() - reloadStarted;

const impactStarted = Date.now();
const impacts = [
  'VOICE_RECEIPT',
  'PIP_RIG',
  'GOAT_RIG',
  'SCENERY_ASSET',
  'CAMERA',
  'LIGHTING',
  'SHOT_DURATION',
  'CAPTION',
  'REVIEW_APPROVAL',
] as const;
const impactRows = impacts.map((kind) => evaluateChangeImpact(kind));
const impactMs = Date.now() - impactStarted;

console.log(JSON.stringify({
  episodes: sim.episodes,
  shots: sim.shots,
  storyBeats: sim.storyBeats,
  cameraPlans: sim.cameraPlans,
  stagingPlans: sim.stagingPlans,
  performancePlans: sim.performancePlans,
  lightingPlans: sim.lightingPlans,
  vfxEvents: sim.vfxEvents,
  editorialClips: sim.editorialClips,
  dialogueEvents: sim.dialogueEvents,
  sfxEvents: sim.sfxEvents,
  ambienceEvents: sim.ambienceEvents,
  musicCues: sim.musicCues,
  captionCues: sim.captionCues,
  reviewItems: sim.reviewItems,
  revisionRequests: sim.revisionRequests,
  finalShotSpecs: sim.finalShotSpecs,
  directorPackages: sim.directorPackages,
  productionPackets: sim.productionPackets,
  readinessState: sim.readinessState,
  variety: {
    cameraVariety: sim.variety.cameraVariety,
    shotSizeDistribution: sim.variety.shotSizeDistribution,
    cameraMotionDistribution: sim.variety.cameraMotionDistribution,
    locationRepetitionRisk: sim.variety.locationRepetitionRisk,
    storyStructureRepetitionRisk: sim.variety.storyStructureRepetitionRisk,
    audioDensity: sim.variety.audioDensity,
    captionWarnings: sim.variety.captionWarnings,
    continuityWarnings: sim.variety.continuityWarnings,
    similarPairCount: sim.variety.similarPairs.length,
  },
  timings: {
    compileMs,
    reportedCompileMs: sim.compileMs,
    timelineMs: sim.timelineMs,
    persistMs,
    reloadMs,
    impactMs,
    hashesMatch,
  },
  impacts: impactRows.map((row) => ({ kind: row.kind, invalidates: row.invalidates, preserves: row.preserves })),
  safety: nightshiftSafetyReport(),
}, null, 2));

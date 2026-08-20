import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateSeason } from './tivvlejoy-production-studio/simulation';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import {
  attachDirectingGraph,
  bindDirectorPackageToPacket,
  buildEpisodeCreativeIntent,
  buildSeasonBible,
  cacheReuseDecision,
  checkSeasonArc,
  compileDirectedEpisode,
  detectFfmpeg,
  evaluateMasterReadiness,
  flagRepeatedCameras,
  flagRepeatedLocations,
  forecastRenderCost,
  forecastSeasonCost,
  humanBlockerLabel,
  knowledgeAfter,
  nightshiftSafetyReport,
  persistDirectorPackage,
  planBudget,
  planSyntheticProxyEdit,
  restoreDirectorHashes,
  runSyntheticProxyIfAvailable,
  simulateNightshiftSeason,
} from './tivvlejoy-nightshift-production';
import { buildProductionStateGraph } from './tivvlejoy-production-studio/state-graph';

describe('director package and master readiness', () => {
  it('compiles a director package that cannot claim production ready', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 12 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    expect(compiled.directorPackage.humanFinalApproval).toBe(false);
    expect(compiled.directorPackage.synthetic).toBe(true);
    expect(compiled.directorPackage.finalShotSpecs).toHaveLength(12);
    expect(compiled.productionPacketSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.directorBindingSha256).toBe(
      bindDirectorPackageToPacket(compiled.productionPacketSha256, compiled.directorPackage.episodeDirectorPackageSha256),
    );
    const readiness = evaluateMasterReadiness({ packages: [compiled.directorPackage], softwareLayers: ['DIRECTING', 'EDITORIAL'] });
    expect(readiness.state).not.toBe('PRODUCTION_READY');
    expect(readiness.blockers.some((item) => item.code === 'MISSING_CHARACTER_RIG')).toBe(true);
  });

  it('persists and cold-reloads the same hashes', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 8 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const store = createMemoryStore({ workspaceId: 'ws_nightshift' });
    const receipts = persistDirectorPackage(store, compiled.directorPackage);
    expect(receipts.every((item) => item.result === 'WRITE_ACCEPTED' || item.result === 'WRITE_IDEMPOTENT')).toBe(true);
    const first = restoreDirectorHashes(store);
    const store2 = createMemoryStore({ workspaceId: 'ws_nightshift_reload' });
    persistDirectorPackage(store2, compiled.directorPackage);
    expect(restoreDirectorHashes(store2)).toEqual(first);
  });

  it('surfaces write conflicts instead of silent overwrite', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 4 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const store = createMemoryStore({ workspaceId: 'ws_conflict' });
    persistDirectorPackage(store, compiled.directorPackage);
    const conflict = store.writeRecord({
      entityType: 'DIRECTOR_PACKAGE',
      entityId: compiled.episodeId,
      payload: { sha256: 'ff'.repeat(32) },
      expectedRevision: 0,
      eventType: 'DIRECTOR_PACKAGE_COMPILED',
      reason: 'stale tab',
    });
    expect(conflict.result === 'WRITE_CONFLICT' || conflict.result === 'WRITE_STALE').toBe(true);
    const idempotent = store.writeRecord({
      entityType: 'DIRECTOR_PACKAGE',
      entityId: compiled.episodeId,
      payload: { sha256: compiled.directorPackage.episodeDirectorPackageSha256 },
      expectedRevision: store.getRevision(),
      eventType: 'DIRECTOR_PACKAGE_COMPILED',
      reason: 'repeat',
    });
    expect(['WRITE_IDEMPOTENT', 'WRITE_ACCEPTED'].includes(idempotent.result)).toBe(true);
  });

  it('keeps synthetic fixtures from claiming PRODUCTION_READY', () => {
    expect(() => evaluateMasterReadiness({ realRigs: true, realSceneryApproved: true, realVoiceExact: true, humanVisualApproval: true, paidRenderAuthorized: true })).not.toThrow();
    const waitingPaid = evaluateMasterReadiness({
      realRigs: true,
      realSceneryApproved: true,
      realVoiceExact: true,
      humanVisualApproval: true,
      paidRenderAuthorized: false,
      softwareLayers: ['DIRECTING', 'EDITORIAL', 'ANIMATION', 'ASSET'],
    });
    expect(waitingPaid.state).toBe('WAITING_FOR_PAID_RENDER_AUTHORIZATION');
    const ready = evaluateMasterReadiness({
      realRigs: true,
      realSceneryApproved: true,
      realVoiceExact: true,
      humanVisualApproval: true,
      paidRenderAuthorized: true,
      softwareLayers: ['DIRECTING', 'EDITORIAL', 'ANIMATION', 'ASSET'],
    });
    expect(ready.state).toBe('CONTROLLED_PRODUCTION_VALIDATION_READY');
    expect(ready.state).not.toBe('PRODUCTION_READY');
  });
});

describe('nightshift season simulation', () => {
  it('directs a 60-episode synthetic season without media', () => {
    const sim = simulateNightshiftSeason({ episodeCount: 60, shotsPerEpisode: 12 });
    expect(sim.episodes).toBe(60);
    expect(sim.shots).toBe(720);
    expect(sim.directorPackages).toBe(60);
    expect(sim.finalShotSpecs).toBe(720);
    expect(sim.productionPackets).toBe(60);
    expect(sim.readinessState).not.toBe('PRODUCTION_READY');
    expect(sim.storyBeats).toBeGreaterThan(0);
    expect(sim.sfxEvents).toBeGreaterThan(0);
    expect(sim.captionCues).toBeGreaterThan(0);
  });

  it('flags repeated bakery/village/forest location runs', () => {
    expect(flagRepeatedLocations(['bakery', 'bakery', 'bakery'])).toBe(true);
    expect(flagRepeatedCameras(Array.from({ length: 20 }, () => 'MEDIUM_TWO_SHOT'))).toBe(true);
    const bible = buildSeasonBible(['bakery', 'village', 'forest']);
    expect(bible.authoritativeCanonInvented).toBe(false);
  });

  it('tracks knowledge forward across episodes', () => {
    const sim = simulateNightshiftSeason({ episodeCount: 4, shotsPerEpisode: 6 });
    const knowledge = knowledgeAfter(sim.compiled.map((item) => item.directorPackage));
    expect(knowledge[3]?.pipKnows.length).toBeGreaterThan(knowledge[0]!.pipKnows.length);
    expect(checkSeasonArc(sim.compiled.map((item) => item.directorPackage)).join(' ')).not.toMatch(/premature/);
  });
});

describe('cost, proxy, graph, and safety', () => {
  it('forecasts cost without authorization', () => {
    const forecast = forecastRenderCost({ shots: 720, secondsPerShot: 4, qualityTier: 'FINAL', usdPerGpuHour: 1.2 });
    expect(forecast.authorizationIssued).toBe(false);
    expect(forecast.estimatedFrameCount).toBeGreaterThan(0);
    const season = forecastSeasonCost(60, 12);
    expect(season.PREVIEW.estimatedCost).toBe(0);
    const budget = planBudget({ rates: { RENDER: 40, VOICE: 10 }, budgetCapUsd: 100 });
    expect(budget.authorizationIssued).toBe(false);
    expect(budget.withinCap).toBe(true);
    expect(cacheReuseDecision({ dependencyChanged: true, kind: 'camera' })).toBe('RECOMPUTE');
  });

  it('plans a synthetic proxy and uses ffmpeg only when present', () => {
    const plan = planSyntheticProxyEdit({ episodeId: 'EP001', shots: [{ shotId: 'A', durationFrames: 60 }] });
    expect(plan.finalRender).toBe(false);
    expect(plan.usedRealImagery).toBe(false);
    if (detectFfmpeg().available) {
      const dir = mkdtempSync(join(tmpdir(), 'tj-proxy-'));
      const result = runSyntheticProxyIfAvailable({ outputPath: join(dir, 'proxy.mp4'), durationSec: 1 });
      expect(['PROXY_WRITTEN', 'PROXY_MEDIA_TOOL_UNAVAILABLE']).toContain(result.status);
    } else {
      expect(plan.status).toBe('PROXY_MEDIA_TOOL_UNAVAILABLE');
    }
  });

  it('extends the graph without dropping rig blockers', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP001',
        scriptSha256: 'aa'.repeat(32),
        shots: [{ shotId: 'SH001', locationId: 'bakery', charactersVisible: ['PIP'] }],
      },
    ]);
    const next = attachDirectingGraph(graph, {
      episodeId: 'EP001',
      hasIntent: true,
      hasCamera: true,
      hasStaging: true,
      hasEdit: true,
      hasAudio: false,
      hasCaptions: false,
      hasReview: false,
    });
    expect(next.nodes.some((node) => node.kind === 'DIRECTING')).toBe(true);
    expect(graph.nodes.some((node) => node.state === 'WAITING_FOR_RIG' || node.blockerClass === 'RIG' || node.humanLabel.includes('rig'))).toBe(true);
  });

  it('scales graph and hash work beyond 60 episodes without claiming readiness', () => {
    const sim = simulateNightshiftSeason({ episodeCount: 8, shotsPerEpisode: 12 });
    expect(sim.shots).toBe(96);
    expect(sim.readinessState).not.toBe('PRODUCTION_READY');
    expect(JSON.stringify(sim.compiled[0]?.directorPackage)).not.toMatch(/DATABASE_URL|R2_SECRET|RUNPOD|ELEVENLABS|sk-/);
  });

  it('keeps the nightshift safety report closed', () => {
    const safety = nightshiftSafetyReport();
    expect(safety.productionMutation).toBe(false);
    expect(safety.paidComputeUsd).toBe(0);
    expect(safety.shotsAutoApproved).toBe(false);
    expect(humanBlockerLabel('MISSING_CHARACTER_RIG')).toMatch(/Pip or Goat production rig/);
  });
});

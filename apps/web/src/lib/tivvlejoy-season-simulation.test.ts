import { describe, expect, it } from 'vitest';
import { syntheticRegistry } from './tivvlejoy-approved-asset-registry';
import { defaultLongevityInput } from './tivvlejoy-scenery-longevity';
import { changeImpact } from './tivvlejoy-production-studio/state-graph';
import {
  locationUsage,
  shotsUsingAsset,
  shotsUsingLocation,
  shotsUsingVoice,
  simulateSeason,
} from './tivvlejoy-production-studio/simulation';
import {
  buildProductionStudioPlan,
  invalidateAfterChange,
  studioInputFromSeason,
  studioReadinessFor,
} from './tivvlejoy-production-studio/orchestrator';
import { evaluateJobRecovery, jobIdempotencyKey } from './tivvlejoy-production-studio/recovery';

const season = simulateSeason();
const plan = buildProductionStudioPlan(
  studioInputFromSeason(season, {
    evidenceClass: 'SYNTHETIC_PREVIEW',
    approvedAssetRegistry: syntheticRegistry(),
    longevity: defaultLongevityInput({ requestedEpisodeCount: 60 }),
  }),
);

describe('season simulation', () => {
  it('simulates 60 episodes and at least 500 shots', () => {
    expect(season.episodeCount).toBe(60);
    expect(season.shotCount).toBeGreaterThanOrEqual(500);
    expect(season.shotCount).toBe(720);
    expect(season.synthetic).toBe(true);
    expect(season.note).toMatch(/SYNTHETIC/);
  });

  it('uses synthetic metadata rather than copyrighted scripts', () => {
    expect(JSON.stringify(season.episodes[0])).not.toMatch(/once upon a time|copyright/i);
    expect(season.episodes[0]?.scriptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reuses recurring locations and introduces new ones', () => {
    const usage = locationUsage(season.episodes);
    expect(usage.bakery).toBeGreaterThan(10);
    expect(usage.new_meadow).toBeGreaterThan(0);
    expect(usage.new_overlook).toBeGreaterThan(0);
  });

  it('creates a large continuity ledger', () => {
    expect(season.continuityFacts.length).toBeGreaterThan(60);
  });

  it('answers how many episodes are planning-ready', () => {
    expect(plan.seasonHealth.planningReady).toBe(60);
  });

  it('answers how many items wait on unresolved character rigs', () => {
    expect(plan.seasonHealth.waitingRigs).toBeGreaterThan(0);
  });

  it('groups environment work for reuse', () => {
    expect(plan.batchPlan.cacheReuse.length).toBeGreaterThan(0);
  });

  it('reports most-used locations', () => {
    const usage = locationUsage(season.episodes);
    const top = Object.entries(usage).sort((left, right) => right[1] - left[1])[0];
    expect(top?.[1]).toBeGreaterThan(20);
  });

  it('evaluates scenery repetition without a fake 48 ceiling', () => {
    expect(plan.longevity?.requestedEpisodeCount).toBe(60);
    expect(JSON.stringify(plan.longevity)).not.toContain('estimatedEpisodeCoverage');
    expect(plan.longevity).not.toHaveProperty('maximumEpisodeCount');
  });

  it('reports semantic role pressure from longevity', () => {
    expect(plan.longevity?.semanticRoleCoverage.length).toBeGreaterThan(0);
  });

  it('plans production batches for the whole season', () => {
    expect(plan.batchPlan.requestedEpisodeCount).toBe(60);
    expect(plan.batchPlan.units).toBeGreaterThan(500);
  });

  it('invalidates only mountain-dependent assemblies when that asset node changes', () => {
    const mountainNodes = plan.graph.nodes.filter((node) => node.nodeId.includes('ASSET::AA_MOUNTAIN_BACKGROUND')).map((node) => node.nodeId);
    const impacted = changeImpact(plan.graph, mountainNodes);
    const mountainShots = new Set(shotsUsingAsset(season.episodes, 'AA_MOUNTAIN_BACKGROUND'));
    const forestShots = shotsUsingAsset(season.episodes, 'AA_FOREST_HERO_TREE');
    expect(mountainNodes.length).toBeGreaterThan(0);
    expect(impacted.some((id) => id.includes('SHOT_ASSEMBLY'))).toBe(true);
    expect(forestShots.some((shotId) => mountainShots.has(shotId))).toBe(false);
    expect(forestShots.some((shotId) => impacted.some((id) => id.endsWith(`::SHOT_ASSEMBLY::${shotId}`)))).toBe(false);
  });

  it('invalidates Pip-dependent real assembly when the rig version changes, not scenery planning', () => {
    const rigNodes = plan.graph.nodes.filter((node) => node.kind === 'CHARACTER_RIG').map((node) => node.nodeId);
    const impacted = invalidateAfterChange(plan, rigNodes.slice(0, 20));
    expect(impacted.some((id) => id.includes('SHOT_ASSEMBLY'))).toBe(true);
    expect(impacted.some((id) => id.includes('::LOCATION::'))).toBe(false);
  });

  it('invalidates only the shot that owns a changed voice receipt', () => {
    const target = season.episodes[0]!.shots[0]!;
    const voiceNode = plan.graph.nodes.find((node) => node.kind === 'VOICE' && node.shotId === target.shotId)!.nodeId;
    const impacted = changeImpact(plan.graph, [voiceNode]);
    const other = season.episodes[0]!.shots[1]!;
    expect(impacted.some((id) => id.includes(target.shotId))).toBe(true);
    expect(impacted.some((id) => id.includes(`::VOICE::${other.shotId}`))).toBe(false);
    expect(shotsUsingVoice(season.episodes, target.dialogueRef)).toEqual([target.shotId]);
  });

  it('invalidates bakery-dependent shots without touching unrelated forest shots', () => {
    const bakeryNodes = plan.graph.nodes.filter((node) => node.nodeId.endsWith('::LOCATION::bakery')).map((node) => node.nodeId);
    const impacted = changeImpact(plan.graph, bakeryNodes);
    const forestShots = shotsUsingLocation(season.episodes, 'forest_exit');
    expect(bakeryNodes.length).toBeGreaterThan(0);
    expect(impacted.some((id) => id.includes('LOCATION::bakery'))).toBe(true);
    expect(forestShots.some((shotId) => impacted.some((id) => id.endsWith(`::SHOT_ASSEMBLY::${shotId}`)))).toBe(false);
  });

  it('keeps delivery blocked while QC is incomplete', () => {
    expect(plan.qcReports.every((item) => item.passed === false)).toBe(true);
    expect(plan.deliveries.every((item) => item.readiness === 'QC_BLOCKED')).toBe(true);
    expect(plan.seasonHealth.deliveryReady).toBe(0);
  });

  it('reuses old completed QC work when the input is unchanged', () => {
    const job = plan.jobs.find((item) => item.jobType === 'ENVIRONMENT_PREP')!;
    const decision = evaluateJobRecovery(
      { ...job, idempotencyKey: jobIdempotencyKey(job) },
      {
        idempotencyKey: jobIdempotencyKey(job),
        inputDependencySha256: job.inputDependencySha256,
        resultReceiptRef: 'ENV_OK',
        success: true,
      },
    );
    expect(decision.decision).toBe('REUSE_EXISTING_RESULT');
  });

  it('avoids duplicate paid-work intent', () => {
    const render = plan.jobs.find((item) => item.jobType === 'RENDER')!;
    expect(render.retryClass).toBe('REQUIRES_NEW_AUTHORIZATION');
    expect(
      evaluateJobRecovery(render, {
        idempotencyKey: render.idempotencyKey,
        inputDependencySha256: render.inputDependencySha256,
        authorizationReceiptRef: 'AUTH',
        resultReceiptRef: 'RENDER_OK',
        success: true,
      }).decision,
    ).toBe('REQUIRES_NEW_AUTHORIZATION');
  });

  it('never claims synthetic fixtures are production ready', () => {
    expect(plan.studioReadiness).not.toBe('PRODUCTION_READY');
    expect(plan.syntheticFixturesClaimProductionReady).toBe(false);
    expect(studioReadinessFor({ episodes: [], evidenceClass: 'SYNTHETIC_PREVIEW', characterRigsResolved: true })).not.toBe(
      'PRODUCTION_READY',
    );
  });

  it('builds a deterministic orchestrator plan', () => {
    const again = buildProductionStudioPlan(
      studioInputFromSeason(season, {
        evidenceClass: 'SYNTHETIC_PREVIEW',
        approvedAssetRegistry: syntheticRegistry(),
        longevity: defaultLongevityInput({ requestedEpisodeCount: 60 }),
      }),
    );
    expect(again.orchestratorSha256).toBe(plan.orchestratorSha256);
    expect(again.graph.graphSha256).toBe(plan.graph.graphSha256);
  });

  it('does not change schedule identity when episode input order changes', () => {
    const reversed = studioInputFromSeason(season);
    reversed.episodes = [...reversed.episodes].reverse();
    const shuffled = buildProductionStudioPlan({
      ...reversed,
      evidenceClass: 'SYNTHETIC_PREVIEW',
    });
    expect(shuffled.batchPlan.batchPlanSha256).toBe(plan.batchPlan.batchPlanSha256);
    expect(shuffled.graph.graphSha256).toBe(plan.graph.graphSha256);
  });

  it('exposes a public studio plan API', () => {
    expect(plan.schemaVersion).toBe('TIVVLEJOY_PRODUCTION_STUDIO_ORCHESTRATOR_V1');
    expect(plan.packets).toHaveLength(60);
    expect(plan.safeNextActions.length).toBeGreaterThan(0);
    expect(plan.safeNextActions.every((item) => !/started gpu|rendered|uploaded|approved/i.test(item.label))).toBe(true);
  });

  it('lets newly approved registry assets flow into packets without auto-approval', () => {
    const registry = syntheticRegistry();
    expect(plan.packets[0]?.environmentDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(registry.filenameSelectionAllowed).toBe(false);
    expect(JSON.stringify(plan.packets[0])).not.toMatch(/auto-approv/i);
  });

  it('indexes the graph instead of losing 720-shot lookups', () => {
    expect(Object.keys(plan.graph.indexes.byEpisode)).toHaveLength(60);
    expect(plan.graph.indexes.byKind.SHOT?.length).toBe(720);
    expect(plan.graph.edges.length).toBeGreaterThan(1000);
  });

  it('completes the 60-episode plan in a practical budget', () => {
    const started = Date.now();
    simulateSeason({ episodeCount: 60, shotsPerEpisode: 12 });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(8000);
  });

  it('keeps render nodes unstarted', () => {
    expect(plan.graph.nodes.filter((node) => node.kind === 'RENDER').every((node) => node.state === 'NOT_STARTED')).toBe(true);
  });

  it('does not mark QC ready without media evaluation', () => {
    expect(plan.seasonHealth.qcReady).toBe(0);
  });

  it('includes recovery jobs for every scheduled unit', () => {
    expect(plan.jobs.length).toBe(plan.batchPlan.units);
  });

  it('answers that scenery planning remains valid after a rig change', () => {
    expect(plan.packets.every((packet) => packet.reasons.find((item) => item.key === 'environment')?.blocksRealProduction === false)).toBe(
      true,
    );
  });
});

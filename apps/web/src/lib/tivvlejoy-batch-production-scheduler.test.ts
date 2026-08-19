import { describe, expect, it } from 'vitest';
import { planProductionBatches, type SchedulableUnit } from './tivvlejoy-production-studio/scheduler';
import { WORK_UNIT_TYPES } from './tivvlejoy-production-studio/types';
import { simulateSeason } from './tivvlejoy-production-studio/simulation';

function unitsFor(episodeCount: number, shotsPerEpisode = 4): SchedulableUnit[] {
  const season = simulateSeason({ episodeCount, shotsPerEpisode });
  return season.episodes.flatMap((episode) =>
    episode.shots.flatMap((shot) =>
      WORK_UNIT_TYPES.map((jobType) => ({
        unitId: `${episode.episodeId}::${jobType}::${shot.shotId}`,
        jobType,
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        locationId: shot.locationId,
        lightingFamily: shot.lightingFamily,
        approvedAssetFamily: shot.approvedAssetIds[0],
        characterFamily: shot.charactersVisible.join('+'),
        priority: episode.episodeNumber === 1 ? 10 : 1,
        blocked: jobType === 'RENDER' || jobType === 'ANIMATION',
        blockerLabel: jobType === 'RENDER' ? 'Paid render authorization required' : undefined,
        inputDependencySha256: shot.assemblyDependencySha256,
      })),
    ),
  );
}

describe('batch production scheduler', () => {
  it('plans one episode without executing work', () => {
    const plan = planProductionBatches(unitsFor(1));
    expect(plan.requestedEpisodeCount).toBe(1);
    expect(plan.units).toBeGreaterThan(0);
    expect(plan.schemaVersion).toBe('TIVVLEJOY_BATCH_PLAN_V1');
    expect(plan.schedulerVersion).toBe('TIVVLEJOY_BATCH_PRODUCTION_SCHEDULER_V1');
    expect(JSON.stringify(plan)).not.toMatch(/spawn|blender|gpu/i);
  });

  it('plans 10, 30, and 60 episodes', () => {
    expect(planProductionBatches(unitsFor(10)).requestedEpisodeCount).toBe(10);
    expect(planProductionBatches(unitsFor(30)).requestedEpisodeCount).toBe(30);
    expect(planProductionBatches(unitsFor(60, 3)).requestedEpisodeCount).toBe(60);
  });

  it('keeps batchPlanSha256 stable when input order changes', () => {
    const units = unitsFor(6);
    const reversed = [...units].reverse();
    expect(planProductionBatches(units).batchPlanSha256).toBe(planProductionBatches(reversed).batchPlanSha256);
  });

  it('groups shared bakery lighting together for reuse', () => {
    const plan = planProductionBatches(unitsFor(8));
    expect(plan.cacheReuse.some((item) => item.toLowerCase().includes('bakery') || item.toLowerCase().includes('reuse'))).toBe(true);
  });

  it('separates blocked render work from parallelizable prep', () => {
    const plan = planProductionBatches(unitsFor(3));
    expect(plan.blockedGroups.length).toBeGreaterThan(0);
    expect(plan.parallelizableGroups.length).toBeGreaterThan(0);
    const blockedIds = new Set(plan.blockedGroups.flat());
    expect([...blockedIds].some((id) => id.includes('RENDER'))).toBe(true);
  });

  it('includes every work-unit type', () => {
    const types = new Set(planProductionBatches(unitsFor(2)).batches.map((batch) => batch.jobType));
    for (const type of WORK_UNIT_TYPES) expect(types.has(type)).toBe(true);
  });

  it('prioritizes earlier story deadlines without changing identity for the same set', () => {
    const units = unitsFor(4);
    const plan = planProductionBatches(units);
    expect(plan.criticalPath.length).toBeGreaterThan(0);
  });

  it('does not invent execution timestamps', () => {
    expect(JSON.stringify(planProductionBatches(unitsFor(2)))).not.toMatch(/startedAt|finishedAt|gpuLaunched/);
  });

  it('reuses approved asset families when many units share one', () => {
    const plan = planProductionBatches([
      {
        unitId: 'A',
        jobType: 'ASSET_MATERIALIZATION',
        episodeId: 'EP001',
        approvedAssetFamily: 'AA_VILLAGE_HERO_BUILDING',
        inputDependencySha256: '11'.repeat(32),
      },
      {
        unitId: 'B',
        jobType: 'ASSET_MATERIALIZATION',
        episodeId: 'EP002',
        approvedAssetFamily: 'AA_VILLAGE_HERO_BUILDING',
        inputDependencySha256: '11'.repeat(32),
      },
    ]);
    expect(plan.cacheReuse.join(' ')).toMatch(/AA_VILLAGE_HERO_BUILDING|Reuse/);
  });

  it('keeps location-specific environment batches distinct', () => {
    const plan = planProductionBatches([
      { unitId: 'B1', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'bakery', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'F1', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'forest_exit', inputDependencySha256: '22'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(2);
  });

  it('groups the same location and lighting family', () => {
    const plan = planProductionBatches([
      { unitId: 'A', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'bakery', lightingFamily: 'DAY', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'B', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP002', locationId: 'bakery', lightingFamily: 'DAY', inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]?.unitIds).toEqual(['A', 'B']);
    expect(plan.batches[0]?.reuseOpportunity).toMatch(/bakery/);
  });

  it('does not merge blocked and open units of the same location', () => {
    const plan = planProductionBatches([
      { unitId: 'OPEN', jobType: 'SHOT_ASSEMBLY', episodeId: 'EP001', locationId: 'bakery', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'STOP', jobType: 'SHOT_ASSEMBLY', episodeId: 'EP002', locationId: 'bakery', blocked: true, inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(2);
  });

  it('lists a critical path including blocked or assembly/voice work', () => {
    const plan = planProductionBatches(unitsFor(2));
    expect(plan.criticalPath.some((id) => id.includes('VOICE_PREP') || id.includes('SHOT_ASSEMBLY') || id.includes('RENDER'))).toBe(true);
  });

  it('scales to hundreds of shots without changing identity', () => {
    const units = unitsFor(20, 8);
    expect(units.length).toBeGreaterThan(500);
    const plan = planProductionBatches(units);
    expect(plan.units).toBe(units.length);
    expect(plan.batchPlanSha256).toBe(planProductionBatches([...units].reverse()).batchPlanSha256);
  });

  it('sorts unit ids inside a batch', () => {
    const plan = planProductionBatches([
      { unitId: 'Z', jobType: 'QC', episodeId: 'EP002', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'A', jobType: 'QC', episodeId: 'EP001', inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches[0]?.unitIds).toEqual(['A', 'Z']);
  });

  it('does not schedule a second paid render just because episode order changed', () => {
    const units = unitsFor(3);
    const a = planProductionBatches(units);
    const b = planProductionBatches([...units].sort(() => -1));
    const renderA = a.batches.filter((batch) => batch.jobType === 'RENDER').map((batch) => batch.batchId).sort();
    const renderB = b.batches.filter((batch) => batch.jobType === 'RENDER').map((batch) => batch.batchId).sort();
    expect(renderA).toEqual(renderB);
  });

  it('records lighting family on environment batches', () => {
    const plan = planProductionBatches([
      { unitId: 'A', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'river', lightingFamily: 'GOLDEN', inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches[0]?.lightingFamily).toBe('GOLDEN');
  });

  it('keeps delivery batches distinct from QC', () => {
    const plan = planProductionBatches([
      { unitId: 'Q', jobType: 'QC', episodeId: 'EP001', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'D', jobType: 'DELIVERY', episodeId: 'EP001', inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches.map((batch) => batch.jobType).sort()).toEqual(['DELIVERY', 'QC']);
  });

  it('creates visual review and audio mux batches', () => {
    const types = new Set(planProductionBatches(unitsFor(1)).batches.map((batch) => batch.jobType));
    expect(types.has('VISUAL_REVIEW')).toBe(true);
    expect(types.has('AUDIO_MUX')).toBe(true);
  });

  it('does not claim work completed', () => {
    expect(JSON.stringify(planProductionBatches(unitsFor(1)))).not.toMatch(/COMPLETE|RENDERED|UPLOADED/);
  });

  it('uses a stable hash alphabet', () => {
    expect(planProductionBatches(unitsFor(2)).batchPlanSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('counts unique episodes even when some have more shots', () => {
    const plan = planProductionBatches([
      ...unitsFor(2, 2),
      {
        unitId: 'EXTRA',
        jobType: 'VOICE_PREP',
        episodeId: 'EP099',
        inputDependencySha256: '99'.repeat(32),
      },
    ]);
    expect(plan.requestedEpisodeCount).toBe(3);
  });

  it('keeps character family metadata from influencing the batch key unless location/lighting differ', () => {
    const plan = planProductionBatches([
      { unitId: 'P', jobType: 'ANIMATION', episodeId: 'EP001', locationId: 'bakery', characterFamily: 'PIP', blocked: true, inputDependencySha256: '11'.repeat(32) },
      { unitId: 'G', jobType: 'ANIMATION', episodeId: 'EP002', locationId: 'bakery', characterFamily: 'GOAT', blocked: true, inputDependencySha256: '11'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(1);
  });

  it('exposes parallel groups as arrays of unit ids', () => {
    const plan = planProductionBatches(unitsFor(2));
    expect(plan.parallelizableGroups.every((group) => group.every((id) => typeof id === 'string'))).toBe(true);
  });

  it('marks every render batch blocked', () => {
    const plan = planProductionBatches(unitsFor(5));
    expect(plan.batches.filter((batch) => batch.jobType === 'RENDER').every((batch) => batch.blocked)).toBe(true);
  });

  it('can plan thousands of conceptual shots', () => {
    const units = unitsFor(40, 8);
    expect(units.length).toBeGreaterThan(2000);
    const plan = planProductionBatches(units);
    expect(plan.batches.length).toBeGreaterThan(10);
  });

  it('does not use mutable latest as a cache key', () => {
    expect(JSON.stringify(planProductionBatches(unitsFor(2)))).not.toMatch(/"latest"/);
  });

  it('keeps voice prep reusable across shots that share no location', () => {
    const plan = planProductionBatches([
      { unitId: 'V1', jobType: 'VOICE_PREP', episodeId: 'EP001', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'V2', jobType: 'VOICE_PREP', episodeId: 'EP002', inputDependencySha256: '22'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(1);
  });

  it('splits night and day lighting for the same bakery', () => {
    const plan = planProductionBatches([
      { unitId: 'D', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'bakery', lightingFamily: 'DAY', inputDependencySha256: '11'.repeat(32) },
      { unitId: 'N', jobType: 'ENVIRONMENT_PREP', episodeId: 'EP001', locationId: 'bakery', lightingFamily: 'NIGHT', inputDependencySha256: '22'.repeat(32) },
    ]);
    expect(plan.batches).toHaveLength(2);
  });

  it('returns empty structures for an empty request', () => {
    const plan = planProductionBatches([]);
    expect(plan.units).toBe(0);
    expect(plan.batches).toEqual([]);
    expect(plan.batchPlanSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

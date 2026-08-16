/**
 * Studio hardening 17–24 — versioning, dependencies, cache, profile,
 * provenance, analytics, recovery, and disposable persist contracts.
 *
 * Draft PRs #24, #26, #27, and #28 stay unmerged. Steps 9–16 stay closed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EPISODE_1_DRAFT_BRIEF,
  PROXY_PIPELINE_BRIEF,
  advanceWorkflow,
  buildEpisode1DraftPackage,
  buildProvenance,
  buildRenderCacheKey,
  checkpointWorkflow,
  detectCorruption,
  draftAnalytics,
  estimateDraftCost,
  invalidateShots,
  listDraftReferenceProvenance,
  planPartialRerender,
  profileLocalWorkflow,
  recordArtifactVersion,
  restoreCachedPlan,
  resumeFromCheckpoint,
  rollbackArtifact,
  trackShotDependencies,
} from '@doodle-dash/preproduction';
import { currentStage, evaluateTheatricalGate, FINAL_1080P_ACCEPTANCE } from '@doodle-dash/direction';
import {
  assertDurableWorkflowPersisted,
  persistPreproductionRun,
  loadLatestPreproductionRun,
  loadPreproductionRunByCacheKey,
  type PersistDb,
} from '@doodle-dash/production';

const repoRoot = path.resolve(__dirname, '../../../..');
const pack = buildEpisode1DraftPackage();
const proxy = advanceWorkflow(PROXY_PIPELINE_BRIEF);

function memoryPersistDb(): PersistDb & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    preproductionRun: {
      async findFirst(args?: Record<string, unknown>) {
        const where = (args?.where ?? {}) as { episodeId?: string; cacheKey?: string };
        const matches = rows.filter((row) => {
          if (where.episodeId && row.episodeId !== where.episodeId) return false;
          if (where.cacheKey && row.cacheKey !== where.cacheKey) return false;
          return true;
        });
        return matches[matches.length - 1] ?? null;
      },
      async create(args: Record<string, unknown>) {
        const data = args.data as Record<string, unknown>;
        const row = { id: `mem-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
  };
}

describe('isolation and closed gates', () => {
  it('keeps the accepted lineage and unmerged draft PRs documented', () => {
    const progress = readFileSync(path.join(repoRoot, 'TRIVVLEJOY_PROGRESS.md'), 'utf8');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
    expect(progress).toContain('Milestone 5');
    expect(progress).toContain('Draft PR #26');
    expect(progress).toContain('Draft PR #27');
    expect(progress).toContain('Draft PR #28');
    expect(progress).toContain('82f26c81fc3564321289831a95ae93468b2f1369');
  });

  it('leaves currentStage and theatrical gate unchanged', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint).toBe(
      '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
    );
  });
});

describe('17 versioning and rollback', () => {
  it('records draft versions and refuses canon on rollback', () => {
    const first = recordArtifactVersion({ kind: 'STORY', cacheKey: 'story-a' });
    const second = recordArtifactVersion({ kind: 'STORY', cacheKey: 'story-b', history: first });
    const rolled = rollbackArtifact(second, 1);
    expect(first.current.label).toBe('DRAFT_NONCANONICAL');
    expect(second.current.version).toBe(2);
    expect(rolled.current.version).toBe(3);
    expect(rolled.current.canonical).toBe(false);
    expect(rolled.current.productionEligible).toBe(false);
    expect(rolled.current.rolledBackFrom).toBe(2);
    expect(rolled.current.cacheKey).not.toBe(first.current.cacheKey);
  });
});

describe('18 shot dependency tracking', () => {
  it('tracks beat/panel/clip links and invalidates without paid rerender', () => {
    const tracked = trackShotDependencies({
      draft: pack.workflow.bundle.draft,
      storyboard: pack.workflow.bundle.storyboard,
      animatic: pack.workflow.bundle.animatic,
      shotPlan: pack.workflow.bundle.shotPlan,
    });
    expect(tracked.dependencies.length).toBe(pack.workflow.bundle.shotPlan.shots.length);
    expect(tracked.dependencies.every((entry) => entry.panelId && entry.clipId)).toBe(true);
    const dirty = invalidateShots(tracked.dependencies, {
      kind: 'BEAT',
      id: pack.workflow.bundle.draft.beats[0]!.beatId,
    });
    expect(dirty.dirtyShotIds.length).toBeGreaterThan(0);
    expect(dirty.paidRerender).toBe(false);
  });
});

describe('19 render-cache and partial rerender', () => {
  it('builds deterministic keys and forces QC/safety re-eval on restore', () => {
    const a = buildRenderCacheKey({
      shotId: 'clip_001',
      animaticCacheKey: 'anim',
      shotPlanCacheKey: 'shots',
      dirty: false,
    });
    const b = buildRenderCacheKey({
      shotId: 'clip_001',
      animaticCacheKey: 'anim',
      shotPlanCacheKey: 'shots',
      dirty: false,
    });
    const dirty = buildRenderCacheKey({
      shotId: 'clip_001',
      animaticCacheKey: 'anim',
      shotPlanCacheKey: 'shots',
      dirty: true,
    });
    expect(a).toBe(b);
    expect(a).not.toBe(dirty);
    const plan = planPartialRerender({
      animatic: pack.workflow.bundle.animatic,
      orchestration: pack.workflow.bundle.orchestration,
      shotPlan: pack.workflow.bundle.shotPlan,
      dirtyClipIds: [pack.workflow.bundle.animatic.clips[0]!.clipId],
    });
    expect(plan.paidRetry).toBe(false);
    expect(plan.maySkipQc).toBe(false);
    expect(plan.mayEnterFinal).toBe(false);
    const restored = restoreCachedPlan({ cacheKey: a, plan: pack.workflow.bundle.shotPlan });
    expect(restored.mustReevaluateQc).toBe(true);
    expect(restored.mustReevaluateSafety).toBe(true);
    expect(restored.mayEnterFinal).toBe(false);
    expect(restored.writesProductionLibrary).toBe(false);
  });
});

describe('20 local profiling', () => {
  it('profiles a local planner walk without paid work', () => {
    const profile = profileLocalWorkflow(EPISODE_1_DRAFT_BRIEF);
    expect(profile.paid).toBe(false);
    expect(profile.stageCount).toBeGreaterThan(0);
    expect(profile.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('21 / 23 provenance', () => {
  it('records commit, versions, inputs and hashes without Pip/Goat assets', () => {
    const provenance = buildProvenance({
      sourceCommit: '82f26c81fc3564321289831a95ae93468b2f1369',
      episodeId: pack.workflow.episodeId,
      cacheKey: pack.workflow.cacheKey,
      inputs: { seed: pack.brief.seed },
      mediaCommandHash: 'mux-hash',
      qcHash: pack.workflow.bundle.qc.cacheKey,
    });
    expect(provenance.sourceCommit).toBe('82f26c81fc3564321289831a95ae93468b2f1369');
    expect(provenance.includesPipGoatAssets).toBe(false);
    expect(provenance.datasetLabel).toBe('DRAFT_NONCANONICAL_REFERENCE');
    expect(provenance.provenanceHash.length).toBeGreaterThan(8);
    expect(listDraftReferenceProvenance().every((entry) => entry.productionLibraryPath === null)).toBe(true);
  });
});

describe('22 draft analytics and cost', () => {
  it('keeps estimates at $0 and refuses paid execution', () => {
    const cost = estimateDraftCost({ estimateUsd: 12 });
    expect(cost.estimatedUsd).toBe(0);
    expect(cost.paidAuthorized).toBe(false);
    expect(cost.cloudRenderEnabled).toBe(false);
    expect(cost.refused).toBe(true);
    const analytics = draftAnalytics(pack.workflow);
    expect(analytics.label).toBe('DRAFT_NONCANONICAL');
    expect(analytics.cost.estimatedUsd).toBe(0);
  });
});

describe('24 crash recovery', () => {
  it('checkpoints, detects corruption, and re-evaluates gates before resume', () => {
    const checkpoint = checkpointWorkflow(pack.workflow);
    expect(checkpoint.label).toBe('DRAFT_NONCANONICAL');
    expect(detectCorruption(checkpoint, pack.workflow).corrupt).toBe(false);
    const resume = resumeFromCheckpoint({ checkpoint, run: pack.workflow });
    expect(resume.reevaluatedSafety).toBe(true);
    expect(resume.theatricalAllowed).toBe(false);
    expect(resume.paidRetryAllowed).toBe(false);
    expect(resume.currentStage).toBe('DDP_STEPS_1_8');
    const corrupt = detectCorruption(checkpoint, proxy);
    expect(corrupt.corrupt).toBe(true);
    const refused = resumeFromCheckpoint({ checkpoint, run: proxy });
    expect(refused.allowed).toBe(false);
  });
});

describe('Episode 1 draft package', () => {
  it('stays DRAFT_NONCANONICAL with continuity, deps, and manifests', () => {
    expect(pack.label).toBe('DRAFT_NONCANONICAL');
    expect(pack.canonical).toBe(false);
    expect(pack.storyApproved).toBe(false);
    expect(pack.continuity.ok).toBe(true);
    expect(pack.canon.allowed).toBe(false);
    expect(pack.validation.missingLinks).toBe(0);
    expect(pack.manifests.camera.length).toBeGreaterThan(0);
    expect(pack.manifests.lighting.length).toBeGreaterThan(0);
    expect(pack.manifests.audioCues.every((cue) => cue.synthesised === false)).toBe(true);
    expect(pack.workflow.bundle.draft.occupants.join(' ')).not.toMatch(/CHAR_PIP|CHAR_GOAT/);
    expect(pack.mux.outputPath).not.toContain('production-library');
  });
});

describe('persist contracts', () => {
  it('writes, reloads, and reuses an identical cache key on an injected client', async () => {
    const client = memoryPersistDb();
    const first = await persistPreproductionRun({
      episodeId: pack.workflow.episodeId,
      workflow: pack.workflow,
      durableRequired: true,
      client,
    });
    expect(first.status).toBe('PERSISTED');
    expect(first.persisted).toBe(true);
    const loaded = await loadLatestPreproductionRun(pack.workflow.episodeId, client);
    expect(loaded?.id).toBe(first.id);
    const reused = await persistPreproductionRun({
      episodeId: pack.workflow.episodeId,
      workflow: pack.workflow,
      durableRequired: true,
      client,
    });
    expect(reused.id).toBe(first.id);
    expect(reused.reason).toMatch(/Reused/);
    const byKey = await loadPreproductionRunByCacheKey(pack.workflow.episodeId, pack.workflow.cacheKey, client);
    expect(byKey?.id).toBe(first.id);
    expect(client.rows).toHaveLength(1);
  });

  it('preserves EPHEMERAL_TEST_ONLY for fixtures', async () => {
    const result = await persistPreproductionRun({
      episodeId: proxy.episodeId,
      workflow: proxy,
      ephemeralTestOnly: true,
    });
    expect(result.status).toBe('EPHEMERAL_TEST_ONLY');
    expect(result.persisted).toBe(false);
  });

  it('returns PERSISTENCE_FAILED and fail-closes when durableRequired', async () => {
    const forbidden = { ...pack.workflow, mayContinueToFinal: true } as typeof pack.workflow;
    const failed = await persistPreproductionRun({
      episodeId: 'forbidden',
      workflow: forbidden,
      client: memoryPersistDb(),
    });
    expect(failed.status).toBe('PERSISTENCE_FAILED');
    await expect(
      persistPreproductionRun({
        episodeId: pack.workflow.episodeId,
        workflow: pack.workflow,
        durableRequired: true,
        client: {},
      }),
    ).rejects.toThrow(/PERSISTENCE_FAILED/);
    expect(() =>
      assertDurableWorkflowPersisted({
        status: 'PERSISTENCE_FAILED',
        persisted: false,
        reason: 'missing model',
      }),
    ).toThrow(/must persist durably/);
  });
});

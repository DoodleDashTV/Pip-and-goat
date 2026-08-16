/**
 * Closed-gate Steps 9–16 infrastructure.
 *
 * Draft PRs #24, #26, #27, #28, and #29 stay unmerged. Theatrical Steps 9–16
 * stay closed. Episode 1 stays DRAFT_NONCANONICAL / PIPELINE_TEST_ONLY.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EPISODE_1_DRAFT_BRIEF,
  PROXY_PIPELINE_BRIEF,
  advanceWorkflow,
  assertSteps9To16StillClosed,
  buildEpisode1DraftPackage,
  buildProvenance,
  checkpointWorkflow,
  compileClosedAnimatic,
  compileClosedStepsAcceptance,
  compileClosedStoryboard,
  compileContinuityDatabase,
  compileMotionAudioQc,
  compileRetentionPlan,
  compileStoryBrain,
  compileVisualQc,
  detectCorruption,
  evaluateEpisodeLaunchSafety,
  evaluatePaidResourcePolicy,
  evaluateProductionOutputGate,
  invalidateShots,
  planAutoRepair,
  planPartialRerender,
  planSteps9To16Infrastructure,
  refuseCanonicalStoryPromotion,
  refuseProtectedRepair,
  restoreCachedPlan,
  resumeFromCheckpoint,
  trackShotDependencies,
} from '@doodle-dash/preproduction';
import { currentStage, evaluateTheatricalGate, FINAL_1080P_ACCEPTANCE } from '@doodle-dash/direction';
import { persistDraftContinuity, persistPreproductionRun, type PersistDb } from '@doodle-dash/production';

const repoRoot = path.resolve(__dirname, '../../../..');
const pack = buildEpisode1DraftPackage();
const proxy = advanceWorkflow(PROXY_PIPELINE_BRIEF);

function memoryPersistDb(): { client: PersistDb; rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    client: {
      preproductionRun: {
        async findFirst(args?: Record<string, unknown>) {
          const where = (args?.where ?? {}) as { episodeId?: string; cacheKey?: string };
          return (
            rows.find((row) => {
              if (where.episodeId && row.episodeId !== where.episodeId) return false;
              if (where.cacheKey && row.cacheKey !== where.cacheKey) return false;
              return true;
            }) ?? null
          );
        },
        async create(args: Record<string, unknown>) {
          const data = args.data as Record<string, unknown>;
          const row = { id: `mem-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
      },
    },
  };
}

describe('closed theatrical gate and isolation', () => {
  it('keeps accepted lineage and unmerged draft PRs documented', () => {
    const progress = readFileSync(path.join(repoRoot, 'TRIVVLEJOY_PROGRESS.md'), 'utf8');
    expect(progress).toContain('cursor/trivvlejoy-milestone-3-1ebc');
    expect(progress).toContain('character-independent');
    expect(progress).toContain('Do not continue the paused Pip conversion');
    expect(progress).toContain('Milestone 5');
    expect(progress).toContain('Draft PR #26');
    expect(progress).toContain('Draft PR #27');
    expect(progress).toContain('Draft PR #28');
    expect(progress).toContain('Draft PR #29');
    expect(progress).toContain('b4e311ac3b72d004923506b104a27cd9ccec0480');
    expect(progress).toContain('82f26c81fc3564321289831a95ae93468b2f1369');
  });

  it('leaves currentStage and theatrical gate unchanged', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    assertSteps9To16StillClosed();
    const plan = planSteps9To16Infrastructure();
    expect(plan.opened).toBe(false);
    expect(plan.gateAllowed).toBe(false);
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint).toBe(
      '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
    );
  });

  it('refuses FINAL_RENDER, production-library, paid execution, and voice synthesis', () => {
    expect(
      evaluateEpisodeLaunchSafety({
        command: 'generate-final',
        intent: 'FINAL',
        characterMode: 'PROXY',
        occupants: pack.workflow.bundle.draft.occupants,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateProductionOutputGate({
        outputClass: 'FINAL_PRODUCTION',
        renderTier: 'FINAL',
        assetQuality: 'THEATRICAL',
        occupants: pack.workflow.bundle.draft.occupants,
        writeProductionLibrary: true,
        launchPaidGpu: true,
      }).allowed,
    ).toBe(false);
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 4 }).allowed).toBe(false);
    expect(pack.workflow.bundle.audio.lockedVoicesUntouched).toBe(true);
    expect(pack.closedSteps.motionQc.synthesisedVoices).toBe(false);
    expect(pack.mux.outputPath).not.toContain('production-library');
  });
});

describe('9 story brain', () => {
  it('is deterministic, eight-beat, and refuses canon', () => {
    const a = compileStoryBrain({ brief: EPISODE_1_DRAFT_BRIEF, draft: pack.workflow.bundle.draft });
    const b = compileStoryBrain({ brief: EPISODE_1_DRAFT_BRIEF, draft: pack.workflow.bundle.draft });
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(a.eightBeatStructure).toHaveLength(8);
    expect(a.label).toBe('DRAFT_NONCANONICAL');
    expect(a.canonical).toBe(false);
    expect(refuseCanonicalStoryPromotion(pack.workflow.bundle.draft).allowed).toBe(false);
    expect(a.placeholderRoles.join(' ')).not.toMatch(/CHAR_PIP|CHAR_GOAT/);
  });
});

describe('10 continuity database', () => {
  it('resolves setup/payoff and never promotes', () => {
    const db = compileContinuityDatabase(pack.workflow.bundle.draft);
    expect(db.promoted).toBe(false);
    expect(db.readiness.canPromote).toBe(false);
    expect(db.readiness.ok).toBe(true);
    expect(db.setupPayoffLinks.length).toBeGreaterThan(0);
    expect(db.mapClues.length).toBeGreaterThan(0);
    expect(db.timeline).toHaveLength(pack.workflow.bundle.draft.beats.length);
  });
});

describe('11 retention planner', () => {
  it('is advisory and does not claim real audience data', () => {
    const plan = compileRetentionPlan(pack.workflow.bundle.draft);
    expect(plan.advisoryOnly).toBe(true);
    expect(plan.claimsRealAudienceData).toBe(false);
    expect(plan.firstSecondVisualHook.length).toBeGreaterThan(0);
    expect(plan.pacingIntervals.length).toBe(8);
  });
});

describe('12 / 13 storyboard and animatic compilers', () => {
  it('keeps panel-to-clip traceability without Pip/Goat assets', () => {
    const boards = compileClosedStoryboard(pack.workflow.bundle.draft);
    expect(boards.bindsPipGoatAssets).toBe(false);
    expect(boards.panels.every((panel) => panel.panelId && panel.beatId && panel.safetyNotes)).toBe(true);
    const animatic = compileClosedAnimatic({
      draft: pack.workflow.bundle.draft,
      storyboard: pack.workflow.bundle.storyboard,
      audio: pack.workflow.bundle.audio,
      outputPath: 'artifacts/studio-steps-9-16-closed/test.mp4',
    });
    expect(animatic.clips).toHaveLength(boards.panels.length);
    expect(animatic.clips.every((clip) => boards.panels.some((panel) => panel.panelId === clip.panelId))).toBe(true);
    expect(animatic.finishedCharacterAnimation).toBe(false);
    expect(animatic.audioKind).toBe('NON_VOICE_TEST_AUDIO');
    expect(() =>
      compileClosedAnimatic({
        draft: pack.workflow.bundle.draft,
        storyboard: pack.workflow.bundle.storyboard,
        audio: pack.workflow.bundle.audio,
        outputPath: 'production-library/leak.mp4',
      }),
    ).toThrow(/production-library/);
  });
});

describe('14 / 15 visual, motion, and audio QC', () => {
  it('fails closed on FINAL labels and locked-voice claims', () => {
    const visual = compileVisualQc({
      storyboard: pack.workflow.bundle.storyboard,
      animatic: pack.workflow.bundle.animatic,
      probe: { width: 360, height: 640, hasVideo: true, fileBytes: 12, outputPath: 'artifacts/x.mp4' },
    });
    expect(visual.theatricalCharacterQualityApproved).toBe(false);
    expect(visual.technical).toBe('PASS');
    const motion = compileMotionAudioQc({
      animatic: pack.workflow.bundle.animatic,
      audio: pack.workflow.bundle.audio,
      probe: { hasAudio: true, durationSeconds: 29.5 },
    });
    expect(motion.synthesisedVoices).toBe(false);
    expect(motion.technical).toBe('PASS');
  });
});

describe('16 auto-repair', () => {
  it('records repairs, reruns QC, and refuses protected assets', () => {
    const deps = trackShotDependencies({
      draft: pack.workflow.bundle.draft,
      storyboard: pack.workflow.bundle.storyboard,
      animatic: pack.workflow.bundle.animatic,
      shotPlan: pack.workflow.bundle.shotPlan,
    });
    const repair = planAutoRepair({
      storyboard: pack.workflow.bundle.storyboard,
      animatic: pack.workflow.bundle.animatic,
      audio: pack.workflow.bundle.audio,
      dependencies: deps.dependencies,
    });
    expect(repair.paid).toBe(false);
    expect(repair.skippedQc).toBe(false);
    expect(repair.mayEnterFinal).toBe(false);
    expect(repair.mayPromoteCanon).toBe(false);
    expect(repair.versionHistory.current.label).toBe('DRAFT_NONCANONICAL');
    expect(repair.actions.length).toBeGreaterThan(0);
    expect(refuseProtectedRepair('production-library/characters/goat_production.blend').allowed).toBe(false);
    expect(refuseProtectedRepair('synthesize pip_default_v1').allowed).toBe(false);
  });
});

describe('hardening 17–24 integration', () => {
  it('reuses versioning, deps, cache, provenance, checkpoints, and resume safety', () => {
    const deps = trackShotDependencies({
      draft: pack.workflow.bundle.draft,
      storyboard: pack.workflow.bundle.storyboard,
      animatic: pack.workflow.bundle.animatic,
      shotPlan: pack.workflow.bundle.shotPlan,
    });
    expect(deps.dependencies.every((entry) => entry.panelId && entry.clipId)).toBe(true);
    const dirty = invalidateShots(deps.dependencies, { kind: 'BEAT', id: pack.workflow.bundle.draft.beats[0]!.beatId });
    expect(dirty.paidRerender).toBe(false);
    const cache = planPartialRerender({
      animatic: pack.workflow.bundle.animatic,
      orchestration: pack.workflow.bundle.orchestration,
      shotPlan: pack.workflow.bundle.shotPlan,
    });
    const restored = restoreCachedPlan({ cacheKey: 'k', plan: pack.workflow.bundle.shotPlan });
    expect(restored.mustReevaluateQc).toBe(true);
    expect(cache.mayEnterFinal).toBe(false);
    const checkpoint = checkpointWorkflow(pack.workflow);
    expect(detectCorruption(checkpoint, pack.workflow).corrupt).toBe(false);
    expect(detectCorruption(checkpoint, proxy).corrupt).toBe(true);
    const resume = resumeFromCheckpoint({ checkpoint, run: pack.workflow });
    expect(resume.reevaluatedSafety).toBe(true);
    expect(resume.theatricalAllowed).toBe(false);
    const provenance = buildProvenance({
      sourceCommit: 'b4e311ac3b72d004923506b104a27cd9ccec0480',
      episodeId: pack.workflow.episodeId,
      cacheKey: pack.workflow.cacheKey,
      inputs: { seed: pack.brief.seed },
    });
    expect(provenance.includesPipGoatAssets).toBe(false);
  });
});

describe('Episode 1 closed-gate package', () => {
  it('stays DRAFT_NONCANONICAL / PIPELINE_TEST_ONLY', () => {
    expect(pack.label).toBe('DRAFT_NONCANONICAL');
    expect(pack.pipelineClass).toBe('PIPELINE_TEST_ONLY');
    expect(pack.closedSteps.completedEpisode).toBe(false);
    expect(pack.closedSteps.animatedEpisode).toBe(false);
    expect(pack.closedSteps.publishable).toBe(false);
    expect(pack.closedSteps.finalDraftAcceptance.status).toBe('DRAFT_PIPELINE_TEST_ONLY');
    expect(pack.closedSteps.currentStage).toBe('DDP_STEPS_1_8');
    expect(pack.closedSteps.steps9To16Opened).toBe(false);
    const acceptance = compileClosedStepsAcceptance({
      brief: pack.brief,
      workflow: pack.workflow,
      sourceCommit: 'test',
      outputPath: 'artifacts/studio-steps-9-16-closed/episode-1-draft.mp4',
    });
    expect(acceptance.storyPlan.cacheKey).toBe(pack.closedSteps.storyPlan.cacheKey);
  });
});

describe('persistence contracts', () => {
  it('persists draft continuity and fail-closes when durableRequired', async () => {
    const memory = memoryPersistDb();
    const first = await persistDraftContinuity({
      episodeId: pack.workflow.episodeId,
      cacheKey: pack.closedSteps.continuityLedger.cacheKey,
      content: { ledger: pack.closedSteps.continuityLedger.ledger, promoted: false, canonical: false },
      occupants: pack.workflow.bundle.draft.occupants,
      durableRequired: true,
      client: memory.client,
    });
    expect(first.status).toBe('PERSISTED');
    const reused = await persistDraftContinuity({
      episodeId: pack.workflow.episodeId,
      cacheKey: pack.closedSteps.continuityLedger.cacheKey,
      content: { ledger: pack.closedSteps.continuityLedger.ledger, promoted: false },
      durableRequired: true,
      client: memory.client,
    });
    expect(reused.id).toBe(first.id);
    const ephemeral = await persistPreproductionRun({
      episodeId: proxy.episodeId,
      workflow: proxy,
      ephemeralTestOnly: true,
    });
    expect(ephemeral.status).toBe('EPHEMERAL_TEST_ONLY');
    await expect(
      persistDraftContinuity({
        episodeId: 'x',
        cacheKey: 'y',
        content: { promoted: false },
        durableRequired: true,
        client: {},
      }),
    ).rejects.toThrow(/PERSISTENCE_FAILED/);
    const promoted = await persistDraftContinuity({
      episodeId: 'x',
      cacheKey: 'y',
      content: { promoted: true },
      client: memory.client,
    });
    expect(promoted.status).toBe('PERSISTENCE_FAILED');
  });
});

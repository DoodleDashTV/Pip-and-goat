import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateShotVisualApproval } from './tivvlejoy-storybook-environment';
import {
  CAMERA_TEMPLATE_IDS,
  evaluateLocationTransition,
  evaluatePlannerVisualGate,
  evaluateRerender,
  hashLocationDelta,
  hashShotDependency,
  sampleBatchPlan,
  sampleEpisodePlan,
  sampleEpisodeWithKnownHashes,
  sampleShotDrafts,
  SAMPLE_LOCATION_DELTA,
  storyOrderPreserved,
} from './tivvlejoy-episode-scene-planner';

const repoRoot = path.resolve(__dirname, '../../../..');

function hashFromDraft(draft = sampleShotDrafts()[2]!, deltaSha: string | null = null) {
  return hashShotDependency({
    shotId: draft.shotId,
    cameraTemplateId: draft.cameraTemplateId,
    lightingPresetId: draft.lightingPresetId,
    locationPresetId: draft.locationPresetId,
    environmentVersion: draft.environmentVersion,
    visibleGeometry: draft.visibleGeometry,
    visibleMaterials: draft.visibleMaterials,
    visibleDressing: draft.visibleDressing,
    characterAnimation: draft.characterAnimation,
    storyPropRefs: draft.storyPropRefs,
    locationDeltaSha256: deltaSha,
    renderProfile: draft.renderProfile,
    fps: 30,
    resolution: '1080x1920',
  });
}

describe('episode plan determinism', () => {
  it('builds a deterministic episode plan', () => {
    const a = sampleEpisodeWithKnownHashes();
    const b = sampleEpisodeWithKnownHashes();
    expect(a.dependencyHash).toBe(b.dependencyHash);
    expect(a.shots).toHaveLength(11);
    expect(a.durationTargetSeconds).toBeGreaterThanOrEqual(58);
    expect(a.durationTargetSeconds).toBeLessThanOrEqual(65);
    expect(a.outputResolution).toBe('1080x1920');
    expect(a.fps).toBe(30);
  });

  it('keeps shot hashes deterministic', () => {
    expect(hashFromDraft()).toBe(hashFromDraft());
  });

  it('does not change a shot dependency hash when notes change', () => {
    const first = sampleEpisodePlan({ notes: 'one' });
    const second = sampleEpisodePlan({ notes: 'two' });
    expect(first.shots[2]?.shotDependencySha256).toBe(second.shots[2]?.shotDependencySha256);
  });

  it('changes the hash when the camera changes', () => {
    const draft = sampleShotDrafts()[2]!;
    const changed = { ...draft, cameraTemplateId: 'TJ_CAM_PIP_CLOSE' as const };
    expect(hashFromDraft(changed)).not.toBe(hashFromDraft(draft));
  });

  it('changes the hash when lighting changes', () => {
    const draft = sampleShotDrafts()[2]!;
    const changed = { ...draft, lightingPresetId: 'TJ_GOLDEN_HOUR' as const };
    expect(hashFromDraft(changed)).not.toBe(hashFromDraft(draft));
  });

  it('changes the hash when a visible asset changes', () => {
    const draft = sampleShotDrafts()[2]!;
    const changed = { ...draft, visibleGeometry: [...draft.visibleGeometry, 'extra-cart'] };
    expect(hashFromDraft(changed)).not.toBe(hashFromDraft(draft));
  });

  it('does not change another shot when an unrelated shot changes', () => {
    const shots = sampleShotDrafts();
    shots[0] = { ...shots[0]!, cameraTemplateId: 'TJ_CAM_REVEAL' };
    const changed = sampleEpisodePlan({ shots });
    const baseline = sampleEpisodePlan();
    expect(changed.shots[3]?.shotDependencySha256).toBe(baseline.shots[3]?.shotDependencySha256);
    expect(changed.shots[0]?.shotDependencySha256).not.toBe(baseline.shots[0]?.shotDependencySha256);
  });

  it('changes only affected shots when a location delta changes', () => {
    const baseline = sampleEpisodePlan();
    const delta = { ...SAMPLE_LOCATION_DELTA, addedProps: [...SAMPLE_LOCATION_DELTA.addedProps, 'extra-bunting'] };
    const changed = sampleEpisodePlan({ delta });
    expect(hashLocationDelta(delta)).not.toBe(hashLocationDelta(SAMPLE_LOCATION_DELTA));
    expect(changed.shots.find((shot) => shot.shotId === 'SH003')?.shotDependencySha256).not.toBe(
      baseline.shots.find((shot) => shot.shotId === 'SH003')?.shotDependencySha256,
    );
    expect(changed.shots.find((shot) => shot.shotId === 'SH001')?.shotDependencySha256).toBe(
      baseline.shots.find((shot) => shot.shotId === 'SH001')?.shotDependencySha256,
    );
  });
});

describe('grouping, continuity, and approval', () => {
  it('keeps production grouping from rewriting story order', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.storyOrder).toEqual(sampleShotDrafts().map((shot) => shot.shotId));
    expect(storyOrderPreserved(plan.storyOrder, plan.productionOrder)).toBe(true);
  });

  it('reduces environment loads by grouping shared locations', () => {
    const batch = sampleBatchPlan();
    expect(batch.locationLoadsWithGrouping).toBeLessThan(batch.locationLoadsWithoutGrouping);
    expect(batch.estimatedLoadsSaved).toBeGreaterThan(0);
  });

  it('allows a valid adjacent world transition', () => {
    expect(evaluateLocationTransition('bakery', 'forest_exit').ok).toBe(true);
  });

  it('blocks an invalid non-adjacent world transition', () => {
    const blocked = evaluateLocationTransition('bakery', 'amusement_entrance');
    expect(blocked.ok).toBe(false);
    expect(blocked.continuityBlocker).toMatch(/explicitTransition/);
  });

  it('allows a non-adjacent jump only with an explicit transition', () => {
    expect(evaluateLocationTransition('bakery', 'amusement_entrance', true).ok).toBe(true);
  });

  it('passes visual score >= 90 with zero hard blockers', () => {
    const visual = evaluateShotVisualApproval({
      shotId: 'SH003',
      shotDependencySha256: 'aa'.repeat(32),
      scores: {
        focalReadability: 90,
        characterReadability: 90,
        composition916: 90,
        lighting: 90,
        palette: 90,
        dressing: 90,
        tierQuality: 90,
        signage: 90,
        kidReadability: 90,
      },
      hardBlockers: [],
      focalTarget: 'PIP',
    });
    const gate = evaluatePlannerVisualGate({
      shotId: 'SH003',
      shotDependencySha256: 'aa'.repeat(32),
      receipt: visual.receipt,
    });
    expect(visual.receipt.score).toBe(90);
    expect(gate.ok).toBe(true);
  });

  it('fails a score of 100 when a hard blocker is present', () => {
    const visual = evaluateShotVisualApproval({
      shotId: 'SH003',
      shotDependencySha256: 'aa'.repeat(32),
      scores: {
        focalReadability: 100,
        characterReadability: 100,
        composition916: 100,
        lighting: 100,
        palette: 100,
        dressing: 100,
        tierQuality: 100,
        signage: 100,
        kidReadability: 100,
      },
      hardBlockers: ['PIP_EYES_OCCLUDED'],
      focalTarget: 'PIP',
    });
    const gate = evaluatePlannerVisualGate({
      shotId: 'SH003',
      shotDependencySha256: 'aa'.repeat(32),
      receipt: visual.receipt,
    });
    expect(visual.receipt.score).toBe(100);
    expect(gate.ok).toBe(false);
  });

  it('blocks a stale visual approval', () => {
    const visual = evaluateShotVisualApproval({
      shotId: 'SH003',
      shotDependencySha256: 'aa'.repeat(32),
      scores: {
        focalReadability: 94,
        characterReadability: 94,
        composition916: 94,
        lighting: 94,
        palette: 94,
        dressing: 94,
        tierQuality: 94,
        signage: 94,
        kidReadability: 94,
      },
      hardBlockers: [],
      focalTarget: 'PIP',
    });
    const gate = evaluatePlannerVisualGate({
      shotId: 'SH003',
      shotDependencySha256: 'bb'.repeat(32),
      receipt: visual.receipt,
    });
    expect(gate.status).toBe('BLOCKED_APPROVAL_STALE');
    expect(evaluateRerender({
      previousShotDependencySha256: 'bb'.repeat(32),
      currentShotDependencySha256: 'bb'.repeat(32),
      renderProfile: 'REVIEW',
      visualApprovalStale: true,
    })).toBe('BLOCKED_APPROVAL_STALE');
  });

  it('does not treat synthetic fixture approval as production approval', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.shots.every((shot) => shot.visualApprovalReceiptRef.reviewerMode === 'FIXTURE')).toBe(true);
    expect(plan.shots.every((shot) => shot.visualGate.productionApprovalEligible === false)).toBe(true);
  });
});

describe('handoff safety and isolation', () => {
  it('keeps FINAL render unauthorized', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.receipt.finalRenderAuthorized).toBe(false);
    expect(plan.shots.every((shot) => shot.handoff.finalRenderAuthorized === false)).toBe(true);
  });

  it('keeps provider contacted false', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.safety.providerContacted).toBe(false);
    expect(plan.shots.every((shot) => shot.handoff.providerContacted === false)).toBe(true);
  });

  it('keeps GPU launched false', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.safety.gpuLaunched).toBe(false);
    expect(plan.receipt.gpuLaunched).toBe(false);
  });

  it('has no Botaniq dependency', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.safety.botaniqProcessed).toBe(false);
    expect(JSON.stringify(plan)).not.toMatch(/botaniq_full|Botaniq Full/i);
  });

  it('has no commercial file dependency', () => {
    const plan = sampleEpisodeWithKnownHashes();
    expect(plan.safety.commercialAssetsProcessed).toBe(false);
    expect(CAMERA_TEMPLATE_IDS).toHaveLength(14);
  });

  it('does not change the purchased-assets uploader', () => {
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/purchased-assets'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/api/purchased-tools'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/lib/purchased-tools'))).toBe(false);
  });

  it('documents the planner and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_EPISODE_SCENE_PLANNER_AND_REUSE_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/EpisodeScenePlanner.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_EPISODE_SCENE_PLAN_V1');
    expect(docs).toContain('TIVVLEJOY_RENDER_BACKEND_READINESS_V1');
    expect(ui).toContain('Episode Scene Planner');
    expect(ui).toContain('NO PAID GPU');
    expect(ui).not.toMatch(/DoodleDash/i);
  });

  it('reports BLOCKED_DEPENDENCY_UNKNOWN without a prior hash', () => {
    expect(
      evaluateRerender({
        currentShotDependencySha256: 'aa'.repeat(32),
        renderProfile: 'PLANNING',
        visualApprovalStale: false,
      }),
    ).toBe('BLOCKED_DEPENDENCY_UNKNOWN');
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_READABILITY_CONTRACT,
  COMPOSITION_9_16_CONTRACT,
  FOCAL_READABILITY_CONTRACT,
  KID_READABILITY_CONTRACT,
  SCATTER_PROVIDER,
  SYNTHETIC_STORYBOOK_INPUT,
  advanceStylizationApproval,
  batchGroupShots,
  classifyQualityTier,
  classifyVisualResult,
  derivativeIdentity,
  evaluatePalette,
  evaluateProvenance,
  evaluateShotVisualApproval,
  evaluateSignage,
  locationPreset,
  mapLegacySourceStatus,
  nativeScatterPlan,
  optionalProviderBoundary,
  planDressing,
  syntheticStorybookPlan,
  textureTargetForTier,
  validateWorldGraph,
  worldGraph,
} from './tivvlejoy-storybook-environment';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('quality tiers and textures', () => {
  it('uses frame-height thresholds and honors manual overrides', () => {
    expect(classifyQualityTier(4)).toBe('BACKGROUND');
    expect(classifyQualityTier(5)).toBe('SUPPORTING');
    expect(classifyQualityTier(19.9)).toBe('SUPPORTING');
    expect(classifyQualityTier(20)).toBe('HERO');
    expect(classifyQualityTier(3, { story: true })).toBe('HERO');
    expect(classifyQualityTier(50, {}, 'BACKGROUND')).toBe('BACKGROUND');
    expect(textureTargetForTier('BACKGROUND')).toBe(1024);
    expect(textureTargetForTier('SUPPORTING')).toBe(2048);
    expect(textureTargetForTier('HERO', false)).toBe(2048);
    expect(textureTargetForTier('HERO', true)).toBe(4096);
  });
});

describe('visual approval', () => {
  const scores = {
    focalReadability: 90,
    characterReadability: 90,
    composition916: 90,
    lighting: 90,
    palette: 90,
    dressing: 90,
    tierQuality: 90,
    signage: 90,
    kidReadability: 90,
  };

  it('uses score bands and never lets a hard blocker pass', () => {
    expect(classifyVisualResult(95)).toBe('VISUALLY_EXCELLENT');
    expect(classifyVisualResult(90)).toBe('VISUALLY_APPROVED');
    expect(classifyVisualResult(85)).toBe('REVISION_REQUIRED');
    expect(classifyVisualResult(84)).toBe('VISUAL_REJECT');
    const pass = evaluateShotVisualApproval({
      shotId: 'SH030',
      shotDependencySha256: 'aa'.repeat(32),
      scores,
      hardBlockers: [],
      focalTarget: 'PIP',
    });
    expect(pass.receipt.score).toBe(90);
    expect(pass.receipt.result).toBe('VISUALLY_APPROVED');
    const blocked = evaluateShotVisualApproval({
      shotId: 'SH030',
      shotDependencySha256: 'aa'.repeat(32),
      scores: { ...scores, focalReadability: 100, characterReadability: 100 },
      hardBlockers: ['PIP_EYES_OCCLUDED'],
      focalTarget: 'PIP',
    });
    expect(blocked.receipt.score).toBeGreaterThanOrEqual(90);
    expect(blocked.receipt.result).not.toMatch(/VISUALLY_/);
    expect(blocked.receipt.hardBlockers).toContain('PIP_EYES_OCCLUDED');
    const perfectBlocked = evaluateShotVisualApproval({
      shotId: 'SH030',
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
      hardBlockers: ['FOCAL_TARGET_UNCLEAR'],
      focalTarget: 'PIP',
    });
    expect(perfectBlocked.receipt.score).toBe(100);
    expect(perfectBlocked.receipt.result).toBe('REVISION_REQUIRED');
  });
});

describe('signage, palette, and dressing', () => {
  it('enforces sign, palette, dressing, obstruction, and walkable targets', () => {
    expect(
      evaluateSignage({
        template: 'TJ_SIGN_HANGING',
        signClass: 'STORY_CRITICAL',
        textCapHeightPx: 36,
        iconHeightPx: 64,
        contrast: 4.5,
        perspectiveDeg: 35,
        occlusion: 0,
      }).ok,
    ).toBe(true);
    expect(
      evaluateSignage({
        template: 'TJ_SIGN_HANGING',
        signClass: 'STORY_CRITICAL',
        textCapHeightPx: 35,
        iconHeightPx: 72,
        contrast: 5,
        perspectiveDeg: 10,
        occlusion: 0,
      }).ok,
    ).toBe(false);
    expect(evaluatePalette({ approvedPct: 85, dominantUnapprovedPct: 10, outsideApprovedPct: 20 }).ok).toBe(true);
    expect(evaluatePalette({ approvedPct: 90, dominantUnapprovedPct: 4, outsideApprovedPct: 8 }).ok).toBe(true);
    expect(evaluatePalette({ approvedPct: 90, dominantUnapprovedPct: 4, outsideApprovedPct: 21 }).ok).toBe(false);
    const dressing = planDressing({
      tier: 'HERO',
      seed: 7,
      obstructionPct: 11,
      walkableWidthPct: 79,
      identicalCopies: 4,
    });
    expect(dressing.clusterTarget).toEqual({ min: 4, max: 8 });
    expect(dressing.ok).toBe(false);
    expect(dressing.reasons.length).toBe(3);
  });
});

describe('cache, locations, world, batch, provenance', () => {
  it('keeps derivative hashes deterministic and ignores notes', () => {
    const a = derivativeIdentity({
      sourceSha: 'ab'.repeat(32),
      styleProfileVersion: 'TIVVLEJOY_STORYBOOK_ENVIRONMENT_V1',
      blenderVersion: '4.2.2',
      transformationPolicyVersion: 'material-v1',
      notes: 'one',
    });
    const b = derivativeIdentity({
      sourceSha: 'ab'.repeat(32),
      styleProfileVersion: 'TIVVLEJOY_STORYBOOK_ENVIRONMENT_V1',
      blenderVersion: '4.2.2',
      transformationPolicyVersion: 'material-v1',
      notes: 'two',
    });
    expect(a).toBe(b);
    expect(
      derivativeIdentity({
        sourceSha: 'cd'.repeat(32),
        styleProfileVersion: 'TIVVLEJOY_STORYBOOK_ENVIRONMENT_V1',
        blenderVersion: '4.2.2',
        transformationPolicyVersion: 'material-v1',
      }),
    ).not.toBe(a);
  });

  it('validates location presets, world graph, and batch grouping', () => {
    const first = locationPreset('bakery', 9);
    const second = locationPreset('bakery', 9);
    expect(first).toEqual(second);
    expect(first.commercialGeometryIncluded).toBe(false);
    expect(validateWorldGraph(worldGraph())).toBe(true);
    const grouped = batchGroupShots([
      { shotId: 'SH001', locationId: 'bakery', lighting: 'TJ_MORNING_WARM' },
      { shotId: 'SH002', locationId: 'bakery', lighting: 'TJ_MORNING_WARM' },
      { shotId: 'SH003', locationId: 'bakery', lighting: 'TJ_GOLDEN_HOUR' },
    ]);
    expect(grouped.groups).toHaveLength(2);
    expect(grouped.groups[0]?.shotIds).toEqual(['SH001', 'SH002']);
    expect(grouped.paidRender).toBe(false);
  });

  it('fails closed on unknown provenance and keeps native Blender default', () => {
    expect(
      evaluateProvenance({
        sourceId: 'x',
        licenseVerified: false,
        automationPermissionStatus: 'UNKNOWN_REVIEW_REQUIRED',
        aiMlTrainingPermissionStatus: 'UNKNOWN_REVIEW_REQUIRED',
      }).failClosed,
    ).toBe(true);
    expect(nativeScatterPlan({ kind: 'trees', seed: 1, count: 4 }).provider).toBe(SCATTER_PROVIDER);
    expect(optionalProviderBoundary('Geo-Scatter', false, false).usable).toBe(false);
    expect(optionalProviderBoundary('Geo-Scatter', false, false).geoScatterIntegrated).toBe(false);
    expect(mapLegacySourceStatus('approved')).toBe('approved');
    expect(mapLegacySourceStatus('quarantined')).toBe('quarantined');
    expect(advanceStylizationApproval({ current: 'STYLIZED_REVIEW', hero: true, explicitReviewer: false })).toBe(
      'BLOCKED_HERO_AUTO_APPROVAL',
    );
  });
});

describe('synthetic foundation plan', () => {
  it('produces a complete dry-run plan without commercial bytes or mutations', () => {
    const plan = syntheticStorybookPlan();
    expect(plan.rendered).toBe(false);
    expect(plan.sourceModified).toBe(false);
    expect(plan.licensedBytesCommitted).toBe(false);
    expect(plan.geoScatterIntegrated).toBe(false);
    expect(plan.pipGoatMutated).toBe(false);
    expect(plan.voiceMutated).toBe(false);
    expect(plan.visual.receipt.schemaVersion).toBe('TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1');
    expect(plan.visual.receipt.shotId).toBe('SH030');
    expect(plan.visual.receipt.shotDependencySha256).toHaveLength(64);
    expect(plan.stylizationReport.blenderExecuted).toBe(false);
    expect(plan.location.presetId).toBe('home_village');
    expect(plan.lighting.id).toBe('TJ_DAY_ADVENTURE');
    expect(plan.complexity.estimatedRenderSeconds).toBeGreaterThan(0);
    expect(CHARACTER_READABILITY_CONTRACT.pipGoatRigMutationRequired).toBe(false);
    expect(FOCAL_READABILITY_CONTRACT.heroFocalCoveragePct).toEqual({ min: 8, max: 40 });
    expect(COMPOSITION_9_16_CONTRACT.resolution).toBe('1080x1920');
    expect(KID_READABILITY_CONTRACT.maxMajorCompetingForms).toBe(3);
    expect(SYNTHETIC_STORYBOOK_INPUT.hero).toBe(true);
  });

  it('documents the system and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_STORYBOOK_ENVIRONMENT_SYSTEM.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/SceneryStudio.tsx'), 'utf8');
    expect(docs).toContain('GitHub Issue #67');
    expect(docs).toContain('NATIVE_BLENDER');
    expect(docs).toContain('TIVVLEJOY_SHOT_VISUAL_REPORT_V1');
    expect(ui).toContain('Storybook profile');
    expect(ui).not.toMatch(/DoodleDash/i);
    expect(ui).toContain('No commercial scenery was converted');
  });
});

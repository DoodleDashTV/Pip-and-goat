import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIGHTING_PRESETS,
  classifyVisualResult,
  evaluateShotVisualApproval,
} from './tivvlejoy-storybook-environment';
import {
  DRESSING_FIXTURES,
  PREVIEW_VALIDATION_SCHEMA,
  QUALITY_TIER_CAMERAS,
  READINESS_COMPAT_BOUNDARY,
  RUNPOD_VISUAL_RECEIPT_FIELDS,
  SIGNAGE_FIXTURES,
  evaluateDressingFixtures,
  evaluateScoreBand,
  evaluateSignageFixtures,
  lightingPresetProofs,
  rejectStaleVisualApproval,
  runStorybookPreviewValidation,
  runpodVisualReceiptCompatibility,
  shotDependencyForWorld,
  syntheticVillageWorld,
  worldCoversRequiredMaterials,
} from './tivvlejoy-storybook-preview-validation';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('synthetic fixture world', () => {
  it('generates a deterministic village with required material coverage', () => {
    const a = syntheticVillageWorld();
    const b = syntheticVillageWorld();
    expect(a).toEqual(b);
    expect(a.buildings).toHaveLength(3);
    expect(a.buildings.map((item) => item.kind)).toEqual([
      'bakery-storefront',
      'map-shop-storefront',
      'cottage-facade',
    ]);
    expect(a.reusableSignTemplates.length).toBeGreaterThanOrEqual(3);
    expect(a.productionApproved).toBe(false);
    expect(a.licensedSource).toBe(false);
    expect(worldCoversRequiredMaterials(a)).toBe(true);
  });

  it('keeps shot dependency hashes deterministic and input-sensitive', () => {
    expect(shotDependencyForWorld()).toBe(shotDependencyForWorld());
    expect(shotDependencyForWorld(1)).not.toBe(shotDependencyForWorld(2));
  });
});

describe('quality tiers', () => {
  it('classifies HERO, SUPPORTING, and BACKGROUND from projected coverage', () => {
    expect(QUALITY_TIER_CAMERAS.HERO.projectedFrameCoveragePct).toBeGreaterThanOrEqual(20);
    expect(QUALITY_TIER_CAMERAS.SUPPORTING.projectedFrameCoveragePct).toBeGreaterThanOrEqual(5);
    expect(QUALITY_TIER_CAMERAS.SUPPORTING.projectedFrameCoveragePct).toBeLessThan(20);
    expect(QUALITY_TIER_CAMERAS.BACKGROUND.projectedFrameCoveragePct).toBeLessThan(5);
    const report = runStorybookPreviewValidation();
    expect(report.tiers.map((item) => item.classified)).toEqual(['HERO', 'SUPPORTING', 'BACKGROUND']);
    expect(report.heroAutoApproval).toBe('BLOCKED_HERO_AUTO_APPROVAL');
  });
});

describe('signage validation', () => {
  it('passes all five templates at the critical thresholds', () => {
    const { pass } = evaluateSignageFixtures();
    expect(pass).toHaveLength(5);
    expect(SIGNAGE_FIXTURES.pass.map((item) => item.template)).toEqual([
      'TJ_SIGN_HANGING',
      'TJ_SIGN_WALL',
      'TJ_SIGN_ROUND',
      'TJ_SIGN_AWNING',
      'TJ_SIGN_WOOD_POST',
    ]);
    expect(pass.every((item) => item.ok)).toBe(true);
  });

  it('fails contrast below 4.5:1 with a hard blocker', () => {
    const { failContrast } = evaluateSignageFixtures();
    expect(failContrast.ok).toBe(false);
    expect(failContrast.blockers).toContain('CRITICAL_SIGN_UNREADABLE');
  });

  it('fails critical occlusion with a hard blocker', () => {
    const { failOcclusion } = evaluateSignageFixtures();
    expect(failOcclusion.occlusion).toBeGreaterThan(0);
    expect(failOcclusion.ok).toBe(false);
    expect(failOcclusion.blockers).toContain('CRITICAL_SIGN_UNREADABLE');
  });
});

describe('dressing validation', () => {
  it('passes HERO dressing density and clearance targets', () => {
    const { passHero } = evaluateDressingFixtures();
    expect(DRESSING_FIXTURES.passHero.tier).toBe('HERO');
    expect(passHero.clusterTarget).toEqual({ min: 4, max: 8 });
    expect(passHero.ok).toBe(true);
    expect(passHero.anchors).toHaveLength(11);
  });

  it('fails decorative obstruction above 10%', () => {
    const { failObstruction } = evaluateDressingFixtures();
    expect(failObstruction.ok).toBe(false);
    expect(failObstruction.reasons.some((item) => item.includes('obstruction'))).toBe(true);
  });

  it('fails walkable width below 80%', () => {
    const { failWalkable } = evaluateDressingFixtures();
    expect(failWalkable.ok).toBe(false);
    expect(failWalkable.reasons.some((item) => item.includes('walkable'))).toBe(true);
  });
});

describe('shot visual approval bands', () => {
  it('maps 95 to VISUALLY_EXCELLENT', () => {
    expect(classifyVisualResult(95)).toBe('VISUALLY_EXCELLENT');
    expect(evaluateScoreBand(95).receipt.result).toBe('VISUALLY_EXCELLENT');
    expect(evaluateScoreBand(95).receipt.score).toBe(95);
  });

  it('maps 90 to VISUALLY_APPROVED', () => {
    expect(classifyVisualResult(90)).toBe('VISUALLY_APPROVED');
    const receipt = evaluateScoreBand(90).receipt;
    expect(receipt.result).toBe('VISUALLY_APPROVED');
    expect(receipt.score).toBe(90);
    expect(receipt.hardBlockers).toEqual([]);
    expect(receipt.shotId).toBeTruthy();
    expect(receipt.shotDependencySha256).toHaveLength(64);
    expect(receipt.visualApprovalVersion).toBe('TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1');
  });

  it('maps 89 to REVISION_REQUIRED', () => {
    expect(classifyVisualResult(89)).toBe('REVISION_REQUIRED');
    expect(evaluateScoreBand(89).receipt.result).toBe('REVISION_REQUIRED');
  });

  it('maps scores below 85 to VISUAL_REJECT', () => {
    expect(classifyVisualResult(84)).toBe('VISUAL_REJECT');
    expect(evaluateScoreBand(84).receipt.result).toBe('VISUAL_REJECT');
  });

  it('blocks a score of 100 when a hard blocker is present', () => {
    const receipt = evaluateScoreBand(100, ['PIP_EYES_OCCLUDED']).receipt;
    expect(receipt.score).toBe(100);
    expect(receipt.hardBlockers).toContain('PIP_EYES_OCCLUDED');
    expect(receipt.result).not.toMatch(/VISUALLY_/);
    expect(['VISUALLY_APPROVED', 'VISUALLY_EXCELLENT']).not.toContain(receipt.result);
  });
});

describe('RunPod contract compatibility', () => {
  it('rejects a stale shotDependencySha256', () => {
    const current = shotDependencyForWorld();
    const stale = rejectStaleVisualApproval(current, 'aa'.repeat(32));
    expect(stale.ok).toBe(false);
    expect(stale.status).toBe('BLOCKED_VISUAL_APPROVAL_STALE');
  });

  it('exposes the exact fields expected by the later readiness adapter', () => {
    const receipt = evaluateScoreBand(92).receipt;
    const compat = runpodVisualReceiptCompatibility(receipt);
    expect(receipt.schemaVersion).toBe('TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1');
    expect(compat.requiredFields).toEqual([...RUNPOD_VISUAL_RECEIPT_FIELDS]);
    expect(compat.fieldsMatch).toBe(true);
    expect(compat.readinessBoundary).toBe(READINESS_COMPAT_BOUNDARY);
    expect(compat.paidExecutorImported).toBe(false);
    expect(compat.authorizationEnabled).toBe(false);
    expect(compat.wouldAdmitToReadiness).toBe(true);
    const staleReceipt = { ...receipt, shotDependencySha256: '00'.repeat(32) };
    expect(runpodVisualReceiptCompatibility(staleReceipt).staleRejected).toBe(true);
    expect(runpodVisualReceiptCompatibility(staleReceipt).wouldAdmitToReadiness).toBe(false);
  });
});

describe('lighting, safety, and preview report', () => {
  it('resolves all seven lighting presets on the native Blender path', () => {
    const proofs = lightingPresetProofs();
    expect(proofs.map((item) => item.id)).toEqual([...LIGHTING_PRESETS]);
    expect(proofs.every((item) => item.resolved && item.nativeBlender && !item.commercialPluginRequired)).toBe(true);
  });

  it('records zero paid-provider mutation and no commercial file dependency', () => {
    const report = runStorybookPreviewValidation();
    expect(report.schemaVersion).toBe(PREVIEW_VALIDATION_SCHEMA);
    expect(report.safety.postPods).toBe(0);
    expect(report.safety.deletePods).toBe(0);
    expect(report.safety.providerMutations).toBe(0);
    expect(report.safety.runpodContacted).toBe(false);
    expect(report.safety.paidComputeUsd).toBe(0);
    expect(report.safety.gpuLaunched).toBe(false);
    expect(report.safety.botaniqProcessed).toBe(false);
    expect(report.safety.geoScatterUsed).toBe(false);
    expect(report.world.licensedSource).toBe(false);
    expect(report.world.commercialBytes).toBe(false);
    expect(report.blenderExecuted).toBe(false);
    expect(report.finalRenderGenerated).toBe(false);
    expect(report.contactSheet.final1080x1920).toBe(false);
    expect(report.complexity.visibleTriangles).toBeGreaterThan(0);
    expect(report.contactSheetSvg).toContain('SYNTHETIC CONTACT SHEET');
  });

  it('documents the milestone and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_STORYBOOK_PREVIEW_VALIDATION_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/SceneryStudio.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_RENDER_BACKEND_READINESS_V1');
    expect(docs).toContain('BLOCKED_VISUAL_APPROVAL_STALE');
    expect(docs).toContain('synthetic');
    expect(ui).toContain('Storybook Preview Validation');
    expect(ui).not.toMatch(/DoodleDash/i);
    expect(ui).toContain('Synthetic fixtures only');
  });
});

describe('existing approval receipt shape', () => {
  it('never weakens the >=90 + zero-hard-blocker rule', () => {
    const weak = evaluateShotVisualApproval({
      shotId: 'SH_PREVIEW_001',
      shotDependencySha256: shotDependencyForWorld(),
      scores: {
        focalReadability: 89,
        characterReadability: 89,
        composition916: 89,
        lighting: 89,
        palette: 89,
        dressing: 89,
        tierQuality: 89,
        signage: 89,
        kidReadability: 89,
      },
      hardBlockers: [],
      focalTarget: 'PIP',
    });
    expect(weak.receipt.score).toBe(89);
    expect(['VISUALLY_APPROVED', 'VISUALLY_EXCELLENT']).not.toContain(weak.receipt.result);
  });
});

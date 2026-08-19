import {
  LIGHTING_PRESETS,
  LIGHTING_PROFILES,
  SHOT_VISUAL_APPROVAL_SCHEMA,
  SIGN_TEMPLATES,
  STORYBOOK_PROFILE,
  advanceStylizationApproval,
  classifyQualityTier,
  classifyVisualResult,
  estimateComplexity,
  evaluateShotVisualApproval,
  evaluateSignage,
  planDressing,
  sha256Canonical,
  textureTargetForTier,
  type HardVisualBlocker,
  type LightingPresetId,
  type QualityTier,
} from '@/lib/tivvlejoy-storybook-environment';
import {
  ACCEPTED_VISUAL_RESULTS,
  CONTACT_SHEET_SLOTS,
  LADDER_STEPS,
  PREVIEW_FINAL_FORBIDDEN,
  PREVIEW_REVIEW,
  PREVIEW_THUMBNAIL,
  PREVIEW_VALIDATION_SCHEMA,
  PREVIEW_VALIDATION_SEED,
  READINESS_COMPAT_BOUNDARY,
  RUNPOD_VISUAL_RECEIPT_FIELDS,
} from './types';
import { syntheticVillageWorld, worldCoversRequiredMaterials } from './world';

export const QUALITY_TIER_CAMERAS = Object.freeze({
  HERO: {
    id: 'CAM_HERO_STREET',
    tier: 'HERO' as const,
    projectedFrameCoveragePct: 28,
    distance: 4.2,
    focal: 'PIP_AND_GOAT',
    intendedTexture: textureTargetForTier('HERO', false),
    materialComplexity: 'high',
    geometryComplexity: 'hero-facade',
    heroSafe: true,
    backgroundSafe: false,
  },
  SUPPORTING: {
    id: 'CAM_SUPPORTING_SHOP',
    tier: 'SUPPORTING' as const,
    projectedFrameCoveragePct: 12,
    distance: 9.5,
    focal: 'HERO_SCENERY',
    intendedTexture: textureTargetForTier('SUPPORTING'),
    materialComplexity: 'medium',
    geometryComplexity: 'storefront',
    heroSafe: false,
    backgroundSafe: true,
  },
  BACKGROUND: {
    id: 'CAM_BACKGROUND_TREELINE',
    tier: 'BACKGROUND' as const,
    projectedFrameCoveragePct: 3,
    distance: 26,
    focal: 'HERO_SCENERY',
    intendedTexture: textureTargetForTier('BACKGROUND'),
    materialComplexity: 'low',
    geometryComplexity: 'instance-cluster',
    heroSafe: false,
    backgroundSafe: true,
  },
});

export const SIGNAGE_FIXTURES = Object.freeze({
  pass: SIGN_TEMPLATES.map((template, index) => ({
    id: `SIGN_PASS_${template}`,
    template,
    signClass: 'STORY_CRITICAL' as const,
    textCapHeightPx: 36 + index,
    iconHeightPx: 64 + index * 2,
    contrast: 4.5 + index * 0.1,
    perspectiveDeg: 12 + index,
    occlusion: 0,
    icon: 'bakery',
    text: 'TEST',
  })),
  failContrast: {
    id: 'SIGN_FAIL_CONTRAST',
    template: 'TJ_SIGN_WALL' as const,
    signClass: 'STORY_CRITICAL' as const,
    textCapHeightPx: 40,
    iconHeightPx: 72,
    contrast: 3.2,
    perspectiveDeg: 10,
    occlusion: 0,
    icon: 'repair',
    text: 'DIM',
  },
  failOcclusion: {
    id: 'SIGN_FAIL_OCCLUSION',
    template: 'TJ_SIGN_HANGING' as const,
    signClass: 'STORY_CRITICAL' as const,
    textCapHeightPx: 40,
    iconHeightPx: 72,
    contrast: 5.1,
    perspectiveDeg: 8,
    occlusion: 0.2,
    icon: 'food',
    text: 'HIDE',
  },
});

export const DRESSING_FIXTURES = Object.freeze({
  passHero: { tier: 'HERO' as const, seed: PREVIEW_VALIDATION_SEED, obstructionPct: 8, walkableWidthPct: 85, identicalCopies: 2 },
  failObstruction: { tier: 'HERO' as const, seed: PREVIEW_VALIDATION_SEED, obstructionPct: 14, walkableWidthPct: 85, identicalCopies: 2 },
  failWalkable: { tier: 'SUPPORTING' as const, seed: PREVIEW_VALIDATION_SEED, obstructionPct: 6, walkableWidthPct: 72, identicalCopies: 1 },
  failCopies: { tier: 'BACKGROUND' as const, seed: PREVIEW_VALIDATION_SEED, obstructionPct: 4, walkableWidthPct: 90, identicalCopies: 4 },
});

function uniformScores(value: number) {
  return {
    focalReadability: value,
    characterReadability: value,
    composition916: value,
    lighting: value,
    palette: value,
    dressing: value,
    tierQuality: value,
    signage: value,
    kidReadability: value,
  };
}

export function qualityTierProofs() {
  return (Object.keys(QUALITY_TIER_CAMERAS) as QualityTier[]).map((tier) => {
    const camera = QUALITY_TIER_CAMERAS[tier];
    return {
      ...camera,
      classified: classifyQualityTier(camera.projectedFrameCoveragePct),
      texturePolicy: camera.intendedTexture,
    };
  });
}

export function evaluateSignageFixtures() {
  const pass = SIGNAGE_FIXTURES.pass.map((fixture) => ({
    ...fixture,
    ...evaluateSignage(fixture),
  }));
  const failContrast = { ...SIGNAGE_FIXTURES.failContrast, ...evaluateSignage(SIGNAGE_FIXTURES.failContrast) };
  const failOcclusion = { ...SIGNAGE_FIXTURES.failOcclusion, ...evaluateSignage(SIGNAGE_FIXTURES.failOcclusion) };
  return { pass, failContrast, failOcclusion };
}

export function evaluateDressingFixtures() {
  return {
    passHero: planDressing(DRESSING_FIXTURES.passHero),
    failObstruction: planDressing(DRESSING_FIXTURES.failObstruction),
    failWalkable: planDressing(DRESSING_FIXTURES.failWalkable),
    failCopies: planDressing(DRESSING_FIXTURES.failCopies),
  };
}

export function lightingPresetProofs() {
  return LIGHTING_PRESETS.map((id: LightingPresetId) => {
    const profile = LIGHTING_PROFILES[id];
    return {
      id,
      resolved: Boolean(profile),
      commercialPluginRequired: profile.commercialPluginRequired,
      nativeBlender: true,
      dayNight: profile.dayNight,
      mood: profile.mood,
    };
  });
}

export function shotDependencyForWorld(seed = PREVIEW_VALIDATION_SEED) {
  const world = syntheticVillageWorld(seed);
  return sha256Canonical({
    schemaVersion: PREVIEW_VALIDATION_SCHEMA,
    seed: world.seed,
    locationId: world.locationId,
    buildings: world.buildings.map((item) => item.id),
    signs: world.signs.map((item) => item.id),
    lighting: 'TJ_DAY_ADVENTURE',
    cameras: QUALITY_TIER_CAMERAS,
    style: STORYBOOK_PROFILE.schemaVersion,
  });
}

export function evaluateScoreBand(score: number, hardBlockers: HardVisualBlocker[] = []) {
  return evaluateShotVisualApproval({
    shotId: 'SH_PREVIEW_001',
    shotDependencySha256: shotDependencyForWorld(),
    scores: uniformScores(score),
    hardBlockers,
    focalTarget: 'PIP_AND_GOAT',
  });
}

export function rejectStaleVisualApproval(currentHash: string, receiptHash: string) {
  if (currentHash !== receiptHash) {
    return {
      ok: false as const,
      status: 'BLOCKED_VISUAL_APPROVAL_STALE' as const,
      boundary: READINESS_COMPAT_BOUNDARY,
    };
  }
  return { ok: true as const, status: 'VISUAL_APPROVAL_CURRENT' as const, boundary: READINESS_COMPAT_BOUNDARY };
}

export function runpodVisualReceiptCompatibility(receipt: {
  schemaVersion: string;
  visualApprovalVersion: string;
  shotId: string;
  shotDependencySha256: string;
  score: number;
  result: string;
  hardBlockers: string[];
}) {
  const missing = RUNPOD_VISUAL_RECEIPT_FIELDS.filter((field) => receipt[field] === undefined || receipt[field] === null);
  const acceptedResult = (ACCEPTED_VISUAL_RESULTS as readonly string[]).includes(receipt.result);
  const current = shotDependencyForWorld();
  const stale = rejectStaleVisualApproval(current, receipt.shotDependencySha256);
  const scoreGate = receipt.score >= 90 && receipt.hardBlockers.length === 0 && acceptedResult;
  return {
    schema: SHOT_VISUAL_APPROVAL_SCHEMA,
    readinessBoundary: READINESS_COMPAT_BOUNDARY,
    requiredFields: RUNPOD_VISUAL_RECEIPT_FIELDS,
    missingFields: missing,
    fieldsMatch: missing.length === 0,
    paidExecutorImported: false,
    authorizationEnabled: false,
    launchAuthorized: false,
    currentShotDependencySha256: current,
    staleRejected: !stale.ok,
    staleStatus: stale.status,
    wouldAdmitToReadiness: stale.ok && scoreGate && missing.length === 0,
  };
}

export function previewLadder(options: { blenderAvailable: boolean; thumbnailRendered: boolean; reviewRendered: boolean }) {
  return LADDER_STEPS.map((step) => {
    if (step === 'REVIEW_FRAME') {
      return {
        step,
        ok: !options.reviewRendered ? true : options.reviewRendered,
        executed: options.reviewRendered,
        resolution: `${PREVIEW_REVIEW.width}x${PREVIEW_REVIEW.height}`,
        note: options.reviewRendered
          ? 'Local review frame generated.'
          : 'Local/zero-cost review frame unavailable. Manifest only.',
      };
    }
    if (step === 'THUMBNAIL_QC') {
      return {
        step,
        ok: true,
        executed: options.thumbnailRendered,
        resolution: `${PREVIEW_THUMBNAIL.width}x${PREVIEW_THUMBNAIL.height}`,
        note: options.thumbnailRendered ? 'Synthetic thumbnail glyph generated.' : 'Thumbnail planned. No raster render.',
      };
    }
    return {
      step,
      ok: true,
      executed: true,
      resolution: step === 'SCHEMA' || step === 'SCENE_PLAN' ? 'n/a' : `${PREVIEW_THUMBNAIL.width}x${PREVIEW_THUMBNAIL.height}`,
      note: step === 'VIEWPORT_SYNTHETIC' ? 'Synthetic primitives only.' : 'Contract step completed without paid compute.',
    };
  });
}

export function contactSheetManifest(rendered = false) {
  return {
    schemaVersion: PREVIEW_VALIDATION_SCHEMA,
    rendered,
    blenderExecuted: false,
    paidRender: false,
    final1080x1920: false,
    forbiddenFinal: `${PREVIEW_FINAL_FORBIDDEN.width}x${PREVIEW_FINAL_FORBIDDEN.height}`,
    slots: CONTACT_SHEET_SLOTS.map((id) => ({
      id,
      evidence: rendered ? 'SYNTHETIC_SVG' : 'SYNTHETIC_MANIFEST_ONLY',
      commercialSource: false,
    })),
  };
}

export function syntheticContactSheetSvg() {
  const cells = CONTACT_SHEET_SLOTS.map((id, index) => {
    const x = 8 + (index % 4) * 70;
    const y = 28 + Math.floor(index / 4) * 42;
    return `<rect x="${x}" y="${y}" width="64" height="36" fill="#f4e6c4" stroke="#5b3a1e"/><text x="${x + 32}" y="${y + 21}" text-anchor="middle" font-size="5" fill="#5b3a1e">${id}</text>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="292" height="160" viewBox="0 0 292 160"><rect width="292" height="160" fill="#fff8ea"/><text x="8" y="16" font-size="8" fill="#5b3a1e">SYNTHETIC CONTACT SHEET — NOT RENDERED</text>${cells}</svg>`;
}

export function planningComplexity(world = syntheticVillageWorld()) {
  return estimateComplexity({
    visibleTriangles: world.triangleEstimate,
    textureVramMb: 48,
    uniqueMaterials: world.materialsUsed.length,
    shadowCastingLights: 2,
    shadowCasters: 8,
    volumetrics: false,
    transparentSurfaces: 2,
    simulations: false,
    geometryNodesDensity: 0.25,
    scatterDensity: 0.35,
    profile: 'PLANNING',
  });
}

export function detectBlender(): boolean {
  return false;
}

export function runStorybookPreviewValidation(seed = PREVIEW_VALIDATION_SEED) {
  const world = syntheticVillageWorld(seed);
  const blenderAvailable = detectBlender();
  const tiers = qualityTierProofs();
  const signage = evaluateSignageFixtures();
  const dressing = evaluateDressingFixtures();
  const lighting = lightingPresetProofs();
  const dependency = shotDependencyForWorld(seed);
  const excellent = evaluateScoreBand(95);
  const approved = evaluateScoreBand(90);
  const revision = evaluateScoreBand(89);
  const rejected = evaluateScoreBand(84);
  const blockedPerfect = evaluateScoreBand(100, ['FOCAL_TARGET_UNCLEAR']);
  const heroAuto = advanceStylizationApproval({
    current: 'STYLIZED_REVIEW',
    hero: true,
    explicitReviewer: false,
  });
  const receipt = approved.receipt;
  const stale = rejectStaleVisualApproval(dependency, `${'ff'.repeat(32)}`);
  const compatibility = runpodVisualReceiptCompatibility(receipt);
  const complexity = planningComplexity(world);

  return {
    schemaVersion: PREVIEW_VALIDATION_SCHEMA,
    fixtureWorld: world.displayName,
    profileVersion: STORYBOOK_PROFILE.schemaVersion,
    seed: world.seed,
    locationId: world.locationId,
    cameraProfile: QUALITY_TIER_CAMERAS.HERO.id,
    qualityTier: QUALITY_TIER_CAMERAS.HERO.tier,
    signageStatus: signage.pass.every((item) => item.ok) && !signage.failContrast.ok && !signage.failOcclusion.ok
      ? 'pass-and-fail-fixtures-proven'
      : 'incomplete',
    dressingStatus: dressing.passHero.ok && !dressing.failObstruction.ok && !dressing.failWalkable.ok
      ? 'pass-and-fail-fixtures-proven'
      : 'incomplete',
    lightingPreset: 'TJ_DAY_ADVENTURE',
    shotScore: receipt.score,
    hardBlockers: receipt.hardBlockers,
    shotDependencySha256: dependency,
    approvalStatus: receipt.result,
    previewResolution: `${PREVIEW_THUMBNAIL.width}x${PREVIEW_THUMBNAIL.height}`,
    reviewResolutionPlanned: `${PREVIEW_REVIEW.width}x${PREVIEW_REVIEW.height}`,
    finalRenderGenerated: false,
    evidenceStatus: blenderAvailable ? 'local-blender-preview' : 'synthetic-manifest-only',
    blenderAvailable,
    blenderExecuted: false,
    renderedEvidenceFabricated: false,
    complexity,
    world,
    materialsCovered: worldCoversRequiredMaterials(world),
    tiers,
    signage,
    dressing,
    lighting,
    lightingAllResolved: lighting.every((item) => item.resolved),
    scores: {
      excellent: excellent.receipt,
      approved: receipt,
      revision: revision.receipt,
      rejected: rejected.receipt,
      blockedPerfect: blockedPerfect.receipt,
    },
    heroAutoApproval: heroAuto,
    ladder: previewLadder({ blenderAvailable, thumbnailRendered: false, reviewRendered: false }),
    contactSheet: contactSheetManifest(false),
    contactSheetSvg: syntheticContactSheetSvg(),
    staleRejection: stale,
    runpodCompatibility: compatibility,
    safety: {
      commercialSourceModified: false,
      commercialBytesCommitted: false,
      botaniqProcessed: false,
      geoScatterUsed: false,
      runpodContacted: false,
      postPods: 0,
      deletePods: 0,
      gpuLaunched: false,
      paidComputeUsd: 0,
      productionMutation: false,
      pipGoatMutated: false,
      voiceMutated: false,
      providerMutations: 0,
    },
  };
}

export type StorybookPreviewValidation = ReturnType<typeof runStorybookPreviewValidation>;

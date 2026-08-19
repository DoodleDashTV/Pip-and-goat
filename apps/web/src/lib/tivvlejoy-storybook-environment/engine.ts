import { sha256Canonical } from './hash';
import {
  DRESSING_ANCHORS,
  DRESSING_CATEGORIES,
  HARD_VISUAL_BLOCKERS,
  LIGHTING_PRESETS,
  LOCATION_PRESET_IDS,
  MATERIAL_CLASSES,
  SCATTER_PROVIDER,
  SHOT_VISUAL_APPROVAL_SCHEMA,
  SHOT_VISUAL_REPORT_SCHEMA,
  SIGN_TEMPLATES,
  SOURCE_PIPELINE_STATES,
  STORYBOOK_ENVIRONMENT_SCHEMA,
  STYLIZATION_REPORT_SCHEMA,
  VISUAL_WEIGHTS,
  WORLD_NODE_IDS,
  type FocalTarget,
  type HardVisualBlocker,
  type LightingPresetId,
  type MaterialClass,
  type ProvenanceStatus,
  type QualityTier,
  type RenderProfile,
  type StorybookApprovalState,
  type VisualResult,
} from './types';

export const STORYBOOK_PROFILE = Object.freeze({
  schemaVersion: STORYBOOK_ENVIRONMENT_SCHEMA,
  paletteVersion: 'palette-v1',
  materialPolicyVersion: 'material-v1',
  shapePolicyVersion: 'shape-v1',
  signagePolicyVersion: 'signage-v1',
  dressingPolicyVersion: 'dressing-v1',
  lightingPolicyVersion: 'lighting-v1',
  qualityTierVersion: 'tier-v1',
  shotApprovalVersion: 'TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1',
  blenderVersion: '4.2.2',
  defaultProvider: SCATTER_PROVIDER,
});

export const APPROVED_PALETTE_FAMILIES = Object.freeze([
  'warm-cream',
  'meadow-green',
  'storybook-blue',
  'lantern-gold',
  'roof-terracotta',
  'path-sand',
]);

export function mapLegacySourceStatus(status: string): (typeof SOURCE_PIPELINE_STATES)[number] | 'quarantined' {
  if (status === 'approved') return 'approved';
  if (status === 'normalized') return 'normalized';
  if (status === 'inspected' || status === 'awaiting_inspection') return 'inspected';
  if (status === 'quarantined') return 'quarantined';
  return 'registered';
}

export function classifyQualityTier(
  projectedFrameHeightPct: number,
  tags: { focal?: boolean; story?: boolean } = {},
  manual?: QualityTier,
): QualityTier {
  if (manual) return manual;
  if (tags.focal || tags.story || projectedFrameHeightPct >= 20) return 'HERO';
  if (projectedFrameHeightPct >= 5) return 'SUPPORTING';
  return 'BACKGROUND';
}

export function textureTargetForTier(tier: QualityTier, hero4096Justified = false): 1024 | 2048 | 4096 {
  if (tier === 'BACKGROUND') return 1024;
  if (tier === 'SUPPORTING') return 2048;
  return hero4096Justified ? 4096 : 2048;
}

export function planMaterialStylization(input: {
  materialClass: MaterialClass;
  confidence: number;
  hero: boolean;
  roughness: number;
  normalStrength: number;
}): {
  destructive: false;
  sourceGeometryPreserved: true;
  uvsPreserved: true;
  operations: string[];
  requiresManualReview: boolean;
} {
  const operations: string[] = [];
  const lowConfidence = input.confidence < 0.7;
  if (!lowConfidence) {
    operations.push('storybook-palette-remap');
    operations.push(`roughness-normalize:${Math.min(0.75, Math.max(0.25, input.roughness))}`);
    operations.push(`normal-strength-clamp:${Math.min(1, input.normalStrength)}`);
    operations.push('grime-reduction');
    operations.push('micro-noise-reduction');
    operations.push(MATERIAL_CLASSES.includes(input.materialClass) ? `family:${input.materialClass}` : 'family:prop');
  }
  return {
    destructive: false,
    sourceGeometryPreserved: true,
    uvsPreserved: true,
    operations,
    requiresManualReview: lowConfidence && input.hero,
  };
}

export function planShapeSoftening(input: { heroArchitecture: boolean }): {
  allowed: string[];
  forbidden: string[];
  sourceOverwrite: false;
} {
  return {
    allowed: input.heroArchitecture
      ? ['controlled-bevels', 'smooth-shading', 'weighted-normals-if-compatible', 'softened-silhouette']
      : ['controlled-bevels', 'smooth-shading', 'optional-trim-exaggeration', 'optional-awning-window-emphasis'],
    forbidden: [
      'voxel-remesh-hero-architecture',
      'quadriflow-hero-architecture',
      'destroy-uvs',
      'destructive-geometry-edits',
      'overwrite-source',
    ],
    sourceOverwrite: false,
  };
}

export function evaluateSignage(input: {
  template: (typeof SIGN_TEMPLATES)[number];
  signClass: 'STORY_CRITICAL' | 'WORLD_BUILDING' | 'DECORATIVE';
  textCapHeightPx: number;
  iconHeightPx: number;
  contrast: number;
  perspectiveDeg: number;
  occlusion: number;
}): { ok: boolean; blockers: HardVisualBlocker[] } {
  const blockers: HardVisualBlocker[] = [];
  if (input.signClass === 'STORY_CRITICAL') {
    if (input.textCapHeightPx < 36 || input.iconHeightPx < 64 || input.contrast < 4.5 || input.perspectiveDeg > 35 || input.occlusion !== 0) {
      blockers.push('CRITICAL_SIGN_UNREADABLE');
    }
  }
  return { ok: blockers.length === 0, blockers };
}

export function planDressing(input: {
  tier: QualityTier;
  seed: number;
  obstructionPct: number;
  walkableWidthPct: number;
  identicalCopies: number;
}): {
  anchors: typeof DRESSING_ANCHORS;
  categories: typeof DRESSING_CATEGORIES;
  clusterTarget: { min: number; max: number };
  seed: number;
  ok: boolean;
  reasons: string[];
} {
  const clusterTarget =
    input.tier === 'HERO' ? { min: 4, max: 8 } : input.tier === 'SUPPORTING' ? { min: 2, max: 5 } : { min: 0, max: 3 };
  const reasons: string[] = [];
  if (input.obstructionPct > 10) reasons.push('character-performance-zone obstruction exceeds 10%');
  if (input.walkableWidthPct < 80) reasons.push('walkable-route clear width is below 80%');
  if (input.identicalCopies > 3) reasons.push('more than 3 obvious identical visible copies');
  return {
    anchors: DRESSING_ANCHORS,
    categories: DRESSING_CATEGORIES,
    clusterTarget,
    seed: input.seed,
    ok: reasons.length === 0,
    reasons,
  };
}

export function nativeScatterPlan(input: { kind: string; seed: number; count: number }) {
  return {
    provider: SCATTER_PROVIDER,
    kind: input.kind,
    seed: input.seed,
    count: input.count,
    instancing: true,
    geoScatterIntegrated: false,
  };
}

export type LightingProfile = {
  id: LightingPresetId;
  mood: string;
  dayNight: 'day' | 'night';
  targetExposure: readonly [number, number];
  keyDirection: string;
  fillStrategy: string;
  rimFocal: boolean;
  characterReadabilityRequired: boolean;
  allowedVolumetrics: boolean;
  shadowBudget: 'low' | 'medium';
  backgroundSaturation: string;
  commercialPluginRequired: false;
};

export const LIGHTING_PROFILES = Object.freeze(
  Object.fromEntries(
    LIGHTING_PRESETS.map((id) => [
      id,
      {
        id,
        mood: id.includes('NIGHT') || id.includes('EVENING') ? 'night' : id.includes('OVERCAST') || id.includes('RAIN') ? 'soft' : 'adventure',
        dayNight: id.includes('NIGHT') ? 'night' : 'day',
        targetExposure: id.includes('NIGHT') ? ([6.5, 8.5] as const) : ([8, 11] as const),
        keyDirection: 'camera-left-or-story',
        fillStrategy: 'soft-opposite',
        rimFocal: true,
        characterReadabilityRequired: true,
        allowedVolumetrics: id === 'TJ_GOLDEN_HOUR' || id === 'TJ_MAGICAL_NIGHT' || id === 'TJ_RAINY_COZY',
        shadowBudget: id.includes('OVERCAST') ? 'low' : 'medium',
        backgroundSaturation: id.includes('NIGHT') ? 'reduced' : 'storybook',
        commercialPluginRequired: false,
      } satisfies LightingProfile,
    ]),
  ),
) as Readonly<Record<LightingPresetId, LightingProfile>>;

export const CHARACTER_READABILITY_CONTRACT = Object.freeze({
  environmentEyeOcclusionPct: 0,
  speakingMouthOcclusionPct: 0,
  maxEnvironmentFaceOcclusionPct: 5,
  normalFaceLuminanceIre: { min: 45, max: 70 },
  preferredHeadroomPct: { min: 6, max: 12 },
  minimumHeadroomPct: 4,
  pipGoatRigMutationRequired: false,
});

export const FOCAL_READABILITY_CONTRACT = Object.freeze({
  allowedTargets: ['PIP', 'GOAT', 'PIP_AND_GOAT', 'STORY_PROP', 'HERO_SCENERY', 'SIGN'],
  heroFocalCoveragePct: { min: 8, max: 40 },
  requireSubjectBackgroundSeparation: true,
  requireSilhouetteReadability: true,
  requireTangencyCheck: true,
});

export const COMPOSITION_9_16_CONTRACT = Object.freeze({
  resolution: '1080x1920',
  aspect: '9:16',
  fps: 30,
  dialogueSafeArea: true,
  intentionalNegativeSpace: true,
  foregroundCrowdingChecked: true,
  depthLayersChecked: true,
  storySafeUiRegions: true,
  characterPerformanceZonePreserved: true,
});

export const KID_READABILITY_CONTRACT = Object.freeze({
  audienceAges: { min: 5, max: 10 },
  maxMajorCompetingForms: 3,
  onePrimaryStoryAction: true,
  avoidDenseDetailBehindFaces: true,
  movingDressingMustNotCompeteWithDialogue: true,
  storyCriticalSilhouetteRequired: true,
});

export type ComplexityEstimate = {
  visibleTriangles: number;
  textureVramMb: number;
  uniqueMaterials: number;
  shadowCastingLights: number;
  shadowCasters: number;
  volumetrics: boolean;
  transparentSurfaces: number;
  simulations: boolean;
  geometryNodesDensity: number;
  scatterDensity: number;
  profile: RenderProfile;
  estimatedRenderSeconds: number;
  estimatedGpuCostUsd: number;
  finalImageryAllowed: boolean;
  blenderExecuted: false;
};

export function evaluatePalette(input: { approvedPct: number; dominantUnapprovedPct: number; outsideApprovedPct: number }): {
  ok: boolean;
  blockers: HardVisualBlocker[];
} {
  const blockers: HardVisualBlocker[] = [];
  if (input.outsideApprovedPct > 20 || input.approvedPct < 85 || input.dominantUnapprovedPct > 10) {
    blockers.push('PALETTE_MISMATCH');
  }
  return { ok: blockers.length === 0, blockers };
}

export function classifyVisualResult(score: number): VisualResult {
  if (score >= 95) return 'VISUALLY_EXCELLENT';
  if (score >= 90) return 'VISUALLY_APPROVED';
  if (score >= 85) return 'REVISION_REQUIRED';
  return 'VISUAL_REJECT';
}

export function evaluateShotVisualApproval(input: {
  shotId: string;
  shotDependencySha256: string;
  scores: {
    focalReadability: number;
    characterReadability: number;
    composition916: number;
    lighting: number;
    palette: number;
    dressing: number;
    tierQuality: number;
    signage: number;
    kidReadability: number;
  };
  hardBlockers: HardVisualBlocker[];
  focalTarget: FocalTarget;
  pipEyesOccluded?: boolean;
  goatEyesOccluded?: boolean;
}): {
  report: Record<string, unknown>;
  receipt: {
    schemaVersion: typeof SHOT_VISUAL_APPROVAL_SCHEMA;
    visualApprovalVersion: string;
    shotId: string;
    shotDependencySha256: string;
    score: number;
    result: VisualResult;
    hardBlockers: HardVisualBlocker[];
    approvedAt: string;
    reviewerMode: 'FIXTURE';
  };
} {
  const weighted = Math.round(
    (input.scores.focalReadability / 100) * VISUAL_WEIGHTS.focalReadability +
      (input.scores.characterReadability / 100) * VISUAL_WEIGHTS.characterReadability +
      (input.scores.composition916 / 100) * VISUAL_WEIGHTS.composition916 +
      (input.scores.lighting / 100) * VISUAL_WEIGHTS.lighting +
      (input.scores.palette / 100) * VISUAL_WEIGHTS.palette +
      (input.scores.dressing / 100) * VISUAL_WEIGHTS.dressing +
      (input.scores.tierQuality / 100) * VISUAL_WEIGHTS.tierQuality +
      (input.scores.signage / 100) * VISUAL_WEIGHTS.signage +
      (input.scores.kidReadability / 100) * VISUAL_WEIGHTS.kidReadability,
  );
  const blockers = [...input.hardBlockers];
  if (input.pipEyesOccluded) blockers.push('PIP_EYES_OCCLUDED');
  if (input.goatEyesOccluded) blockers.push('GOAT_EYES_OCCLUDED');
  const unique = Array.from(new Set(blockers));
  const band = classifyVisualResult(weighted);
  const result: VisualResult = unique.length > 0 ? (weighted >= 85 ? 'REVISION_REQUIRED' : 'VISUAL_REJECT') : band;
  const report = {
    schemaVersion: SHOT_VISUAL_REPORT_SCHEMA,
    shotId: input.shotId,
    resolution: '1080x1920',
    fps: 30,
    declaredFocalTarget: input.focalTarget,
    categoryScores: input.scores,
    pipVisibility: { input: input.pipEyesOccluded === true ? 'occluded' : 'clear', result: input.pipEyesOccluded ? 'FAIL' : 'PASS' },
    goatVisibility: { input: input.goatEyesOccluded === true ? 'occluded' : 'clear', result: input.goatEyesOccluded ? 'FAIL' : 'PASS' },
    compositionResult: input.scores.composition916,
    lightingResult: input.scores.lighting,
    paletteResult: input.scores.palette,
    dressingResult: input.scores.dressing,
    signageResult: input.scores.signage,
    tierResult: input.scores.tierQuality,
    kidReadabilityResult: input.scores.kidReadability,
    totalScore: weighted,
    hardBlockers: unique,
    shotDependencySha256: input.shotDependencySha256,
    approvalResult: unique.length > 0 ? result : band,
    blenderRendered: false,
  };
  return {
    report,
    receipt: {
      schemaVersion: SHOT_VISUAL_APPROVAL_SCHEMA,
      visualApprovalVersion: STORYBOOK_PROFILE.shotApprovalVersion,
      shotId: input.shotId,
      shotDependencySha256: input.shotDependencySha256,
      score: weighted,
      result: unique.length > 0 ? result : band,
      hardBlockers: unique,
      approvedAt: '2026-08-19T00:00:00.000Z',
      reviewerMode: 'FIXTURE',
    },
  };
}

export function advanceStylizationApproval(input: {
  current: StorybookApprovalState;
  hero: boolean;
  explicitReviewer: boolean;
}): StorybookApprovalState | 'BLOCKED_HERO_AUTO_APPROVAL' {
  if (input.hero && input.current === 'STYLIZED_REVIEW' && !input.explicitReviewer) {
    return 'BLOCKED_HERO_AUTO_APPROVAL';
  }
  if (input.current === 'UNSTYLIZED') return 'STYLIZED_REVIEW';
  if (input.current === 'STYLIZED_REVIEW' && input.explicitReviewer) return 'STYLIZED_APPROVED';
  return input.current;
}

export function derivativeIdentity(input: {
  sourceSha: string;
  styleProfileVersion: string;
  blenderVersion: string;
  transformationPolicyVersion: string;
  notes?: string;
}): string {
  return sha256Canonical({
    sourceSha: input.sourceSha,
    styleProfileVersion: input.styleProfileVersion,
    blenderVersion: input.blenderVersion,
    transformationPolicyVersion: input.transformationPolicyVersion,
  });
}

export function locationPreset(id: (typeof LOCATION_PRESET_IDS)[number], seed: number) {
  return {
    presetId: id,
    baseEnvironmentVersion: `${id}-env-v1`,
    artDirectionVersion: STORYBOOK_ENVIRONMENT_SCHEMA,
    defaultLighting: id.includes('forest') ? 'TJ_DAY_ADVENTURE' : 'TJ_MORNING_WARM',
    cameraSafeZones: ['dialogue-center', 'headroom-6-12'],
    characterPerformanceZone: 'street-stage',
    approvedDressingAnchors: DRESSING_ANCHORS,
    defaultTiers: { architecture: 'HERO', foliage: 'SUPPORTING', sky: 'BACKGROUND' },
    deterministicSeed: seed,
    dependencyHash: sha256Canonical({ id, seed, profile: STORYBOOK_ENVIRONMENT_SCHEMA }),
    commercialGeometryIncluded: false,
  };
}

export function worldGraph() {
  const nodes = WORLD_NODE_IDS.map((id) => ({ id }));
  const edges = [
    ['HOME_NEIGHBORHOOD', 'ENCHANTED_OUTSKIRTS'],
    ['ENCHANTED_OUTSKIRTS', 'WATERFRONT_DISTRICT'],
    ['WATERFRONT_DISTRICT', 'AMUSEMENT_PARK'],
    ['AMUSEMENT_PARK', 'SKY_GATE'],
    ['SKY_GATE', 'CITY_IN_THE_SKY'],
  ] as const;
  return {
    schemaVersion: 'TIVVLEJOY_WORLD_GRAPH_V1',
    nodes,
    edges: edges.map(([from, to]) => ({
      from,
      to,
      transitionZone: `${from}->${to}`,
      establishingShotPreset: `${from.toLowerCase()}-establishing`,
      continuityLandmarks: [`${from}-marker`],
      preferredLighting: 'TJ_DAY_ADVENTURE',
      travelDirection: 'story-forward',
    })),
    commercialPackRequired: false,
  };
}

export function validateWorldGraph(graph = worldGraph()): boolean {
  return graph.nodes.length === WORLD_NODE_IDS.length && graph.edges.length === WORLD_NODE_IDS.length - 1;
}

export function batchGroupShots(shots: Array<{ shotId: string; locationId: string; lighting: string }>) {
  const groups = new Map<string, string[]>();
  for (const shot of shots) {
    const key = `${shot.locationId}|${shot.lighting}`;
    groups.set(key, [...(groups.get(key) ?? []), shot.shotId]);
  }
  return {
    groups: [...groups.entries()].map(([key, shotIds]) => {
      const [locationId, lighting] = key.split('|');
      return { locationId, lighting, shotIds, warmCacheHint: true, sharedEnvironment: true };
    }),
    paidRender: false,
  };
}

export function estimateComplexity(input: {
  visibleTriangles: number;
  textureVramMb: number;
  uniqueMaterials: number;
  shadowCastingLights: number;
  shadowCasters: number;
  volumetrics: boolean;
  transparentSurfaces: number;
  simulations: boolean;
  geometryNodesDensity: number;
  scatterDensity: number;
  profile: RenderProfile;
}): ComplexityEstimate {
  const renderSeconds = Math.round(
    8 + input.visibleTriangles / 250_000 + input.textureVramMb / 64 + (input.volumetrics ? 6 : 0) + (input.simulations ? 10 : 0),
  );
  return {
    ...input,
    estimatedRenderSeconds: renderSeconds,
    estimatedGpuCostUsd: Number(((0.74 * renderSeconds) / 3600).toFixed(4)),
    finalImageryAllowed: input.profile !== 'FINAL' ? false : renderSeconds < 120 && !input.simulations,
    blenderExecuted: false,
  };
}

export function evaluateProvenance(input: {
  sourceId: string;
  vendor?: string;
  licenseReference?: string;
  licenseVerified: boolean;
  commercialUseAllowed?: boolean;
  rawRedistributionAllowed?: boolean;
  automationPermissionStatus: ProvenanceStatus;
  aiMlTrainingPermissionStatus: ProvenanceStatus;
  notes?: string;
}): { status: ProvenanceStatus; failClosed: boolean; redistributeRaw: false } {
  let status: ProvenanceStatus = 'UNKNOWN_REVIEW_REQUIRED';
  if (input.licenseVerified && input.commercialUseAllowed && input.automationPermissionStatus === 'VERIFIED_ALLOWED') {
    status = input.rawRedistributionAllowed ? 'VERIFIED_ALLOWED' : 'VERIFIED_RESTRICTED';
  } else if (input.licenseVerified && input.automationPermissionStatus === 'VERIFIED_RESTRICTED') {
    status = 'VERIFIED_RESTRICTED';
  }
  const failClosed =
    status === 'UNKNOWN_REVIEW_REQUIRED' ||
    input.automationPermissionStatus === 'UNKNOWN_REVIEW_REQUIRED' ||
    input.aiMlTrainingPermissionStatus === 'UNKNOWN_REVIEW_REQUIRED';
  return { status, failClosed, redistributeRaw: false };
}

export function temporalQcContract() {
  return {
    checks: [
      'lighting flicker',
      'material pop',
      'texture pop',
      'LOD pop',
      'missing frame',
      'animation clipping',
      'camera discontinuity',
      'exposure jump',
      'background dressing discontinuity',
      'unexpected asset disappearance',
    ],
    realFinalRenderRequired: false,
  };
}

export function optionalProviderBoundary(name: string, present: boolean, licensePresent: boolean) {
  return {
    name,
    present,
    licensePresent,
    usable: present && licensePresent,
    nativeFallback: SCATTER_PROVIDER,
    geoScatterIntegrated: false,
  };
}

export function previewArtifactManifest() {
  return {
    artifacts: ['original-reference', 'stylized-frame', 'validation-overlay', 'clean-final-preview'],
    contactSheet: ['front', 'three-quarter', 'pip-height-street', 'day-hero', 'evening-hero', '9x16-medium', 'material-closeup'],
    rendered: false,
  };
}

export function simulationPolicy() {
  return {
    preferDeterministicLoops: true,
    requiredDeclaration: ['simulationType', 'cacheIdentity', 'deterministicSeed', 'estimatedCost', 'approvedCacheReceipt'],
    expensiveSimulationRequired: false,
  };
}

export function buildStorybookPlan(input: {
  sourceId: string;
  sourceSha: string;
  seed: number;
  locationId: (typeof LOCATION_PRESET_IDS)[number];
  lighting: LightingPresetId;
  shotId: string;
  projectedFrameHeightPct: number;
  hero: boolean;
  materialClass: MaterialClass;
  materialConfidence: number;
  palette: { approvedPct: number; dominantUnapprovedPct: number; outsideApprovedPct: number };
  sign: Parameters<typeof evaluateSignage>[0];
  dressing: Omit<Parameters<typeof planDressing>[0], 'tier'>;
  visualScores: Parameters<typeof evaluateShotVisualApproval>[0]['scores'];
  provenance: Parameters<typeof evaluateProvenance>[0];
  notes?: string;
}) {
  const tier = classifyQualityTier(input.projectedFrameHeightPct, { story: input.hero });
  const materials = planMaterialStylization({
    materialClass: input.materialClass,
    confidence: input.materialConfidence,
    hero: input.hero,
    roughness: 0.5,
    normalStrength: 1.2,
  });
  const shape = planShapeSoftening({ heroArchitecture: input.hero });
  const dressing = planDressing({ ...input.dressing, tier });
  const signage = evaluateSignage(input.sign);
  const palette = evaluatePalette(input.palette);
  const shotDependencySha256 = sha256Canonical({
    locationId: input.locationId,
    lighting: input.lighting,
    seed: input.seed,
    style: STORYBOOK_PROFILE,
  });
  const visual = evaluateShotVisualApproval({
    shotId: input.shotId,
    shotDependencySha256,
    scores: input.visualScores,
    hardBlockers: [...signage.blockers, ...palette.blockers],
    focalTarget: 'PIP_AND_GOAT',
  });
  const provenance = evaluateProvenance(input.provenance);
  const cacheId = derivativeIdentity({
    sourceSha: input.sourceSha,
    styleProfileVersion: STORYBOOK_PROFILE.schemaVersion,
    blenderVersion: STORYBOOK_PROFILE.blenderVersion,
    transformationPolicyVersion: STORYBOOK_PROFILE.materialPolicyVersion,
    notes: input.notes,
  });
  return {
    rendered: false,
    sourceModified: false,
    licensedBytesCommitted: false,
    geoScatterIntegrated: false,
    pipGoatMutated: false,
    voiceMutated: false,
    profile: STORYBOOK_PROFILE,
    location: locationPreset(input.locationId, input.seed),
    lighting: LIGHTING_PROFILES[input.lighting],
    qualityTier: tier,
    textureTarget: textureTargetForTier(tier, false),
    materials,
    shape,
    signage,
    dressing,
    scatter: nativeScatterPlan({ kind: 'flowers', seed: input.seed, count: dressing.clusterTarget.max }),
    visual,
    provenance,
    cacheIdentity: cacheId,
    complexity: estimateComplexity({
      visibleTriangles: 180_000,
      textureVramMb: 96,
      uniqueMaterials: 12,
      shadowCastingLights: 2,
      shadowCasters: 6,
      volumetrics: false,
      transparentSurfaces: 1,
      simulations: false,
      geometryNodesDensity: 0.3,
      scatterDensity: 0.4,
      profile: 'PLANNING',
    }),
    stylizationReport: {
      schemaVersion: STYLIZATION_REPORT_SCHEMA,
      sourceId: input.sourceId,
      sourceSha: input.sourceSha,
      licenseReference: input.provenance.licenseReference ?? null,
      sourceModified: false,
      styleVersion: STORYBOOK_PROFILE.schemaVersion,
      objectsInspected: 1,
      materialsClassified: 1,
      classificationConfidence: input.materialConfidence,
      materialReplacements: materials.operations,
      shapeOperationsPlanned: shape.allowed,
      signageReplacements: [input.sign.template],
      dressingAnchors: DRESSING_ANCHORS,
      lightingChecks: [input.lighting],
      qualityTiers: [tier],
      cameraChecks: ['9:16'],
      performanceEstimate: 'planning-only',
      blockers: visual.receipt.hardBlockers,
      approvalStatus: visual.receipt.hardBlockers.length ? 'SHOT_REVISION_REQUIRED' : 'STYLIZED_REVIEW',
      blenderExecuted: false,
    },
    temporalQc: temporalQcContract(),
    world: worldGraph(),
    previewArtifacts: previewArtifactManifest(),
    simulation: simulationPolicy(),
    providers: {
      default: SCATTER_PROVIDER,
      lighting: optionalProviderBoundary('native-blender-lights', true, true),
      vegetation: optionalProviderBoundary('botaniq', false, false),
      geoScatter: optionalProviderBoundary('Geo-Scatter', false, false),
    },
  };
}

export { HARD_VISUAL_BLOCKERS, SIGN_TEMPLATES, LOCATION_PRESET_IDS };

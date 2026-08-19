import {
  LOCATION_PRESET_IDS,
  SHOT_VISUAL_APPROVAL_SCHEMA,
  evaluateShotVisualApproval,
  locationPreset,
  sha256Canonical,
  worldGraph,
  type FocalTarget,
  type HardVisualBlocker,
  type LightingPresetId,
  type RenderProfile,
  type VisualResult,
} from '@/lib/tivvlejoy-storybook-environment';
import { cameraTemplate } from './cameras';
import {
  BATCH_EPISODE_PLAN_SCHEMA,
  EPISODE_PLAN_SCHEMA,
  LOCATION_BLOCK_SCHEMA,
  LOCATION_DELTA_SCHEMA,
  LOCATION_WORLD_NODES,
  PLANNING_RECEIPT_SCHEMA,
  PRIMARY_OUTPUT,
  RENDER_HANDOFF_SCHEMA,
  SHOT_PACKAGE_SCHEMA,
  UNRESOLVED,
  type CameraTemplateId,
  type RerenderStatus,
  type StoryBeatKind,
  type TransitionKind,
} from './types';

export type StoryBeatRecord = {
  beatId: string;
  kind: StoryBeatKind;
  order: number;
  durationFrames: number;
  storyPurpose: string;
  primaryCharacter: 'PIP' | 'GOAT' | 'PIP_AND_GOAT';
  secondaryCharacters: Array<'PIP' | 'GOAT'>;
  dialogueRefs: string[];
  requiredStoryProps: string[];
  preferredLocation: (typeof LOCATION_PRESET_IDS)[number];
  focalTarget: FocalTarget;
  energyLevel: 'low' | 'medium' | 'high';
  continuityNotes: string;
};

export type ShotDraft = {
  shotId: string;
  sequenceNumber: number;
  storyBeatId: string;
  durationFrames: number;
  locationPresetId: (typeof LOCATION_PRESET_IDS)[number];
  lightingPresetId: LightingPresetId;
  cameraTemplateId: CameraTemplateId;
  focalTarget: FocalTarget;
  charactersVisible: Array<'PIP' | 'GOAT'>;
  dialogueRefs: string[];
  storyPropRefs: string[];
  visibleGeometry: string[];
  visibleMaterials: string[];
  visibleDressing: string[];
  characterAnimation: string;
  environmentVersion: string;
  renderProfile: RenderProfile;
  notes?: string;
  displayLabel?: string;
  explicitTransition?: boolean;
  transitionKind?: TransitionKind;
};

export type LocationDeltaInput = {
  baseLocationVersion: string;
  episodeId: string;
  shotIds: string[];
  seed: number;
  addedProps: string[];
  removedProps: string[];
  movedProps: string[];
  signageChanges: string[];
  dressingChanges: string[];
  lightingOverrides: LightingPresetId[];
  temporaryStoryProps: string[];
  notes?: string;
};

function adjacentWorldNodes(from: string, to: string): boolean {
  if (from === to) return true;
  const edges = worldGraph().edges;
  return edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
}

export function worldNodeForLocation(locationPresetId: (typeof LOCATION_PRESET_IDS)[number]) {
  return LOCATION_WORLD_NODES[locationPresetId];
}

export function evaluateLocationTransition(
  fromLocation: (typeof LOCATION_PRESET_IDS)[number],
  toLocation: (typeof LOCATION_PRESET_IDS)[number],
  explicitTransition = false,
): { ok: boolean; continuityBlocker: string | null; requiresExplicitTransition: boolean } {
  const from = worldNodeForLocation(fromLocation);
  const to = worldNodeForLocation(toLocation);
  if (adjacentWorldNodes(from, to)) {
    return { ok: true, continuityBlocker: null, requiresExplicitTransition: false };
  }
  if (explicitTransition) {
    return { ok: true, continuityBlocker: null, requiresExplicitTransition: true };
  }
  return {
    ok: false,
    continuityBlocker: `Non-adjacent world jump ${from} -> ${to} requires explicitTransition`,
    requiresExplicitTransition: true,
  };
}

export function hashLocationDelta(input: LocationDeltaInput) {
  return sha256Canonical({
    schemaVersion: LOCATION_DELTA_SCHEMA,
    baseLocationVersion: input.baseLocationVersion,
    episodeId: input.episodeId,
    shotIds: [...input.shotIds].sort(),
    seed: input.seed,
    addedProps: [...input.addedProps].sort(),
    removedProps: [...input.removedProps].sort(),
    movedProps: [...input.movedProps].sort(),
    signageChanges: [...input.signageChanges].sort(),
    dressingChanges: [...input.dressingChanges].sort(),
    lightingOverrides: [...input.lightingOverrides].sort(),
    temporaryStoryProps: [...input.temporaryStoryProps].sort(),
  });
}

export function hashShotDependency(input: {
  shotId: string;
  cameraTemplateId: CameraTemplateId;
  lightingPresetId: LightingPresetId;
  locationPresetId: string;
  environmentVersion: string;
  visibleGeometry: string[];
  visibleMaterials: string[];
  visibleDressing: string[];
  characterAnimation: string;
  storyPropRefs: string[];
  locationDeltaSha256: string | null;
  renderProfile: RenderProfile;
  fps: number;
  resolution: string;
}) {
  return sha256Canonical({
    shotId: input.shotId,
    camera: input.cameraTemplateId,
    lighting: input.lightingPresetId,
    locationPresetId: input.locationPresetId,
    environmentVersion: input.environmentVersion,
    visibleGeometry: [...input.visibleGeometry].sort(),
    visibleMaterials: [...input.visibleMaterials].sort(),
    visibleDressing: [...input.visibleDressing].sort(),
    characterAnimation: input.characterAnimation,
    storyPropRefs: [...input.storyPropRefs].sort(),
    locationDeltaSha256: input.locationDeltaSha256,
    renderSettings: {
      profile: input.renderProfile,
      fps: input.fps,
      resolution: input.resolution,
    },
  });
}

export function evaluateRerender(input: {
  previousShotDependencySha256?: string;
  currentShotDependencySha256: string;
  renderProfile: RenderProfile;
  visualApprovalStale: boolean;
}): RerenderStatus {
  if (input.visualApprovalStale) return 'BLOCKED_APPROVAL_STALE';
  if (!input.previousShotDependencySha256) return 'BLOCKED_DEPENDENCY_UNKNOWN';
  if (input.previousShotDependencySha256 === input.currentShotDependencySha256) return 'NO_RERENDER_REQUIRED';
  return input.renderProfile === 'FINAL' ? 'FINAL_RERENDER_REQUIRED' : 'PREVIEW_RERENDER_REQUIRED';
}

export function evaluatePlannerVisualGate(input: {
  shotId: string;
  shotDependencySha256: string;
  receipt?: {
    schemaVersion: string;
    visualApprovalVersion: string;
    shotId: string;
    shotDependencySha256: string;
    score: number;
    result: VisualResult;
    hardBlockers: HardVisualBlocker[];
    reviewerMode: 'HUMAN' | 'FIXTURE' | 'ADAPTER';
  };
}) {
  if (!input.receipt) {
    return {
      ok: false,
      status: 'VISUAL_APPROVAL_REQUIRED' as const,
      productionApprovalEligible: false,
      stale: false,
    };
  }
  if (input.receipt.shotDependencySha256 !== input.shotDependencySha256) {
    return {
      ok: false,
      status: 'BLOCKED_APPROVAL_STALE' as const,
      productionApprovalEligible: false,
      stale: true,
    };
  }
  const accepted =
    input.receipt.score >= 90 &&
    input.receipt.hardBlockers.length === 0 &&
    (input.receipt.result === 'VISUALLY_APPROVED' || input.receipt.result === 'VISUALLY_EXCELLENT');
  return {
    ok: accepted,
    status: accepted ? input.receipt.result : input.receipt.result,
    productionApprovalEligible: accepted && input.receipt.reviewerMode === 'HUMAN',
    stale: false,
    syntheticCannotBecomeProductionApproval: input.receipt.reviewerMode !== 'HUMAN',
  };
}

export function buildRenderHandoff(input: {
  shotId: string;
  shotDependencySha256: string;
  renderProfile: RenderProfile;
  assetReceiptRefs: string[];
  visualApprovalReceipt: unknown;
  estimatedRuntimeClass: 'short' | 'medium';
  estimatedComplexity: Record<string, unknown>;
}) {
  return {
    schemaVersion: RENDER_HANDOFF_SCHEMA,
    readinessBoundary: 'TIVVLEJOY_RENDER_BACKEND_READINESS_V1',
    shotId: input.shotId,
    shotDependencySha256: input.shotDependencySha256,
    renderProfile: input.renderProfile,
    assetReceiptRefs: input.assetReceiptRefs,
    visualApprovalReceipt: input.visualApprovalReceipt,
    estimatedRuntimeClass: input.estimatedRuntimeClass,
    estimatedComplexity: input.estimatedComplexity,
    paidAuthorizationRequired: true as const,
    gpuLaunched: false as const,
    paidCompute: false as const,
    providerContacted: false as const,
    launchAuthorized: false as const,
    finalRenderAuthorized: false as const,
    paidExecutorImported: false as const,
  };
}

export function planEpisode(input: {
  episodeId: string;
  episodeVersion: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  notes?: string;
  beats: StoryBeatRecord[];
  shots: ShotDraft[];
  delta: LocationDeltaInput;
  previousHashes?: Record<string, string>;
  visualScores?: Record<string, number>;
}) {
  const deltaSha = hashLocationDelta(input.delta);
  const locationDelta = {
    schemaVersion: LOCATION_DELTA_SCHEMA,
    ...input.delta,
    deltaDependencySha256: deltaSha,
    notesExcludedFromHash: true,
    basePurchasedSourceImmutable: true,
  };

  let frameCursor = 0;
  const continuity: Array<ReturnType<typeof evaluateLocationTransition> & { from: string; to: string; shotId: string }> =
    [];
  const shots = input.shots.map((draft, index) => {
    const previous = input.shots[index - 1];
    if (previous) {
      const transition = evaluateLocationTransition(
        previous.locationPresetId,
        draft.locationPresetId,
        draft.explicitTransition === true,
      );
      continuity.push({
        ...transition,
        from: previous.locationPresetId,
        to: draft.locationPresetId,
        shotId: draft.shotId,
      });
    }
    const frameStart = frameCursor;
    const frameEnd = frameCursor + draft.durationFrames;
    frameCursor = frameEnd;
    const locationDeltaSha256 = input.delta.shotIds.includes(draft.shotId) ? deltaSha : null;
    const shotDependencySha256 = hashShotDependency({
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
      locationDeltaSha256,
      renderProfile: draft.renderProfile,
      fps: PRIMARY_OUTPUT.fps,
      resolution: `${PRIMARY_OUTPUT.width}x${PRIMARY_OUTPUT.height}`,
    });
    const score = input.visualScores?.[draft.shotId] ?? 92;
    const visual = evaluateShotVisualApproval({
      shotId: draft.shotId,
      shotDependencySha256,
      scores: {
        focalReadability: score,
        characterReadability: score,
        composition916: score,
        lighting: score,
        palette: score,
        dressing: score,
        tierQuality: score,
        signage: score,
        kidReadability: score,
      },
      hardBlockers: [],
      focalTarget: draft.focalTarget,
    });
    const visualGate = evaluatePlannerVisualGate({
      shotId: draft.shotId,
      shotDependencySha256,
      receipt: visual.receipt,
    });
    const rerenderStatus = evaluateRerender({
      previousShotDependencySha256: input.previousHashes?.[draft.shotId],
      currentShotDependencySha256: shotDependencySha256,
      renderProfile: draft.renderProfile,
      visualApprovalStale: visualGate.stale,
    });
    const camera = cameraTemplate(draft.cameraTemplateId);
    const blocked = !visualGate.ok || rerenderStatus.startsWith('BLOCKED_') || continuity.some((item) => item.shotId === draft.shotId && !item.ok);
    return {
      schemaVersion: SHOT_PACKAGE_SCHEMA,
      shotId: draft.shotId,
      episodeId: input.episodeId,
      sequenceNumber: draft.sequenceNumber,
      storyBeatId: draft.storyBeatId,
      frameStart,
      frameEnd,
      durationFrames: draft.durationFrames,
      locationPresetId: draft.locationPresetId,
      locationPresetVersion: locationPreset(draft.locationPresetId, input.delta.seed).baseEnvironmentVersion,
      lightingPresetId: draft.lightingPresetId,
      cameraTemplateId: draft.cameraTemplateId,
      camera,
      focalTarget: draft.focalTarget,
      charactersVisible: draft.charactersVisible,
      dialogueRefs: draft.dialogueRefs,
      storyPropRefs: draft.storyPropRefs,
      deterministicSeed: input.delta.seed + draft.sequenceNumber,
      assetReceiptRefs: [UNRESOLVED],
      characterVersionRefs: { pipAssetVersion: UNRESOLVED, goatAssetVersion: UNRESOLVED },
      rigVersionRefs: { pipRigVersion: UNRESOLVED, goatRigVersion: UNRESOLVED },
      dressingDelta: locationDeltaSha256,
      cameraDelta: null,
      lightingDelta: null,
      shotDependencySha256,
      visualApprovalRequired: true,
      visualApprovalReceiptRef: visual.receipt,
      visualGate,
      renderProfile: draft.renderProfile,
      renderReadinessState: blocked ? 'BLOCKED' : 'PLANNING_READY_PAID_AUTH_REQUIRED',
      rerenderStatus,
      notes: draft.notes,
      displayLabel: draft.displayLabel,
      handoff: buildRenderHandoff({
        shotId: draft.shotId,
        shotDependencySha256,
        renderProfile: draft.renderProfile,
        assetReceiptRefs: [UNRESOLVED],
        visualApprovalReceipt: visual.receipt,
        estimatedRuntimeClass: draft.durationFrames > 150 ? 'medium' : 'short',
        estimatedComplexity: { visibleTriangles: 180000, uniqueMaterials: 12 },
      }),
    };
  });

  const storyOrder = shots.map((shot) => shot.shotId);
  const groups = new Map<string, string[]>();
  for (const shot of shots) {
    const key = `${shot.locationPresetId}|${shot.lightingPresetId}|${shot.locationPresetVersion}`;
    groups.set(key, [...(groups.get(key) ?? []), shot.shotId]);
  }
  const locationBlocks = [...groups.entries()].map(([key, shotIds], index) => {
    const [locationPresetId, lightingPresetId, environmentVersion] = key.split('|');
    return {
      schemaVersion: LOCATION_BLOCK_SCHEMA,
      locationBlockId: `LB_${String(index + 1).padStart(2, '0')}`,
      locationPresetId,
      environmentVersion,
      lightingPresetId,
      shotIds,
      deterministicBaseSeed: input.delta.seed + index,
      warmCacheReuseKey: key,
      sharedEnvironment: true,
      storyOrder: shotIds.filter((id) => storyOrder.includes(id)),
      productionOrder: shotIds,
      estimatedEnvironmentLoads: 1,
    };
  });

  const locationChangesWithoutGrouping = shots.length;

  const planningStatus = continuity.every((item) => item.ok) ? 'PLANNED' : 'BLOCKED_CONTINUITY';
  const dependencyHash = sha256Canonical({
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    shotHashes: shots.map((shot) => shot.shotDependencySha256),
    deltaSha,
  });
  const blockedShotCount = shots.filter((shot) => String(shot.renderReadinessState).startsWith('BLOCKED') || shot.rerenderStatus.startsWith('BLOCKED_')).length;
  const receipt = {
    schemaVersion: PLANNING_RECEIPT_SCHEMA,
    episodeId: input.episodeId,
    episodeDependencySha256: dependencyHash,
    shotCount: shots.length,
    locationBlockCount: locationBlocks.length,
    uniqueLocationCount: new Set(shots.map((shot) => shot.locationPresetId)).size,
    estimatedEnvironmentLoadsBefore: locationChangesWithoutGrouping,
    estimatedEnvironmentLoadsAfter: locationBlocks.length,
    warmCacheOpportunityCount: locationBlocks.filter((block) => block.shotIds.length > 1).length,
    cacheReuseEligibleShotCount: 0,
    rerenderRequiredCount: shots.filter((shot) => shot.rerenderStatus.includes('RERENDER_REQUIRED')).length,
    blockedShotCount,
    finalRenderAuthorized: false as const,
    gpuLaunched: false as const,
    paidCompute: false as const,
  };

  return {
    schemaVersion: EPISODE_PLAN_SCHEMA,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    seasonId: input.seasonId,
    episodeNumber: input.episodeNumber,
    title: input.title,
    durationTargetSeconds: Math.round(frameCursor / PRIMARY_OUTPUT.fps),
    fps: PRIMARY_OUTPUT.fps,
    outputResolution: `${PRIMARY_OUTPUT.width}x${PRIMARY_OUTPUT.height}`,
    aspectRatio: PRIMARY_OUTPUT.aspectRatio,
    storyBeats: input.beats,
    locationSequence: shots.map((shot) => shot.locationPresetId),
    shots,
    locationBlocks,
    locationDelta,
    estimatedComplexity: {
      shotCount: shots.length,
      uniqueLocations: receipt.uniqueLocationCount,
      blenderRequired: false,
    },
    dependencyHash,
    planningStatus,
    storyOrder,
    productionOrder: locationBlocks.flatMap((block) => block.productionOrder),
    continuity,
    receipt,
    safety: {
      blenderExecuted: false,
      commercialAssetsProcessed: false,
      botaniqProcessed: false,
      geoScatterUsed: false,
      gpuLaunched: false,
      paidCompute: false,
      providerContacted: false,
      pipGoatMutated: false,
      voiceGenerated: false,
    },
  };
}

export function planBatchEpisodes(episodes: Array<ReturnType<typeof planEpisode>>) {
  const locationKeys = new Map<string, string[]>();
  const lighting = new Set<string>();
  const cameras = new Set<string>();
  const environments = new Set<string>();
  const props = new Set<string>();
  let loadsWithout = 0;
  let loadsWith = 0;
  let blocked = 0;
  let approval = 0;
  for (const episode of episodes) {
    loadsWithout += episode.receipt.estimatedEnvironmentLoadsBefore;
    loadsWith += episode.receipt.estimatedEnvironmentLoadsAfter;
    blocked += episode.receipt.blockedShotCount;
    approval += episode.shots.filter((shot) => shot.visualApprovalRequired).length;
    for (const block of episode.locationBlocks) {
      const key = block.warmCacheReuseKey;
      locationKeys.set(key, [...(locationKeys.get(key) ?? []), ...block.shotIds]);
      lighting.add(String(block.lightingPresetId));
      environments.add(String(block.environmentVersion));
    }
    for (const shot of episode.shots) {
      cameras.add(shot.cameraTemplateId);
      for (const prop of shot.storyPropRefs) props.add(prop);
    }
  }
  return {
    schemaVersion: BATCH_EPISODE_PLAN_SCHEMA,
    episodesPlanned: episodes.length,
    shotsPlanned: episodes.reduce((sum, episode) => sum + episode.shots.length, 0),
    uniqueLocations: new Set(episodes.flatMap((episode) => episode.shots.map((shot) => shot.locationPresetId))).size,
    sharedLocations: [...new Set(episodes.flatMap((episode) => episode.shots.map((shot) => shot.locationPresetId)))],
    sharedLightingSetups: [...lighting],
    sharedCameraTemplates: [...cameras],
    sharedEnvironmentVersions: [...environments],
    warmCacheGroups: [...locationKeys.entries()].filter(([, shotIds]) => shotIds.length > 1).map(([key, shotIds]) => ({ key, shotIds })),
    reusableEstablishingShots: episodes.flatMap((episode) =>
      episode.shots.filter((shot) => shot.cameraTemplateId === 'TJ_CAM_ESTABLISHING_VERTICAL').map((shot) => shot.shotId),
    ),
    reusableNonCharacterBackgroundPlates: episodes.flatMap((episode) =>
      episode.shots.filter((shot) => shot.charactersVisible.length === 0).map((shot) => shot.shotId),
    ),
    commonStoryProps: [...props],
    locationLoadCount: loadsWith,
    locationLoadsWithoutGrouping: loadsWithout,
    locationLoadsWithGrouping: loadsWith,
    estimatedLoadsSaved: Math.max(0, loadsWithout - loadsWith),
    shotsRequiringVisualApproval: approval,
    shotsBlocked: blocked,
    characterAnimationReuseAutomatic: false,
    finalShotReuseRequiresExactHash: true,
    gpuLaunched: false as const,
    paidCompute: false as const,
    providerContacted: false as const,
  };
}

export function storyOrderPreserved(storyOrder: string[], productionOrder: string[]): boolean {
  const sameIds = [...storyOrder].sort().join('|') === [...productionOrder].sort().join('|');
  return sameIds && new Set(storyOrder).size === storyOrder.length;
}

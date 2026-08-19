import {
  LIGHTING_PROFILES,
  sha256Canonical,
  type LightingPresetId,
  type QualityTier,
  type RenderProfile,
} from '@/lib/tivvlejoy-storybook-environment';
import {
  CAMERA_TEMPLATE_IDS,
  cameraTemplate,
  evaluateRerender,
  type CameraTemplateId,
  type RerenderStatus,
} from '@/lib/tivvlejoy-episode-scene-planner';
import { collectionPlan, instanceNames } from './collections';
import {
  ASSEMBLY_MANIFEST_SCHEMA,
  ASSEMBLY_STAGES,
  BLENDER_ASSEMBLY_REQUEST_SCHEMA,
  CAMERA_BINDING_SCHEMA,
  CHANGE_IMPACT_SCHEMA,
  CHARACTER_SLOT_SCHEMA,
  DEPENDENCY_GRAPH_SCHEMA,
  ENVIRONMENT_SLOT_SCHEMA,
  LIGHTING_BINDING_SCHEMA,
  LOCATION_INSTANCE_SCHEMA,
  STORY_PROP_CONTINUITY_SCHEMA,
  UNRESOLVED,
  UNRESOLVED_PRODUCTION_RIG,
  VEGETATION_ROLES,
  type AssemblyBlocker,
  type AssemblyReadiness,
  type AssemblyStage,
  type EnvironmentRole,
  type ResolutionState,
} from './types';

export type CharacterSlotInput = {
  characterId: 'PIP' | 'GOAT';
  visible: boolean;
  speaking: boolean;
  dialogueRefs: string[];
  animationClipRef?: string;
};

export type EnvironmentSlotInput = {
  slotId: string;
  semanticRole: EnvironmentRole;
  qualityTier: QualityTier;
  required: boolean;
  visibilityClass: 'HERO' | 'SUPPORTING' | 'BACKGROUND';
  sourceReceiptRef?: string;
  sourceVersion?: string;
  sourceSha256?: string;
  expectedSha256?: string;
  derivativeReceiptRef?: string;
  derivativeSha256?: string;
  provenanceStatus?: ResolutionState;
  approvalStatus?: 'approved' | 'unapproved' | 'quarantined' | 'missing';
  expectedVersion?: string;
  providerPreference?: 'NATIVE_BLENDER' | 'BOTANIQ_IF_APPROVED';
  approvedAssetId?: string;
  approvedAssetVersion?: string;
  sourceId?: string;
  inspectionReceiptRef?: string;
  inspectionSha256?: string;
  approvalReceiptRef?: string;
  approvalSha256?: string;
  assetDependencySha256?: string;
  resolutionReceiptRef?: string;
  resolutionReceiptSha256?: string;
  registrySnapshotSha256?: string;
  resolutionState?: string;
  filenameSubstitution?: boolean;
  latestUsed?: boolean;
};

export type StoryPropContinuityInput = {
  propId: string;
  sourceVersion: string;
  visibleShotIds: string[];
  stateByShot: Record<string, string>;
  carriedBy: Record<string, 'PIP' | 'GOAT' | 'NONE'>;
  screenDirection: Record<string, 'left' | 'right' | 'center'>;
};

export function resolveAssetSlot(slot: EnvironmentSlotInput): {
  dependencyStatus: ResolutionState;
  blocker: AssemblyBlocker | null;
} {
  if (slot.providerPreference === 'BOTANIQ_IF_APPROVED') {
    return { dependencyStatus: 'UNRESOLVED_SOURCE', blocker: null };
  }
  if (slot.resolutionState === 'UNRESOLVED_NO_ELIGIBLE_ASSET') {
    return { dependencyStatus: 'UNRESOLVED_SOURCE', blocker: slot.required ? 'MISSING_ENVIRONMENT_SOURCE' : null };
  }
  if (slot.resolutionState === 'BLOCKED_UNAPPROVED') {
    return { dependencyStatus: 'BLOCKED_UNAPPROVED', blocker: 'UNAPPROVED_ASSET' };
  }
  if (slot.resolutionState === 'BLOCKED_QUARANTINED') {
    return { dependencyStatus: 'BLOCKED_QUARANTINED', blocker: 'QUARANTINED_ASSET' };
  }
  if (slot.resolutionState === 'BLOCKED_HASH_MISMATCH') {
    return { dependencyStatus: 'BLOCKED_HASH_MISMATCH', blocker: 'HASH_MISMATCH' };
  }
  if (slot.resolutionState === 'UNRESOLVED_PROVENANCE') {
    return { dependencyStatus: 'UNRESOLVED_PROVENANCE', blocker: 'PROVENANCE_UNKNOWN' };
  }
  if (slot.resolutionState === 'BLOCKED_CANONICAL_CONFLICT') {
    return { dependencyStatus: 'BLOCKED_CANONICAL_CONFLICT', blocker: 'CANONICAL_CONFLICT' };
  }
  if (slot.resolutionState === 'BLOCKED_CONTINUITY_PIN_INVALID') {
    return { dependencyStatus: 'BLOCKED_CONTINUITY_PIN_INVALID', blocker: 'CONTINUITY_PIN_INVALID' };
  }
  if (slot.resolutionState === 'BLOCKED_LICENSE') {
    return { dependencyStatus: 'BLOCKED_LICENSE', blocker: 'LICENSE_BLOCKED' };
  }
  if (slot.resolutionState === 'BLOCKED_STYLE_INCOMPATIBLE') {
    return { dependencyStatus: 'BLOCKED_STYLE_INCOMPATIBLE', blocker: 'STYLE_INCOMPATIBLE' };
  }
  if (slot.resolutionState === 'BLOCKED_TECHNICAL_INCOMPATIBLE') {
    return { dependencyStatus: 'BLOCKED_TECHNICAL_INCOMPATIBLE', blocker: 'TECHNICAL_INCOMPATIBLE' };
  }
  if (slot.approvalStatus === 'missing' || !slot.sourceReceiptRef) {
    return { dependencyStatus: 'UNRESOLVED_SOURCE', blocker: slot.required ? 'MISSING_ENVIRONMENT_SOURCE' : null };
  }
  if (slot.approvalStatus === 'quarantined') {
    return { dependencyStatus: 'BLOCKED_QUARANTINED', blocker: 'QUARANTINED_ASSET' };
  }
  if (slot.approvalStatus === 'unapproved') {
    return { dependencyStatus: 'BLOCKED_UNAPPROVED', blocker: 'UNAPPROVED_ASSET' };
  }
  if (!slot.sourceVersion) {
    return { dependencyStatus: 'UNRESOLVED_VERSION', blocker: slot.required ? 'MISSING_ENVIRONMENT_VERSION' : null };
  }
  if (!slot.sourceSha256) {
    return { dependencyStatus: 'UNRESOLVED_HASH', blocker: slot.required ? 'MISSING_ENVIRONMENT_HASH' : null };
  }
  if (slot.expectedVersion && slot.sourceVersion && slot.expectedVersion !== slot.sourceVersion) {
    return { dependencyStatus: 'BLOCKED_VERSION_MISMATCH', blocker: 'VERSION_MISMATCH' };
  }
  if (slot.expectedSha256 && slot.expectedSha256 !== slot.sourceSha256) {
    return { dependencyStatus: 'BLOCKED_HASH_MISMATCH', blocker: 'HASH_MISMATCH' };
  }
  if (slot.provenanceStatus === 'UNRESOLVED_PROVENANCE') {
    return { dependencyStatus: 'UNRESOLVED_PROVENANCE', blocker: 'PROVENANCE_UNKNOWN' };
  }
  return { dependencyStatus: slot.provenanceStatus === 'RESOLVED_RESTRICTED' ? 'RESOLVED_RESTRICTED' : 'RESOLVED_APPROVED', blocker: null };
}

export function characterSlot(input: CharacterSlotInput) {
  const unresolved = true;
  return {
    schemaVersion: CHARACTER_SLOT_SCHEMA,
    characterId: input.characterId,
    characterAssetVersion: UNRESOLVED_PRODUCTION_RIG,
    rigVersion: UNRESOLVED_PRODUCTION_RIG,
    animationClipRef: input.animationClipRef ?? UNRESOLVED,
    animationVersion: UNRESOLVED,
    transform: UNRESOLVED,
    visibility: input.visible,
    speaking: input.speaking,
    dialogueRefs: input.dialogueRefs,
    requiredPoseCapabilities: ['idle', 'talk'],
    requiredFacialCapabilities: ['eyes', 'mouth'],
    dependencyStatus: 'UNRESOLVED_VERSION' as ResolutionState,
    unresolvedProductionRig: unresolved,
  };
}

export function environmentSlot(input: EnvironmentSlotInput) {
  const vegetation = (VEGETATION_ROLES as readonly string[]).includes(input.semanticRole);
  const providerPreference = input.providerPreference ?? (vegetation ? 'NATIVE_BLENDER' : 'NATIVE_BLENDER');
  const resolved = resolveAssetSlot({ ...input, providerPreference });
  return {
    schemaVersion: ENVIRONMENT_SLOT_SCHEMA,
    slotId: input.slotId,
    semanticRole: input.semanticRole,
    requiredTags: [input.semanticRole.toLowerCase()],
    qualityTier: input.qualityTier,
    sourceReceiptRef: input.sourceReceiptRef ?? UNRESOLVED,
    sourceVersion: input.sourceVersion ?? UNRESOLVED,
    sourceSha256: input.sourceSha256 ?? UNRESOLVED,
    derivativeReceiptRef: input.derivativeReceiptRef ?? UNRESOLVED,
    derivativeSha256: input.derivativeSha256 ?? UNRESOLVED,
    provenanceStatus: resolved.dependencyStatus,
    visibilityClass: input.visibilityClass,
    required: input.required,
    dependencyStatus: resolved.dependencyStatus,
    providerPreference,
    botaniqBound: false,
    geoScatterIntegrated: false,
    blocker: resolved.blocker,
    latestUsed: input.latestUsed ?? false,
    filenameSubstitution: input.filenameSubstitution ?? false,
    approvedAssetId: input.approvedAssetId ?? null,
    approvedAssetVersion: input.approvedAssetVersion ?? null,
    sourceId: input.sourceId ?? null,
    inspectionReceiptRef: input.inspectionReceiptRef ?? null,
    inspectionSha256: input.inspectionSha256 ?? null,
    approvalReceiptRef: input.approvalReceiptRef ?? null,
    approvalSha256: input.approvalSha256 ?? null,
    assetDependencySha256: input.assetDependencySha256 ?? null,
    resolutionReceiptRef: input.resolutionReceiptRef ?? null,
    resolutionReceiptSha256: input.resolutionReceiptSha256 ?? null,
    registrySnapshotSha256: input.registrySnapshotSha256 ?? null,
  };
}

export function hashAssemblyManifest(input: {
  shotId: string;
  episodeId: string;
  episodeVersion: string;
  shotDependencySha256: string;
  locationVersion: string;
  locationDeltaSha256: string | null;
  cameraTemplateId: string;
  lightingPresetId: string;
  characterSlots: Array<{ characterId: string; rigVersion: string; visible: boolean }>;
  environmentSlots: Array<{
    slotId: string;
    sourceVersion: string;
    sourceSha256: string;
    approvedAssetId?: string | null;
    approvedAssetVersion?: string | null;
    assetDependencySha256?: string | null;
    resolutionReceiptSha256?: string | null;
    registrySnapshotSha256?: string | null;
  }>;
  storyPropIds: string[];
  renderProfile: RenderProfile;
}) {
  return sha256Canonical({
    schemaVersion: ASSEMBLY_MANIFEST_SCHEMA,
    shotId: input.shotId,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    shotDependencySha256: input.shotDependencySha256,
    locationVersion: input.locationVersion,
    locationDeltaSha256: input.locationDeltaSha256,
    cameraTemplateId: input.cameraTemplateId,
    lightingPresetId: input.lightingPresetId,
    characters: input.characterSlots
      .map((slot) => ({ id: slot.characterId, rig: slot.rigVersion, visible: slot.visible }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    environment: input.environmentSlots
      .map((slot) => ({
        slotId: slot.slotId,
        approvedAssetId: slot.approvedAssetId ?? null,
        approvedAssetVersion: slot.approvedAssetVersion ?? null,
        sourceSha256: slot.sourceSha256,
        assetDependencySha256: slot.assetDependencySha256 ?? null,
        resolutionReceiptSha256: slot.resolutionReceiptSha256 ?? null,
        registrySnapshotSha256: slot.registrySnapshotSha256 ?? null,
      }))
      .sort((a, b) => a.slotId.localeCompare(b.slotId)),
    storyProps: [...input.storyPropIds].sort(),
    renderProfile: input.renderProfile,
  });
}

export function classifyReadiness(input: {
  requiredBlockers: AssemblyBlocker[];
  unresolvedRigs: boolean;
  waitingForAssets: boolean;
  synthetic: boolean;
}): { planning: AssemblyReadiness; real: AssemblyReadiness } {
  if (
    input.requiredBlockers.some((item) =>
      (
        [
          'QUARANTINED_ASSET',
          'UNAPPROVED_ASSET',
          'HASH_MISMATCH',
          'VERSION_MISMATCH',
          'MISSING_ENVIRONMENT_SOURCE',
          'MISSING_ENVIRONMENT_VERSION',
          'MISSING_ENVIRONMENT_HASH',
          'MISSING_STORY_PROP',
          'CANONICAL_CONFLICT',
          'CONTINUITY_PIN_INVALID',
          'LICENSE_BLOCKED',
          'TECHNICAL_INCOMPATIBLE',
          'STYLE_INCOMPATIBLE',
        ] as AssemblyBlocker[]
      ).includes(item),
    )
  ) {
    return { planning: 'ASSEMBLY_BLOCKED', real: 'ASSEMBLY_BLOCKED' };
  }
  if (input.waitingForAssets) {
    return { planning: 'PLANNING_READY', real: 'WAITING_FOR_ASSETS' };
  }
  if (input.unresolvedRigs) {
    return { planning: 'READY_FOR_SYNTHETIC_ASSEMBLY', real: 'WAITING_FOR_CHARACTER_RIGS' };
  }
  if (input.synthetic) {
    return { planning: 'READY_FOR_SYNTHETIC_ASSEMBLY', real: 'WAITING_FOR_ASSETS' };
  }
  return { planning: 'READY_FOR_SYNTHETIC_ASSEMBLY', real: 'WAITING_FOR_CHARACTER_RIGS' };
}

export function stoppedStage(blockers: AssemblyBlocker[]): AssemblyStage {
  if (blockers.includes('SHOT_DEPENDENCY_MISMATCH')) return '01_VALIDATE_SHOT_PACKAGE';
  if (blockers.includes('MISSING_LOCATION_VERSION')) return '02_RESOLVE_LOCATION';
  if (
    blockers.includes('MISSING_ENVIRONMENT_SOURCE') ||
    blockers.includes('MISSING_ENVIRONMENT_VERSION') ||
    blockers.includes('MISSING_ENVIRONMENT_HASH') ||
    blockers.includes('MISSING_DERIVATIVE') ||
    blockers.includes('UNAPPROVED_ASSET') ||
    blockers.includes('QUARANTINED_ASSET') ||
    blockers.includes('HASH_MISMATCH') ||
    blockers.includes('VERSION_MISMATCH') ||
    blockers.includes('CANONICAL_CONFLICT') ||
    blockers.includes('CONTINUITY_PIN_INVALID') ||
    blockers.includes('LICENSE_BLOCKED') ||
    blockers.includes('TECHNICAL_INCOMPATIBLE') ||
    blockers.includes('STYLE_INCOMPATIBLE')
  ) {
    return '03_RESOLVE_ASSET_RECEIPTS';
  }
  if (blockers.includes('MISSING_STORY_PROP')) return '07_PLACE_STORY_PROPS';
  if (blockers.includes('MISSING_CHARACTER_ASSET') || blockers.includes('MISSING_CHARACTER_RIG')) return '08_PLACE_CHARACTERS';
  if (blockers.includes('CAMERA_RIG_MEASUREMENT_UNRESOLVED')) return '09_BIND_CAMERA';
  if (blockers.includes('PROVENANCE_UNKNOWN')) return '13_VALIDATE_PROVENANCE';
  return '14_BUILD_DEPENDENCY_HASH';
}

export function buildBlenderAssemblyRequest(manifestRef: string, assemblyDependencySha256: string) {
  return {
    schemaVersion: BLENDER_ASSEMBLY_REQUEST_SCHEMA,
    shotAssemblyManifestRef: manifestRef,
    assemblyDependencySha256,
    blenderVersion: '4.2.2',
    outputWorkspace: UNRESOLVED,
    dryRun: true as const,
    allowCommercialSources: false as const,
    allowCharacterAssets: false as const,
    executionAuthorized: false as const,
    subprocessStarted: false as const,
    blenderCommandIssued: false as const,
    workerCalled: false as const,
  };
}

export function buildRenderBridge(input: {
  shotId: string;
  shotDependencySha256: string;
  assemblyDependencySha256: string;
  renderProfile: RenderProfile;
  assemblyReady: boolean;
  visualApprovalReady: boolean;
  assetReceiptRefs: string[];
  visualApprovalReceiptRef: unknown;
}) {
  return {
    shotId: input.shotId,
    shotDependencySha256: input.shotDependencySha256,
    assemblyDependencySha256: input.assemblyDependencySha256,
    assetReceiptRefs: input.assetReceiptRefs,
    visualApprovalReceiptRef: input.visualApprovalReceiptRef,
    renderProfile: input.renderProfile,
    assemblyReady: input.assemblyReady,
    visualApprovalReady: input.visualApprovalReady,
    paidAuthorizationRequired: true as const,
    providerContacted: false as const,
    gpuLaunched: false as const,
    paidCompute: false as const,
    launchAuthorized: false as const,
  };
}

export function storyPropContinuity(input: StoryPropContinuityInput) {
  return {
    schemaVersion: STORY_PROP_CONTINUITY_SCHEMA,
    propId: input.propId,
    sourceVersion: input.sourceVersion,
    visibleShotIds: input.visibleShotIds,
    stateByShot: input.stateByShot,
    carriedBy: input.carriedBy,
    screenDirection: input.screenDirection,
    continuityVersion: `${input.propId}-v1`,
    dependencySha256: sha256Canonical({
      propId: input.propId,
      sourceVersion: input.sourceVersion,
      visibleShotIds: [...input.visibleShotIds].sort(),
      stateByShot: input.stateByShot,
    }),
  };
}

export function continuityAffectedShots(continuity: ReturnType<typeof storyPropContinuity>, changedShotId: string) {
  const start = continuity.visibleShotIds.indexOf(changedShotId);
  if (start === -1) return [];
  return continuity.visibleShotIds.slice(start);
}

export type AssemblyShotInput = {
  shotId: string;
  episodeId: string;
  episodeVersion: string;
  shotDependencySha256: string;
  locationPresetId: string;
  environmentVersion: string;
  locationBlockId: string;
  locationDeltaId: string | null;
  locationDeltaSha256: string | null;
  cameraTemplateId: string;
  focalTarget: string;
  lightingPresetId: string;
  charactersVisible: Array<'PIP' | 'GOAT'>;
  dialogueRefs: string[];
  storyPropRefs: string[];
  renderProfile: RenderProfile;
  notes?: string;
  environmentSlots: EnvironmentSlotInput[];
  visualApprovalReceiptRef: unknown;
  visualApprovalStale?: boolean;
};

export function assembleShot(input: AssemblyShotInput) {
  const characters = (['PIP', 'GOAT'] as const).map((id) =>
    characterSlot({
      characterId: id,
      visible: input.charactersVisible.includes(id),
      speaking: input.dialogueRefs.length > 0 && input.charactersVisible.includes(id),
      dialogueRefs: input.charactersVisible.includes(id) ? input.dialogueRefs : [],
    }),
  );
  const environmentAssets = input.environmentSlots.map((slot) => environmentSlot(slot));
  const requiredBlockers = environmentAssets
    .map((slot) => slot.blocker)
    .filter((item): item is AssemblyBlocker => Boolean(item));
  if (input.charactersVisible.includes('PIP') || input.charactersVisible.includes('GOAT')) {
    requiredBlockers.push('MISSING_CHARACTER_RIG');
  }
  requiredBlockers.push('CAMERA_RIG_MEASUREMENT_UNRESOLVED');
  if (input.visualApprovalStale) requiredBlockers.push('VISUAL_APPROVAL_STALE');

  const uniqueBlockers = Array.from(new Set(requiredBlockers));
  const readiness = classifyReadiness({
    requiredBlockers: uniqueBlockers,
    unresolvedRigs: true,
    waitingForAssets: environmentAssets.some((slot) => slot.required && String(slot.sourceReceiptRef) === UNRESOLVED),
    synthetic: true,
  });
  const planningStatus: AssemblyReadiness = readiness.planning;
  const realStatus: AssemblyReadiness = readiness.real;
  if (readiness.real === 'READY_FOR_REAL_ASSEMBLY') {
    throw new Error('Synthetic fixtures cannot become READY_FOR_REAL_ASSEMBLY');
  }
  const knownCamera = (CAMERA_TEMPLATE_IDS as readonly string[]).includes(input.cameraTemplateId)
    ? cameraTemplate(input.cameraTemplateId as CameraTemplateId)
    : null;
  const lightingProfile =
    input.lightingPresetId in LIGHTING_PROFILES
      ? LIGHTING_PROFILES[input.lightingPresetId as LightingPresetId]
      : null;
  const assemblyDependencySha256 = hashAssemblyManifest({
    shotId: input.shotId,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    shotDependencySha256: input.shotDependencySha256,
    locationVersion: input.environmentVersion,
    locationDeltaSha256: input.locationDeltaSha256,
    cameraTemplateId: input.cameraTemplateId,
    lightingPresetId: input.lightingPresetId,
    characterSlots: characters.map((slot) => ({
      characterId: slot.characterId,
      rigVersion: slot.rigVersion,
      visible: slot.visibility,
    })),
    environmentSlots: environmentAssets,
    storyPropIds: input.storyPropRefs,
    renderProfile: input.renderProfile,
  });
  const camera = {
    schemaVersion: CAMERA_BINDING_SCHEMA,
    shotId: input.shotId,
    cameraTemplateId: input.cameraTemplateId,
    cameraTemplateVersion: '1',
    transformStatus: UNRESOLVED,
    lensStatus: UNRESOLVED,
    focalTarget: input.focalTarget,
    plannedTransform: UNRESOLVED,
    plannedLens: UNRESOLVED,
    plannedMovement: knownCamera?.movementClass ?? UNRESOLVED,
    safeHeadroomPolicy: knownCamera?.safeHeadroomPolicy ?? 'preferred-6-12',
    dialogueSafe: knownCamera?.dialogueSafe ?? (input.focalTarget === 'PIP' || input.focalTarget === 'GOAT' || input.focalTarget === 'PIP_AND_GOAT'),
    rigDependentMeasurementStatus: UNRESOLVED_PRODUCTION_RIG,
    pipGoatPixelMeasurements: UNRESOLVED,
  };
  const lighting = {
    schemaVersion: LIGHTING_BINDING_SCHEMA,
    shotId: input.shotId,
    lightingPresetId: input.lightingPresetId,
    lightingProfileVersion: lightingProfile ? '1' : 'lighting-v1',
    lightingVersion: lightingProfile ? '1' : 'lighting-v1',
    keyRole: 'KEY',
    fillRole: 'FILL',
    rimRole: 'RIM',
    environmentLightRole: 'WORLD',
    volumetricsAllowed: lightingProfile?.allowedVolumetrics ?? false,
    characterReadabilityRequired: lightingProfile?.characterReadabilityRequired ?? true,
    pluginDependency: 'NONE',
    optionalProviders: {
      gaffer: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
      physicalStarlight: 'OPTIONAL_PROVIDER_NOT_ACTIVATED',
    },
    nativeFallback: 'NATIVE_BLENDER',
    overrideRefs: [],
  };
  return {
    schemaVersion: ASSEMBLY_MANIFEST_SCHEMA,
    manifestVersion: ASSEMBLY_MANIFEST_SCHEMA,
    shotId: input.shotId,
    episodeId: input.episodeId,
    episodeVersion: input.episodeVersion,
    shotDependencySha256: input.shotDependencySha256,
    location: {
      presetId: input.locationPresetId,
      environmentVersion: input.environmentVersion,
      locationBlockId: input.locationBlockId,
      locationDeltaId: input.locationDeltaId,
      sourceReceiptRefs: [UNRESOLVED],
    },
    camera,
    lighting,
    characters: { slots: characters },
    storyProps: { slots: input.storyPropRefs.map((id) => ({ propId: id, sourceVersion: UNRESOLVED })) },
    environmentAssets: { slots: environmentAssets },
    dressing: {
      baseLocationRef: input.environmentVersion,
      deltaRef: input.locationDeltaId,
      deterministicSeed: 4170179,
    },
    render: {
      profile: input.renderProfile,
      resolution: '1080x1920',
      aspectRatio: '9:16',
      fps: 30,
    },
    collections: collectionPlan(input.shotId),
    names: instanceNames(input.shotId, input.locationPresetId.toUpperCase()),
    assemblyStatus: planningStatus,
    realAssemblyStatus: realStatus,
    unresolvedDependencies: [
      UNRESOLVED_PRODUCTION_RIG,
      ...environmentAssets.filter((slot) => String(slot.dependencyStatus).startsWith('UNRESOLVED')).map((slot) => slot.slotId),
    ],
    hardBlockers: uniqueBlockers,
    assemblyDependencySha256,
    stoppedAt: readiness.planning === 'ASSEMBLY_BLOCKED' ? stoppedStage(uniqueBlockers) : '14_BUILD_DEPENDENCY_HASH',
    stages: ASSEMBLY_STAGES,
    blenderRequest: buildBlenderAssemblyRequest(`${input.shotId}.manifest`, assemblyDependencySha256),
    renderBridge: buildRenderBridge({
      shotId: input.shotId,
      shotDependencySha256: input.shotDependencySha256,
      assemblyDependencySha256,
      renderProfile: input.renderProfile,
      assemblyReady: planningStatus === 'READY_FOR_SYNTHETIC_ASSEMBLY' || planningStatus === 'PLANNING_READY',
      visualApprovalReady: !input.visualApprovalStale,
      assetReceiptRefs: [UNRESOLVED],
      visualApprovalReceiptRef: input.visualApprovalReceiptRef,
    }),
    notes: input.notes,
    safety: {
      blenderExecuted: false,
      botaniqProcessed: false,
      geoScatterIntegrated: false,
      gpuLaunched: false,
      paidCompute: false,
      providerContacted: false,
      readyForRealAssembly: false,
    },
  };
}

export function locationInstance(input: {
  locationInstanceId: string;
  locationPresetId: string;
  baseEnvironmentVersion: string;
  locationBlockId: string;
  episodeDeltaId: string | null;
  shotIds: string[];
  baseSeed: number;
  appliedDeltaSha256: string | null;
}) {
  return {
    schemaVersion: LOCATION_INSTANCE_SCHEMA,
    ...input,
    sourceImmutable: true as const,
    duplicatedBaseSource: false as const,
  };
}

export function buildDependencyGraph(
  manifests: Array<ReturnType<typeof assembleShot>>,
  extras?: { pipRigVersion?: string; goatRigVersion?: string; locationVersions?: Record<string, string> },
) {
  const nodes = manifests.flatMap((manifest) => {
    const characterIds = manifest.characters.slots.filter((slot) => slot.visibility).map((slot) => slot.characterId);
    return [
      { id: `shot:${manifest.shotId}`, kind: 'shot', shotId: manifest.shotId },
      { id: `location:${manifest.location.presetId}:${manifest.location.environmentVersion}`, kind: 'location', shotId: manifest.shotId },
      { id: `delta:${manifest.location.locationDeltaId ?? 'none'}`, kind: 'locationDelta', shotId: manifest.shotId },
      { id: `camera:${manifest.camera.cameraTemplateId}:${manifest.shotId}`, kind: 'camera', shotId: manifest.shotId },
      { id: `lighting:${manifest.lighting.lightingPresetId}:${manifest.shotId}`, kind: 'lighting', shotId: manifest.shotId },
      ...characterIds.map((id) => ({
        id: `character:${id}:${id === 'PIP' ? extras?.pipRigVersion ?? UNRESOLVED_PRODUCTION_RIG : extras?.goatRigVersion ?? UNRESOLVED_PRODUCTION_RIG}`,
        kind: 'character',
        shotId: manifest.shotId,
      })),
      ...manifest.storyProps.slots.map((slot) => ({ id: `prop:${slot.propId}`, kind: 'storyProp', shotId: manifest.shotId })),
      ...manifest.environmentAssets.slots.map((slot) => ({ id: `env:${slot.slotId}`, kind: 'environmentSlot', shotId: manifest.shotId })),
    ];
  });
  const edges = manifests.flatMap((manifest) => {
    const deps = [
      `location:${manifest.location.presetId}:${manifest.location.environmentVersion}`,
      `camera:${manifest.camera.cameraTemplateId}:${manifest.shotId}`,
      `lighting:${manifest.lighting.lightingPresetId}:${manifest.shotId}`,
      ...manifest.characters.slots.filter((slot) => slot.visibility).map((slot) => `character:${slot.characterId}:${slot.rigVersion}`),
      ...manifest.storyProps.slots.map((slot) => `prop:${slot.propId}`),
      ...manifest.environmentAssets.slots.map((slot) => `env:${slot.slotId}`),
    ];
    return deps.map((from) => ({ from, to: `shot:${manifest.shotId}` }));
  });
  const shotsFor = (predicate: (edge: { from: string; to: string }) => boolean) =>
    Array.from(new Set(edges.filter(predicate).map((edge) => edge.to.replace('shot:', ''))));
  return {
    schemaVersion: DEPENDENCY_GRAPH_SCHEMA,
    nodes,
    edges,
    locationVersions: extras?.locationVersions ?? {},
    shotsAffectedByAsset(assetId: string) {
      return shotsFor((edge) => edge.from.includes(assetId));
    },
    shotsAffectedByLocation(version: string) {
      const query = version.replace(/_/g, '-');
      return shotsFor((edge) => {
        if (!edge.from.startsWith('location:')) return false;
        const rest = edge.from.slice('location:'.length);
        return rest === version || rest.replace(/_/g, '-').includes(query) || rest.includes(version);
      });
    },
    shotsAffectedByCharacter(characterId: 'PIP' | 'GOAT') {
      return shotsFor((edge) => edge.from.startsWith(`character:${characterId}:`));
    },
    shotsAffectedByProp(propId: string) {
      return shotsFor((edge) => edge.from === `prop:${propId}`);
    },
    directDependencies: Object.fromEntries(manifests.map((manifest) => [manifest.shotId, edges.filter((edge) => edge.to === `shot:${manifest.shotId}`).map((edge) => edge.from)])),
    downstreamDependents: Object.fromEntries(
      nodes.map((node) => [node.id, edges.filter((edge) => edge.from === node.id).map((edge) => edge.to)]),
    ),
  };
}

export function changeImpactReport(
  previous: ReturnType<typeof buildDependencyGraph>,
  next: ReturnType<typeof buildDependencyGraph>,
  manifests: Array<ReturnType<typeof assembleShot>>,
  previousHashes: Record<string, string>,
  previousShotHashes?: Record<string, string>,
) {
  const unchangedShots: string[] = [];
  const previewRerenderShots: string[] = [];
  const finalRerenderShots: string[] = [];
  const visualApprovalStaleShots: string[] = [];
  const unresolvedShots: string[] = [];
  const reasonsByShot: Record<string, string[]> = {};
  for (const manifest of manifests) {
    const previousShotHash =
      previousShotHashes?.[manifest.shotId] ??
      (previousHashes[manifest.shotId] === manifest.assemblyDependencySha256 ? manifest.shotDependencySha256 : previousHashes[manifest.shotId]);
    const status: RerenderStatus = evaluateRerender({
      previousShotDependencySha256: previousShotHash,
      currentShotDependencySha256: manifest.shotDependencySha256,
      renderProfile: manifest.render.profile,
      visualApprovalStale: manifest.hardBlockers.includes('VISUAL_APPROVAL_STALE'),
    });
    const prevDeps = previous.directDependencies[manifest.shotId] ?? [];
    const nextDeps = next.directDependencies[manifest.shotId] ?? [];
    const changed = JSON.stringify(prevDeps) !== JSON.stringify(nextDeps) || previousHashes[manifest.shotId] !== manifest.assemblyDependencySha256;
    reasonsByShot[manifest.shotId] = changed ? ['dependency-or-assembly-hash-changed'] : ['unchanged'];
    if (status === 'BLOCKED_APPROVAL_STALE') visualApprovalStaleShots.push(manifest.shotId);
    else if (status === 'BLOCKED_DEPENDENCY_UNKNOWN') unresolvedShots.push(manifest.shotId);
    else if (status === 'FINAL_RERENDER_REQUIRED') finalRerenderShots.push(manifest.shotId);
    else if (status === 'PREVIEW_RERENDER_REQUIRED') previewRerenderShots.push(manifest.shotId);
    else unchangedShots.push(manifest.shotId);
  }
  return {
    schemaVersion: CHANGE_IMPACT_SCHEMA,
    unchangedShots,
    previewRerenderShots,
    finalRerenderShots,
    visualApprovalStaleShots,
    unresolvedShots,
    reasonsByShot,
  };
}

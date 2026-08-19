import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import {
  assembleShot,
  buildDependencyGraph,
  changeImpactReport,
  locationInstance,
  storyPropContinuity,
  type AssemblyShotInput,
  type EnvironmentSlotInput,
} from './engine';

function bakerySlots(): EnvironmentSlotInput[] {
  return [
    { slotId: 'BAKERY_HERO', semanticRole: 'BUILDING_HERO', qualityTier: 'HERO', required: true, visibilityClass: 'HERO', sourceReceiptRef: 'SYN_BAKERY', sourceVersion: 'bakery-env-v1', sourceSha256: 'ab'.repeat(32), approvalStatus: 'approved', provenanceStatus: 'RESOLVED_RESTRICTED' },
    { slotId: 'BAKERY_PATH', semanticRole: 'PATH', qualityTier: 'SUPPORTING', required: true, visibilityClass: 'SUPPORTING', sourceReceiptRef: 'SYN_PATH', sourceVersion: 'path-v1', sourceSha256: 'cd'.repeat(32), approvalStatus: 'approved' },
    { slotId: 'BAKERY_FLOWERS', semanticRole: 'FLOWERS', qualityTier: 'SUPPORTING', required: false, visibilityClass: 'SUPPORTING', sourceReceiptRef: 'SYN_FLOWERS', sourceVersion: 'flowers-v1', sourceSha256: 'ef'.repeat(32), approvalStatus: 'approved', providerPreference: 'NATIVE_BLENDER' },
    { slotId: 'BAKERY_TREES', semanticRole: 'TREE_BACKGROUND', qualityTier: 'BACKGROUND', required: false, visibilityClass: 'BACKGROUND', providerPreference: 'BOTANIQ_IF_APPROVED' },
    { slotId: 'BAKERY_SIGN', semanticRole: 'SIGNAGE', qualityTier: 'HERO', required: true, visibilityClass: 'HERO', sourceReceiptRef: 'SYN_SIGN', sourceVersion: 'sign-v1', sourceSha256: '11'.repeat(32), approvalStatus: 'approved' },
  ];
}

function forestSlots(): EnvironmentSlotInput[] {
  return [
    { slotId: 'FOREST_TREES', semanticRole: 'TREE_HERO', qualityTier: 'HERO', required: true, visibilityClass: 'HERO', sourceReceiptRef: 'SYN_TREES', sourceVersion: 'forest-exit-env-v1', sourceSha256: '22'.repeat(32), approvalStatus: 'approved', providerPreference: 'NATIVE_BLENDER' },
    { slotId: 'FOREST_GRASS', semanticRole: 'GRASS', qualityTier: 'BACKGROUND', required: false, visibilityClass: 'BACKGROUND', sourceReceiptRef: 'SYN_GRASS', sourceVersion: 'grass-v1', sourceSha256: '33'.repeat(32), approvalStatus: 'approved', providerPreference: 'NATIVE_BLENDER' },
    { slotId: 'FOREST_SKY', semanticRole: 'SKY', qualityTier: 'BACKGROUND', required: true, visibilityClass: 'BACKGROUND', sourceReceiptRef: 'SYN_SKY', sourceVersion: 'sky-v1', sourceSha256: '44'.repeat(32), approvalStatus: 'approved' },
  ];
}

export const MAP_PROP_CONTINUITY = storyPropContinuity({
  propId: 'MAP_PROP_001',
  sourceVersion: 'map-synth-v1',
  visibleShotIds: ['SH003', 'SH004', 'SH007', 'SH010'],
  stateByShot: {
    SH003: 'discovered',
    SH004: 'insert-open',
    SH007: 'carried',
    SH010: 'pointed-at-tree',
  },
  carriedBy: {
    SH003: 'PIP',
    SH004: 'NONE',
    SH007: 'PIP',
    SH010: 'PIP',
  },
  screenDirection: {
    SH003: 'center',
    SH004: 'center',
    SH007: 'left',
    SH010: 'right',
  },
});

export function ep012AssemblyInputs(overrides: Partial<AssemblyShotInput> = {}, shotFilter?: (shotId: string) => boolean) {
  const plan = sampleEpisodeWithKnownHashes();
  return plan.shots.filter((shot) => (shotFilter ? shotFilter(shot.shotId) : true)).map((shot) => {
    const bakery = shot.locationPresetId === 'bakery';
    const input: AssemblyShotInput = {
      shotId: shot.shotId,
      episodeId: plan.episodeId,
      episodeVersion: plan.episodeVersion,
      shotDependencySha256: shot.shotDependencySha256,
      locationPresetId: shot.locationPresetId,
      environmentVersion: shot.locationPresetVersion,
      locationBlockId: plan.locationBlocks.find((block) => block.shotIds.includes(shot.shotId))?.locationBlockId ?? 'LB_UNKNOWN',
      locationDeltaId: shot.dressingDelta ? 'DELTA_EP012_BAKERY' : null,
      locationDeltaSha256: typeof shot.dressingDelta === 'string' ? shot.dressingDelta : null,
      cameraTemplateId: shot.cameraTemplateId,
      focalTarget: shot.focalTarget,
      lightingPresetId: shot.lightingPresetId,
      charactersVisible: shot.charactersVisible,
      dialogueRefs: shot.dialogueRefs,
      storyPropRefs: shot.storyPropRefs.includes('PROP_STORY_MAP') ? ['MAP_PROP_001'] : shot.storyPropRefs,
      renderProfile: shot.renderProfile,
      environmentSlots: bakery ? bakerySlots() : forestSlots(),
      visualApprovalReceiptRef: shot.visualApprovalReceiptRef,
      ...overrides,
    };
    return { ...input, shotId: shot.shotId, episodeId: plan.episodeId };
  });
}

export function assembleEp012(overrides: Partial<AssemblyShotInput> = {}) {
  const plan = sampleEpisodeWithKnownHashes();
  const manifests = ep012AssemblyInputs(overrides).map((input) => assembleShot(input));
  const bakeryShots = manifests.filter((item) => item.location.presetId === 'bakery').map((item) => item.shotId);
  const forestShots = manifests.filter((item) => item.location.presetId === 'forest_exit').map((item) => item.shotId);
  const instances = [
    locationInstance({
      locationInstanceId: 'LOC_BAKERY_EP012',
      locationPresetId: 'bakery',
      baseEnvironmentVersion: 'bakery-env-v1',
      locationBlockId: 'LB_01',
      episodeDeltaId: 'DELTA_EP012_BAKERY',
      shotIds: bakeryShots,
      baseSeed: 4170179,
      appliedDeltaSha256: plan.locationDelta.deltaDependencySha256,
    }),
    locationInstance({
      locationInstanceId: 'LOC_FOREST_EP012',
      locationPresetId: 'forest_exit',
      baseEnvironmentVersion: 'forest-exit-env-v1',
      locationBlockId: 'LB_02',
      episodeDeltaId: null,
      shotIds: forestShots,
      baseSeed: 4170180,
      appliedDeltaSha256: null,
    }),
  ];
  const graph = buildDependencyGraph(manifests);
  const impact = changeImpactReport(
    graph,
    graph,
    manifests,
    Object.fromEntries(manifests.map((item) => [item.shotId, item.assemblyDependencySha256])),
    Object.fromEntries(manifests.map((item) => [item.shotId, item.shotDependencySha256])),
  );
  const resolved = manifests.flatMap((item) => item.environmentAssets.slots).filter((slot) => String(slot.dependencyStatus).startsWith('RESOLVED'));
  const unresolved = manifests.flatMap((item) => item.environmentAssets.slots).filter((slot) => !String(slot.dependencyStatus).startsWith('RESOLVED'));
  return {
    episodeId: 'EP012',
    title: plan.title,
    manifests,
    instances,
    continuity: MAP_PROP_CONTINUITY,
    graph,
    impact,
    metrics: {
      shotCount: manifests.length,
      uniqueLocationInstances: instances.length,
      baseEnvironmentLoads: instances.length,
      environmentInstances: manifests.length,
      reusedEnvironmentInstances: manifests.length - instances.length,
      assetSlotCount: manifests.flatMap((item) => item.environmentAssets.slots).length,
      resolvedSlotCount: resolved.length,
      unresolvedSlotCount: unresolved.length,
      blockedShotCount: manifests.filter((item) => item.assemblyStatus === 'ASSEMBLY_BLOCKED').length,
      readyPlanningShotCount: manifests.filter((item) => item.assemblyStatus === 'PLANNING_READY' || item.assemblyStatus === 'READY_FOR_SYNTHETIC_ASSEMBLY').length,
      readyRealAssemblyShotCount: manifests.filter((item) => item.realAssemblyStatus === 'READY_FOR_REAL_ASSEMBLY').length,
    },
    safety: {
      blenderExecuted: false,
      botaniqProcessed: false,
      geoScatterIntegrated: false,
      gpuLaunched: false,
      paidCompute: false,
      providerContacted: false,
      purchasedAssetsTouched: false,
    },
  };
}

export function assembleEp012Once() {
  return assembleEp012();
}

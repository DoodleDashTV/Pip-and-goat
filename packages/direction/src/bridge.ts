/**
 * Bridge from a production blueprint to the manifests the studio already has.
 *
 * This is the whole integration surface, and it is deliberately a projection rather
 * than a replacement. Two targets:
 *
 * 1. `shot_meta`, consumed by `scripts/blender/assemble_scene.py`. Its existing keys
 *    keep their existing meanings; everything new lives under a single `direction`
 *    block that the Python side reads only when present. A renderer that has not
 *    been updated therefore produces byte-identical output to today, which is what
 *    makes this safe to land next to a closed acceptance. (Built by
 *    `projectShotMeta`, in the director module where the plans are in scope.)
 *
 * 2. `CloudJobManifest`'s `cameraState` / `lightingState` / `vfxState` /
 *    `expressionStates` / `visemeData` bags, which have existed and been hashed by
 *    `buildCloudCacheKey()` since before this tranche — and been empty the whole
 *    time. Filling them is what makes direction changes invalidate cloud renders,
 *    and it needs no schema change because they are already `record(unknown)`.
 *
 * Pure and total: no I/O, no clock. `production` owns the manifest and drops these
 * records into it, which keeps the dependency pointing one way.
 */
import type { ShotBlueprint } from './schema/blueprint';
import type { ProductionBlueprint } from './schema/blueprint';
import { BLUEPRINT_SCHEMA_VERSION, SUBSYSTEM_VERSIONS } from './versions';
import { rigProfile, type Viseme } from './rig';

/** The Blender role names the approved assets use. Lowercase, and not renamed. */
export const BLENDER_ROLE_BY_CHARACTER: Readonly<Record<string, string>> = {
  CHAR_PIP_001: 'pip',
  CHAR_GOAT_001: 'goat',
};

/** Manifest state bags, exactly as `CloudJobManifestSchema` declares them. */
export type ManifestDirectionState = {
  readonly cameraState: Record<string, unknown>;
  readonly lightingState: Record<string, unknown>;
  readonly vfxState: Record<string, unknown>;
  readonly expressionStates: Record<string, unknown>;
  readonly visemeData: Record<string, unknown>;
  /**
   * Render tier, engine, samples, passes, comp and grade, for the manifest's
   * existing `renderSettings` bag.
   *
   * `renderSettings` is already `record(unknown)` and already hashed into the
   * cloud cache key, so a Cycles FINAL and an EEVEE DRAFT of the same plan stop
   * colliding without any manifest schema change.
   */
  readonly renderSettings: Record<string, unknown>;
  /** Groom and simulation caches the render depends on. */
  readonly simulationState: Record<string, unknown>;
};

function roleFor(characterCode: string): string {
  return BLENDER_ROLE_BY_CHARACTER[characterCode] ?? characterCode.toLowerCase();
}

/**
 * The rig's viseme channels, and the reverse map back to the structured viseme.
 *
 * The manifest's `visemeData` speaks structured visemes (`A`, `M_B_P`), and the
 * face plan speaks rig channel names. Reverse-mapping through the rig is what lets
 * a rig that names its channels anything at all still produce the same manifest —
 * where the old `channel.startsWith('viseme_')` test would have silently emitted
 * nothing.
 */
function visemeLookup(rigId: string): { channels: Set<string>; visemeOf: Map<string, Viseme> } {
  const rig = rigProfile(rigId);
  const visemeOf = new Map<string, Viseme>();
  for (const [viseme, channel] of Object.entries(rig.visemeChannels)) {
    visemeOf.set(channel, viseme as Viseme);
  }
  return { channels: new Set(visemeOf.keys()), visemeOf };
}

/**
 * Project one shot's direction into the manifest's state bags.
 *
 * What goes in is everything that changes the rendered pixels and nothing that does
 * not: the cost estimate and the decision trace are deliberately excluded, because
 * a re-render triggered by a changed cost estimate would be a re-render for nothing.
 */
export function projectManifestState(shot: ShotBlueprint): ManifestDirectionState {
  const cameraState: Record<string, unknown> = {
    directionVersion: SUBSYSTEM_VERSIONS.camera,
    composition: shot.camera.composition,
    preset: shot.camera.preset,
    move: shot.camera.move,
    lensMm: shot.camera.lensMm,
    resolution: shot.camera.resolution,
    subject: shot.camera.subject ?? null,
    framing: shot.camera.framing,
    depth: shot.camera.depth,
    safeRegions: shot.camera.safeRegions,
    screenDirection: shot.camera.screenDirection,
    geometry: shot.camera.geometry ?? null,
  };

  const lightingState: Record<string, unknown> = {
    directionVersion: SUBSYSTEM_VERSIONS.lighting,
    recipe: shot.lighting.recipe,
    // The existing string state name, kept so a consumer that only understands
    // `LIGHTING_STATES` still finds what it expects.
    state: shot.lighting.state,
    key: shot.lighting.key,
    fill: shot.lighting.fill,
    rim: shot.lighting.rim,
    practicals: shot.lighting.practicals,
    palette: shot.lighting.palette,
    colorManagement: shot.lighting.colorManagement,
    samplesHint: shot.lighting.samplesHint,
  };

  const vfxState: Record<string, unknown> = {
    directionVersion: SUBSYSTEM_VERSIONS.vfx,
    totalCostWeight: shot.vfx.totalCostWeight,
    instances: shot.vfx.instances.map((instance) => ({
      instanceId: instance.instanceId,
      presetId: instance.presetId,
      presetVersion: instance.presetVersion,
      seed: instance.seed,
      startMs: instance.startMs,
      durationMs: instance.durationMs,
      intensity: instance.intensity,
      particleCount: instance.particleCount,
      anchor: instance.anchor,
      boundsMeters: instance.boundsMeters,
      palette: instance.palette,
      layer: instance.layer,
      // Per-instance key: this is what lets one effect change re-render one shot
      // instead of the episode.
      cacheKey: instance.cacheKey,
    })),
  };

  const expressionStates: Record<string, unknown> = {};
  const visemeData: Record<string, unknown> = {};
  for (const facePlan of [...shot.face].sort((a, b) => a.characterCode.localeCompare(b.characterCode))) {
    const role = roleFor(facePlan.characterCode);
    const { channels, visemeOf } = visemeLookup(facePlan.rig.rigId);
    expressionStates[role] = {
      directionVersion: SUBSYSTEM_VERSIONS.face,
      expression: facePlan.expression,
      weights: facePlan.expressionWeights,
      gaze: facePlan.gaze,
      blinks: facePlan.blinks,
      asymmetry: facePlan.asymmetry,
      restRecovery: facePlan.restRecovery,
      // Which rig authored these channel names, so a renderer bound to a different
      // rig version can refuse rather than drive channels that no longer exist.
      rig: facePlan.rig,
      // Non-viseme cues: brows, blinks, gaze. Visemes travel separately below so
      // that a dialogue change and an expression change invalidate independently.
      cues: facePlan.cues.filter((cue) => !channels.has(cue.channel)),
    };
    const visemes = facePlan.cues.filter((cue) => channels.has(cue.channel));
    if (visemes.length > 0) {
      visemeData[role] = visemes.map((cue) => ({
        viseme: visemeOf.get(cue.channel),
        // The rig's own channel name, alongside the structured viseme, so the
        // Blender layer does not have to reconstruct it from a naming convention.
        channel: cue.channel,
        startMs: cue.startMs,
        endMs: cue.endMs,
        weight: cue.weight,
      }));
    }
  }

  const renderSettings: Record<string, unknown> = {
    directionVersion: SUBSYSTEM_VERSIONS.render,
    tier: shot.render.tier,
    engine: shot.render.engine,
    resolution: shot.render.resolution,
    samples: shot.render.samples,
    adaptiveSampling: shot.render.adaptiveSampling,
    denoise: shot.render.denoise,
    motionBlur: shot.render.motionBlur,
    depthOfField: shot.render.depthOfField,
    passes: shot.render.passes,
    compositing: shot.render.compositing,
    colorGrade: shot.render.colorGrade,
    groomValidation: shot.render.groomValidation,
    atmosphere: shot.render.atmosphere,
    // Never `true` for a prototype asset or a draft tier. A consumer reading this
    // to label output knows from one field whether it may say "master".
    isMasterCandidate: shot.render.isMasterCandidate,
    cloudRenderProfile: shot.render.cloudRenderProfile,
    cacheKey: shot.render.cacheKey,
  };

  const simulationState: Record<string, unknown> = {
    directionVersion: SUBSYSTEM_VERSIONS.simulation,
    groom: shot.simulation.groom,
    secondaryMotion: shot.simulation.secondaryMotion,
    environment: shot.simulation.environment,
    // Caches the render must find already baked. Empty on prototype assets, which
    // is why nothing waits on a bake today.
    requiredCaches: shot.simulation.requiredCaches,
    costWeight: shot.simulation.costWeight,
  };

  return { cameraState, lightingState, vfxState, expressionStates, visemeData, renderSettings, simulationState };
}

/**
 * Asset bindings as `AssetRef`-shaped records for the manifest.
 *
 * `CloudJobManifestSchema` already has `characters: { pip, goat }`,
 * `environments` and `props`, each an `AssetRef` with `assetId`, `version` and
 * `checksum` — and the direction layer has never filled them. Filling them is what
 * makes a mesh version reach the worker, and it needs no schema change.
 *
 * `checksum` requires eight characters, so a binding without a published
 * fingerprint falls back to its own cache key, which is a real content hash of the
 * component versions rather than a placeholder.
 */
export type ManifestAssetRefs = {
  readonly characters: Record<string, Record<string, unknown>>;
  readonly environments: Array<Record<string, unknown>>;
  readonly props: Array<Record<string, unknown>>;
};

export function projectManifestAssetRefs(shot: ShotBlueprint): ManifestAssetRefs {
  const characters: Record<string, Record<string, unknown>> = {};
  const environments: Array<Record<string, unknown>> = [];
  const props: Array<Record<string, unknown>> = [];

  for (const binding of [...shot.assetBindings].sort((a, b) => a.logicalId.localeCompare(b.logicalId))) {
    const ref = {
      assetId: binding.logicalId,
      version: binding.assetVersion,
      checksum: binding.sourceFingerprint ?? binding.cacheKey,
      role:
        binding.kind === 'CHARACTER'
          ? 'character'
          : binding.kind === 'ENVIRONMENT'
            ? 'environment'
            : binding.kind === 'PROP'
              ? 'prop'
              : 'other',
      required: true,
      // Component versions and LOD travel too. Without them the worker knows which
      // asset but not which of its parts, and a groom-only change would look
      // identical to no change at all.
      components: binding.components,
      lod: binding.lod,
      quality: binding.quality,
    };
    if (binding.kind === 'CHARACTER' && binding.characterCode) {
      characters[roleFor(binding.characterCode)] = ref;
    } else if (binding.kind === 'ENVIRONMENT') {
      environments.push(ref);
    } else if (binding.kind === 'PROP') {
      props.push(ref);
    }
  }

  return { characters, environments, props };
}

/** Audio assembly plan for one shot, in the shape the FFmpeg stage consumes. */
export type ShotAudioAssembly = {
  readonly shotId: string;
  readonly mixConfigKey: string;
  readonly mixBusTrimDb: number;
  readonly durationMs: number;
  readonly loudness: ShotBlueprint['audio']['loudness'];
  readonly ducking: ShotBlueprint['audio']['ducking'];
  readonly tracks: ShotBlueprint['audio']['tracks'];
  readonly dialogueTiming: ShotBlueprint['audio']['dialogueTiming'];
  /**
   * Voice artifacts the mix needs. Every one carries a cache key and
   * `requiresPaidProvider: false`; it is the provider layer's job to satisfy them
   * from cache or a local synthesiser, and this tranche never asks for more.
   */
  readonly voiceRequests: ShotBlueprint['audio']['voiceRequests'];
};

export function projectAudioAssembly(shot: ShotBlueprint): ShotAudioAssembly {
  return {
    shotId: shot.shotId,
    mixConfigKey: shot.audio.mixConfigKey,
    mixBusTrimDb: shot.audio.mixBusTrimDb,
    durationMs: shot.audio.durationMs,
    loudness: shot.audio.loudness,
    ducking: shot.audio.ducking,
    tracks: shot.audio.tracks,
    dialogueTiming: shot.audio.dialogueTiming,
    voiceRequests: shot.audio.voiceRequests,
  };
}

/**
 * Everything `production` needs to turn one blueprint shot into a render job,
 * gathered in one place so a caller does not have to know which plan owns what.
 */
export type ShotRenderProjection = {
  readonly shotId: string;
  readonly beatId: string;
  readonly index: number;
  readonly frameRange: ShotBlueprint['frameRange'];
  readonly resolution: string;
  readonly shotMeta: Record<string, unknown>;
  readonly manifestState: ManifestDirectionState;
  readonly assetRefs: ManifestAssetRefs;
  readonly audio: ShotAudioAssembly;
  readonly requiredAssets: readonly string[];
  readonly cacheKey: string;
  readonly cost: ShotBlueprint['cost'];
  /** Technical measurement verdict. Not a statement about how the shot looks. */
  readonly qcStatus: 'PASS' | 'FAIL';
  /** Technical result and artistic approval. What a release decision should read. */
  readonly acceptance: ShotBlueprint['acceptance'];
  /** Render tier and engine, so a caller never has to infer them from resolution. */
  readonly renderTier: ShotBlueprint['render']['tier'];
  readonly renderEngine: ShotBlueprint['render']['engine'];
  readonly cloudRenderProfile: ShotBlueprint['render']['cloudRenderProfile'];
  /** True only for a Cycles FINAL of theatrical assets with comp and grade. */
  readonly isMasterCandidate: boolean;
  /** Roles present in this shot, in the naming the approved .blend files use. */
  readonly roles: readonly string[];
};

export function projectShotForRender(shot: ShotBlueprint): ShotRenderProjection {
  return {
    shotId: shot.shotId,
    beatId: shot.beatId,
    index: shot.index,
    frameRange: shot.frameRange,
    resolution: shot.camera.resolution,
    shotMeta: shot.shotMeta,
    manifestState: projectManifestState(shot),
    assetRefs: projectManifestAssetRefs(shot),
    audio: projectAudioAssembly(shot),
    requiredAssets: shot.requiredAssets,
    cacheKey: shot.cacheKey,
    cost: shot.cost,
    qcStatus: shot.qc.status,
    acceptance: shot.acceptance,
    renderTier: shot.render.tier,
    renderEngine: shot.render.engine,
    cloudRenderProfile: shot.render.cloudRenderProfile,
    isMasterCandidate: shot.render.isMasterCandidate,
    roles: [...shot.acting].map((plan) => roleFor(plan.characterCode)).sort(),
  };
}

/**
 * Project a whole blueprint.
 *
 * Refuses a failing blueprint. A blueprint whose QC failed describes a shot the
 * studio already knows is wrong, and projecting it anyway is how a known-bad plan
 * reaches a GPU — so this fails closed instead, and the caller has to either fix
 * the plan or record an override.
 */
export function projectBlueprintForRender(blueprint: ProductionBlueprint): {
  readonly episodeId: string;
  readonly schemaVersion: string;
  readonly contentHash: string;
  readonly cacheKey: string;
  readonly shots: readonly ShotRenderProjection[];
  readonly qualityContext: ProductionBlueprint['content']['qualityContext'];
  readonly acceptance: ProductionBlueprint['content']['acceptance'];
} {
  if (blueprint.content.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    throw new Error(
      `Blueprint is ${blueprint.content.schemaVersion}; this bridge projects ${BLUEPRINT_SCHEMA_VERSION}. Migrate it with upgradeBlueprint() first.`,
    );
  }
  if (blueprint.content.validation.status !== 'PASS') {
    const codes = blueprint.content.issues
      .filter((issue) => issue.severity === 'ERROR')
      .map((issue) => issue.code)
      .slice(0, 5)
      .join(', ');
    throw new Error(
      `Refusing to project a blueprint that failed validation (${blueprint.content.validation.errorCount} error(s): ${codes}). Fix the plan or record an override.`,
    );
  }
  return {
    episodeId: blueprint.content.episodeId,
    schemaVersion: blueprint.content.schemaVersion,
    contentHash: blueprint.content.contentHash,
    cacheKey: blueprint.content.cacheKey,
    shots: blueprint.content.shots.map((shot) => projectShotForRender(shot)),
    qualityContext: blueprint.content.qualityContext,
    acceptance: blueprint.content.acceptance,
  };
}

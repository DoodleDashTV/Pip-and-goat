/**
 * Step 1 — Director AI.
 *
 * Converts an approved scene plan into a versioned production blueprint by running
 * the other seven systems in dependency order and assembling their output into one
 * document with a decision trace, a validation verdict, and cache keys.
 *
 * Order matters: emotion first, because acting and face both read it; then camera,
 * which needs to know whether anyone travels and how big the emotional peak is;
 * then lighting, which needs the framing to know whether a catchlight is required;
 * then VFX, which needs the framing to size effects; then sound, which needs the
 * effects to score them and the acting to place footsteps.
 *
 * Two things it will not do. It will not plan an unapproved story — an unapproved
 * plan is an error, not a draft. And it will not fall back to generic direction: if
 * a beat cannot be resolved, the blueprint fails closed and says which beat.
 */
import {
  errorsOf,
  issueStatus,
  parseResolution,
  type CharacterCode,
  type Decision,
  type PlanIssue,
} from '../schema/common';
import { deriveSeed, quantize, shortHash, stableHash } from '../determinism';
import { BLUEPRINT_SCHEMA_VERSION, SUBSYSTEM_VERSIONS } from '../versions';
import { CHARACTER_LOCKS, characterLock } from '../locks';
import { defaultRigFor, rigProfile, type RigProfile } from '../rig';
import { findBinding, projectShotBinding, resolveCharacterBinding, type ShotAssetBinding } from '../assets';
import { planRender } from '../quality';
import { planSimulation } from '../simulation';
import { planningAcceptance, deriveOverall, weakestArtisticStatus, type Acceptance } from '../acceptance';
import { THEATRICAL_GOLDEN_SCENE } from '../roadmap';
import { planEmotion, type EmotionPlan } from '../emotion';
import { planActing, type ActingPlan, type MotionMeasurement } from '../acting';
import { planFace } from '../face';
import { planCamera, type CameraPlan, type Composition } from '../camera';
import { planLighting, type LightingPlan } from '../lighting';
import { planVfx } from '../vfx';
import { planSound } from '../sound';
import { computeBlueprintCacheKey, computeShotCacheKey } from '../cache';
import { checkOverrides, readPath, type DirectorOverride } from '../overrides';
import {
  ProductionBlueprintSchema,
  ShotBlueprintSchema,
  type AppliedOverride,
  type ProductionBlueprint,
  type ShotBlueprint,
} from '../schema/blueprint';
import { ScenePlanSchema, type ScenePlan, type StoryBeat, type StoryEmotion } from '../schema/scene-plan';

export type DirectorConfig = {
  /**
   * Cost model for the advisory estimate. Advisory is load-bearing: nothing here
   * authorizes spend, and the paid-launch gate is unchanged and elsewhere.
   */
  readonly costModel?: {
    readonly localMinutesPerFrame: number;
    readonly cloudGpuMinutesPerFrame: number;
    readonly cloudGpuHourlyUsd: number;
  };
  /** Render cache keys already known to exist, so the plan can report hits. */
  readonly knownRenderCacheKeys?: readonly string[];
  /** Voice/audio cache keys already known to exist. */
  readonly knownAudioCacheKeys?: readonly string[];
  /** Per-shot VFX cost budget override. */
  readonly vfxBudgetCostWeight?: number;
  readonly overrides?: readonly DirectorOverride[];
  /** Non-deterministic envelope values. Never hashed. */
  readonly meta?: { generatedAt?: string; generatedBy?: string; studioName?: string };
};

const DEFAULT_COST_MODEL = {
  localMinutesPerFrame: 0.06,
  cloudGpuMinutesPerFrame: 0.011,
  cloudGpuHourlyUsd: 0.34,
} as const;

export type DirectResult = {
  readonly blueprint: ProductionBlueprint;
  /** Convenience mirrors of the blueprint's own verdict. */
  readonly status: 'PASS' | 'FAIL';
  readonly issues: PlanIssue[];
};

export function direct(planInput: unknown, config: DirectorConfig = {}): DirectResult {
  const plan: ScenePlan = ScenePlanSchema.parse(planInput);
  const issues: PlanIssue[] = [];
  const decisionTrace: Decision[] = [];
  const costModel = config.costModel ?? DEFAULT_COST_MODEL;

  // An unapproved story is refused outright. This is the fail-closed boundary
  // between writing and producing.
  if (!plan.storyApproved) {
    issues.push({
      code: 'STORY_NOT_APPROVED',
      severity: 'ERROR',
      system: 'director',
      message: 'Scene plan is not marked storyApproved; the director will not produce direction for an unapproved story.',
    });
  }

  const overrideCheck = checkOverrides(config.overrides ?? []);
  issues.push(...overrideCheck.issues);
  const appliedOverrides: AppliedOverride[] = [...overrideCheck.refused];

  const { width, height } = parseResolution(plan.delivery.resolution);
  const fps = plan.delivery.fps;
  const renderTier = plan.delivery.renderTier;
  const assetQuality = plan.delivery.assetQuality;

  // Episode-level duration validation. A hook that arrives late is a hook nobody
  // saw, and vertical short-form is unforgiving about it.
  issues.push(...validateEpisodeStructure(plan));

  const shots: ShotBlueprint[] = [];
  let previousEmotionByCharacter = new Map<CharacterCode, { primary: StoryEmotion; intensity: number }>();
  let previousStagingByCharacter = new Map<CharacterCode, ActingPlan['staging']>();
  let previousCamera: { composition: Composition; lensMm: number; screenDirection: CameraPlan['screenDirection'] } | undefined;
  let previousLighting: { recipe: string; exposure: number; shotId: string } | undefined;
  let previousShotId: string | undefined;
  let frameCursor = 1;

  plan.beats.forEach((beat, index) => {
    const shotId = `${plan.episodeId}_s${String(index + 1).padStart(3, '0')}`;
    const shotSeed = deriveSeed(plan.seed, shotId);
    const overridesForShot = overrideCheck.accepted.filter((override) => !override.shotId || override.shotId === shotId);

    const durationOverride = overridesForShot.find((override) => override.path === 'durationSeconds');
    const durationSeconds = quantize(
      typeof durationOverride?.value === 'number' ? durationOverride.value : beat.durationSeconds,
      3,
    );
    if (durationOverride) {
      appliedOverrides.push({
        path: 'durationSeconds',
        from: beat.durationSeconds,
        to: durationSeconds,
        by: durationOverride.by,
        reason: durationOverride.reason,
      });
    }

    const characterCodes = [...beat.characters]
      .map((character) => character.characterCode)
      .sort() as CharacterCode[];

    // ---- Step 3: emotion, per character.
    const emotions: EmotionPlan[] = [];
    for (const characterCode of characterCodes) {
      const result = planEmotion({
        beat,
        characterCode,
        rootSeed: plan.seed,
        shotId,
        previous: previousEmotionByCharacter.get(characterCode),
        approvedGatedEmotions: plan.approvedGatedEmotions,
      });
      let emotionPlan = result.plan;
      issues.push(...result.issues);
      decisionTrace.push(...result.decisions);

      const intensityOverride = overridesForShot.find((override) => override.path === 'emotion.intensity');
      if (intensityOverride && typeof intensityOverride.value === 'number') {
        appliedOverrides.push({
          path: `emotion.intensity`,
          from: emotionPlan.intensity,
          to: intensityOverride.value,
          by: intensityOverride.by,
          reason: intensityOverride.reason,
        });
        emotionPlan = { ...emotionPlan, intensity: intensityOverride.value };
      }
      emotions.push(emotionPlan);
    }

    // ---- Step 2: acting, per character. Needs emotion.
    const actingPlans: ActingPlan[] = [];
    const motionMeasurements: MotionMeasurement[] = [];
    for (const characterCode of characterCodes) {
      const emotion = emotions.find((candidate) => candidate.characterCode === characterCode);
      if (!emotion) continue;
      const result = planActing({
        beat,
        characterCode,
        emotion,
        rootSeed: plan.seed,
        shotId,
        fps,
        durationSeconds,
        previousStaging: previousStagingByCharacter.get(characterCode),
        otherPositions: actingPlans.map((existing) => ({
          characterCode: existing.characterCode as CharacterCode,
          x: existing.staging.position.x,
          y: existing.staging.position.y,
        })),
        propPositions: beat.requiredProps.map((prop) => ({ propId: prop, x: 0, y: -2.3 })),
      });
      let actingPlan = result.plan;
      issues.push(...result.issues);
      decisionTrace.push(...result.decisions);
      motionMeasurements.push(...result.measurements);

      const gestureOverride = overridesForShot.find((override) => override.path === 'acting.gesture');
      if (gestureOverride && typeof gestureOverride.value === 'string') {
        const lock = characterLock(characterCode);
        if (!lock.gestureCodes.includes(gestureOverride.value)) {
          appliedOverrides.push({
            path: 'acting.gesture',
            from: actingPlan.gesture,
            to: gestureOverride.value,
            by: gestureOverride.by,
            reason: gestureOverride.reason,
            refusedBecause: `"${gestureOverride.value}" is not in ${lock.name}'s gesture vocabulary`,
          });
          issues.push({
            code: 'OVERRIDE_REFUSED',
            severity: 'ERROR',
            system: 'director',
            shotId,
            characterCode,
            message: `Gesture override "${gestureOverride.value}" refused: not in ${lock.name}'s vocabulary (${lock.gestureCodes.join(', ')}).`,
          });
        } else {
          appliedOverrides.push({
            path: 'acting.gesture',
            from: actingPlan.gesture,
            to: gestureOverride.value,
            by: gestureOverride.by,
            reason: gestureOverride.reason,
          });
          actingPlan = { ...actingPlan, gesture: gestureOverride.value };
        }
      }
      actingPlans.push(actingPlan);
    }

    if (actingPlans.length === 0) {
      issues.push({
        code: 'DIRECTOR_BEAT_UNRESOLVED',
        severity: 'ERROR',
        system: 'director',
        shotId,
        message: `Beat "${beat.beatId}" produced no acting plan; the director will not substitute generic direction.`,
      });
      return;
    }

    const travellingCharacters = actingPlans
      .filter((actingPlan) => actingPlan.locomotion.distanceMeters > 0.4)
      .map((actingPlan) => actingPlan.characterCode)
      .sort();

    // ---- Step 5: camera. Needs emotion and acting.
    const requiredAccessories = characterCodes.flatMap((code) => CHARACTER_LOCKS[code].requiredAccessories);
    const cameraResult = planCamera({
      beat,
      rootSeed: plan.seed,
      shotId,
      resolution: plan.delivery.resolution,
      fps,
      durationSeconds,
      emotions,
      acting: actingPlans,
      previous: previousCamera,
      requireVisibleAccessories: beat.purpose === 'SETUP' ? requiredAccessories : [],
    });
    let cameraPlan = cameraResult.plan;
    issues.push(...cameraResult.issues);
    decisionTrace.push(...cameraResult.decisions);

    for (const path of ['camera.composition', 'camera.move'] as const) {
      const override = overridesForShot.find((candidate) => candidate.path === path);
      if (!override || typeof override.value !== 'string') continue;
      const field = path.split('.')[1] as 'composition' | 'move';
      appliedOverrides.push({
        path,
        from: cameraPlan[field],
        to: override.value,
        by: override.by,
        reason: override.reason,
      });
      cameraPlan = { ...cameraPlan, [field]: override.value } as CameraPlan;
      // An overridden framing is re-validated: a human may choose a different
      // framing, not an invalid one.
      issues.push(
        ...validateOverriddenCamera(cameraPlan, { shotId, width, height }),
      );
    }

    // ---- Step 4: face. Needs emotion and the sound plan's dialogue timing, so a
    // provisional sound pass runs first to get the line timings, then the final
    // sound pass consumes the VFX plan. Splitting it this way is what lets visemes
    // land on the words without the two systems becoming circular.
    const provisionalSound = planSound({
      beat,
      rootSeed: plan.seed,
      shotId,
      durationSeconds,
      emotions,
      vfx: { instances: [], totalCostWeight: 0, budgetCostWeight: 0, totalParticles: 0, selectiveRerenderSupported: true, provenance: { system: 'vfx', version: SUBSYSTEM_VERSIONS.vfx, seed: 0 } },
      travellingCharacters,
      stepsByCharacter: Object.fromEntries(actingPlans.map((actingPlan) => [actingPlan.characterCode, actingPlan.locomotion.steps])),
      knownCacheKeys: config.knownAudioCacheKeys,
    });

    const facePlans = characterCodes.flatMap((characterCode) => {
      const emotion = emotions.find((candidate) => candidate.characterCode === characterCode);
      const actingPlan = actingPlans.find((candidate) => candidate.characterCode === characterCode);
      if (!emotion || !actingPlan) return [];
      const dialogue = provisionalSound.plan.dialogueTiming
        .filter((timing) => timing.characterCode === characterCode)
        .map((timing) => ({
          line: beat.dialogue.find((line) => line.lineId === timing.lineId)!,
          startMs: timing.startMs,
          durationMs: timing.durationMs,
        }))
        .filter((entry) => entry.line !== undefined);
      const result = planFace({
        beat,
        characterCode,
        emotion,
        rootSeed: plan.seed,
        shotId,
        fps,
        durationSeconds,
        dialogue,
        eyeLeadFrames: actingPlan.eyeLeadFrames,
        gazeTarget: emotion.target,
      });
      issues.push(...result.issues);
      decisionTrace.push(...result.decisions);
      return [{ plan: result.plan, measurements: result.measurements }];
    });

    if (facePlans.length === 0) {
      issues.push({
        code: 'DIRECTOR_BEAT_UNRESOLVED',
        severity: 'ERROR',
        system: 'director',
        shotId,
        message: `Beat "${beat.beatId}" produced no facial plan.`,
      });
      return;
    }

    // ---- Step 6: lighting. Needs the framing to know if a catchlight is required.
    const requiresCatchlight = ['CLOSE_UP', 'REACTION', 'MEDIUM'].includes(cameraPlan.composition);
    const lightingResult = planLighting({
      beat,
      rootSeed: plan.seed,
      shotId,
      emotions,
      previous: previousLighting,
      requiresCatchlight,
    });
    let lightingPlan = lightingResult.plan;
    issues.push(...lightingResult.issues);
    decisionTrace.push(...lightingResult.decisions);

    const recipeOverride = overridesForShot.find((override) => override.path === 'lighting.recipe');
    if (recipeOverride && typeof recipeOverride.value === 'string') {
      appliedOverrides.push({
        path: 'lighting.recipe',
        from: lightingPlan.recipe,
        to: recipeOverride.value,
        by: recipeOverride.by,
        reason: recipeOverride.reason,
      });
      lightingPlan = { ...lightingPlan, recipe: recipeOverride.value } as LightingPlan;
    }

    // ---- Step 7: VFX. Needs the framing to size effects.
    const budgetOverride = overridesForShot.find((override) => override.path === 'vfx.budgetCostWeight');
    const vfxResult = planVfx({
      beat,
      rootSeed: plan.seed,
      shotId,
      durationSeconds,
      emotions,
      camera: cameraPlan,
      travellingCharacters,
      budgetCostWeight:
        typeof budgetOverride?.value === 'number' ? budgetOverride.value : config.vfxBudgetCostWeight,
    });
    issues.push(...vfxResult.issues);
    decisionTrace.push(...vfxResult.decisions);
    if (budgetOverride && typeof budgetOverride.value === 'number') {
      appliedOverrides.push({
        path: 'vfx.budgetCostWeight',
        from: config.vfxBudgetCostWeight ?? 6,
        to: budgetOverride.value,
        by: budgetOverride.by,
        reason: budgetOverride.reason,
      });
    }

    // ---- Step 8: sound, final pass with the effects in hand.
    const soundResult = planSound({
      beat,
      rootSeed: plan.seed,
      shotId,
      durationSeconds,
      emotions,
      vfx: vfxResult.plan,
      travellingCharacters,
      stepsByCharacter: Object.fromEntries(actingPlans.map((actingPlan) => [actingPlan.characterCode, actingPlan.locomotion.steps])),
      knownCacheKeys: config.knownAudioCacheKeys,
      isTransitionShot: index < plan.beats.length - 1 && plan.beats[index + 1].locationId !== beat.locationId,
    });
    let audioPlan = soundResult.plan;
    issues.push(...soundResult.issues);
    decisionTrace.push(...soundResult.decisions);

    const loudnessOverride = overridesForShot.find((override) => override.path === 'audio.loudness.targetLufs');
    if (loudnessOverride && typeof loudnessOverride.value === 'number') {
      appliedOverrides.push({
        path: 'audio.loudness.targetLufs',
        from: audioPlan.loudness.targetLufs,
        to: loudnessOverride.value,
        by: loudnessOverride.by,
        reason: loudnessOverride.reason,
      });
      audioPlan = { ...audioPlan, loudness: { ...audioPlan.loudness, targetLufs: loudnessOverride.value } };
    }

    const frameCount = Math.max(1, Math.round(durationSeconds * fps));
    const frameRange = { start: frameCursor, end: frameCursor + frameCount - 1 };
    frameCursor = frameRange.end + 1;

    const shotMeta = projectShotMeta({
      beat,
      camera: cameraPlan,
      lighting: lightingPlan,
      acting: actingPlans,
      emotion: emotions,
      face: facePlans.map((entry) => entry.plan),
      vfx: vfxResult.plan,
      frameRange,
    });

    const requiredAssets = [
      ...characterCodes.map((code) => characterAssetId(code)),
      beat.locationId,
      ...beat.requiredProps,
      ...vfxResult.plan.instances.map((instance) => instance.presetId),
    ].sort();

    // Resolve which *version* of each asset this shot binds. Characters must
    // resolve or the shot fails closed — asking for theatrical Pip before she
    // exists cannot quietly render the prototype. Environments and props degrade to
    // an unbound logical id, which is what they were before bindings existed.
    const assetBindings: ShotAssetBinding[] = [];
    for (const characterCode of characterCodes) {
      try {
        assetBindings.push(projectShotBinding(resolveCharacterBinding(characterCode, assetQuality), renderTier));
      } catch (error) {
        issues.push({
          code: 'ASSET_BINDING_UNRESOLVED',
          severity: 'ERROR',
          system: 'director',
          shotId,
          characterCode,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const logicalId of [beat.locationId, ...beat.requiredProps].sort()) {
      const binding = findBinding(logicalId, assetQuality);
      if (binding) {
        assetBindings.push(projectShotBinding(binding, renderTier));
      } else {
        issues.push({
          code: 'ASSET_BINDING_MISSING',
          severity: 'INFO',
          system: 'director',
          shotId,
          message: `"${logicalId}" has no versioned asset binding, so it cannot be version-pinned or rolled back. It renders from its logical id as before.`,
        });
      }
    }

    const simulationPlan = planSimulation({
      shotId,
      seed: shotSeed,
      version: SUBSYSTEM_VERSIONS.simulation,
      fps,
      frameRange,
      characters: actingPlans.map((actingPlan) => {
        const characterCode = actingPlan.characterCode as CharacterCode;
        const binding = assetBindings.find((candidate) => candidate.characterCode === characterCode);
        const emotion = emotions.find((candidate) => candidate.characterCode === characterCode);
        return {
          characterCode,
          rig: rigForCharacter(characterCode, binding),
          groomVersion: binding?.components.groomVersion,
          energy: emotion?.effects.body.energy ?? 0.5,
          overlap: actingPlan.overlap,
          secondaryMotion: actingPlan.secondaryMotion,
        };
      }),
      // Wind reads off the lighting state: an overcast meadow moves, a still one
      // does not. One source rather than an independent knob that can disagree.
      windUnit: lightingPlan.state === 'OVERCAST' ? 0.35 : 0.15,
      groomValidationRequired: renderTier !== 'DRAFT',
    });

    const renderResult = planRender({
      shotId,
      tier: renderTier,
      assetQuality,
      resolution: plan.delivery.resolution,
      samplesHint: lightingPlan.samplesHint,
      // Depth of field is motivated by the framing, never applied for its own sake:
      // a close-up isolates a face and wants the background soft, a wide shot is
      // showing you where you are and wants it legible.
      depthOfField:
        cameraPlan.composition === 'CLOSE_UP' || cameraPlan.composition === 'REACTION'
          ? {
              motivation: `isolate ${cameraPlan.subject ?? 'the subject'} in a ${cameraPlan.composition} at ${cameraPlan.depth.focusDistanceMeters}m`,
              fStop: 2.8,
            }
          : undefined,
      hasGroom: simulationPlan.groom.some((groom) => groom.mode !== 'NONE'),
      grade: { exposure: lightingPlan.colorManagement.exposure, contrast: 0, saturation: 1 },
    });
    for (const issue of renderResult.issues) {
      issues.push({ code: issue.code, severity: issue.severity, system: 'render', shotId, message: issue.message });
    }

    const draft = {
      shotId,
      index,
      beatId: beat.beatId,
      beatPurpose: beat.purpose,
      purpose: `${beat.purpose}: ${beat.summary}`,
      hookRole: beat.purpose === 'HOOK' ? ('HOOK' as const) : beat.purpose === 'PAYOFF' ? ('PAYOFF' as const) : ('NONE' as const),
      durationSeconds,
      frameRange,
      seed: shotSeed,
      characters: characterCodes.map((characterCode) => {
        const actingPlan = actingPlans.find((candidate) => candidate.characterCode === characterCode)!;
        return {
          characterCode,
          objective: actingPlan.objective,
          blocking: `${actingPlan.staging.screenSide} at (${actingPlan.staging.position.x}, ${actingPlan.staging.position.y}) facing ${actingPlan.staging.facing}`,
          performanceIntent: actingPlan.performanceIntent,
        };
      }),
      emotion: emotions,
      acting: actingPlans,
      face: facePlans.map((entry) => entry.plan),
      camera: cameraPlan,
      lighting: lightingPlan,
      vfx: vfxResult.plan,
      audio: audioPlan,
      simulation: simulationPlan,
      render: renderResult.plan,
      continuity: {
        references: beat.continuityRefs,
        screenDirection: cameraPlan.screenDirection,
        previousShotId,
      },
      requiredAssets,
      assetBindings: [...assetBindings].sort((a, b) => a.logicalId.localeCompare(b.logicalId)),
      shotMeta,
    };

    const cacheKey = computeShotCacheKey(draft);
    const cacheHit = (config.knownRenderCacheKeys ?? []).includes(cacheKey);

    const shot: ShotBlueprint = ShotBlueprintSchema.parse({
      ...draft,
      cost: {
        frameCount,
        estimatedLocalMinutes: quantize(frameCount * costModel.localMinutesPerFrame, 3),
        estimatedCloudGpuMinutes: quantize(frameCount * costModel.cloudGpuMinutesPerFrame, 4),
        estimatedCloudCostUsd: quantize(
          (frameCount * costModel.cloudGpuMinutesPerFrame * costModel.cloudGpuHourlyUsd) / 60,
          5,
        ),
        vfxCostWeight: vfxResult.plan.totalCostWeight,
        cacheHit,
      },
      qc: {
        motion: motionMeasurements,
        facial: facePlans.flatMap((entry) => entry.measurements),
        sound: soundResult.measurements,
        status: 'PASS',
      },
      acceptance: planningAcceptance({ technical: 'PASS', technicalChecks: [{ item: 'SCHEMA_VALIDATION', status: 'PASS' }] }),
      cacheKey,
    });

    // The QC verdict is derived from the measurements, not asserted.
    const qcStatus =
      [...shot.qc.motion, ...shot.qc.facial, ...shot.qc.sound].some((measurement) => measurement.status === 'FAIL')
        ? 'FAIL'
        : 'PASS';

    // Technical status is this shot's own measurements plus any error raised
    // against it. Artistic status is `NOT_RENDERED` and there is no argument that
    // could make it anything else here: nothing has been rendered, so nothing has
    // been seen.
    const shotErrors = errorsOf(issues.filter((issue) => issue.shotId === shotId));
    const technical = qcStatus === 'FAIL' || shotErrors.length > 0 ? 'FAIL' : 'PASS';
    const acceptance = planningAcceptance({
      technical,
      technicalChecks: shotTechnicalChecks({
        motion: shot.qc.motion,
        facial: shot.qc.facial,
        sound: shot.qc.sound,
        lockIssueCount: shotErrors.filter((issue) => issue.code.includes('LOCK')).length,
        boundRigs: [...new Set(facePlans.map((entry) => `${entry.plan.rig.rigId}@${entry.plan.rig.rigVersion}`))].sort(),
        bindingCount: assetBindings.length,
        technical,
      }),
      goldenReferenceId: THEATRICAL_GOLDEN_SCENE.status === 'ACCEPTED' ? THEATRICAL_GOLDEN_SCENE.id : undefined,
    });

    shots.push({ ...shot, qc: { ...shot.qc, status: qcStatus }, acceptance });

    previousEmotionByCharacter = new Map(
      emotions.map((emotion) => [emotion.characterCode as CharacterCode, { primary: emotion.primary as StoryEmotion, intensity: emotion.intensity }]),
    );
    previousStagingByCharacter = new Map(
      actingPlans.map((actingPlan) => [actingPlan.characterCode as CharacterCode, actingPlan.staging]),
    );
    previousCamera = {
      composition: cameraPlan.composition,
      lensMm: cameraPlan.lensMm,
      screenDirection: cameraPlan.screenDirection,
    };
    previousLighting = { recipe: lightingPlan.recipe, exposure: lightingPlan.colorManagement.exposure, shotId };
    previousShotId = shotId;
  });

  if (shots.length === 0) {
    issues.push({
      code: 'DIRECTOR_NO_SHOTS',
      severity: 'ERROR',
      system: 'director',
      message: 'No shot could be planned from this scene plan.',
    });
  }

  const totalFrames = shots.reduce((sum, shot) => sum + shot.cost.frameCount, 0);
  const totalDuration = quantize(
    shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
    3,
  );
  const cacheHits = shots.filter((shot) => shot.cost.cacheHit).length;

  const shotCacheKeys = shots.map((shot) => shot.cacheKey);
  const cacheKey = computeBlueprintCacheKey({
    episodeId: plan.episodeId,
    delivery: plan.delivery,
    shotCacheKeys,
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
  });

  const sortedIssues = [...issues].sort(
    (a, b) =>
      (a.shotId ?? '').localeCompare(b.shotId ?? '') ||
      a.system.localeCompare(b.system) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );

  const contentWithoutHash = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    episodeId: plan.episodeId,
    episodeTitle: plan.episodeTitle,
    seed: plan.seed,
    delivery: plan.delivery,
    systemVersions: { ...SUBSYSTEM_VERSIONS },
    shots,
    totals: {
      shotCount: Math.max(1, shots.length),
      durationSeconds: Math.max(0.001, totalDuration),
      frameCount: Math.max(1, totalFrames),
      estimatedCloudCostUsd: quantize(
        shots.reduce((sum, shot) => sum + shot.cost.estimatedCloudCostUsd, 0),
        5,
      ),
      estimatedLocalMinutes: quantize(
        shots.reduce((sum, shot) => sum + shot.cost.estimatedLocalMinutes, 0),
        3,
      ),
      cacheHitFraction: shots.length > 0 ? quantize(cacheHits / shots.length, 4) : 0,
    },
    decisionTrace: decisionTrace.sort(
      (a, b) =>
        (a.shotId ?? '').localeCompare(b.shotId ?? '') ||
        a.system.localeCompare(b.system) ||
        a.decision.localeCompare(b.decision) ||
        (a.characterCode ?? '').localeCompare(b.characterCode ?? ''),
    ),
    issues: sortedIssues,
    overrides: appliedOverrides.sort((a, b) => a.path.localeCompare(b.path)),
    validation: {
      status: issueStatus(sortedIssues),
      errorCount: errorsOf(sortedIssues).length,
      warningCount: sortedIssues.filter((issue) => issue.severity === 'WARNING').length,
    },
    acceptance: episodeAcceptance(shots, issueStatus(sortedIssues)),
    qualityContext: {
      assetQuality,
      renderTier,
      // Every shot must be a master candidate for the episode to be one. One
      // DRAFT shot in a FINAL episode means the episode is not a master, and
      // reporting otherwise is how a mixed-tier cut gets called finished.
      isMasterCandidate: shots.length > 0 && shots.every((shot) => shot.render.isMasterCandidate),
      goldenReferenceId: THEATRICAL_GOLDEN_SCENE.status === 'ACCEPTED' ? THEATRICAL_GOLDEN_SCENE.id : undefined,
    },
    cacheKey,
  };

  const blueprint: ProductionBlueprint = ProductionBlueprintSchema.parse({
    content: { ...contentWithoutHash, contentHash: stableHash(contentWithoutHash) },
    meta: {
      generatedAt: config.meta?.generatedAt,
      generatedBy: config.meta?.generatedBy,
      studioName: config.meta?.studioName,
      storedSchemaVersion: BLUEPRINT_SCHEMA_VERSION,
    },
  });

  return { blueprint, status: blueprint.content.validation.status, issues: sortedIssues };
}

/** Logical asset id for a character's approved production blend. */
export function characterAssetId(characterCode: CharacterCode): string {
  return characterCode === 'CHAR_PIP_001' ? 'pip' : 'goat';
}

/**
 * Episode acceptance, aggregated from its shots.
 *
 * The weakest shot governs both axes. An episode whose shots are technically fine
 * except one is not technically fine, and an episode with one unreviewed shot is
 * not approved — there is no useful sense in which a cut is finished while part of
 * it is unexamined.
 */
function episodeAcceptance(shots: readonly ShotBlueprint[], validation: 'PASS' | 'FAIL'): Acceptance {
  const technical =
    validation === 'FAIL' || shots.some((shot) => shot.acceptance.technical === 'FAIL') ? 'FAIL' : 'PASS';
  const artistic = weakestArtisticStatus(shots.flatMap((shot) => shot.acceptance.artisticReviews));
  const base = planningAcceptance({
    technical,
    technicalChecks: [
      { item: 'SCHEMA_VALIDATION', status: 'PASS' },
      {
        item: 'AUTOMATED_TESTS',
        status: 'NOT_RUN',
        detail: 'reported by the test suite, not by planning',
      },
      {
        item: 'ASSET_FINGERPRINTS',
        status: shots.every((shot) => shot.assetBindings.length > 0) ? 'PASS' : 'NOT_RUN',
        detail: `${shots.filter((shot) => shot.assetBindings.length > 0).length}/${shots.length} shot(s) version-pinned`,
      },
    ],
    goldenReferenceId: THEATRICAL_GOLDEN_SCENE.status === 'ACCEPTED' ? THEATRICAL_GOLDEN_SCENE.id : undefined,
  });
  return { ...base, artistic, overall: deriveOverall(technical, artistic) };
}

/**
 * The rig a shot plans against.
 *
 * Taken from the asset binding when there is one, because the binding is what
 * pins a rig version, and falling back to the character's default only when
 * nothing is bound. A binding that names a rig the registry does not have is a
 * hard error rather than a silent fallback: planning against a different rig than
 * the one that will render is how a face ends up not moving.
 */
function rigForCharacter(characterCode: CharacterCode, binding: ShotAssetBinding | undefined): RigProfile {
  const rigId = binding?.components.rigId;
  return rigId ? rigProfile(rigId) : defaultRigFor(characterCode);
}

/**
 * The technical checks this package actually performed, per shot.
 *
 * Enumerated from what ran rather than asserted, so a check that produced no
 * measurements is reported `NOT_APPLICABLE` instead of counting as coverage.
 */
function shotTechnicalChecks(input: {
  readonly motion: readonly unknown[];
  readonly facial: readonly unknown[];
  readonly sound: readonly unknown[];
  readonly lockIssueCount: number;
  readonly boundRigs: readonly string[];
  readonly bindingCount: number;
  readonly technical: 'PASS' | 'FAIL';
}): Acceptance['technicalChecks'] {
  const measured = (items: readonly unknown[]): Acceptance['technicalChecks'][number]['status'] =>
    items.length === 0 ? 'NOT_APPLICABLE' : input.technical === 'FAIL' ? 'FAIL' : 'PASS';
  return [
    { item: 'SCHEMA_VALIDATION', status: 'PASS' },
    { item: 'MOTION_MEASUREMENTS', status: measured(input.motion), detail: `${input.motion.length} measurement(s)` },
    { item: 'FACIAL_MEASUREMENTS', status: measured(input.facial), detail: `${input.facial.length} measurement(s)` },
    { item: 'SOUND_MEASUREMENTS', status: measured(input.sound), detail: `${input.sound.length} measurement(s)` },
    {
      item: 'CHARACTER_LOCK',
      status: input.lockIssueCount === 0 ? 'PASS' : 'FAIL',
      detail: `${input.lockIssueCount} lock violation(s)`,
    },
    {
      item: 'RIG_INTEGRITY',
      status: input.boundRigs.length === 0 ? 'NOT_APPLICABLE' : 'PASS',
      detail: input.boundRigs.length === 0 ? 'no rig bound' : `planned against ${input.boundRigs.join(', ')}`,
    },
    {
      item: 'ASSET_FINGERPRINTS',
      status: input.bindingCount === 0 ? 'NOT_RUN' : 'PASS',
      detail:
        input.bindingCount === 0
          ? 'no versioned asset binding on this shot; fingerprints are verified by the regression suite instead'
          : `${input.bindingCount} binding(s) pinned`,
    },
    // Deliberately NOT_RUN rather than PASS. These are measured on rendered pixels
    // by the Blender gates, and this package only predicts them.
    { item: 'LIGHTING_THRESHOLDS', status: 'NOT_RUN', detail: 'measured on rendered frames by scripts/assets gates' },
    { item: 'VFX_BUDGET', status: 'PASS' },
    { item: 'AUTOMATED_TESTS', status: 'NOT_RUN', detail: 'reported by the test suite, not by planning' },
  ];
}

/**
 * Episode-level structural validation.
 *
 * These are the constraints that make a vertical short work at all: it opens on a
 * hook, it pays that hook off, and it fits the duration it was commissioned for.
 */
function validateEpisodeStructure(plan: ScenePlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const totalDuration = plan.beats.reduce((sum, beat) => sum + beat.durationSeconds, 0);
  const target = plan.delivery.targetDurationSeconds;

  // 12% tolerance: tight enough that a 30s slot does not become 40s, loose enough
  // that beat timing is not a straitjacket.
  const drift = Math.abs(totalDuration - target) / target;
  if (drift > 0.12) {
    issues.push({
      code: 'DIRECTOR_DURATION_MISMATCH',
      severity: 'ERROR',
      system: 'director',
      message: `Beats total ${quantize(totalDuration, 2)}s against a ${target}s target (${quantize(drift * 100, 1)}% drift, tolerance 12%).`,
      measured: { total: quantize(totalDuration, 2), target, driftPercent: quantize(drift * 100, 1) },
    });
  }

  const hookIndex = plan.beats.findIndex((beat) => beat.purpose === 'HOOK');
  if (hookIndex < 0) {
    issues.push({
      code: 'DIRECTOR_NO_HOOK',
      severity: 'ERROR',
      system: 'director',
      message: 'No HOOK beat; vertical short-form loses the audience without one in the first seconds.',
    });
  } else {
    const secondsBeforeHook = plan.beats.slice(0, hookIndex).reduce((sum, beat) => sum + beat.durationSeconds, 0);
    if (secondsBeforeHook > 3) {
      issues.push({
        code: 'DIRECTOR_LATE_HOOK',
        severity: 'WARNING',
        system: 'director',
        message: `The hook arrives at ${quantize(secondsBeforeHook, 2)}s; after 3s most vertical viewers have gone.`,
        measured: { at: quantize(secondsBeforeHook, 2), tolerance: 3 },
      });
    }
  }

  if (!plan.beats.some((beat) => beat.purpose === 'PAYOFF' || beat.purpose === 'RESOLUTION')) {
    issues.push({
      code: 'DIRECTOR_NO_PAYOFF',
      severity: 'ERROR',
      system: 'director',
      message: 'No PAYOFF or RESOLUTION beat; the hook is never paid off.',
    });
  }

  if (plan.delivery.aspect !== '9:16') {
    issues.push({
      code: 'DIRECTOR_NOT_VERTICAL',
      severity: 'ERROR',
      system: 'director',
      message: `Delivery aspect is ${plan.delivery.aspect}; this studio delivers 9:16.`,
    });
  }

  const seen = new Set<string>();
  for (const beat of plan.beats) {
    if (seen.has(beat.beatId)) {
      issues.push({
        code: 'DIRECTOR_DUPLICATE_BEAT_ID',
        severity: 'ERROR',
        system: 'director',
        message: `Duplicate beat id "${beat.beatId}".`,
      });
    }
    seen.add(beat.beatId);
  }
  for (const beat of plan.beats) {
    for (const reference of beat.continuityRefs) {
      if (!seen.has(reference) && !plan.beats.some((candidate) => candidate.beatId === reference)) {
        issues.push({
          code: 'DIRECTOR_DANGLING_CONTINUITY_REF',
          severity: 'WARNING',
          system: 'director',
          message: `Beat "${beat.beatId}" references "${reference}", which is not in this plan.`,
        });
      }
    }
  }
  return issues;
}

function validateOverriddenCamera(
  camera: CameraPlan,
  context: { shotId: string; width: number; height: number },
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (context.height <= context.width) {
    issues.push({
      code: 'CAMERA_NOT_VERTICAL',
      severity: 'ERROR',
      system: 'camera',
      shotId: context.shotId,
      message: `Delivery ${context.width}x${context.height} is not vertical.`,
    });
  }
  if (camera.move !== 'STATIC' && camera.durationSeconds < 1.0) {
    issues.push({
      code: 'CAMERA_MOVE_TOO_SHORT',
      severity: 'WARNING',
      system: 'camera',
      shotId: context.shotId,
      message: `An overridden ${camera.move} in ${camera.durationSeconds}s will not read.`,
    });
  }
  return issues;
}

/**
 * Project a shot blueprint into the `shot_meta` JSON that
 * `scripts/blender/assemble_scene.py` already consumes.
 *
 * Every key here is either one Blender reads today (`placements`, `actions`,
 * `lipSync`, `lightingState`, `cameraPreset`, `endFrame`) or a new key under
 * `direction` that the Python side only reads when present. Absent the new keys,
 * the projection is byte-identical in shape to what the accepted acceptance render
 * used — which is the regression this is written to protect.
 */
export function projectShotMeta(input: {
  beat: StoryBeat;
  camera: CameraPlan;
  lighting: LightingPlan;
  acting: readonly ActingPlan[];
  emotion?: readonly EmotionPlan[];
  face: ReadonlyArray<{
    characterCode: string;
    cues: ReadonlyArray<{ channel: string; startMs: number; endMs: number; weight: number; source?: string }>;
    expression?: string;
    expressionWeights?: Record<string, number>;
    gaze?: ReadonlyArray<{ startMs: number; endMs: number; target: string; eyeLeadMs: number; headFollow: number }>;
    blinks?: ReadonlyArray<{ atMs: number; durationMs: number }>;
    restRecovery?: { channel: string; atMs: number; weight: number };
    rig?: { rigId: string; rigVersion: string; controlScheme: string };
  }>;
  vfx: { instances: ReadonlyArray<{ instanceId: string; presetId: string; presetVersion: string; seed: number; startMs: number; durationMs: number; intensity: number; particleCount: number; anchor: { kind: string; ref: string }; boundsMeters: { x: number; y: number; z: number }; palette: readonly string[]; layer: string }> };
  frameRange: { start: number; end: number };
}): Record<string, unknown> {
  const placements: Record<string, unknown> = {};
  for (const actingPlan of [...input.acting].sort((a, b) => a.characterCode.localeCompare(b.characterCode))) {
    const role = characterAssetId(actingPlan.characterCode as CharacterCode);
    placements[role] = {
      location: [actingPlan.staging.position.x, actingPlan.staging.position.y, 0],
      rotation: [0, 0, actingPlan.staging.rotationZ],
      action: actingPlan.baseAction,
    };
  }

  const lipSync: Record<string, unknown> = {};
  for (const facePlan of [...input.face].sort((a, b) => a.characterCode.localeCompare(b.characterCode))) {
    const role = characterAssetId(facePlan.characterCode as CharacterCode);
    const cues = facePlan.cues
      .filter((cue) => cue.channel.startsWith('viseme_'))
      .map((cue) => ({
        viseme: cue.channel.replace('viseme_', ''),
        startMs: cue.startMs,
        endMs: cue.endMs,
        weight: cue.weight,
      }));
    if (cues.length > 0) lipSync[role] = cues;
  }

  const meta: Record<string, unknown> = {
    title: input.beat.summary,
    cameraPreset: input.camera.preset,
    lightingState: input.lighting.state,
    placements,
    endFrame: input.frameRange.end - input.frameRange.start + 1,
  };
  if (Object.keys(lipSync).length > 0) meta.lipSync = lipSync;

  // New, opt-in extension block. The Python side reads it only when present, so a
  // renderer that has not been updated still produces today's output exactly.
  meta.direction = {
    version: SUBSYSTEM_VERSIONS.director,
    camera: {
      composition: input.camera.composition,
      move: input.camera.move,
      lensMm: input.camera.lensMm,
      geometry: input.camera.geometry,
      focusDistanceMeters: input.camera.depth.focusDistanceMeters,
      endFocusDistanceMeters: input.camera.depth.endFocusDistanceMeters,
    },
    lighting: {
      recipe: input.lighting.recipe,
      exposure: input.lighting.colorManagement.exposure,
      viewTransform: input.lighting.colorManagement.viewTransform,
      look: input.lighting.colorManagement.look,
      practicals: input.lighting.practicals,
    },
    facial: Object.fromEntries(
      [...input.face]
        .sort((a, b) => a.characterCode.localeCompare(b.characterCode))
        .map((facePlan) => [
          characterAssetId(facePlan.characterCode as CharacterCode),
          facePlan.cues.filter((cue) => !cue.channel.startsWith('viseme_')),
        ]),
    ),
    // Richer face/acting/emotion payloads for Milestone 3 Blender consumers.
    // Kept beside the original `facial` cue map so older readers stay valid.
    face: Object.fromEntries(
      [...input.face]
        .sort((a, b) => a.characterCode.localeCompare(b.characterCode))
        .map((facePlan) => [
          characterAssetId(facePlan.characterCode as CharacterCode),
          {
            cues: facePlan.cues.filter((cue) => !cue.channel.startsWith('viseme_')),
            expression: facePlan.expression ?? null,
            expressionWeights: facePlan.expressionWeights ?? {},
            gaze: facePlan.gaze ?? [],
            blinks: facePlan.blinks ?? [],
            restRecovery: facePlan.restRecovery ?? null,
            rig: facePlan.rig ?? null,
          },
        ]),
    ),
    acting: Object.fromEntries(
      [...input.acting]
        .sort((a, b) => a.characterCode.localeCompare(b.characterCode))
        .map((actingPlan) => [
          characterAssetId(actingPlan.characterCode as CharacterCode),
          {
            baseAction: actingPlan.baseAction,
            gesture: actingPlan.gesture,
            keys: actingPlan.keys,
            eyeLeadFrames: actingPlan.eyeLeadFrames,
            headLeadFrames: actingPlan.headLeadFrames,
            overlap: actingPlan.overlap,
            secondaryMotion: actingPlan.secondaryMotion,
            weightShift: actingPlan.weightShift,
            locomotion: actingPlan.locomotion,
            staging: actingPlan.staging,
          },
        ]),
    ),
    emotion: Object.fromEntries(
      [...(input.emotion ?? [])]
        .sort((a, b) => a.characterCode.localeCompare(b.characterCode))
        .map((emotionPlan) => [
          characterAssetId(emotionPlan.characterCode as CharacterCode),
          {
            primary: emotionPlan.primary,
            intensity: emotionPlan.intensity,
            valence: emotionPlan.valence,
            transitionInSeconds: emotionPlan.transitionInSeconds,
            settleSeconds: emotionPlan.settleSeconds,
            effects: emotionPlan.effects,
          },
        ]),
    ),
    vfx: input.vfx.instances.map((instance) => ({
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
      palette: [...instance.palette],
      layer: instance.layer,
    })),
    shotHash: shortHash({
      camera: input.camera,
      lighting: input.lighting,
      acting: input.acting,
      vfx: input.vfx,
    }, 16),
  };

  return meta;
}

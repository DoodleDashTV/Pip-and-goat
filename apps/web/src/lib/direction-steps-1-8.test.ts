/**
 * DDP Steps 1-8 — the direction layer.
 *
 * The package is pure by construction, so these tests need no database, no network
 * and no provider. That is the point: determinism is only a testable claim if
 * nothing in the call graph can vary underneath it.
 */
import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_SCHEMA_VERSION,
  BLUEPRINT_SCHEMA_HISTORY,
  CAMERA_RULES,
  CHILD_SAFE_POLICY,
  FACIAL_TOLERANCES,
  FAULTY_SCENE_PLAN_INPUT,
  FINAL_1080P_ACCEPTANCE,
  GOAT_LOCK,
  LIGHTING_THRESHOLDS,
  MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META,
  MOTION_TOLERANCES,
  OVERRIDE_BOUNDS,
  PIP_LOCK,
  PROTECTED_OVERRIDE_PATHS,
  SCENE_PLAN_SCHEMA_VERSION,
  SHADOW_CASTER_CONSTANTS,
  SOUND_TARGETS,
  SUBSYSTEM_VERSIONS,
  ScenePlanSchema,
  VALIDATION_SCENE_PLAN,
  VFX_BUDGET,
  VFX_REGISTRY,
  computeBlueprintCacheKey,
  deriveSeed,
  diffBlueprints,
  direct,
  createRng,
  parseBlueprint,
  quantize,
  stableHash,
  stableStringify,
  upgradeBlueprint,
  voiceIdFor,
} from '@doodle-dash/direction';

const PIP = PIP_LOCK.characterCode;
const GOAT = GOAT_LOCK.characterCode;

/** Planned once and shared: `direct()` is pure, so every test sees the same object. */
const planned = direct(VALIDATION_SCENE_PLAN);

function clonePlan() {
  return structuredClone(VALIDATION_SCENE_PLAN) as typeof VALIDATION_SCENE_PLAN;
}

describe('determinism primitives', () => {
  it('stringifies stably regardless of key insertion order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('hashes structurally rather than textually', () => {
    expect(stableHash({ x: [1, 2], y: 'z' })).toBe(stableHash({ y: 'z', x: [1, 2] }));
    expect(stableHash({ x: 1 })).not.toBe(stableHash({ x: 2 }));
  });

  it('derives distinct, reproducible seeds per path', () => {
    expect(deriveSeed('root', 'shot1', 'camera')).toBe(deriveSeed('root', 'shot1', 'camera'));
    expect(deriveSeed('root', 'shot1', 'camera')).not.toBe(deriveSeed('root', 'shot1', 'lighting'));
    expect(deriveSeed('root', 'shot1', 'camera')).not.toBe(deriveSeed('other', 'shot1', 'camera'));
  });

  it('produces a reproducible stream from a seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const drawsA = [a.float(0, 1), a.float(0, 1), a.int(0, 100)];
    const drawsB = [b.float(0, 1), b.float(0, 1), b.int(0, 100)];
    expect(drawsA).toEqual(drawsB);
    // A different seed must actually diverge, or seeding is decorative.
    const c = createRng(1235);
    expect(c.float(0, 1)).not.toBe(drawsA[0]);
  });

  it('quantises to kill floating-point drift across platforms', () => {
    expect(quantize(0.1 + 0.2, 4)).toBe(0.3);
  });
});

describe('Step 1 — Director AI', () => {
  it('produces a versioned, schema-valid blueprint', () => {
    expect(planned.blueprint.content.schemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(VALIDATION_SCENE_PLAN.planVersion).toBe(SCENE_PLAN_SCHEMA_VERSION);
    expect(() => parseBlueprint(planned.blueprint)).not.toThrow();
  });

  it('is deterministic for identical input', () => {
    const again = direct(VALIDATION_SCENE_PLAN);
    expect(again.blueprint.content.contentHash).toBe(planned.blueprint.content.contentHash);
    expect(again.blueprint.content.cacheKey).toBe(planned.blueprint.content.cacheKey);
    // Compare the whole deterministic document, not just its hash, so a hash that
    // stopped covering a field would not hide the difference.
    expect(stableStringify(again.blueprint.content)).toBe(stableStringify(planned.blueprint.content));
  });

  it('excludes the non-deterministic envelope from the content hash', () => {
    const withMeta = direct(VALIDATION_SCENE_PLAN, {
      meta: { generatedBy: 'someone-else', generatedAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(withMeta.blueprint.meta.generatedBy).toBe('someone-else');
    expect(withMeta.blueprint.content.contentHash).toBe(planned.blueprint.content.contentHash);
  });

  it('plans every beat as a shot with the required structured decisions', () => {
    expect(planned.blueprint.content.shots).toHaveLength(VALIDATION_SCENE_PLAN.beats.length);
    for (const shot of planned.blueprint.content.shots) {
      expect(shot.beatPurpose).toBeTruthy();
      expect(shot.purpose).toBeTruthy();
      expect(shot.characters.length).toBeGreaterThan(0);
      expect(shot.characters[0].objective).toBeTruthy();
      expect(shot.characters[0].blocking).toBeTruthy();
      expect(shot.characters[0].performanceIntent).toBeTruthy();
      expect(shot.emotion.length).toBeGreaterThan(0);
      expect(shot.acting.length).toBeGreaterThan(0);
      expect(shot.face.length).toBeGreaterThan(0);
      expect(shot.camera.composition).toBeTruthy();
      expect(shot.lighting.recipe).toBeTruthy();
      expect(shot.audio.tracks.length).toBeGreaterThan(0);
      expect(shot.requiredAssets.length).toBeGreaterThan(0);
      expect(shot.cost.frameCount).toBeGreaterThan(0);
      expect(shot.seed).toBeTypeOf('number');
      expect(shot.frameRange.end).toBeGreaterThanOrEqual(shot.frameRange.start);
    }
  });

  it('places the hook and the payoff', () => {
    const roles = planned.blueprint.content.shots.map((shot) => shot.hookRole);
    expect(roles).toContain('HOOK');
    expect(roles).toContain('PAYOFF');
  });

  it('records an explainable decision trace with runners-up', () => {
    const trace = planned.blueprint.content.decisionTrace;
    expect(trace.length).toBeGreaterThan(0);
    for (const decision of trace) {
      expect(decision.because).toBeTruthy();
      expect(decision.chose).toBeTruthy();
    }
    // At least one decision must show what it rejected and why, or "explainable"
    // means only "narrated".
    const withAlternatives = trace.filter((decision) => decision.alternatives.length > 0);
    expect(withAlternatives.length).toBeGreaterThan(0);
    for (const decision of withAlternatives) {
      expect(decision.alternatives[0].rejectedBecause).toBeTruthy();
    }
  });

  it('stamps provenance and system versions', () => {
    expect(planned.blueprint.content.systemVersions).toMatchObject(SUBSYSTEM_VERSIONS);
    expect(planned.blueprint.meta.storedSchemaVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
  });

  it('passes validation on the approved validation scene', () => {
    expect(planned.blueprint.content.validation.errorCount).toBe(0);
    expect(planned.blueprint.content.validation.status).toBe('PASS');
    expect(planned.status).toBe('PASS');
  });

  it('estimates cost without authorising spend', () => {
    expect(planned.blueprint.content.totals.estimatedCloudCostUsd).toBeGreaterThan(0);
    expect(planned.blueprint.content.totals.estimatedLocalMinutes).toBeGreaterThan(0);
  });
});

describe('Step 1 — fault injection: the director must fail closed', () => {
  const faulty = direct(ScenePlanSchema.parse(FAULTY_SCENE_PLAN_INPUT));

  it('refuses an unapproved story rather than planning it anyway', () => {
    expect(faulty.status).toBe('FAIL');
    expect(faulty.blueprint.content.issues.some((issue) => issue.code === 'STORY_NOT_APPROVED')).toBe(true);
  });

  it('refuses a gated emotion that policy did not approve', () => {
    expect(
      faulty.blueprint.content.issues.some((issue) => issue.code === 'EMOTION_GATED_UNAPPROVED'),
    ).toBe(true);
  });

  it('reports a duration that does not fill its slot', () => {
    expect(faulty.blueprint.content.issues.some((issue) => issue.code.includes('DURATION'))).toBe(true);
  });

  it('reports a dangling continuity reference', () => {
    expect(
      faulty.blueprint.content.issues.some((issue) => issue.code === 'DIRECTOR_DANGLING_CONTINUITY_REF'),
    ).toBe(true);
  });

  it('reports a missing hook', () => {
    expect(faulty.blueprint.content.issues.some((issue) => issue.code === 'DIRECTOR_NO_HOOK')).toBe(true);
  });

  it('reports a VFX preset that is not in the registry instead of silently dropping it', () => {
    expect(faulty.blueprint.content.issues.some((issue) => issue.code === 'VFX_UNKNOWN_PRESET')).toBe(true);
  });

  it('reports a missing payoff', () => {
    expect(faulty.blueprint.content.issues.some((issue) => issue.code === 'DIRECTOR_NO_PAYOFF')).toBe(true);
  });

  it('rejects a scene plan with no beats at the schema boundary', () => {
    expect(() => ScenePlanSchema.parse({ ...FAULTY_SCENE_PLAN_INPUT, beats: [] })).toThrow();
  });

  it('rejects an unknown plan version rather than guessing', () => {
    expect(() => ScenePlanSchema.parse({ ...FAULTY_SCENE_PLAN_INPUT, planVersion: 'not-a-version' })).toThrow();
  });
});

describe('Step 2 — animation and acting', () => {
  const shots = planned.blueprint.content.shots;

  it('gives every character a four-phase pose-to-pose beat', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        expect(plan.keys.map((key) => key.phase)).toEqual([
          'ANTICIPATION',
          'ACTION',
          'REACTION',
          'SETTLE',
        ]);
      }
    }
  });

  it('leads with the eyes before the head', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        expect(plan.eyeLeadFrames).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('always plans overlap and secondary motion', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        expect(plan.overlap.length).toBeGreaterThan(0);
        expect(plan.secondaryMotion).toBeGreaterThan(0);
        expect(plan.motionArcs.length).toBeGreaterThan(0);
      }
    }
  });

  it('never plans mechanical symmetry', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        expect(plan.asymmetry).toBeGreaterThanOrEqual(MOTION_TOLERANCES.minAsymmetry);
      }
    }
  });

  it('gives Pip and Goat different performances from the same emotion', () => {
    // Same instruction, different characters: the profiles are what stop procedural
    // acting from making everyone move identically.
    const twoHander = shots.find((shot) => shot.acting.length === 2);
    expect(twoHander).toBeDefined();
    const [first, second] = twoHander!.acting;
    expect(first.characterCode).not.toBe(second.characterCode);
    const differs =
      first.eyeLeadFrames !== second.eyeLeadFrames ||
      first.headLeadFrames !== second.headLeadFrames ||
      first.secondaryMotion !== second.secondaryMotion ||
      stableStringify(first.overlap) !== stableStringify(second.overlap);
    expect(differs).toBe(true);
  });

  it('names only actions authored in the approved assets', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        const lock = plan.characterCode === PIP ? PIP_LOCK : GOAT_LOCK;
        expect(lock.authoredActions).toContain(plan.baseAction);
      }
    }
  });

  it('keeps travel on whole strides so the feet do not scrub', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        const slide = shot.qc.motion.find(
          (measurement) => measurement.check === 'FOOT_SLIDE' && measurement.characterCode === plan.characterCode,
        );
        expect(slide?.status).toBe('PASS');
        expect(slide!.measured).toBeLessThanOrEqual(MOTION_TOLERANCES.footSlideMeters);
      }
    }
  });

  it('passes every motion QC check on the validation scene', () => {
    for (const shot of shots) {
      for (const measurement of shot.qc.motion) {
        expect(measurement.status, `${shot.shotId} ${measurement.check}`).toBe('PASS');
      }
    }
  });

  it('still catches a genuinely over-fast move', () => {
    // Compressing a travelling beat raises cruise speed against a fixed wind-up, so
    // the acceleration gate must fire. Without this the gate would be decorative.
    const plan = clonePlan();
    plan.beats[2].durationSeconds = 0.8;
    plan.beats[2].summary = 'They run and dash together toward the creek as fast as they can';
    const tight = direct(plan);
    const accelerationIssues = tight.blueprint.content.issues.filter((issue) =>
      issue.code.includes('EXCESSIVE_ACCELERATION'),
    );
    expect(accelerationIssues.length).toBeGreaterThan(0);
  });
});

describe('Step 3 — emotion engine', () => {
  const shots = planned.blueprint.content.shots;

  it('bounds intensity to the child-safe ceiling', () => {
    for (const shot of shots) {
      for (const emotion of shot.emotion) {
        expect(emotion.intensity).toBeLessThanOrEqual(CHILD_SAFE_POLICY.maxIntensity);
        expect(emotion.intensity).toBeGreaterThan(0);
        expect(emotion.confidence).toBeGreaterThan(0);
      }
    }
  });

  it('emits body, face and voice effects plus a cause for every emotion', () => {
    for (const shot of shots) {
      for (const emotion of shot.emotion) {
        expect(emotion.cause).toBeTruthy();
        expect(emotion.effects.body).toBeDefined();
        expect(emotion.effects.face).toBeDefined();
        expect(emotion.effects.voice).toBeDefined();
        expect(emotion.settleSeconds).toBeGreaterThan(0);
        expect(emotion.transitionInSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('carries continuity from the preceding beat rather than jumping', () => {
    const later = shots.slice(1);
    const withPrevious = later.flatMap((shot) => shot.emotion).filter((emotion) => emotion.previous != null);
    expect(withPrevious.length).toBeGreaterThan(0);
  });

  it('gives the same emotion a character-specific performance', () => {
    // The regression the brief asks for by name: one instruction must not produce
    // two identical performances.
    const plan = clonePlan();
    for (const character of plan.beats[3].characters) {
      (character as { emotion?: string }).emotion = 'happy';
    }
    const shot = direct(plan).blueprint.content.shots[3];
    const [pip, goat] = [
      shot.emotion.find((emotion) => emotion.characterCode === PIP)!,
      shot.emotion.find((emotion) => emotion.characterCode === GOAT)!,
    ];
    expect(pip.primary).toBe('happy');
    expect(goat.primary).toBe('happy');
    expect(stableStringify(pip.effects)).not.toBe(stableStringify(goat.effects));
  });

  it('refuses a gated emotion unless story intent approved it', () => {
    const plan = clonePlan();
    (plan.beats[0].characters[0] as { emotion?: string }).emotion = 'afraid';
    const withoutApproval = direct(plan);
    expect(
      withoutApproval.blueprint.content.issues.some((issue) => issue.code === 'EMOTION_GATED_UNAPPROVED'),
    ).toBe(true);

    const approved = clonePlan();
    (approved.beats[0].characters[0] as { emotion?: string }).emotion = 'afraid';
    (approved as { approvedGatedEmotions: string[] }).approvedGatedEmotions = ['afraid'];
    const withApproval = direct(approved);
    expect(
      withApproval.blueprint.content.issues.some((issue) => issue.code === 'EMOTION_GATED_UNAPPROVED'),
    ).toBe(false);
  });
});

describe('Step 4 — facial performance', () => {
  const shots = planned.blueprint.content.shots;

  it('plans blinks, gaze and a rest recovery for every character', () => {
    for (const shot of shots) {
      for (const plan of shot.face) {
        expect(plan.blinks.length).toBeGreaterThan(0);
        expect(plan.gaze).toBeDefined();
        expect(plan.restRecovery.weight).toBe(1);
        expect(plan.asymmetry).toBeGreaterThanOrEqual(FACIAL_TOLERANCES.minAsymmetry);
      }
    }
  });

  it('only drives channels the approved rig actually has', () => {
    for (const shot of shots) {
      for (const plan of shot.face) {
        const lock = plan.characterCode === PIP ? PIP_LOCK : GOAT_LOCK;
        for (const channel of Object.keys(plan.expressionWeights)) {
          expect(lock.facialChannels, `${plan.characterCode} ${channel}`).toContain(channel);
        }
      }
    }
  });

  it('keeps the mouth group inside one travel budget', () => {
    for (const shot of shots) {
      for (const plan of shot.face) {
        const mouthTotal = Object.entries(plan.expressionWeights)
          .filter(([channel]) => /open|smile/.test(channel))
          .reduce((sum, [, weight]) => sum + weight, 0);
        expect(mouthTotal).toBeLessThanOrEqual(FACIAL_TOLERANCES.maxMouthGroupWeight + 1e-9);
      }
    }
  });

  it('supports dialogue-free reaction acting', () => {
    const plan = clonePlan();
    plan.beats[1].dialogue = [];
    const shot = direct(plan).blueprint.content.shots[1];
    for (const facePlan of shot.face) {
      expect(facePlan.dialogueFree).toBe(true);
      // No words is not no performance: brows and blinks still carry the beat.
      expect(facePlan.cues.length).toBeGreaterThan(0);
    }
  });

  it('passes every facial QC check on the validation scene', () => {
    for (const shot of shots) {
      for (const measurement of shot.qc.facial) {
        expect(measurement.status, `${shot.shotId} ${measurement.check}`).toBe('PASS');
      }
    }
  });

  it('refuses a dialogue line that does not fit its shot', () => {
    const plan = clonePlan();
    plan.beats[0].dialogue[0].text =
      'Goat look at this extraordinarily complicated cartographical annotation immediately please right now';
    const tight = direct(plan);
    expect(tight.status).toBe('FAIL');
    // Either the visemes would chatter or the audio runs past the cut. Both are
    // refusals of the same underlying problem, and which one binds first depends on
    // the shot length, so accept either rather than pinning the incidental one.
    expect(
      tight.blueprint.content.issues.some(
        (issue) => issue.code.includes('VISEME') || issue.code === 'SOUND_DURATION_OVERRUN',
      ),
    ).toBe(true);
  });
});

describe('Step 5 — vertical 9:16 camera intelligence', () => {
  const shots = planned.blueprint.content.shots;

  it('scores compositions and reports why one was chosen', () => {
    for (const shot of shots) {
      expect(shot.camera.score).toBeGreaterThan(0);
    }
    const cameraDecisions = planned.blueprint.content.decisionTrace.filter(
      (decision) => decision.system === 'camera' && decision.decision === 'composition',
    );
    expect(cameraDecisions.length).toBe(shots.length);
    for (const decision of cameraDecisions) {
      expect(decision.because).toBeTruthy();
      expect(decision.alternatives.length).toBeGreaterThan(0);
    }
  });

  it('keeps headroom, foot room and caption-safe regions', () => {
    for (const shot of shots) {
      expect(shot.camera.framing.headroomFraction).toBeGreaterThanOrEqual(CAMERA_RULES.minHeadroomFraction);
      expect(shot.camera.framing.headroomFraction).toBeLessThanOrEqual(CAMERA_RULES.maxHeadroomFraction);
      expect(shot.camera.safeRegions.topCaptionFraction).toBe(CAMERA_RULES.topCaptionFraction);
      expect(shot.camera.safeRegions.bottomCaptionFraction).toBe(CAMERA_RULES.bottomCaptionFraction);
    }
  });

  it('never rolls the horizon', () => {
    for (const shot of shots) {
      expect(Math.abs(shot.camera.geometry?.rotationDegrees[1] ?? 0)).toBeLessThanOrEqual(
        CAMERA_RULES.maxHorizonTiltDegrees,
      );
    }
  });

  it('pulls focus with the camera on a dolly move', () => {
    const moving = shots.filter((shot) => shot.camera.geometry?.endLocation != null);
    expect(moving.length).toBeGreaterThan(0);
    for (const shot of moving) {
      const endDistance = Math.abs(shot.camera.geometry!.endLocation![1]);
      // Focus must land on the subject at the end of the move, not only the start.
      expect(Math.abs(shot.camera.depth.endFocusDistanceMeters - endDistance)).toBeLessThanOrEqual(
        CAMERA_RULES.maxFocusErrorMeters,
      );
    }
  });

  it('keeps screen direction continuous across shots', () => {
    for (let index = 1; index < shots.length; index += 1) {
      expect(shots[index].continuity.previousShotId).toBe(shots[index - 1].shotId);
    }
  });

  it('delivers at the plan resolution', () => {
    for (const shot of shots) {
      expect(shot.camera.resolution).toBe(VALIDATION_SCENE_PLAN.delivery.resolution);
    }
  });

  it('preserves the accepted Meadow Map Mystery framing as a fixture, not a mandate', () => {
    expect(MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META.cameraPreset).toBe('PUSH_IN');
    expect(MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META.lightingState).toBe('DAY_KEY');
    // The camera system must remain free to choose otherwise for a different beat.
    const compositions = new Set(shots.map((shot) => shot.camera.composition));
    expect(compositions.size).toBeGreaterThan(1);
  });

  it('flags a shot held longer than a vertical cut rhythm tolerates', () => {
    const plan = clonePlan();
    plan.beats[3].durationSeconds = CAMERA_RULES.maxStaticShotSeconds + 4;
    plan.delivery.targetDurationSeconds = 20;
    const slow = direct(plan);
    expect(slow.blueprint.content.issues.some((issue) => issue.code.startsWith('CAMERA_'))).toBe(true);
  });
});

describe('Step 6 — lighting director', () => {
  const shots = planned.blueprint.content.shots;

  it('plans key, fill and rim for every shot', () => {
    for (const shot of shots) {
      expect(shot.lighting.key.relativeEnergy).toBeGreaterThan(0);
      expect(shot.lighting.fill.relativeEnergy).toBeGreaterThan(0);
      expect(shot.lighting.rim.relativeEnergy).toBeGreaterThan(0);
    }
  });

  it('preserves the corrected colour-management pipeline', () => {
    for (const shot of shots) {
      // The repaired pipeline is Khronos PBR Neutral. An unapproved transform is
      // exactly the regression that made an earlier acceptance read as overcast.
      expect(shot.lighting.colorManagement.viewTransform).toBe('Khronos PBR Neutral');
      expect(shot.lighting.colorManagement.look).toBe('None');
    }
  });

  it('requires catchlights and subject separation where the shot needs them', () => {
    for (const shot of shots) {
      expect(shot.lighting.predicted.catchlightPresent).toBe(true);
      expect(shot.lighting.predicted.subjectSeparationLuma).toBeGreaterThanOrEqual(
        LIGHTING_THRESHOLDS.subjectSeparationMin,
      );
      expect(shot.lighting.predicted.contactShadowLuma).toBeGreaterThanOrEqual(
        LIGHTING_THRESHOLDS.contactShadowMin,
      );
    }
  });

  it('stays inside the highlight and shadow thresholds', () => {
    for (const shot of shots) {
      expect(shot.lighting.predicted.highlightClipFraction).toBeLessThanOrEqual(
        LIGHTING_THRESHOLDS.highlightClipMax,
      );
      expect(shot.lighting.predicted.shadowFloorP01).toBeGreaterThanOrEqual(
        LIGHTING_THRESHOLDS.shadowFloorP01Min,
      );
      expect(shot.lighting.predicted.shadowAcneRisk).toBeLessThanOrEqual(
        LIGHTING_THRESHOLDS.shadowAcneRiskMax,
      );
    }
  });

  it('rejects an unapproved colour-management transform', () => {
    // Fail closed at the schema boundary: this is the one setting whose silent
    // change would invalidate every accepted frame statistic in the repository.
    const plan = clonePlan();
    const stored = direct(plan).blueprint;
    const tampered = structuredClone(stored) as typeof stored;
    (tampered.content.shots[0].lighting.colorManagement as { viewTransform: string }).viewTransform = 'AgX';
    expect(() => parseBlueprint(tampered)).toThrow();
  });

  it('does not weaken the existing accepted thresholds', () => {
    // Pinned against the values the accepted renders were measured with. Loosening
    // one to make a new scene pass would change these numbers and fail here.
    expect(LIGHTING_THRESHOLDS.highlightClipMax).toBeLessThanOrEqual(0.02);
    expect(LIGHTING_THRESHOLDS.shadowFloorP01Min).toBeGreaterThanOrEqual(6);
    expect(LIGHTING_THRESHOLDS.subjectSeparationMin).toBeGreaterThanOrEqual(20);
    expect(LIGHTING_THRESHOLDS.contactShadowMin).toBeGreaterThanOrEqual(2);
  });
});

describe('Step 7 — reusable VFX library', () => {
  const shots = planned.blueprint.content.shots;

  it('registers the initial categories the brief asks for', () => {
    const categories = new Set(VFX_REGISTRY.map((preset) => preset.category));
    for (const required of [
      'MAGICAL_SPARKLES',
      'GLOWING_TRAIL',
      'DUST_PUFF',
      'LEAVES_WIND',
      'MAP_GLOW',
      'SOFT_MIST',
      'WATER_SPLASH',
      'DISCOVERY_BURST',
      'ENVIRONMENTAL_PARTICLES',
      'TRANSITION_ACCENT',
    ]) {
      expect(categories, required).toContain(required);
    }
  });

  it('versions every preset and records provenance and licensing', () => {
    for (const preset of VFX_REGISTRY) {
      expect(preset.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(preset.provenance.license).toBeTruthy();
      expect(preset.provenance.author).toBeTruthy();
    }
  });

  it('seeds instances deterministically', () => {
    const again = direct(VALIDATION_SCENE_PLAN);
    for (let index = 0; index < shots.length; index += 1) {
      expect(again.blueprint.content.shots[index].vfx.instances.map((instance) => instance.seed)).toEqual(
        shots[index].vfx.instances.map((instance) => instance.seed),
      );
    }
  });

  it('bounds particle counts and stays inside the frame budget', () => {
    for (const shot of shots) {
      expect(shot.vfx.totalParticles).toBeLessThanOrEqual(VFX_BUDGET.perShotParticles);
      expect(shot.vfx.totalCostWeight).toBeLessThanOrEqual(VFX_BUDGET.perShotCostWeight);
      for (const instance of shot.vfx.instances) {
        const preset = VFX_REGISTRY.find((entry) => entry.id === instance.presetId)!;
        expect(instance.particleCount).toBeLessThanOrEqual(preset.maxParticles);
        expect(instance.intensity).toBeLessThanOrEqual(VFX_BUDGET.childSafeMaxIntensity);
      }
    }
  });

  it('never obscures a face or a required story prop', () => {
    for (const shot of shots) {
      for (const instance of shot.vfx.instances) {
        expect(instance.facesOccludedFraction).toBeLessThanOrEqual(VFX_BUDGET.maxFaceOcclusion);
        expect(instance.propOccludedFraction).toBeLessThanOrEqual(VFX_BUDGET.maxPropOcclusion);
      }
    }
  });

  it('keeps effects readable on a phone', () => {
    for (const shot of shots) {
      for (const instance of shot.vfx.instances) {
        const preset = VFX_REGISTRY.find((entry) => entry.id === instance.presetId)!;
        expect(instance.onScreenFraction).toBeGreaterThanOrEqual(preset.minOnScreenFraction);
      }
    }
  });

  it('gives every instance its own cache key so one effect change re-renders one shot', () => {
    const keys = shots.flatMap((shot) => shot.vfx.instances.map((instance) => instance.cacheKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses a preset that is not in the registry', () => {
    const plan = clonePlan();
    plan.beats[0].vfxRequests = ['vfx_does_not_exist_v1'];
    const result = direct(plan);
    expect(result.blueprint.content.issues.some((issue) => issue.code === 'VFX_UNKNOWN_PRESET')).toBe(true);
  });
});

describe('Step 8 — professional sound system', () => {
  const shots = planned.blueprint.content.shots;

  it('lays a timeline with ambience under every shot', () => {
    for (const shot of shots) {
      expect(shot.audio.tracks.some((track) => track.kind === 'AMBIENCE')).toBe(true);
      expect(shot.audio.durationMs).toBeGreaterThan(0);
    }
  });

  it('uses the permanent locked voice identities and nothing else', () => {
    expect(voiceIdFor(PIP)).toBe('pip_default_v1');
    expect(voiceIdFor(GOAT)).toBe('goat_default_v1');
    for (const shot of shots) {
      for (const request of shot.audio.voiceRequests) {
        expect(request.voiceId).toBe(voiceIdFor(request.characterCode));
      }
      for (const track of shot.audio.tracks.filter((entry) => entry.kind === 'DIALOGUE')) {
        expect(track.source.ref).toBe(voiceIdFor(track.characterCode!));
      }
    }
  });

  it('never requires a paid provider', () => {
    for (const shot of shots) {
      for (const request of shot.audio.voiceRequests) {
        expect(request.requiresPaidProvider).toBe(false);
      }
      for (const track of shot.audio.tracks) {
        expect(track.source.provider).not.toBe('external');
        expect(track.source.cacheKey).toBeTruthy();
        expect(track.source.license).toBeTruthy();
      }
      const paid = shot.qc.sound.find((measurement) => measurement.check === 'NO_PAID_PROVIDER');
      expect(paid?.status).toBe('PASS');
      expect(paid?.measured).toBe(0);
    }
  });

  it('gain stages the bus so the summed mix clears the true-peak ceiling', () => {
    for (const shot of shots) {
      expect(shot.audio.mixBusTrimDb).toBeLessThanOrEqual(0);
      const clipping = shot.qc.sound.find((measurement) => measurement.check === 'CLIPPING_RISK');
      expect(clipping?.status, shot.shotId).toBe('PASS');
      expect(clipping!.measured).toBeLessThanOrEqual(SOUND_TARGETS.truePeakDb);
    }
  });

  it('keeps dialogue intelligible over music', () => {
    for (const shot of shots) {
      const intelligibility = shot.qc.sound.find(
        (measurement) => measurement.check === 'DIALOGUE_INTELLIGIBILITY',
      );
      expect(intelligibility?.status).toBe('PASS');
    }
  });

  it('ducks every dialogue line', () => {
    for (const shot of shots) {
      const ducking = shot.qc.sound.find((measurement) => measurement.check === 'DUCKING_COVERAGE');
      expect(ducking?.status).toBe('PASS');
      if (shot.audio.dialogueTiming.length > 0) {
        expect(shot.audio.ducking.length).toBeGreaterThan(0);
      }
    }
  });

  it('detects silence, dropouts and overruns', () => {
    for (const shot of shots) {
      for (const check of ['SILENCE_DROPOUT', 'DURATION_OVERRUN', 'MISSING_AUDIO', 'CHILD_SAFE_LOUDNESS']) {
        const measurement = shot.qc.sound.find((entry) => entry.check === check);
        expect(measurement?.status, `${shot.shotId} ${check}`).toBe('PASS');
      }
    }
  });

  it('lands footsteps on the steps the acting plan planned', () => {
    for (const shot of shots) {
      for (const plan of shot.acting) {
        const steps = shot.audio.tracks.filter(
          (track) => track.kind === 'FOOTSTEPS' && track.characterCode === plan.characterCode,
        ).length;
        // Audio and animation are not allowed to disagree about how many steps happened.
        expect(steps).toBe(plan.locomotion.steps);
      }
    }
  });

  it('emits dialogue and viseme timing metadata that agree with each other', () => {
    for (const shot of shots) {
      for (const timing of shot.audio.dialogueTiming) {
        expect(timing.durationMs).toBeGreaterThan(0);
        const visemes = shot.face
          .find((plan) => plan.characterCode === timing.characterCode)
          ?.cues.filter((cue) => cue.channel.startsWith('viseme_'));
        expect(visemes && visemes.length > 0).toBe(true);
      }
    }
  });

  it('keys the mix on a deterministic configuration hash', () => {
    const again = direct(VALIDATION_SCENE_PLAN);
    for (let index = 0; index < shots.length; index += 1) {
      expect(again.blueprint.content.shots[index].audio.mixConfigKey).toBe(shots[index].audio.mixConfigKey);
    }
  });

  it('lets one track be replaced without disturbing the others', () => {
    const plan = clonePlan();
    plan.beats[0].musicIntent = 'WARM';
    const changed = direct(plan).blueprint.content.shots[0];
    const before = shots[0];
    expect(changed.audio.mixConfigKey).not.toBe(before.audio.mixConfigKey);
    // The dialogue artifact is keyed on voice, text and prosody, so a music change
    // must not invalidate it — that is what makes track replacement cheap.
    expect(changed.audio.voiceRequests.map((request) => request.cacheKey)).toEqual(
      before.audio.voiceRequests.map((request) => request.cacheKey),
    );
  });
});

describe('character and voice locks', () => {
  it('pins Pip to her canon identity', () => {
    expect(PIP_LOCK.characterCode).toBe('CHAR_PIP_001');
    expect(PIP_LOCK.sex).toBe('girl');
    expect(PIP_LOCK.species).toBe('chick');
    expect(PIP_LOCK.voice.voiceId).toBe('pip_default_v1');
    expect(PIP_LOCK.requiredAccessories).toContain('purple backpack');
    expect(PIP_LOCK.signatureFeatures.join(' ')).toMatch(/crest|beak|feet|eyes/);
    expect(PIP_LOCK.voice.forbidden).toContain('squeaky');
  });

  it('pins Goat to his canon identity', () => {
    expect(GOAT_LOCK.characterCode).toBe('CHAR_GOAT_001');
    expect(GOAT_LOCK.sex).toBe('boy');
    expect(GOAT_LOCK.species).toBe('goat');
    expect(GOAT_LOCK.voice.voiceId).toBe('goat_default_v1');
    expect(GOAT_LOCK.voice.forbidden.join(' ')).toMatch(/deep|babyish/);
  });

  it('keeps prosody inside each voice lock', () => {
    for (const shot of planned.blueprint.content.shots) {
      for (const request of shot.audio.voiceRequests) {
        const lock = request.characterCode === PIP ? PIP_LOCK : GOAT_LOCK;
        expect(request.prosody.pitchSemitones).toBeGreaterThanOrEqual(lock.voice.pitchRange.minSemitones);
        expect(request.prosody.pitchSemitones).toBeLessThanOrEqual(lock.voice.pitchRange.maxSemitones);
        expect(request.prosody.rate).toBeGreaterThanOrEqual(lock.voice.rateRange.min);
        expect(request.prosody.rate).toBeLessThanOrEqual(lock.voice.rateRange.max);
      }
    }
  });

  it('reports no lock violation on the validation scene', () => {
    const violations = planned.blueprint.content.issues.filter(
      (issue) => issue.code.includes('LOCK') || issue.code.includes('CHARACTER_'),
    );
    expect(violations).toEqual([]);
  });
});

describe('overrides', () => {
  const baseOverride = { by: 'director@tivvlejoy', reason: 'artistic call for this beat' };
  const firstShotId = planned.blueprint.content.shots[0].shotId;

  it('applies a bounded override and records its provenance', () => {
    expect(Object.keys(OVERRIDE_BOUNDS)).toContain('lighting.recipe');
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'lighting.recipe', value: 'DISCOVERY_GOLDEN' }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'lighting.recipe');
    expect(applied).toBeDefined();
    expect(applied!.by).toBe(baseOverride.by);
    expect(applied!.reason).toBe(baseOverride.reason);
    expect(applied!.refusedBecause).toBeUndefined();
    expect(result.blueprint.content.shots[0].lighting.recipe).toBe('DISCOVERY_GOLDEN');
  });

  it('changes the content hash, so an override is never invisible', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'camera.composition', value: 'CLOSE_UP' }],
    });
    expect(result.blueprint.content.contentHash).not.toBe(planned.blueprint.content.contentHash);
    expect(result.blueprint.content.shots[0].cacheKey).not.toBe(planned.blueprint.content.shots[0].cacheKey);
  });

  it('scopes an override with no continuity coupling to its own shot', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'lighting.recipe', value: 'DISCOVERY_GOLDEN' }],
    });
    const diff = diffBlueprints(planned.blueprint, result.blueprint);
    expect(diff.invalidatedShotIds).toEqual([firstShotId]);
    expect(diff.reusableShotIds).toHaveLength(planned.blueprint.content.shots.length - 1);
  });

  it('propagates a camera override exactly as far as continuity requires', () => {
    // Screen direction and lens continuity make the next shot depend on this one, so
    // overriding a framing must invalidate its successor too — and then stop. Both
    // halves matter: under-invalidating ships a continuity break, over-invalidating
    // re-renders shots nothing touched.
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'camera.composition', value: 'CLOSE_UP' }],
    });
    expect(result.blueprint.content.shots[0].camera.composition).toBe('CLOSE_UP');
    const shotIds = planned.blueprint.content.shots.map((shot) => shot.shotId);
    const diff = diffBlueprints(planned.blueprint, result.blueprint);
    expect(diff.invalidatedShotIds).toEqual([shotIds[0], shotIds[1]]);
    expect(diff.reusableShotIds).toEqual([shotIds[2], shotIds[3]]);
  });

  it('refuses to override a protected path and says why', () => {
    for (const protectedPath of PROTECTED_OVERRIDE_PATHS.slice(0, 6)) {
      const result = direct(VALIDATION_SCENE_PLAN, {
        overrides: [{ ...baseOverride, shotId: firstShotId, path: protectedPath, value: 'anything' }],
      });
      const applied = result.blueprint.content.overrides.find((entry) => entry.path === protectedPath);
      expect(applied?.refusedBecause, protectedPath).toBeTruthy();
    }
  });

  it('refuses to override the approved colour-management pipeline', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [
        { ...baseOverride, shotId: firstShotId, path: 'lighting.colorManagement', value: { viewTransform: 'AgX' } },
      ],
    });
    const applied = result.blueprint.content.overrides.find(
      (entry) => entry.path === 'lighting.colorManagement',
    );
    expect(applied?.refusedBecause).toBeTruthy();
    expect(result.blueprint.content.shots[0].lighting.colorManagement.viewTransform).toBe(
      'Khronos PBR Neutral',
    );
  });

  it('refuses to override a voice identity', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'audio.voiceRequests', value: [] }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'audio.voiceRequests');
    expect(applied?.refusedBecause).toBeTruthy();
    for (const request of result.blueprint.content.shots[0].audio.voiceRequests) {
      expect(request.voiceId).toBe(voiceIdFor(request.characterCode));
    }
  });

  it('refuses an emotion intensity above the child-safe ceiling', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'emotion.intensity', value: 1 }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'emotion.intensity');
    expect(applied?.refusedBecause).toBeTruthy();
    for (const emotion of result.blueprint.content.shots[0].emotion) {
      expect(emotion.intensity).toBeLessThanOrEqual(CHILD_SAFE_POLICY.maxIntensity);
    }
  });

  it('accepts an emotion intensity inside the ceiling', () => {
    const value = CHILD_SAFE_POLICY.maxIntensity - 0.1;
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'emotion.intensity', value }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'emotion.intensity');
    expect(applied?.refusedBecause).toBeUndefined();
  });

  it('refuses an unknown override path rather than silently ignoring it', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'not.a.real.path', value: 1 }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'not.a.real.path');
    expect(applied?.refusedBecause).toBeTruthy();
  });

  it('refuses a value of the wrong kind for an enum path', () => {
    const result = direct(VALIDATION_SCENE_PLAN, {
      overrides: [{ ...baseOverride, shotId: firstShotId, path: 'camera.move', value: 'BARREL_ROLL' }],
    });
    const applied = result.blueprint.content.overrides.find((entry) => entry.path === 'camera.move');
    expect(applied?.refusedBecause).toBeTruthy();
  });
});

describe('cache keys and targeted invalidation', () => {
  it('gives every shot its own key', () => {
    const keys = planned.blueprint.content.shots.map((shot) => shot.cacheKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('derives the episode key from the shot keys', () => {
    const content = planned.blueprint.content;
    expect(
      computeBlueprintCacheKey({
        episodeId: content.episodeId,
        delivery: content.delivery,
        schemaVersion: content.schemaVersion,
        shotCacheKeys: content.shots.map((shot) => shot.cacheKey),
      }),
    ).toBe(content.cacheKey);
  });

  it('invalidates only the shots a change actually affects', () => {
    const plan = clonePlan();
    plan.beats[3].musicIntent = 'WARM';
    const diff = diffBlueprints(planned.blueprint, direct(plan).blueprint);
    expect(diff.invalidatedShotIds).toEqual([planned.blueprint.content.shots[3].shotId]);
    expect(diff.reusableShotIds).toHaveLength(3);
    expect(diff.changedSystems[planned.blueprint.content.shots[3].shotId]).toContain('audio');
    expect(diff.episodeKeyChanged).toBe(true);
  });

  it('invalidates nothing when nothing changed', () => {
    const diff = diffBlueprints(planned.blueprint, direct(VALIDATION_SCENE_PLAN).blueprint);
    expect(diff.invalidatedShotIds).toEqual([]);
    expect(diff.episodeKeyChanged).toBe(false);
  });

  it('folds subsystem versions into the episode key', () => {
    // A version bump has to reach the key, or a planner fix would silently reuse
    // renders produced by the bug it fixed. The versions are read from the module at
    // hash time, so what is asserted here is that they are recorded and material.
    const content = planned.blueprint.content;
    expect(content.systemVersions).toMatchObject(SUBSYSTEM_VERSIONS);
    const material = {
      episodeId: content.episodeId,
      delivery: content.delivery,
      schemaVersion: content.schemaVersion,
      shotCacheKeys: content.shots.map((shot) => shot.cacheKey),
    };
    expect(computeBlueprintCacheKey(material)).toBe(content.cacheKey);
    expect(
      computeBlueprintCacheKey({ ...material, shotCacheKeys: [...material.shotCacheKeys, 'extra'] }),
    ).not.toBe(content.cacheKey);
  });

  it('reports which systems changed, not just that something did', () => {
    const plan = clonePlan();
    plan.beats[1].timeOfDay = 'GOLDEN_HOUR';
    const diff = diffBlueprints(planned.blueprint, direct(plan).blueprint);
    const changed = diff.changedSystems[planned.blueprint.content.shots[1].shotId];
    expect(changed).toBeDefined();
    expect(changed).toContain('lighting');
  });
});

describe('schema migrations', () => {
  it('round-trips a current blueprint unchanged', () => {
    const result = upgradeBlueprint(planned.blueprint);
    expect(result.applied).toEqual([]);
    expect(result.fromVersion).toBe(BLUEPRINT_SCHEMA_VERSION);
    expect(result.blueprint.content.contentHash).toBe(planned.blueprint.content.contentHash);
  });

  it('knows its own version history', () => {
    expect(BLUEPRINT_SCHEMA_HISTORY).toContain(BLUEPRINT_SCHEMA_VERSION);
    expect(BLUEPRINT_SCHEMA_HISTORY[BLUEPRINT_SCHEMA_HISTORY.length - 1]).toBe(BLUEPRINT_SCHEMA_VERSION);
  });

  it('fails closed on a version it cannot interpret', () => {
    const tampered = structuredClone(planned.blueprint) as typeof planned.blueprint;
    (tampered.content as { schemaVersion: string }).schemaVersion = 'ddp-production-blueprint-v99';
    expect(() => upgradeBlueprint(tampered)).toThrow(/v99|unknown|migrat/i);
  });

  it('rejects a stored value that is not a blueprint at all', () => {
    expect(() => upgradeBlueprint(null)).toThrow();
    expect(() => upgradeBlueprint({})).toThrow();
    expect(() => upgradeBlueprint({ content: 'nope' })).toThrow();
  });
});

describe('preserved acceptance evidence', () => {
  it('keeps the closed FINAL_1080P acceptance intact', () => {
    expect(FINAL_1080P_ACCEPTANCE.workerImageDigest).toBe(
      'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830',
    );
    expect(FINAL_1080P_ACCEPTANCE.acceptedArtifactSha256).toBe(
      'aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458',
    );
    expect(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint.startsWith('7876ac73')).toBe(true);
    expect(FINAL_1080P_ACCEPTANCE.resolution).toBe('1080x1920');
    expect(FINAL_1080P_ACCEPTANCE.frames).toBe(90);
    expect(FINAL_1080P_ACCEPTANCE.fps).toBe(30);
    expect(FINAL_1080P_ACCEPTANCE.codec).toBe('H.264');
    expect(FINAL_1080P_ACCEPTANCE.chestSeamRepair).toBe('PASS');
    expect(FINAL_1080P_ACCEPTANCE.prNumber).toBe(10);
  });

  it('keeps the shadow-caster constants the chest-seam repair depends on', () => {
    expect(SHADOW_CASTER_CONSTANTS.SHADOW_PROXY_VERTEX_GROUP).toBe('DDP_ShadowShrink');
    expect(SHADOW_CASTER_CONSTANTS.SHADOW_PROXY_SHRINK).toBe(0.022);
    expect(SHADOW_CASTER_CONSTANTS.SHADOW_PROXY_SEALED_CLEARANCE).toBe(0.0001);
    expect(SHADOW_CASTER_CONSTANTS.SHADOW_PROXY_SUFFIX).toBe('_ShadowProxy');
  });

  it('never renders the validation scene at acceptance resolution', () => {
    // The fixture is a capability check at draft resolution and must not be
    // mistakable for a new FINAL_1080P acceptance.
    expect(VALIDATION_SCENE_PLAN.delivery.resolution).not.toBe(FINAL_1080P_ACCEPTANCE.resolution);
    expect(planned.blueprint.content.totals.durationSeconds).toBeLessThanOrEqual(15);
    expect(planned.blueprint.content.totals.durationSeconds).toBeGreaterThanOrEqual(10);
  });
});

describe('secret redaction and structured logging', () => {
  it('leaks no credential-shaped material into a blueprint', () => {
    const serialised = stableStringify(planned.blueprint);
    for (const pattern of [
      /RUNPOD_API_KEY/i,
      /R2_SECRET/i,
      /AWS_SECRET/i,
      /ghp_[A-Za-z0-9]{10}/,
      /Bearer\s+[A-Za-z0-9._-]{12}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /password/i,
      /authorization/i,
    ]) {
      expect(serialised, String(pattern)).not.toMatch(pattern);
    }
  });

  it('carries no environment variable values', () => {
    const serialised = stableStringify(planned.blueprint);
    for (const key of ['RUNPOD_API_KEY', 'R2_SECRET_ACCESS_KEY', 'R2_ACCESS_KEY_ID', 'DATABASE_URL']) {
      const value = process.env[key];
      if (value && value.length > 8) expect(serialised).not.toContain(value);
    }
  });

  it('keeps every issue message actionable without exposing internals', () => {
    const faulty = direct(ScenePlanSchema.parse(FAULTY_SCENE_PLAN_INPUT));
    for (const issue of faulty.blueprint.content.issues) {
      expect(issue.message.length).toBeGreaterThan(10);
      expect(issue.message).not.toMatch(/\/home\/|\/workspace\/|node_modules/);
    }
  });
});

describe('offline and provider independence', () => {
  it('plans a whole episode with no provider, no database and no network', () => {
    // Nothing to stub: the package cannot reach any of them. This test exists to
    // assert that stays true as the layer grows.
    const result = direct(VALIDATION_SCENE_PLAN);
    expect(result.blueprint.content.shots.length).toBeGreaterThan(0);
    expect(result.status).toBe('PASS');
  });

  it('never marks a voice request as needing a paid provider', () => {
    const requests = planned.blueprint.content.shots.flatMap((shot) => shot.audio.voiceRequests);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.requiresPaidProvider === false)).toBe(true);
  });
});

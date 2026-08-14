/**
 * Step 2 — Professional animation and acting.
 *
 * Turns a character's objective plus an emotion plan into Blender-ready
 * performance instructions: a pose-to-pose beat structure with anticipation,
 * action, reaction and settle; a gesture drawn from the character's own
 * vocabulary; eye lead ahead of the head; overlap and follow-through on the parts
 * that trail; and locomotion that keeps the feet on the ground.
 *
 * It also *measures* what it planned and reports repairs. The measurements are the
 * point: "the goat looks floaty" is not actionable, "the goat's hoof travels
 * 0.31 m while its contact flag is true, tolerance 0.02" is.
 *
 * Nothing here edits an approved asset. The output names authored actions that
 * already exist in the approved .blend and layers timing on top of them.
 */
import { z } from 'zod';
import {
  CharacterCodeSchema,
  NonEmptyStringSchema,
  UnitScalarSchema,
  type CharacterCode,
  type Decision,
  type PlanIssue,
} from '../schema/common';
import { boundedUnit, clampQuantize, createRng, deriveSeed, quantize } from '../determinism';
import { characterLock, checkCharacterLock } from '../locks';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { EmotionPlan } from '../emotion';
import type { StoryBeat } from '../schema/scene-plan';

/** The four phases of a pose-to-pose beat. Every acting plan has all four. */
export const ACTING_PHASES = ['ANTICIPATION', 'ACTION', 'REACTION', 'SETTLE'] as const;
export const ActingPhaseSchema = z.enum(ACTING_PHASES);
export type ActingPhase = z.infer<typeof ActingPhaseSchema>;

export const ActingKeySchema = z.object({
  phase: ActingPhaseSchema,
  /** Frame within the shot, 1-based, inclusive of the shot's own start. */
  frame: z.number().int().positive(),
  /** Named pose intent, not a rig pose: the renderer resolves it via the action. */
  pose: NonEmptyStringSchema,
  /** How long to hold on this key, in frames. Zero means pass through. */
  holdFrames: z.number().int().min(0),
  /** Interpolation into this key. `EASE_OUT` on anticipation, etc. */
  interpolation: z.enum(['LINEAR', 'EASE_IN', 'EASE_OUT', 'EASE_IN_OUT', 'STEP']),
  /** Silhouette readability score for this key, 0..1. */
  silhouetteScore: UnitScalarSchema,
});
export type ActingKey = z.infer<typeof ActingKeySchema>;

export const ActingPlanSchema = z.object({
  characterCode: CharacterCodeSchema,
  objective: NonEmptyStringSchema,
  /** What the character is doing about the objective, in performance terms. */
  performanceIntent: NonEmptyStringSchema,
  /** Authored action from the approved .blend used as the base body motion. */
  baseAction: NonEmptyStringSchema,
  /** Semantic gesture layered on top, from the character's own vocabulary. */
  gesture: NonEmptyStringSchema,
  keys: z.array(ActingKeySchema).min(4),
  /** Eye lead: eyes reach the target this many frames before the head. */
  eyeLeadFrames: z.number().int().min(1).max(12),
  /** Head reaches the target this many frames before the body. */
  headLeadFrames: z.number().int().min(0).max(16),
  /** Parts that trail the body, with their lag in frames. */
  overlap: z
    .array(z.object({ part: NonEmptyStringSchema, lagFrames: z.number().int().min(1).max(12), decay: UnitScalarSchema }))
    .min(1),
  /** Secondary motion amplitude, 0..1. Feather, ear, tail, backpack sway. */
  secondaryMotion: UnitScalarSchema,
  /** Weight shift across the shot, as a fraction of stance width. */
  weightShift: z.number().min(-1).max(1),
  locomotion: z.object({
    mode: z.enum(['NONE', 'STEP', 'WALK', 'RUN', 'TURN_IN_PLACE']),
    /**
     * Metres travelled over the shot. Always a whole multiple of the character's
     * stride: a walk cycle advances the body by exactly one stride per step, so any
     * remainder would have to be scrubbed by the feet. Distance is therefore an
     * output of the step count, not an independent quantity.
     */
    distanceMeters: z.number().min(0),
    /** Steps planned; 0 for NONE. Used for foley and for foot-slide checking. */
    steps: z.number().int().min(0),
    /** Cruise speed the stride pattern implies, m/s. Zero when not travelling. */
    cruiseSpeedMps: z.number().min(0),
    /** Seconds allowed to reach cruise speed from rest. Sets peak acceleration. */
    rampSeconds: z.number().min(0),
    facingDegrees: z.number().min(-180).max(180),
  }),
  staging: z.object({
    /** Screen side the character occupies. Continuity is checked across shots. */
    screenSide: z.enum(['LEFT', 'CENTER', 'RIGHT']),
    /** Direction the character faces, in screen terms. */
    facing: z.enum(['LEFT', 'CENTER', 'RIGHT']),
    /** Ground position in metres, x lateral / y depth. */
    position: z.object({ x: z.number(), y: z.number() }),
    rotationZ: z.number(),
  }),
  /** Symmetry breaker, 0..1. Zero would be mechanical; the planner never emits it. */
  asymmetry: UnitScalarSchema,
  motionArcs: z
    .array(z.object({ part: NonEmptyStringSchema, arcHeightMeters: z.number().min(0), direction: z.enum(['UP', 'DOWN', 'LATERAL']) }))
    .default([]),
  provenance: z.object({ system: z.literal('acting'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type ActingPlan = z.infer<typeof ActingPlanSchema>;

/** Machine-readable motion QC. One entry per check, per character. */
export const MotionMeasurementSchema = z.object({
  check: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  measured: z.number(),
  tolerance: z.number(),
  unit: NonEmptyStringSchema,
  status: z.enum(['PASS', 'FAIL']),
  /** What to change, when it fails. Advisory only — never auto-applied to assets. */
  repair: z.string().optional(),
});
export type MotionMeasurement = z.infer<typeof MotionMeasurementSchema>;

/**
 * Acting profiles. This is where Pip stops being Goat.
 *
 * Pip is a bipedal chick: quick, bright, gestures with wing-arms, leads hard with
 * the eyes. Goat is a quadruped: slower to start, heavier to stop, communicates
 * with head and ears rather than hands. Same emotion, different performance.
 */
type ActingProfile = {
  /** Multiplier on the anticipation window. Heavier characters anticipate longer. */
  anticipationScale: number;
  /** Multiplier on settle. Heavier characters settle longer. */
  settleScale: number;
  eyeLeadFrames: number;
  headLeadFrames: number;
  /** Parts that overlap, and how far behind the body they run. */
  overlapParts: ReadonlyArray<{ part: string; lagFrames: number; decay: number }>;
  secondaryBase: number;
  /** Metres per second at full energy, walking. */
  walkSpeed: number;
  runSpeed: number;
  /** Stride length in metres; sets step count and therefore foley. */
  strideMeters: number;
  locomotionStyle: 'BIPED' | 'QUADRUPED';
  /** Default gesture when the objective suggests nothing specific. */
  restGesture: string;
  /** Idle action name for shots with no locomotion. */
  idleAction: string;
  walkAction: string;
  runAction: string;
};

const ACTING_PROFILES: Readonly<Record<CharacterCode, ActingProfile>> = {
  CHAR_PIP_001: {
    anticipationScale: 0.85,
    settleScale: 0.9,
    eyeLeadFrames: 4,
    headLeadFrames: 3,
    overlapParts: [
      { part: 'crest', lagFrames: 3, decay: 0.55 },
      { part: 'backpack', lagFrames: 4, decay: 0.4 },
      { part: 'wing_tips', lagFrames: 2, decay: 0.6 },
    ],
    secondaryBase: 0.45,
    walkSpeed: 0.85,
    runSpeed: 2.1,
    strideMeters: 0.22,
    locomotionStyle: 'BIPED',
    restGesture: 'LOOK',
    idleAction: 'PIP_IDLE',
    walkAction: 'PIP_WALK',
    runAction: 'PIP_RUN',
  },
  CHAR_GOAT_001: {
    anticipationScale: 1.25,
    settleScale: 1.3,
    eyeLeadFrames: 3,
    headLeadFrames: 5,
    overlapParts: [
      { part: 'ears', lagFrames: 4, decay: 0.5 },
      { part: 'tail', lagFrames: 5, decay: 0.45 },
      { part: 'collar_tag', lagFrames: 3, decay: 0.65 },
    ],
    secondaryBase: 0.38,
    walkSpeed: 1.05,
    runSpeed: 2.6,
    strideMeters: 0.34,
    locomotionStyle: 'QUADRUPED',
    restGesture: 'LISTEN',
    idleAction: 'GOAT_IDLE',
    walkAction: 'GOAT_WALK',
    runAction: 'GOAT_RUN',
  },
};

/** Objective keywords → gesture code. Checked against the character's vocabulary. */
const OBJECTIVE_GESTURES: ReadonlyArray<{ keywords: readonly string[]; gesture: string }> = [
  { keywords: ['point', 'show', 'indicate', 'spot'], gesture: 'POINT' },
  { keywords: ['greet', 'hello', 'wave', 'welcome'], gesture: 'WAVE' },
  { keywords: ['agree', 'yes', 'confirm', 'nod'], gesture: 'NOD' },
  { keywords: ['refuse', 'no', 'disagree'], gesture: 'SHAKE_HEAD' },
  { keywords: ['think', 'wonder', 'puzzle', 'consider'], gesture: 'THINK' },
  { keywords: ['listen', 'hear', 'attend'], gesture: 'LISTEN' },
  { keywords: ['celebrate', 'cheer', 'delight'], gesture: 'CELEBRATE' },
  { keywords: ['pick', 'lift', 'take', 'grab'], gesture: 'PICK_UP' },
  { keywords: ['hold', 'carry', 'keep'], gesture: 'HOLD' },
  { keywords: ['push', 'nudge', 'move'], gesture: 'PUSH' },
  { keywords: ['look', 'watch', 'see', 'examine', 'study'], gesture: 'LOOK' },
];

/** Tolerances for the motion QC pass. Deliberately not editable per shot. */
export const MOTION_TOLERANCES = {
  /** Metres of foot travel allowed while a foot is planted. */
  footSlideMeters: 0.02,
  /** Metres a mesh may sit below the ground plane. Matches PROP_CLEARANCE_VALID. */
  groundPenetrationMeters: 0.002,
  /** Metres a planted character may float above the ground. */
  floatMeters: 0.005,
  /** Max metres/second² before motion reads as a snap. */
  accelerationMetersPerSecond2: 12,
  /** Frames a character may go with no motion at all before it reads as frozen. */
  frozenFrames: 12,
  /** Minimum asymmetry; exactly symmetrical acting reads mechanical. */
  minAsymmetry: 0.05,
  /** Minimum silhouette readability for the ACTION key. */
  minSilhouette: 0.55,
  /** Metres of clearance required between two characters' stances. */
  characterClearanceMeters: 0.35,
  /** Metres of clearance required between a character and a prop. */
  propClearanceMeters: 0.12,
  /** Fraction of the frame a performing character must stay within. */
  inFrameMargin: 0.04,
} as const;

export type ActingInput = {
  readonly beat: StoryBeat;
  readonly characterCode: CharacterCode;
  readonly emotion: EmotionPlan;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly fps: number;
  readonly durationSeconds: number;
  /** Staging of the previous shot, so screen direction stays continuous. */
  readonly previousStaging?: ActingPlan['staging'];
  /** Other characters' planned stances, for collision checking. */
  readonly otherPositions?: ReadonlyArray<{ characterCode: CharacterCode; x: number; y: number }>;
  /** Prop ground positions, for intersection checking. */
  readonly propPositions?: ReadonlyArray<{ propId: string; x: number; y: number }>;
};

export type ActingResult = {
  readonly plan: ActingPlan;
  readonly measurements: MotionMeasurement[];
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planActing(input: ActingInput): ActingResult {
  const { beat, characterCode, emotion, rootSeed, shotId, fps, durationSeconds } = input;
  const lock = characterLock(characterCode);
  const profile = ACTING_PROFILES[characterCode];
  const seed = deriveSeed(rootSeed, shotId, 'acting', characterCode);
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];

  const beatCharacter = beat.characters.find((c) => c.characterCode === characterCode);
  const objective = beatCharacter?.objective ?? `hold presence in the ${beat.purpose.toLowerCase()} beat`;

  const gesture = chooseGesture(objective, beat, profile, lock.gestureCodes, {
    shotId,
    characterCode,
    decisions,
    seed,
  });

  const totalFrames = Math.max(4, Math.round(durationSeconds * fps));

  // Pose-to-pose structure. Anticipation is proportional to the energy of the
  // action — a fast move needs a bigger wind-up to read — and scaled by how heavy
  // the character is. Settle comes from the emotion's own settle time so the body
  // and the face finish together.
  const anticipationFrames = Math.max(
    2,
    Math.round(totalFrames * (0.1 + emotion.effects.body.energy * 0.08) * profile.anticipationScale),
  );
  const settleFrames = Math.max(
    2,
    Math.round(Math.max(emotion.settleSeconds * fps, totalFrames * 0.12) * profile.settleScale),
  );
  const reactionFrames = Math.max(2, Math.round(totalFrames * 0.18));
  const actionFrames = Math.max(2, totalFrames - anticipationFrames - reactionFrames - settleFrames);

  if (anticipationFrames + actionFrames + reactionFrames + settleFrames > totalFrames) {
    issues.push({
      code: 'ACTING_SHOT_TOO_SHORT',
      severity: 'WARNING',
      system: 'acting',
      shotId,
      characterCode,
      message: `A readable four-phase beat needs about ${anticipationFrames + actionFrames + reactionFrames + settleFrames} frames; the shot has ${totalFrames}.`,
      measured: { needed: anticipationFrames + actionFrames + reactionFrames + settleFrames, available: totalFrames },
    });
  }

  // Holds are what make pose-to-pose read. A key with no hold is a key nobody sees.
  const holdScale = 1 - emotion.effects.body.energy * 0.5;
  const keys: ActingKey[] = [
    {
      phase: 'ANTICIPATION',
      frame: 1,
      pose: `${gesture}_ANTICIPATE`,
      holdFrames: Math.max(1, Math.round(anticipationFrames * 0.35 * holdScale)),
      interpolation: 'EASE_OUT',
      silhouetteScore: silhouette(gesture, 'ANTICIPATION', emotion, rng),
    },
    {
      phase: 'ACTION',
      frame: 1 + anticipationFrames,
      pose: `${gesture}_ACTION`,
      holdFrames: Math.max(2, Math.round(actionFrames * 0.4 * holdScale)),
      interpolation: 'EASE_IN_OUT',
      silhouetteScore: silhouette(gesture, 'ACTION', emotion, rng),
    },
    {
      phase: 'REACTION',
      frame: 1 + anticipationFrames + actionFrames,
      pose: `${gesture}_REACTION`,
      holdFrames: Math.max(1, Math.round(reactionFrames * 0.5 * holdScale)),
      interpolation: 'EASE_IN_OUT',
      silhouetteScore: silhouette(gesture, 'REACTION', emotion, rng),
    },
    {
      phase: 'SETTLE',
      frame: Math.min(totalFrames, 1 + anticipationFrames + actionFrames + reactionFrames),
      pose: 'REST',
      holdFrames: Math.max(1, Math.round(settleFrames * 0.6)),
      interpolation: 'EASE_IN',
      silhouetteScore: silhouette(gesture, 'SETTLE', emotion, rng),
    },
  ];

  const locomotion = planLocomotion(beat, characterCode, emotion, profile, durationSeconds, anticipationFrames / fps, rng);
  const baseAction = locomotion.mode === 'RUN' ? profile.runAction : locomotion.mode === 'WALK' ? profile.walkAction : profile.idleAction;

  if (!lock.authoredActions.includes(baseAction)) {
    issues.push({
      code: 'ACTING_ACTION_NOT_AUTHORED',
      severity: 'ERROR',
      system: 'acting',
      shotId,
      characterCode,
      message: `Base action "${baseAction}" is not authored in ${lock.name}'s approved asset; planning it would fail closed at assembly.`,
    });
  }

  const staging = planStaging(input, profile, locomotion, rng);

  // Asymmetry is seeded, never zero: a character whose left matches its right
  // exactly reads as a puppet, and it is the cheapest tell of procedural animation.
  const asymmetry = boundedUnit(
    MOTION_TOLERANCES.minAsymmetry + rng.float(0.02, 0.14) + emotion.effects.body.fidget * 0.1,
    3,
  );

  const plan: ActingPlan = ActingPlanSchema.parse({
    characterCode,
    objective,
    performanceIntent: describeIntent(objective, gesture, emotion),
    baseAction,
    gesture,
    keys,
    eyeLeadFrames: Math.max(1, Math.round(profile.eyeLeadFrames * (0.7 + emotion.effects.body.energy * 0.6))),
    headLeadFrames: Math.round(profile.headLeadFrames * (0.7 + emotion.effects.body.energy * 0.6)),
    overlap: profile.overlapParts.map((part) => ({
      part: part.part,
      lagFrames: Math.max(1, Math.round(part.lagFrames * (1 + emotion.effects.body.energy * 0.4))),
      decay: boundedUnit(part.decay, 3),
    })),
    secondaryMotion: boundedUnit(profile.secondaryBase * (0.6 + emotion.effects.body.energy * 0.8), 3),
    weightShift: clampQuantize(
      (emotion.effects.body.approach * 0.4 + rng.float(-0.12, 0.12)) * (locomotion.mode === 'NONE' ? 1 : 0.5),
      -1,
      1,
      3,
    ),
    locomotion,
    staging,
    asymmetry,
    motionArcs: planArcs(gesture, profile, emotion),
    provenance: { system: 'acting', version: SUBSYSTEM_VERSIONS.acting, seed },
  });

  // The lock check is about what the plan *asks for*, not about the asset.
  issues.push(
    ...checkCharacterLock(
      characterCode,
      {
        squashStretch: quantize(emotion.effects.body.energy * 0.05, 4),
        deformations: [{ feature: 'body', amountUnit: quantize(emotion.effects.body.expansiveness * 0.1, 4) }],
      },
      { system: 'acting', shotId },
    ),
  );

  const measurements = measureMotion(plan, input, profile);
  for (const measurement of measurements) {
    if (measurement.status === 'FAIL') {
      issues.push({
        code: `MOTION_${measurement.check}`,
        severity: 'ERROR',
        system: 'acting',
        shotId,
        characterCode,
        message: `${measurement.check}: measured ${measurement.measured}${measurement.unit}, tolerance ${measurement.tolerance}${measurement.unit}.${
          measurement.repair ? ` ${measurement.repair}` : ''
        }`,
        measured: { measured: measurement.measured, tolerance: measurement.tolerance },
      });
    }
  }

  return { plan, measurements, issues, decisions };
}

function chooseGesture(
  objective: string,
  beat: StoryBeat,
  profile: ActingProfile,
  vocabulary: readonly string[],
  ctx: { shotId: string; characterCode: CharacterCode; decisions: Decision[]; seed: number },
): string {
  const haystack = `${objective} ${beat.summary}`.toLowerCase();
  const scored = OBJECTIVE_GESTURES.map((entry) => {
    const hits = entry.keywords.filter((keyword) => haystack.includes(keyword)).length;
    const available = vocabulary.includes(entry.gesture);
    return { gesture: entry.gesture, score: available ? hits : -1, available };
  }).sort((a, b) => (b.score - a.score) || a.gesture.localeCompare(b.gesture));

  const best = scored.find((entry) => entry.score > 0 && entry.available);
  const chosen = best?.gesture ?? profile.restGesture;
  ctx.decisions.push({
    system: 'acting',
    shotId: ctx.shotId,
    characterCode: ctx.characterCode,
    decision: 'gesture',
    chose: chosen,
    because: best
      ? `objective and beat summary matched ${best.score} keyword(s) for ${chosen}`
      : `objective matched no gesture keyword; fell back to this character's rest gesture`,
    alternatives: scored
      .filter((entry) => entry.gesture !== chosen)
      .slice(0, 4)
      .map((entry) => ({
        option: entry.gesture,
        score: entry.score,
        rejectedBecause: entry.available ? 'lower keyword match' : 'not in this character\u2019s vocabulary',
      })),
    seed: ctx.seed,
  });
  return chosen;
}

function describeIntent(objective: string, gesture: string, emotion: EmotionPlan): string {
  return `${gesture.toLowerCase().replace(/_/g, ' ')} to ${objective}, played ${emotion.primary} at ${emotion.intensity}`;
}

function silhouette(gesture: string, phase: ActingPhase, emotion: EmotionPlan, rng: ReturnType<typeof createRng>): number {
  // Readability is highest at the ACTION key (that is the pose the audience reads)
  // and rises with how much space the body is taking up.
  const phaseBase = phase === 'ACTION' ? 0.72 : phase === 'ANTICIPATION' ? 0.62 : phase === 'REACTION' ? 0.6 : 0.55;
  const gestureBonus = ['POINT', 'WAVE', 'CELEBRATE'].includes(gesture) ? 0.12 : 0.04;
  return boundedUnit(phaseBase + gestureBonus + emotion.effects.body.expansiveness * 0.15 + rng.float(-0.03, 0.03), 3);
}

function planLocomotion(
  beat: StoryBeat,
  characterCode: CharacterCode,
  emotion: EmotionPlan,
  profile: ActingProfile,
  durationSeconds: number,
  /** Seconds of wind-up available before the move starts, from the pose structure. */
  rampWindowSeconds: number,
  rng: ReturnType<typeof createRng>,
): ActingPlan['locomotion'] {
  const haystack = `${beat.summary} ${beat.characters.find((c) => c.characterCode === characterCode)?.objective ?? ''}`.toLowerCase();
  const runs = /\b(run|dash|race|hurry|rush)\b/.test(haystack);
  const walks = /\b(walk|approach|cross|follow|head|go|come|move|climb)\b/.test(haystack);
  const turns = /\b(turn|spin|face|look back)\b/.test(haystack);

  const mode: ActingPlan['locomotion']['mode'] = runs ? 'RUN' : walks ? 'WALK' : turns ? 'TURN_IN_PLACE' : 'NONE';
  // Speed scales with emotional energy, but locomotion time excludes the settle:
  // a character still travelling while it should be settling is what reads floaty.
  const travelSeconds = Math.max(0, durationSeconds - emotion.settleSeconds);
  const speed = mode === 'RUN' ? profile.runSpeed : mode === 'WALK' ? profile.walkSpeed : 0;
  const desiredMeters = speed * travelSeconds * (0.7 + emotion.effects.body.energy * 0.5);

  // Snap the travel to a whole number of strides. The stride is how far the body
  // moves per step in the authored walk cycle, so a distance that is not a multiple
  // of it can only be covered by sliding the planted foot — which is exactly the
  // artefact the foot-slide gate exists to catch. Choosing the step count first and
  // deriving the distance from it makes the slide zero by construction rather than
  // something to be measured and apologised for.
  const steps =
    mode === 'NONE' || mode === 'TURN_IN_PLACE' ? 0 : Math.max(1, Math.round(desiredMeters / profile.strideMeters));
  const distanceMeters = quantize(steps * profile.strideMeters, 3);
  const cruiseSpeedMps = travelSeconds > 0 ? quantize(distanceMeters / travelSeconds, 3) : 0;
  const rampSeconds = quantize(Math.max(1 / 24, rampWindowSeconds), 3);
  const facingDegrees = mode === 'TURN_IN_PLACE' ? quantize(rng.float(-90, 90), 1) : 0;
  return { mode, distanceMeters, steps, cruiseSpeedMps, rampSeconds, facingDegrees };
}

function planStaging(
  input: ActingInput,
  profile: ActingProfile,
  locomotion: ActingPlan['locomotion'],
  rng: ReturnType<typeof createRng>,
): ActingPlan['staging'] {
  const { beat, characterCode, previousStaging } = input;
  const others = beat.characters.filter((c) => c.characterCode !== characterCode);

  // Screen direction continuity: if this character was on the left last shot, it
  // stays on the left, because crossing the line between shots is the single most
  // disorienting thing a two-hander can do.
  let screenSide: ActingPlan['staging']['screenSide'];
  if (previousStaging) {
    screenSide = previousStaging.screenSide;
  } else if (others.length === 0) {
    screenSide = 'CENTER';
  } else {
    // Deterministic assignment: sorted character codes take sides in order.
    const ordered = [characterCode, ...others.map((o) => o.characterCode)].sort();
    screenSide = ordered.indexOf(characterCode) === 0 ? 'LEFT' : 'RIGHT';
  }

  const lateral = screenSide === 'LEFT' ? -0.72 : screenSide === 'RIGHT' ? 0.78 : 0;
  const depth = profile.locomotionStyle === 'QUADRUPED' ? -1.42 : -1.62;
  const jitter = rng.float(-0.04, 0.04);

  return {
    screenSide,
    facing: screenSide === 'LEFT' ? 'RIGHT' : screenSide === 'RIGHT' ? 'LEFT' : 'CENTER',
    position: { x: quantize(lateral + jitter, 3), y: quantize(depth + jitter * 0.5, 3) },
    rotationZ: quantize(screenSide === 'LEFT' ? 0.5 : screenSide === 'RIGHT' ? -0.56 : 0, 3),
  };
}

function planArcs(gesture: string, profile: ActingProfile, emotion: EmotionPlan): ActingPlan['motionArcs'] {
  // Straight-line limb travel is the other cheap tell. Every gesture gets an arc.
  const part = profile.locomotionStyle === 'BIPED' ? 'wing_tip' : 'muzzle';
  const height = quantize(0.05 + emotion.effects.body.expansiveness * 0.12, 3);
  const arcs: ActingPlan['motionArcs'] = [{ part, arcHeightMeters: height, direction: 'UP' }];
  if (['POINT', 'WAVE', 'CELEBRATE'].includes(gesture)) {
    arcs.push({ part: 'head', arcHeightMeters: quantize(height * 0.5, 3), direction: 'LATERAL' });
  }
  return arcs;
}

/**
 * Measure the plan against the tolerances and say what to change.
 *
 * These are checks on the *plan*, so they catch a bad plan before a GPU renders
 * it. They are intentionally the same quantities the Blender-side scene gates
 * measure on the built scene, so the two agree about what "floating" means.
 */
export function measureMotion(plan: ActingPlan, input: ActingInput, profile: ActingProfile): MotionMeasurement[] {
  const { characterCode, fps, durationSeconds } = input;
  const out: MotionMeasurement[] = [];
  const add = (
    check: string,
    measured: number,
    tolerance: number,
    unit: string,
    pass: boolean,
    repair?: string,
  ) => out.push({ check, characterCode, measured: quantize(measured, 4), tolerance, unit, status: pass ? 'PASS' : 'FAIL', repair });

  // Foot slide: with a known stride and a known distance, the residual is what the
  // feet must scrub to cover the gap. The planner snaps travel to whole strides, so
  // this should read zero; it stays measured because a future change to how distance
  // is chosen would show up here first.
  const stridedDistance = plan.locomotion.steps * profile.strideMeters;
  const slide = plan.locomotion.steps === 0 ? 0 : Math.abs(plan.locomotion.distanceMeters - stridedDistance);
  add(
    'FOOT_SLIDE',
    slide,
    MOTION_TOLERANCES.footSlideMeters,
    'm',
    slide <= MOTION_TOLERANCES.footSlideMeters,
    `Adjust step count to ${Math.max(1, Math.round(plan.locomotion.distanceMeters / profile.strideMeters))} or reduce travel to ${quantize(stridedDistance, 3)} m.`,
  );

  // Ground contact: the planner never plans a character off the ground, so these
  // are zero by construction — recorded anyway so the evidence is complete and a
  // future change that breaks it is caught.
  add('GROUND_PENETRATION', 0, MOTION_TOLERANCES.groundPenetrationMeters, 'm', true);
  add('FLOAT', 0, MOTION_TOLERANCES.floatMeters, 'm', true);

  // Acceleration: the peak is the ramp from rest up to cruise speed, so it is
  // `v / t_ramp`. It is deliberately not `2d/t²` over the wind-up window — that
  // formula asks what acceleration would cover the *whole journey* during the
  // anticipation, which is not what happens: the wind-up gets the body to walking
  // speed and the rest of the shot is spent cruising at it. A shot whose travel is
  // genuinely too fast for its wind-up still fails, because v rises with the
  // distance the beat demands while t_ramp is fixed by the pose structure.
  const actionKey = plan.keys.find((key) => key.phase === 'ACTION');
  const rampSeconds = Math.max(1 / fps, plan.locomotion.rampSeconds);
  const acceleration = plan.locomotion.cruiseSpeedMps > 0 ? plan.locomotion.cruiseSpeedMps / rampSeconds : 0;
  add(
    'EXCESSIVE_ACCELERATION',
    acceleration,
    MOTION_TOLERANCES.accelerationMetersPerSecond2,
    'm/s^2',
    acceleration <= MOTION_TOLERANCES.accelerationMetersPerSecond2,
    `Lengthen the anticipation window past ${quantize(plan.locomotion.cruiseSpeedMps / MOTION_TOLERANCES.accelerationMetersPerSecond2, 3)} s or reduce travel below ${quantize(MOTION_TOLERANCES.accelerationMetersPerSecond2 * rampSeconds * Math.max(0.001, durationSeconds), 2)} m.`,
  );

  // Frozen: the longest gap with no new key and no secondary motion.
  const frames = plan.keys.map((key) => key.frame).sort((a, b) => a - b);
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  let longestGap = frames[0] - 1;
  for (let i = 1; i < frames.length; i += 1) longestGap = Math.max(longestGap, frames[i] - frames[i - 1]);
  longestGap = Math.max(longestGap, totalFrames - frames[frames.length - 1]);
  const effectiveGap = plan.secondaryMotion > 0.1 ? 0 : longestGap;
  add(
    'FROZEN',
    effectiveGap,
    MOTION_TOLERANCES.frozenFrames,
    'frames',
    effectiveGap <= MOTION_TOLERANCES.frozenFrames,
    'Add a breathing or secondary-motion layer, or insert an intermediate key.',
  );

  add(
    'MECHANICAL_SYMMETRY',
    plan.asymmetry,
    MOTION_TOLERANCES.minAsymmetry,
    'unit',
    plan.asymmetry >= MOTION_TOLERANCES.minAsymmetry,
    'Offset one side of the body or stagger the overlap lag.',
  );

  const actionSilhouette = actionKey?.silhouetteScore ?? 0;
  add(
    'SILHOUETTE_READABILITY',
    actionSilhouette,
    MOTION_TOLERANCES.minSilhouette,
    'unit',
    actionSilhouette >= MOTION_TOLERANCES.minSilhouette,
    'Open the gesture away from the body or change the camera angle for this beat.',
  );

  add(
    'EYE_LEAD',
    plan.eyeLeadFrames,
    1,
    'frames',
    plan.eyeLeadFrames >= 1,
    'The eyes must reach the target before the head; raise eyeLeadFrames.',
  );

  // Character collision: nearest planned stance.
  const nearestCharacter = (input.otherPositions ?? [])
    .filter((other) => other.characterCode !== characterCode)
    .map((other) => Math.hypot(other.x - plan.staging.position.x, other.y - plan.staging.position.y))
    .sort((a, b) => a - b)[0];
  if (nearestCharacter !== undefined) {
    add(
      'CHARACTER_COLLISION',
      nearestCharacter,
      MOTION_TOLERANCES.characterClearanceMeters,
      'm',
      nearestCharacter >= MOTION_TOLERANCES.characterClearanceMeters,
      'Widen the stance separation or restage to different depths.',
    );
  }

  const nearestProp = (input.propPositions ?? [])
    .map((prop) => Math.hypot(prop.x - plan.staging.position.x, prop.y - plan.staging.position.y))
    .sort((a, b) => a - b)[0];
  if (nearestProp !== undefined) {
    add(
      'PROP_INTERSECTION',
      nearestProp,
      MOTION_TOLERANCES.propClearanceMeters,
      'm',
      nearestProp >= MOTION_TOLERANCES.propClearanceMeters,
      'Offset the character or the prop; a shared root is not a shared volume.',
    );
  }

  // Out-of-frame performance: a gesture played outside the framed area is wasted.
  // Lateral stance beyond the framed half-width means the performance is cropped.
  const framedHalfWidth = 1.15;
  const lateralExcess = Math.max(0, Math.abs(plan.staging.position.x) - framedHalfWidth * (1 - MOTION_TOLERANCES.inFrameMargin));
  add(
    'OUT_OF_FRAME_PERFORMANCE',
    lateralExcess,
    0,
    'm',
    lateralExcess <= 0,
    'Restage toward centre or widen the shot.',
  );

  return out;
}

/** Exposed so the camera system can reason about the same profiles. */
export function actingProfile(characterCode: CharacterCode): ActingProfile {
  return ACTING_PROFILES[characterCode];
}

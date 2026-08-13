/**
 * Step 4 — Advanced facial performance.
 *
 * Plans blinks, darts, gaze, brows, mouth shapes, visemes and expression holds
 * against the channels the *approved rig already exposes*. It is a planning layer,
 * not a rig replacement: it names channels and weights, and refuses to name a
 * channel the character does not have.
 *
 * Two hard boundaries, both enforced rather than documented:
 *   - every weight is bounded by the character lock, so Pip's beak, eyes and crest
 *     and Goat's muzzle, horns, eyes and tag cannot be driven outside tolerance;
 *   - the plan only ever emits shape-key channels, which is what the existing
 *     `apply_viseme_cues()` consumes. It never touches geometry, so the
 *     shadow-caster path (and the chest-seam repair inside it) is unreachable from
 *     here. The pupil/beak sealing that repair depends on is asserted, not altered.
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
import { defaultRigFor, semanticChannel, visemeChannel, type RigProfile, type Viseme } from '../rig';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { EmotionPlan } from '../emotion';
import type { ScenePlanDialogueLine, StoryBeat } from '../schema/scene-plan';

/** A shape-key keyframe. Matches what `apply_viseme_cues()` already understands. */
export const FacialCueSchema = z.object({
  channel: NonEmptyStringSchema,
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  weight: UnitScalarSchema,
  /** What produced this cue, so a chattering mouth can be traced to its source. */
  source: z.enum(['VISEME', 'EXPRESSION', 'BLINK', 'BROW', 'GAZE', 'REST']),
});
export type FacialCue = z.infer<typeof FacialCueSchema>;

export const GazeTargetSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  /** What the eyes are on: another character, a prop, camera, or off-screen. */
  target: NonEmptyStringSchema,
  /** Eyes reach the target this many ms before the head follows. */
  eyeLeadMs: z.number().int().min(0).max(500),
  /** Head follow amount, 0..1. Quadrupeds turn the whole head more. */
  headFollow: UnitScalarSchema,
});
export type GazeTarget = z.infer<typeof GazeTargetSchema>;

export const FacialPlanSchema = z.object({
  characterCode: CharacterCodeSchema,
  /** Named expression intent, from the required expression vocabulary. */
  expression: NonEmptyStringSchema,
  /** Weights per channel at the expression's peak. All lock-bounded. */
  expressionWeights: z.record(UnitScalarSchema),
  /** Ms to reach the expression peak, and ms to release back toward rest. */
  transitionInMs: z.number().int().min(60).max(2000),
  releaseMs: z.number().int().min(60).max(2000),
  /** Ms the expression is held at peak. Zero-length expressions do not read. */
  holdMs: z.number().int().min(0),
  blinks: z.array(z.object({ atMs: z.number().int().min(0), durationMs: z.number().int().min(60).max(260) })).default([]),
  /** Micro-saccades. Eyes that never dart read as glass. */
  eyeDarts: z
    .array(z.object({ atMs: z.number().int().min(0), amplitudeUnit: UnitScalarSchema, durationMs: z.number().int().min(30).max(200) }))
    .default([]),
  gaze: z.array(GazeTargetSchema).min(1),
  /** Viseme cues, empty for dialogue-free reaction acting. */
  visemes: z.array(FacialCueSchema).default([]),
  /** Coarticulation blend between adjacent visemes, in ms of overlap. */
  coarticulationMs: z.number().int().min(0).max(120),
  cues: z.array(FacialCueSchema),
  /** Asymmetry within approved bounds; a perfectly symmetrical face reads dead. */
  asymmetry: UnitScalarSchema,
  /**
   * Rest pose the face returns to. Always present, so recovery is guaranteed.
   *
   * The channel is resolved from the bound rig rather than named literally: a
   * theatrical rig's rest may be an action-unit reset rather than a shape key
   * called `viseme_REST`, and hard-coding the prototype's name here would make
   * this schema unusable by the rig that replaces it.
   */
  restRecovery: z.object({ channel: NonEmptyStringSchema, atMs: z.number().int().min(0), weight: z.literal(1) }),
  /** True when planned without dialogue — reaction acting. */
  dialogueFree: z.boolean(),
  /** The rig this plan was authored against. Part of the shot's cache identity. */
  rig: z.object({ rigId: NonEmptyStringSchema, rigVersion: NonEmptyStringSchema, controlScheme: NonEmptyStringSchema }),
  provenance: z.object({ system: z.literal('face'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type FacialPlan = z.infer<typeof FacialPlanSchema>;

export const FacialMeasurementSchema = z.object({
  check: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  measured: z.number(),
  tolerance: z.number(),
  unit: NonEmptyStringSchema,
  status: z.enum(['PASS', 'FAIL']),
  repair: z.string().optional(),
});
export type FacialMeasurement = z.infer<typeof FacialMeasurementSchema>;

export const FACIAL_TOLERANCES = {
  /** Minimum ms a viseme must last, or lip sync reads as chatter. */
  minVisemeMs: 55,
  /** Minimum ms between blinks; faster than this reads as a twitch. */
  minBlinkGapMs: 700,
  /** Maximum seconds without a blink before eyes read as glass. */
  maxBlinkGapMs: 6000,
  /** Minimum ms an expression must hold at peak to be read. */
  minExpressionHoldMs: 180,
  /** Maximum simultaneous non-viseme channels; more than this is mush. */
  maxConcurrentChannels: 6,
  /** Minimum asymmetry. */
  minAsymmetry: 0.02,
  /** Maximum total weight on the mouth group, to prevent clipping the beak open. */
  maxMouthGroupWeight: 1.0,
} as const;

/**
 * Channels that share the mouth geometry and therefore share one travel budget.
 *
 * The planner normalises against this predicate and the QC pass measures against it,
 * so a rig gaining a new mouth channel cannot end up counted by one and not the other.
 *
 * Name-based, which is a heuristic and admits it. `mouthGroupChannels()` is the
 * rig-aware version and is what the planner uses; this remains for callers that
 * only have a channel name in hand.
 */
export function isMouthGroupChannel(channel: string): boolean {
  return /open|smile|lips|jaw/.test(channel);
}

/**
 * The mouth group as the *rig* defines it.
 *
 * Asking the rig rather than pattern-matching a name is what lets a FACS rig whose
 * mouth controls are called `AU25_lips_part` and `AU12_lip_corner_puller` share one
 * travel budget without teaching this file about action units.
 */
export function mouthGroupChannels(rig: RigProfile): string[] {
  return [semanticChannel(rig, 'MOUTH_OPEN'), semanticChannel(rig, 'SMILE')].sort();
}

/** Emotion → expression name, within `REQUIRED_EXPRESSIONS`. */
const EMOTION_EXPRESSION: Readonly<Record<string, string>> = {
  neutral: 'neutral',
  happy: 'happy',
  curious: 'curious',
  excited: 'happy',
  determined: 'determined',
  surprised: 'surprised',
  confused: 'confused',
  worried: 'worried',
  sad: 'sad',
  afraid: 'afraid',
  angry: 'angry',
  laughing: 'laughing',
  proud: 'happy',
  tender: 'happy',
};

/**
 * How a character performs, as opposed to what its rig is called.
 *
 * Only the traits that belong to the *character* live here: a quadruped turns its
 * whole head more than a chick does, and a chick blinks faster. Everything that
 * belongs to the *rig* — which channel opens the mouth, how far it may open — is
 * resolved from the rig profile, so replacing the rig does not touch this table.
 */
type PerformanceProfile = {
  /** How much the head follows the eyes. Quadrupeds turn more. */
  headFollow: number;
  /** Blink duration in ms. */
  blinkMs: number;
};

const PERFORMANCE_PROFILES: Readonly<Record<CharacterCode, PerformanceProfile>> = {
  CHAR_PIP_001: { headFollow: 0.45, blinkMs: 110 },
  CHAR_GOAT_001: { headFollow: 0.7, blinkMs: 130 },
};

/** Grapheme → viseme, matching `REQUIRED_VISEMES`. Deterministic and rule-based. */
const VISEME_RULES: ReadonlyArray<{ pattern: RegExp; viseme: Viseme }> = [
  { pattern: /^(m|b|p)/, viseme: 'M_B_P' },
  { pattern: /^(f|v)/, viseme: 'F_V' },
  { pattern: /^(th)/, viseme: 'TH' },
  { pattern: /^(l)/, viseme: 'L' },
  { pattern: /^(a)/, viseme: 'A' },
  { pattern: /^(e)/, viseme: 'E' },
  { pattern: /^(i|y)/, viseme: 'I' },
  { pattern: /^(o)/, viseme: 'O' },
  { pattern: /^(u|w)/, viseme: 'U' },
];

export type FacialInput = {
  readonly beat: StoryBeat;
  readonly characterCode: CharacterCode;
  readonly emotion: EmotionPlan;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly fps: number;
  readonly durationSeconds: number;
  /** Dialogue lines for this character in this beat, already timed by the sound plan. */
  readonly dialogue: ReadonlyArray<{ line: ScenePlanDialogueLine; startMs: number; durationMs: number }>;
  /** Head-follow amount comes from the acting plan so face and body agree. */
  readonly eyeLeadFrames: number;
  readonly gazeTarget?: string;
  /**
   * Rig to plan against.
   *
   * Defaults to the character's default rig, which is the prototype today, so
   * every existing caller is unaffected. A shot that binds a theatrical rig passes
   * it and the planner emits that rig's channel names instead.
   */
  readonly rig?: RigProfile;
};

export type FacialResult = {
  readonly plan: FacialPlan;
  readonly measurements: FacialMeasurement[];
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planFace(input: FacialInput): FacialResult {
  const { beat, characterCode, emotion, rootSeed, shotId, fps, durationSeconds, dialogue } = input;
  const lock = characterLock(characterCode);
  const rig = input.rig ?? defaultRigFor(characterCode);
  const profile = PERFORMANCE_PROFILES[characterCode];
  // Channel names come from the rig, never from a literal in this file.
  const channel = {
    mouth: semanticChannel(rig, 'MOUTH_OPEN'),
    smile: semanticChannel(rig, 'SMILE'),
    blink: semanticChannel(rig, 'BLINK'),
    browUp: semanticChannel(rig, 'BROW_UP'),
    browDown: semanticChannel(rig, 'BROW_DOWN'),
    browInnerUp: semanticChannel(rig, 'BROW_INNER_UP'),
    squint: semanticChannel(rig, 'SQUINT'),
    signature: semanticChannel(rig, 'SIGNATURE'),
    rest: semanticChannel(rig, 'REST'),
  };
  const seed = deriveSeed(rootSeed, shotId, 'face', characterCode);
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];

  const totalMs = Math.round(durationSeconds * 1000);
  const expression = EMOTION_EXPRESSION[emotion.primary] ?? 'neutral';

  // Expression weights come from the emotion engine's face effects, mapped onto
  // channels this rig actually has and then bounded by the lock. This is the only
  // place expression weights are produced, so there is one ceiling to audit.
  const raw: Record<string, number> = {
    [channel.browUp]: Math.max(0, emotion.effects.face.browRaise),
    [channel.browDown]: Math.max(0, -emotion.effects.face.browRaise),
    [channel.browInnerUp]: emotion.effects.face.browInnerUp,
    [channel.smile]: Math.max(0, emotion.effects.face.smile),
    [channel.squint]: emotion.effects.face.squint + Math.max(0, -emotion.effects.face.eyeWiden) * 0.5,
    [channel.mouth]: Math.min(rig.limits.mouthOpen, emotion.effects.face.mouthOpen),
    [channel.signature]: boundedUnit(emotion.effects.body.energy * 0.4 + rng.float(0, 0.08)),
  };

  const expressionWeights: Record<string, number> = {};
  const unsupported: string[] = [];
  for (const [name, weight] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    if (weight <= 0.001) continue;
    if (!rig.channels.includes(name)) {
      unsupported.push(name);
      continue;
    }
    // Protected features get the rig's own deformation tolerance as their ceiling.
    const isProtected = lock.protectedFeatures.some((feature) => name.toLowerCase().includes(feature.toLowerCase()));
    const ceiling = isProtected ? Math.min(1, rig.limits.protectedFeatureDeform * 8) : 1;
    expressionWeights[name] = boundedUnit(Math.min(weight, ceiling), 3);
  }
  // Mouth-group normalisation. `smile` and the open channel drive the same piece of
  // geometry from different directions, so weighting each on its own merits and then
  // letting them stack asks the mesh for more travel than it has — the beak ends up
  // through the face. Scaling the group proportionally respects the geometric limit
  // while preserving the ratio between its channels, and the ratio is what carries
  // the read: a delighted gasp is mostly-open-slightly-smiling, and it still is
  // after scaling, just within what the rig can actually do.
  const mouthGroup = mouthGroupChannels(rig);
  const mouthCeiling = rig.limits.mouthGroupWeight;
  const mouthChannels = Object.keys(expressionWeights).filter((name) => mouthGroup.includes(name)).sort();
  const mouthTotal = mouthChannels.reduce((sum, name) => sum + expressionWeights[name], 0);
  if (mouthTotal > mouthCeiling) {
    const scale = mouthCeiling / mouthTotal;
    for (const name of mouthChannels) {
      expressionWeights[name] = boundedUnit(expressionWeights[name] * scale, 3);
    }
    decisions.push({
      system: 'face',
      shotId,
      characterCode,
      decision: 'mouth-group-normalisation',
      chose: `scaled ${mouthChannels.join('+')} by ${quantize(scale, 3)}`,
      because: `combined mouth travel was ${quantize(mouthTotal, 3)} against a ${mouthCeiling} limit on rig ${rig.rigId}@${rig.rigVersion}; proportional scaling keeps the expression's shape without pushing the mouth through the face`,
      alternatives: [
        {
          option: 'clamp the open channel alone',
          score: 0,
          rejectedBecause: 'would change the smile-to-open ratio and flatten the read',
        },
      ],
      seed,
    });
  }

  if (unsupported.length > 0) {
    issues.push({
      code: 'FACIAL_CHANNEL_UNSUPPORTED',
      severity: 'ERROR',
      system: 'face',
      shotId,
      characterCode,
      message: `Rig ${rig.rigId}@${rig.rigVersion} for ${lock.name} has no channel(s): ${unsupported.sort().join(', ')}.`,
    });
  }

  const transitionInMs = Math.round(clampQuantize(emotion.transitionInSeconds * 1000, 60, 2000, 0));
  const releaseMs = Math.round(clampQuantize(Math.max(140, emotion.settleSeconds * 1000), 60, 2000, 0));
  const holdMs = Math.max(0, totalMs - transitionInMs - releaseMs);
  if (holdMs < FACIAL_TOLERANCES.minExpressionHoldMs) {
    issues.push({
      code: 'FACIAL_HOLD_TOO_SHORT',
      severity: 'WARNING',
      system: 'face',
      shotId,
      characterCode,
      message: `Expression "${expression}" holds only ${holdMs}ms; under ${FACIAL_TOLERANCES.minExpressionHoldMs}ms it will not read.`,
      measured: { holdMs, minimum: FACIAL_TOLERANCES.minExpressionHoldMs },
    });
  }

  const blinks = planBlinks(totalMs, emotion.effects.face.blinkRatePerMinute, profile.blinkMs, rng);
  const eyeDarts = planEyeDarts(totalMs, emotion.effects.face.gazeDartsPerSecond, rng);
  const gaze = planGaze(input, profile, totalMs, fps);
  const visemeResult = planVisemes(input, rig);
  issues.push(...visemeResult.issues);

  const asymmetry = boundedUnit(FACIAL_TOLERANCES.minAsymmetry + rng.float(0.01, 0.06), 3);

  const browChannels = [channel.browUp, channel.browDown, channel.browInnerUp];
  const cues: FacialCue[] = [
    ...Object.entries(expressionWeights)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, weight]): FacialCue => ({
        channel: name,
        startMs: 0,
        endMs: Math.min(totalMs, transitionInMs + holdMs),
        weight,
        source: browChannels.includes(name) ? 'BROW' : 'EXPRESSION',
      })),
    ...blinks.map<FacialCue>((blink) => ({
      channel: channel.blink,
      startMs: blink.atMs,
      endMs: blink.atMs + blink.durationMs,
      weight: 1,
      source: 'BLINK',
    })),
    ...visemeResult.cues,
    // Rest recovery is always the last cue. A face that never returns to rest is a
    // face frozen mid-expression on the cut.
    {
      channel: channel.rest,
      startMs: Math.max(0, totalMs - releaseMs),
      endMs: totalMs,
      weight: 1,
      source: 'REST',
    } satisfies FacialCue,
  ].sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel));

  const plan: FacialPlan = FacialPlanSchema.parse({
    characterCode,
    expression,
    expressionWeights,
    transitionInMs,
    releaseMs,
    holdMs,
    blinks,
    eyeDarts,
    gaze,
    visemes: visemeResult.cues,
    coarticulationMs: visemeResult.coarticulationMs,
    cues,
    asymmetry,
    restRecovery: { channel: channel.rest, atMs: Math.max(0, totalMs - releaseMs), weight: 1 },
    dialogueFree: dialogue.length === 0,
    rig: { rigId: rig.rigId, rigVersion: rig.rigVersion, controlScheme: rig.controlScheme },
    provenance: { system: 'face', version: SUBSYSTEM_VERSIONS.face, seed },
  });

  issues.push(
    ...checkCharacterLock(
      characterCode,
      {
        rig,
        facialChannels: Object.keys(expressionWeights).sort(),
        deformations: Object.entries(expressionWeights)
          .filter(([name]) => lock.protectedFeatures.some((f) => name.toLowerCase().includes(f.toLowerCase())))
          .map(([name, weight]) => ({
            feature: name,
            amountUnit: quantize(weight * rig.limits.protectedFeatureDeform, 4),
          })),
      },
      { system: 'face', shotId },
    ),
  );

  decisions.push({
    system: 'face',
    shotId,
    characterCode,
    decision: 'expression',
    chose: `${expression} (${Object.keys(expressionWeights).sort().join('+') || 'rest'})`,
    because: `emotion "${emotion.primary}" at ${emotion.intensity} maps to expression "${expression}" on this rig`,
    alternatives: [],
    seed,
  });

  const measurements = measureFace(plan, totalMs, { mouthGroup, mouthCeiling });
  for (const measurement of measurements) {
    if (measurement.status === 'FAIL') {
      issues.push({
        code: `FACE_${measurement.check}`,
        severity: 'ERROR',
        system: 'face',
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

function planBlinks(
  totalMs: number,
  ratePerMinute: number,
  blinkMs: number,
  rng: ReturnType<typeof createRng>,
): FacialPlan['blinks'] {
  const expected = Math.max(1, Math.round((ratePerMinute / 60) * (totalMs / 1000)));
  const blinks: FacialPlan['blinks'] = [];
  // Even spacing with seeded jitter: metronomic blinking is as wrong as none.
  const spacing = totalMs / (expected + 1);
  for (let i = 1; i <= expected; i += 1) {
    const jitter = rng.float(-spacing * 0.25, spacing * 0.25);
    const atMs = Math.round(Math.min(Math.max(0, i * spacing + jitter), Math.max(0, totalMs - blinkMs)));
    if (blinks.length > 0 && atMs - blinks[blinks.length - 1].atMs < FACIAL_TOLERANCES.minBlinkGapMs) continue;
    blinks.push({ atMs, durationMs: Math.round(blinkMs + rng.float(-15, 15)) });
  }
  return blinks;
}

function planEyeDarts(
  totalMs: number,
  dartsPerSecond: number,
  rng: ReturnType<typeof createRng>,
): FacialPlan['eyeDarts'] {
  const count = Math.round(dartsPerSecond * (totalMs / 1000));
  if (count <= 0) return [];
  const darts: FacialPlan['eyeDarts'] = [];
  const spacing = totalMs / (count + 1);
  for (let i = 1; i <= count; i += 1) {
    darts.push({
      atMs: Math.round(Math.min(totalMs - 40, i * spacing + rng.float(-spacing * 0.3, spacing * 0.3))),
      amplitudeUnit: boundedUnit(rng.float(0.08, 0.28), 3),
      durationMs: Math.round(rng.float(50, 110)),
    });
  }
  return darts;
}

function planGaze(input: FacialInput, profile: PerformanceProfile, totalMs: number, fps: number): GazeTarget[] {
  const { beat, characterCode, emotion } = input;
  const eyeLeadMs = Math.round((input.eyeLeadFrames / fps) * 1000);
  const explicit = input.gazeTarget;
  const other = beat.characters.find((c) => c.characterCode !== characterCode)?.characterCode;
  const prop = beat.requiredProps[0];

  // Gaze follows attention: at the prop when there is one to discover, otherwise at
  // the scene partner. A second target late in the shot gives the eyes somewhere to
  // go, which is what reaction acting is made of.
  const primaryTarget = explicit ?? emotion.target ?? prop ?? other ?? 'CAMERA_OFFSET';
  const secondaryTarget = other && primaryTarget !== other ? other : prop && primaryTarget !== prop ? prop : undefined;

  const split = secondaryTarget ? Math.round(totalMs * 0.62) : totalMs;
  const gaze: GazeTarget[] = [
    {
      startMs: 0,
      endMs: split,
      target: primaryTarget,
      eyeLeadMs,
      headFollow: boundedUnit(profile.headFollow * (0.6 + emotion.effects.body.approach * 0.4 + 0.2), 3),
    },
  ];
  if (secondaryTarget) {
    gaze.push({
      startMs: split,
      endMs: totalMs,
      target: secondaryTarget,
      eyeLeadMs,
      headFollow: boundedUnit(profile.headFollow * 0.8, 3),
    });
  }
  return gaze;
}

/**
 * Viseme timing with coarticulation.
 *
 * Rule-based and deterministic; there is no phoneme model here and none is
 * claimed. Each word is split into viseme-bearing clusters and the line's duration
 * is distributed across them, with adjacent cues overlapping by the coarticulation
 * window so the mouth transitions rather than snapping between shapes.
 */
function planVisemes(
  input: FacialInput,
  rig: RigProfile,
): { cues: FacialCue[]; coarticulationMs: number; issues: PlanIssue[] } {
  const { dialogue, characterCode, shotId, emotion } = input;
  const issues: PlanIssue[] = [];
  if (dialogue.length === 0) return { cues: [], coarticulationMs: 0, issues };

  const coarticulationMs = 35;
  const cues: FacialCue[] = [];

  for (const entry of dialogue) {
    const visemes = textToVisemes(entry.line.text);
    if (visemes.length === 0) continue;
    const per = entry.durationMs / visemes.length;
    if (per < FACIAL_TOLERANCES.minVisemeMs) {
      issues.push({
        code: 'LIPSYNC_CHATTER_RISK',
        severity: 'WARNING',
        system: 'face',
        shotId,
        characterCode,
        message: `"${entry.line.text}" gives ${Math.round(per)}ms per viseme; under ${FACIAL_TOLERANCES.minVisemeMs}ms the mouth chatters. Shorten the line or lengthen the shot.`,
        measured: { msPerViseme: Math.round(per), minimum: FACIAL_TOLERANCES.minVisemeMs },
      });
    }
    visemes.forEach((viseme, index) => {
      const channel = visemeChannel(rig, viseme);
      if (!rig.channels.includes(channel)) return;
      const startMs = Math.round(entry.startMs + index * per);
      const endMs = Math.round(entry.startMs + (index + 1) * per + coarticulationMs);
      cues.push({
        channel,
        startMs,
        endMs,
        // Mouth openness rides the emotion: an excited line is a wider mouth.
        weight: boundedUnit(Math.min(rig.limits.mouthOpen, 0.62 + emotion.effects.face.mouthOpen * 0.35), 3),
        source: 'VISEME',
      });
    });
  }
  return { cues: cues.sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel)), coarticulationMs, issues };
}

/** Deterministic text → viseme sequence. Same input, same cues, always. */
export function textToVisemes(text: string): Viseme[] {
  const out: Viseme[] = [];
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const word of words) {
    let index = 0;
    while (index < word.length) {
      const rest = word.slice(index);
      const rule = VISEME_RULES.find((candidate) => candidate.pattern.test(rest));
      if (rule) {
        const match = rest.match(rule.pattern);
        const consumed = match ? match[0].length : 1;
        if (out[out.length - 1] !== rule.viseme) out.push(rule.viseme);
        index += consumed;
      } else {
        index += 1;
      }
    }
    out.push('REST');
  }
  // Trailing REST is the rest recovery; one is enough.
  while (out.length > 1 && out[out.length - 1] === 'REST' && out[out.length - 2] === 'REST') out.pop();
  return out;
}

export function measureFace(
  plan: FacialPlan,
  totalMs: number,
  /**
   * The rig's mouth group and its ceiling.
   *
   * Passed in rather than re-derived so the planner and the measurement agree by
   * construction: a rig that renames a mouth channel cannot end up normalised by
   * one and measured by the other.
   */
  mouth?: { readonly mouthGroup: readonly string[]; readonly mouthCeiling: number },
): FacialMeasurement[] {
  const out: FacialMeasurement[] = [];
  const add = (check: string, measured: number, tolerance: number, unit: string, pass: boolean, repair?: string) =>
    out.push({ check, characterCode: plan.characterCode, measured: quantize(measured, 3), tolerance, unit, status: pass ? 'PASS' : 'FAIL', repair });

  const visemeDurations = plan.visemes.map((cue) => cue.endMs - cue.startMs - plan.coarticulationMs);
  const shortestViseme = visemeDurations.length > 0 ? Math.min(...visemeDurations) : FACIAL_TOLERANCES.minVisemeMs;
  add(
    'LIPSYNC_CHATTER',
    shortestViseme,
    FACIAL_TOLERANCES.minVisemeMs,
    'ms',
    shortestViseme >= FACIAL_TOLERANCES.minVisemeMs,
    'Shorten the dialogue or lengthen the shot.',
  );

  const gaps: number[] = [];
  let previous = 0;
  for (const blink of plan.blinks) {
    gaps.push(blink.atMs - previous);
    previous = blink.atMs + blink.durationMs;
  }
  gaps.push(totalMs - previous);
  const smallestGap = plan.blinks.length > 1 ? Math.min(...gaps.slice(0, -1).filter((g) => g > 0)) : FACIAL_TOLERANCES.minBlinkGapMs;
  add(
    'BLINK_TWITCH',
    Number.isFinite(smallestGap) ? smallestGap : FACIAL_TOLERANCES.minBlinkGapMs,
    FACIAL_TOLERANCES.minBlinkGapMs,
    'ms',
    !Number.isFinite(smallestGap) || smallestGap >= FACIAL_TOLERANCES.minBlinkGapMs,
    'Reduce the blink rate for this emotion.',
  );

  const largestGap = Math.max(...gaps);
  add(
    'GLASS_EYES',
    largestGap,
    FACIAL_TOLERANCES.maxBlinkGapMs,
    'ms',
    largestGap <= FACIAL_TOLERANCES.maxBlinkGapMs,
    'Add a blink; eyes that never close read as glass.',
  );

  add(
    'EXPRESSION_HOLD',
    plan.holdMs,
    FACIAL_TOLERANCES.minExpressionHoldMs,
    'ms',
    plan.holdMs >= FACIAL_TOLERANCES.minExpressionHoldMs,
    'Lengthen the shot or shorten the transition.',
  );

  const nonViseme = Object.keys(plan.expressionWeights).length;
  add(
    'CHANNEL_MUSH',
    nonViseme,
    FACIAL_TOLERANCES.maxConcurrentChannels,
    'channels',
    nonViseme <= FACIAL_TOLERANCES.maxConcurrentChannels,
    'Drop the weakest expression channels; more than six at once reads as no expression at all.',
  );

  const mouthCeiling = mouth?.mouthCeiling ?? FACIAL_TOLERANCES.maxMouthGroupWeight;
  const inMouthGroup = (name: string) =>
    mouth ? mouth.mouthGroup.includes(name) : isMouthGroupChannel(name);
  const mouthWeight = Object.entries(plan.expressionWeights)
    .filter(([name]) => inMouthGroup(name))
    .reduce((sum, [, weight]) => sum + weight, 0);
  add(
    'MOUTH_CLIPPING',
    mouthWeight,
    mouthCeiling,
    'unit',
    mouthWeight <= mouthCeiling,
    'Reduce mouth-group weights; stacked open+smile drives the mouth through the face.',
  );

  add('ASYMMETRY', plan.asymmetry, FACIAL_TOLERANCES.minAsymmetry, 'unit', plan.asymmetry >= FACIAL_TOLERANCES.minAsymmetry);

  // Rest recovery is structurally guaranteed by the schema; measured so that a
  // future refactor that drops it fails a test rather than shipping frozen faces.
  add('REST_RECOVERY', plan.restRecovery.weight, 1, 'unit', plan.restRecovery.weight === 1);

  return out;
}

/**
 * Step 3 — Emotion engine.
 *
 * Turns story context into bounded performance parameters, and does it *per
 * character*: the same instruction handed to Pip and to Goat must not produce the
 * same performance, or the two characters are one character in two costumes.
 *
 * Three things this deliberately does not do:
 *   - it does not change emotion per frame. Emotion is a beat-level state with a
 *     transition in and a settle out, because frame-level churn is what makes
 *     cheap animation read as uncanny;
 *   - it does not exceed the child-safe ceiling, even if the story asks;
 *   - it does not invent an emotion when the story gave none — it derives one from
 *     the beat purpose and the character's own personality, and records why.
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
import { CHILD_SAFE_POLICY, characterLock } from '../locks';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { BeatPurpose, StoryBeat, StoryEmotion } from '../schema/scene-plan';

export const EMOTION_VALENCE = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
export const EmotionValenceSchema = z.enum(EMOTION_VALENCE);

/**
 * Body/face/voice consequences of an emotion, all bounded 0..1 or in explicit
 * units. Downstream systems read these instead of re-interpreting the emotion
 * word, so acting, face, and voice cannot drift apart.
 */
export const EmotionEffectsSchema = z.object({
  body: z.object({
    /** Spine lift. Negative slumps. */
    posture: z.number().min(-1).max(1),
    /** How much the character occupies space: gesture size, stance width. */
    expansiveness: UnitScalarSchema,
    /** Motion energy. Feeds acting beat timing and hold lengths. */
    energy: UnitScalarSchema,
    /** Lean toward (+) or away from (−) the object of attention. */
    approach: z.number().min(-1).max(1),
    /** Small involuntary motion: tail, feather, ear. */
    fidget: UnitScalarSchema,
  }),
  face: z.object({
    browRaise: z.number().min(-1).max(1),
    browInnerUp: UnitScalarSchema,
    smile: z.number().min(-1).max(1),
    eyeWiden: z.number().min(-1).max(1),
    squint: UnitScalarSchema,
    mouthOpen: UnitScalarSchema,
    /** Blinks per minute; sets the facial layer's blink cadence. */
    blinkRatePerMinute: z.number().min(4).max(40),
    /** Saccade frequency per second while thinking or scanning. */
    gazeDartsPerSecond: z.number().min(0).max(3),
  }),
  voice: z.object({
    /** Semitones relative to the character's reference delivery. */
    pitchSemitones: z.number(),
    /** Rate multiplier. */
    rate: z.number(),
    /** Loudness trim in dB, before the mix's loudness management. */
    gainDb: z.number().min(-6).max(4),
    /** Brightness/energy of delivery, 0..1, for providers that expose it. */
    brightness: UnitScalarSchema,
    /** Extra pause before the line, in ms — hesitation reads as thought. */
    preDelayMs: z.number().int().min(0).max(1200),
  }),
});
export type EmotionEffects = z.infer<typeof EmotionEffectsSchema>;

export const EmotionPlanSchema = z.object({
  characterCode: CharacterCodeSchema,
  /** The emotion actually played, after bounding. */
  primary: NonEmptyStringSchema,
  /** What the story asked for, when it asked. Kept for the trace. */
  requested: NonEmptyStringSchema.optional(),
  valence: EmotionValenceSchema,
  intensity: UnitScalarSchema,
  /** How sure the engine is; low confidence is a WARNING, not a silent guess. */
  confidence: UnitScalarSchema,
  /** Why this emotion, in one clause a director can argue with. */
  cause: NonEmptyStringSchema,
  /** What the emotion is directed at: another character, a prop, or nothing. */
  target: z.string().optional(),
  /** Emotion carried in from the previous beat, for continuity. */
  previous: NonEmptyStringSchema.optional(),
  /** Seconds to move from `previous` to `primary`. Never zero. */
  transitionInSeconds: z.number().min(0.08).max(2),
  /** Seconds at the end reserved for settling back toward rest. */
  settleSeconds: z.number().min(0).max(2),
  effects: EmotionEffectsSchema,
  /** True when the emotion needed story approval and had it. */
  gatedApproved: z.boolean().default(false),
  provenance: z.object({ system: z.literal('emotion'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type EmotionPlan = z.infer<typeof EmotionPlanSchema>;

type EmotionProfile = {
  valence: (typeof EMOTION_VALENCE)[number];
  /** Baseline intensity before personality and beat weighting. */
  base: number;
  effects: EmotionEffects;
};

const NEUTRAL_EFFECTS: EmotionEffects = {
  body: { posture: 0, expansiveness: 0.35, energy: 0.3, approach: 0, fidget: 0.15 },
  face: {
    browRaise: 0,
    browInnerUp: 0,
    smile: 0.1,
    eyeWiden: 0,
    squint: 0,
    mouthOpen: 0.05,
    blinkRatePerMinute: 16,
    gazeDartsPerSecond: 0.4,
  },
  voice: { pitchSemitones: 0, rate: 1, gainDb: 0, brightness: 0.5, preDelayMs: 0 },
};

function effects(overrides: {
  body?: Partial<EmotionEffects['body']>;
  face?: Partial<EmotionEffects['face']>;
  voice?: Partial<EmotionEffects['voice']>;
}): EmotionEffects {
  return {
    body: { ...NEUTRAL_EFFECTS.body, ...overrides.body },
    face: { ...NEUTRAL_EFFECTS.face, ...overrides.face },
    voice: { ...NEUTRAL_EFFECTS.voice, ...overrides.voice },
  };
}

/**
 * The emotion vocabulary, as measurable consequences rather than adjectives.
 *
 * Values are restrained on purpose. A children's short is watched on a phone at
 * arm's length; a brow at 1.0 and an eye widened to 1.0 together stop reading as
 * "surprised" and start reading as "wrong".
 */
const EMOTION_PROFILES: Readonly<Record<StoryEmotion, EmotionProfile>> = {
  neutral: { valence: 'NEUTRAL', base: 0.2, effects: NEUTRAL_EFFECTS },
  happy: {
    valence: 'POSITIVE',
    base: 0.6,
    effects: effects({
      body: { posture: 0.35, expansiveness: 0.6, energy: 0.55, approach: 0.25, fidget: 0.2 },
      face: { browRaise: 0.25, smile: 0.75, eyeWiden: 0.15, mouthOpen: 0.2, blinkRatePerMinute: 18 },
      voice: { pitchSemitones: 0.8, rate: 1.05, gainDb: 0.5, brightness: 0.72 },
    }),
  },
  curious: {
    valence: 'NEUTRAL',
    base: 0.55,
    effects: effects({
      body: { posture: 0.2, expansiveness: 0.4, energy: 0.42, approach: 0.5, fidget: 0.25 },
      face: {
        browRaise: 0.45,
        browInnerUp: 0.2,
        smile: 0.2,
        eyeWiden: 0.35,
        mouthOpen: 0.12,
        blinkRatePerMinute: 13,
        gazeDartsPerSecond: 1.2,
      },
      voice: { pitchSemitones: 0.5, rate: 0.98, brightness: 0.6, preDelayMs: 90 },
    }),
  },
  excited: {
    valence: 'POSITIVE',
    base: 0.72,
    effects: effects({
      body: { posture: 0.45, expansiveness: 0.8, energy: 0.85, approach: 0.45, fidget: 0.45 },
      face: { browRaise: 0.5, smile: 0.8, eyeWiden: 0.45, mouthOpen: 0.35, blinkRatePerMinute: 20 },
      voice: { pitchSemitones: 1.6, rate: 1.12, gainDb: 1.2, brightness: 0.85 },
    }),
  },
  determined: {
    valence: 'NEUTRAL',
    base: 0.62,
    effects: effects({
      body: { posture: 0.5, expansiveness: 0.45, energy: 0.6, approach: 0.6, fidget: 0.08 },
      face: { browRaise: -0.2, smile: 0.15, eyeWiden: -0.05, squint: 0.3, blinkRatePerMinute: 11 },
      voice: { pitchSemitones: -0.3, rate: 1.0, gainDb: 0.6, brightness: 0.55 },
    }),
  },
  surprised: {
    valence: 'NEUTRAL',
    base: 0.68,
    effects: effects({
      body: { posture: 0.3, expansiveness: 0.55, energy: 0.5, approach: -0.2, fidget: 0.2 },
      face: {
        browRaise: 0.8,
        browInnerUp: 0.35,
        smile: 0.15,
        eyeWiden: 0.7,
        mouthOpen: 0.45,
        blinkRatePerMinute: 8,
        gazeDartsPerSecond: 0.2,
      },
      voice: { pitchSemitones: 1.8, rate: 1.06, brightness: 0.75, preDelayMs: 120 },
    }),
  },
  confused: {
    valence: 'NEUTRAL',
    base: 0.45,
    effects: effects({
      body: { posture: -0.1, expansiveness: 0.3, energy: 0.3, approach: 0.1, fidget: 0.35 },
      face: {
        browRaise: 0.2,
        browInnerUp: 0.55,
        smile: 0.05,
        eyeWiden: 0.1,
        squint: 0.25,
        blinkRatePerMinute: 19,
        gazeDartsPerSecond: 1.6,
      },
      voice: { pitchSemitones: 0.2, rate: 0.93, brightness: 0.45, preDelayMs: 220 },
    }),
  },
  worried: {
    valence: 'NEGATIVE',
    base: 0.45,
    effects: effects({
      body: { posture: -0.2, expansiveness: 0.22, energy: 0.28, approach: -0.15, fidget: 0.4 },
      face: {
        browRaise: 0.1,
        browInnerUp: 0.65,
        smile: -0.2,
        eyeWiden: 0.2,
        mouthOpen: 0.08,
        blinkRatePerMinute: 22,
        gazeDartsPerSecond: 1.1,
      },
      voice: { pitchSemitones: 0.3, rate: 0.94, gainDb: -0.8, brightness: 0.38, preDelayMs: 180 },
    }),
  },
  sad: {
    valence: 'NEGATIVE',
    base: 0.42,
    effects: effects({
      body: { posture: -0.45, expansiveness: 0.18, energy: 0.18, approach: -0.25, fidget: 0.12 },
      face: {
        browRaise: -0.1,
        browInnerUp: 0.7,
        smile: -0.35,
        eyeWiden: -0.15,
        squint: 0.15,
        blinkRatePerMinute: 12,
        gazeDartsPerSecond: 0.2,
      },
      voice: { pitchSemitones: -0.8, rate: 0.88, gainDb: -1.6, brightness: 0.28, preDelayMs: 320 },
    }),
  },
  afraid: {
    valence: 'NEGATIVE',
    base: 0.5,
    effects: effects({
      body: { posture: -0.25, expansiveness: 0.2, energy: 0.45, approach: -0.6, fidget: 0.5 },
      face: {
        browRaise: 0.4,
        browInnerUp: 0.6,
        smile: -0.25,
        eyeWiden: 0.5,
        mouthOpen: 0.25,
        blinkRatePerMinute: 26,
        gazeDartsPerSecond: 1.8,
      },
      voice: { pitchSemitones: 1.1, rate: 1.04, gainDb: -0.5, brightness: 0.4, preDelayMs: 140 },
    }),
  },
  angry: {
    valence: 'NEGATIVE',
    base: 0.45,
    effects: effects({
      body: { posture: 0.25, expansiveness: 0.4, energy: 0.6, approach: 0.4, fidget: 0.2 },
      face: {
        browRaise: -0.55,
        smile: -0.3,
        eyeWiden: -0.1,
        squint: 0.45,
        mouthOpen: 0.2,
        blinkRatePerMinute: 10,
        gazeDartsPerSecond: 0.3,
      },
      voice: { pitchSemitones: -0.5, rate: 1.02, gainDb: 0.8, brightness: 0.5 },
    }),
  },
  laughing: {
    valence: 'POSITIVE',
    base: 0.75,
    effects: effects({
      body: { posture: 0.3, expansiveness: 0.75, energy: 0.8, approach: 0.2, fidget: 0.5 },
      face: { browRaise: 0.35, smile: 0.9, eyeWiden: -0.1, squint: 0.5, mouthOpen: 0.55, blinkRatePerMinute: 22 },
      voice: { pitchSemitones: 1.4, rate: 1.08, gainDb: 1.0, brightness: 0.8 },
    }),
  },
  proud: {
    valence: 'POSITIVE',
    base: 0.6,
    effects: effects({
      body: { posture: 0.6, expansiveness: 0.55, energy: 0.4, approach: 0.15, fidget: 0.1 },
      face: { browRaise: 0.15, smile: 0.65, eyeWiden: 0.05, squint: 0.2, blinkRatePerMinute: 13 },
      voice: { pitchSemitones: 0.4, rate: 0.97, gainDb: 0.4, brightness: 0.62 },
    }),
  },
  tender: {
    valence: 'POSITIVE',
    base: 0.45,
    effects: effects({
      body: { posture: 0.1, expansiveness: 0.28, energy: 0.22, approach: 0.55, fidget: 0.1 },
      face: { browRaise: 0.1, browInnerUp: 0.3, smile: 0.5, eyeWiden: 0.05, squint: 0.2, blinkRatePerMinute: 14 },
      voice: { pitchSemitones: -0.2, rate: 0.92, gainDb: -0.6, brightness: 0.44, preDelayMs: 160 },
    }),
  },
};

export const EMOTION_VOCABULARY = Object.keys(EMOTION_PROFILES).sort() as StoryEmotion[];

/** Default emotion for a beat purpose when the story does not name one. */
const PURPOSE_DEFAULT_EMOTION: Readonly<Record<BeatPurpose, StoryEmotion>> = {
  HOOK: 'curious',
  SETUP: 'happy',
  DISCOVERY: 'surprised',
  COMPLICATION: 'worried',
  TURN: 'determined',
  PAYOFF: 'excited',
  RESOLUTION: 'tender',
  BUTTON: 'laughing',
};

/**
 * Per-character temperament, applied multiplicatively.
 *
 * This is the mechanism that keeps Pip and Goat distinct under identical
 * direction: Pip runs hotter and brighter, Goat is warmer and steadier. Both stay
 * inside their own voice lock.
 */
const TEMPERAMENT: Readonly<
  Record<CharacterCode, { intensityScale: number; energyScale: number; expansivenessScale: number; pitchBias: number; settleBias: number }>
> = {
  CHAR_PIP_001: { intensityScale: 1.12, energyScale: 1.15, expansivenessScale: 1.1, pitchBias: 0.35, settleBias: 0.9 },
  CHAR_GOAT_001: { intensityScale: 0.92, energyScale: 0.88, expansivenessScale: 0.94, pitchBias: -0.3, settleBias: 1.15 },
};

/** How much a beat purpose amplifies whatever emotion is being played. */
const PURPOSE_WEIGHT: Readonly<Record<BeatPurpose, number>> = {
  HOOK: 1.08,
  SETUP: 0.92,
  DISCOVERY: 1.12,
  COMPLICATION: 1.0,
  TURN: 1.05,
  PAYOFF: 1.15,
  RESOLUTION: 0.9,
  BUTTON: 1.0,
};

export type EmotionInput = {
  readonly beat: StoryBeat;
  readonly characterCode: CharacterCode;
  readonly rootSeed: string;
  readonly shotId: string;
  /** Emotion the same character played in the previous beat, for continuity. */
  readonly previous?: { primary: StoryEmotion; intensity: number };
  readonly approvedGatedEmotions: readonly StoryEmotion[];
};

export type EmotionResult = {
  readonly plan: EmotionPlan;
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planEmotion(input: EmotionInput): EmotionResult {
  const { beat, characterCode, rootSeed, shotId } = input;
  const lock = characterLock(characterCode);
  const seed = deriveSeed(rootSeed, shotId, 'emotion', characterCode);
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];

  const beatCharacter = beat.characters.find((c) => c.characterCode === characterCode);
  const requested = beatCharacter?.emotion;
  const derivedFromPurpose = PURPOSE_DEFAULT_EMOTION[beat.purpose];
  let primary: StoryEmotion = requested ?? derivedFromPurpose;
  let confidence = requested ? 0.95 : 0.7;
  let cause = requested
    ? `story requested "${requested}" for this ${beat.purpose.toLowerCase()} beat`
    : `no story emotion given; derived from the ${beat.purpose.toLowerCase()} beat purpose`;

  // Forbidden emotions are never played, approved or not.
  if ((CHILD_SAFE_POLICY.forbiddenEmotions as readonly string[]).includes(primary)) {
    issues.push({
      code: 'EMOTION_FORBIDDEN',
      severity: 'ERROR',
      system: 'emotion',
      shotId,
      characterCode,
      message: `"${primary}" is not permitted in children's content for this studio.`,
    });
    primary = 'neutral';
    confidence = 0;
    cause = 'forbidden emotion refused';
  }

  // Gated emotions need recorded story approval. No silent substitution: the
  // refusal is reported, and the plan drops to the nearest safe neighbour.
  let gatedApproved = false;
  if ((CHILD_SAFE_POLICY.gatedEmotions as readonly string[]).includes(primary)) {
    if (input.approvedGatedEmotions.includes(primary)) {
      gatedApproved = true;
      cause += '; gated emotion explicitly approved by story';
    } else {
      issues.push({
        code: 'EMOTION_GATED_UNAPPROVED',
        severity: 'ERROR',
        system: 'emotion',
        shotId,
        characterCode,
        message: `"${primary}" requires explicit story approval (approvedGatedEmotions) before it can be planned.`,
      });
      primary = primary === 'angry' ? 'determined' : 'worried';
      confidence = Math.min(confidence, 0.5);
      cause += `; downgraded to "${primary}" pending approval`;
    }
  }

  const profile = EMOTION_PROFILES[primary];
  const temperament = TEMPERAMENT[characterCode];

  // Intensity: story request if given, else the profile baseline, then weighted by
  // beat purpose and the character's own temperament, then a small seeded jitter so
  // repeated beats do not read as copy-paste. The jitter is deterministic.
  const requestedIntensity = beatCharacter?.emotionIntensity;
  const baseIntensity = requestedIntensity ?? profile.base;
  const jitter = rng.float(-0.03, 0.03);
  let intensity =
    baseIntensity * PURPOSE_WEIGHT[beat.purpose] * temperament.intensityScale + jitter;

  const ceiling =
    profile.valence === 'NEGATIVE' ? CHILD_SAFE_POLICY.maxNegativeIntensity : CHILD_SAFE_POLICY.maxIntensity;
  if (intensity > ceiling) {
    decisions.push({
      system: 'emotion',
      shotId,
      characterCode,
      decision: 'intensity ceiling',
      chose: String(quantize(ceiling, 3)),
      because: `child-safe ceiling for ${profile.valence.toLowerCase()} emotion; wanted ${quantize(intensity, 3)}`,
      alternatives: [],
      seed,
    });
    if (requestedIntensity !== undefined && requestedIntensity > ceiling) {
      issues.push({
        code: 'EMOTION_INTENSITY_CLAMPED',
        severity: 'WARNING',
        system: 'emotion',
        shotId,
        characterCode,
        message: `Requested intensity ${requestedIntensity} exceeds the child-safe ceiling ${ceiling}; clamped.`,
        measured: { requested: requestedIntensity, ceiling },
      });
    }
    intensity = ceiling;
  }
  intensity = boundedUnit(intensity, 3);

  if (confidence < 0.6) {
    issues.push({
      code: 'EMOTION_LOW_CONFIDENCE',
      severity: 'WARNING',
      system: 'emotion',
      shotId,
      characterCode,
      message: `Emotion "${primary}" derived with low confidence (${quantize(confidence, 2)}); a director override is advisable.`,
      measured: { confidence: quantize(confidence, 2) },
    });
  }

  // Continuity: a large emotional jump gets a longer transition rather than a cut.
  const previous = input.previous;
  const jump = previous ? emotionalDistance(previous.primary, primary) : 0;
  const transitionInSeconds = clampQuantize(
    0.18 + jump * 0.55 + (1 - intensity) * 0.1,
    0.08,
    Math.min(2, beat.durationSeconds * 0.5),
    3,
  );
  const settleSeconds = clampQuantize(
    Math.max(CHILD_SAFE_POLICY.minSettleSeconds, intensity * 0.5 * temperament.settleBias),
    0,
    Math.min(2, beat.durationSeconds * 0.4),
    3,
  );

  const target = resolveTarget(beat, characterCode);
  const scaled = scaleEffects(profile.effects, intensity, temperament);
  const voiceBounded = boundVoice(scaled.voice, characterCode, { shotId, issues });

  const plan: EmotionPlan = EmotionPlanSchema.parse({
    characterCode,
    primary,
    requested,
    valence: profile.valence,
    intensity,
    confidence: boundedUnit(confidence, 2),
    cause,
    target,
    previous: previous?.primary,
    transitionInSeconds,
    settleSeconds,
    effects: { ...scaled, voice: voiceBounded },
    gatedApproved,
    provenance: { system: 'emotion', version: SUBSYSTEM_VERSIONS.emotion, seed },
  });

  decisions.push({
    system: 'emotion',
    shotId,
    characterCode,
    decision: 'primary emotion',
    chose: `${primary} @ ${intensity}`,
    because: cause,
    alternatives: requested
      ? [{ option: derivedFromPurpose, score: 0.5, rejectedBecause: 'story named an emotion explicitly' }]
      : [],
    seed,
  });

  // Voice lock is checked here rather than only in the sound system, because the
  // emotion engine is what proposes the prosody in the first place.
  void lock;
  return { plan, issues, decisions };
}

/**
 * Distance between two emotions, 0..1, used only to time transitions.
 * Same-valence moves are close; crossing valence is far.
 */
export function emotionalDistance(from: StoryEmotion, to: StoryEmotion): number {
  if (from === to) return 0;
  const a = EMOTION_PROFILES[from];
  const b = EMOTION_PROFILES[to];
  if (a.valence === b.valence) return 0.35;
  if (a.valence === 'NEUTRAL' || b.valence === 'NEUTRAL') return 0.6;
  return 1;
}

function resolveTarget(beat: StoryBeat, characterCode: CharacterCode): string | undefined {
  const other = beat.characters.find((c) => c.characterCode !== characterCode);
  if (beat.requiredProps.length > 0) return beat.requiredProps[0];
  return other?.characterCode;
}

function scaleEffects(
  base: EmotionEffects,
  intensity: number,
  temperament: (typeof TEMPERAMENT)[CharacterCode],
): EmotionEffects {
  // Effects scale from the neutral rest pose toward the profile at `intensity`, so
  // a low-intensity "sad" is a slight droop rather than a dialled-down caricature.
  const lerp = (rest: number, full: number, scale = 1) => quantize(rest + (full - rest) * intensity * scale, 4);
  return {
    body: {
      posture: lerp(NEUTRAL_EFFECTS.body.posture, base.body.posture),
      expansiveness: boundedUnit(
        lerp(NEUTRAL_EFFECTS.body.expansiveness, base.body.expansiveness, temperament.expansivenessScale),
      ),
      energy: boundedUnit(lerp(NEUTRAL_EFFECTS.body.energy, base.body.energy, temperament.energyScale)),
      approach: clampQuantize(lerp(NEUTRAL_EFFECTS.body.approach, base.body.approach), -1, 1),
      fidget: boundedUnit(lerp(NEUTRAL_EFFECTS.body.fidget, base.body.fidget)),
    },
    face: {
      browRaise: clampQuantize(lerp(NEUTRAL_EFFECTS.face.browRaise, base.face.browRaise), -1, 1),
      browInnerUp: boundedUnit(lerp(NEUTRAL_EFFECTS.face.browInnerUp, base.face.browInnerUp)),
      smile: clampQuantize(lerp(NEUTRAL_EFFECTS.face.smile, base.face.smile), -1, 1),
      eyeWiden: clampQuantize(lerp(NEUTRAL_EFFECTS.face.eyeWiden, base.face.eyeWiden), -1, 1),
      squint: boundedUnit(lerp(NEUTRAL_EFFECTS.face.squint, base.face.squint)),
      mouthOpen: boundedUnit(lerp(NEUTRAL_EFFECTS.face.mouthOpen, base.face.mouthOpen)),
      blinkRatePerMinute: clampQuantize(
        lerp(NEUTRAL_EFFECTS.face.blinkRatePerMinute, base.face.blinkRatePerMinute),
        4,
        40,
        2,
      ),
      gazeDartsPerSecond: clampQuantize(
        lerp(NEUTRAL_EFFECTS.face.gazeDartsPerSecond, base.face.gazeDartsPerSecond),
        0,
        3,
        3,
      ),
    },
    voice: {
      pitchSemitones: quantize(
        lerp(NEUTRAL_EFFECTS.voice.pitchSemitones, base.voice.pitchSemitones) + temperament.pitchBias * intensity,
        3,
      ),
      rate: quantize(lerp(NEUTRAL_EFFECTS.voice.rate, base.voice.rate), 3),
      gainDb: clampQuantize(lerp(NEUTRAL_EFFECTS.voice.gainDb, base.voice.gainDb), -6, 4, 2),
      brightness: boundedUnit(lerp(NEUTRAL_EFFECTS.voice.brightness, base.voice.brightness)),
      preDelayMs: Math.round(clampQuantize(lerp(NEUTRAL_EFFECTS.voice.preDelayMs, base.voice.preDelayMs), 0, 1200, 0)),
    },
  };
}

/**
 * Keep prosody inside the character's permanent voice identity.
 *
 * The emotion engine is allowed to want a brighter, faster Pip; it is not allowed
 * to want a Pip who no longer sounds like Pip. Clamping here, with a warning, is
 * what makes "voice identity is permanent" true in practice.
 */
function boundVoice(
  voice: EmotionEffects['voice'],
  characterCode: CharacterCode,
  ctx: { shotId: string; issues: PlanIssue[] },
): EmotionEffects['voice'] {
  const lock = characterLock(characterCode).voice;
  const pitch = clampQuantize(voice.pitchSemitones, lock.pitchRange.minSemitones, lock.pitchRange.maxSemitones, 3);
  const rate = clampQuantize(voice.rate, lock.rateRange.min, lock.rateRange.max, 3);
  if (pitch !== voice.pitchSemitones || rate !== voice.rate) {
    ctx.issues.push({
      code: 'VOICE_PROSODY_CLAMPED',
      severity: 'INFO',
      system: 'emotion',
      shotId: ctx.shotId,
      characterCode,
      message: `Prosody clamped to ${lock.voiceId}'s locked range.`,
      measured: { pitchWanted: voice.pitchSemitones, pitchUsed: pitch, rateWanted: voice.rate, rateUsed: rate },
    });
  }
  return { ...voice, pitchSemitones: pitch, rate };
}

/**
 * Step 5 — Cinematic vertical 9:16 camera intelligence.
 *
 * Vertical is not landscape rotated. A 1080×1920 frame is generous vertically and
 * mean horizontally: a two-shot that works in 16:9 crops both characters' faces in
 * 9:16, and a wide that reads on a monitor is unreadable on a phone held at arm's
 * length. So framing here is scored against vertical-specific constraints —
 * headroom, foot room, subject height as a fraction of frame, caption-safe regions
 * — and the score is reported so a framing can be argued with rather than trusted.
 *
 * The camera resolves to the preset vocabulary `configure_camera()` already
 * implements. New geometry is emitted as an *optional* override that the Blender
 * side only reads when present, so absent it reproduces today's framing exactly.
 */
import { z } from 'zod';
import {
  DeliveryResolutionSchema,
  NonEmptyStringSchema,
  UnitScalarSchema,
  parseResolution,
  type CharacterCode,
  type Decision,
  type DeliveryResolution,
  type PlanIssue,
} from '../schema/common';
import { boundedUnit, clampQuantize, createRng, deriveSeed, quantize } from '../determinism';
import { characterLock } from '../locks';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { ActingPlan } from '../acting';
import type { EmotionPlan } from '../emotion';
import type { StoryBeat } from '../schema/scene-plan';

/**
 * Compositions the planner may choose. These map onto the presets
 * `assemble_scene.configure_camera()` implements, so nothing new is required of
 * Blender for the plan to render.
 */
export const COMPOSITIONS = [
  'ESTABLISHING',
  'WIDE',
  'FULL_BODY',
  'MEDIUM',
  'TWO_SHOT',
  'CLOSE_UP',
  'REACTION',
] as const;
export const CompositionSchema = z.enum(COMPOSITIONS);
export type Composition = z.infer<typeof CompositionSchema>;

export const CAMERA_MOVES = ['STATIC', 'PUSH_IN', 'PULL_OUT', 'PAN', 'TILT', 'TRACK', 'FOLLOW'] as const;
export const CameraMoveSchema = z.enum(CAMERA_MOVES);
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const CameraPlanSchema = z.object({
  composition: CompositionSchema,
  /** The preset name handed to `configure_camera()`. Always an existing preset. */
  preset: NonEmptyStringSchema,
  move: CameraMoveSchema,
  /** Why the move exists. An unmotivated move is a rejected move. */
  moveMotivation: NonEmptyStringSchema,
  lensMm: z.number().min(14).max(135),
  resolution: DeliveryResolutionSchema,
  /** Which character the framing serves. Undefined for establishing shots. */
  subject: z.string().optional(),
  /** Subjects in priority order, for multi-character framing. */
  subjectPriority: z.array(NonEmptyStringSchema).default([]),
  framing: z.object({
    /** Subject height as a fraction of frame height. The core vertical metric. */
    subjectHeightFraction: UnitScalarSchema,
    /** Gap above the head, as a fraction of frame height. */
    headroomFraction: UnitScalarSchema,
    /** Gap below the feet, as a fraction of frame height. */
    footRoomFraction: UnitScalarSchema,
    /** Space ahead of gaze/travel, as a fraction of frame width. Signed: + is right. */
    leadRoomFraction: z.number().min(-1).max(1),
    /** Where the subject's eyeline sits vertically, 0 = top. */
    eyelineFraction: UnitScalarSchema,
  }),
  depth: z.object({
    /** Distinct depth layers in frame: subject, mid, background. */
    layers: z.number().int().min(1).max(5),
    /** Parallax across the move, in metres of apparent background shift. */
    parallaxMeters: z.number().min(0).max(2),
    /** Focal plane distance in metres at the start of the shot. */
    focusDistanceMeters: z.number().positive(),
    /**
     * Focal plane distance at the end of the shot. A move that changes the
     * camera-to-subject distance needs the focus to travel with it — that is a focus
     * pull, and without it a push-in ends soft on the face it was pushing in on.
     * Equal to the start distance on a static shot.
     */
    endFocusDistanceMeters: z.number().positive(),
  }),
  /** Platform-safe regions kept clear of the subject, as frame fractions. */
  safeRegions: z.object({
    topCaptionFraction: UnitScalarSchema,
    bottomCaptionFraction: UnitScalarSchema,
    actionSafeInsetFraction: UnitScalarSchema,
  }),
  /** Screen direction, checked for continuity against the previous shot. */
  screenDirection: z.enum(['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'NEUTRAL']),
  durationSeconds: z.number().positive(),
  /** Deterministic score, 0..1, and the runners-up. */
  score: UnitScalarSchema,
  /**
   * Optional explicit geometry. Blender reads this only when present; without it
   * the named preset's existing behaviour is used unchanged.
   */
  geometry: z
    .object({
      location: z.tuple([z.number(), z.number(), z.number()]),
      rotationDegrees: z.tuple([z.number(), z.number(), z.number()]),
      endLocation: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .optional(),
  provenance: z.object({ system: z.literal('camera'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type CameraPlan = z.infer<typeof CameraPlanSchema>;

/**
 * Vertical framing rules. These are the thresholds that make a phone-first frame
 * readable, and they are the reason a landscape-derived framing fails here.
 */
export const CAMERA_RULES = {
  /** Subject must occupy at least this fraction of frame height to read on a phone. */
  minSubjectHeightFraction: 0.22,
  /** Above this the subject is cropped by the frame. */
  maxSubjectHeightFraction: 0.92,
  minHeadroomFraction: 0.03,
  maxHeadroomFraction: 0.3,
  minFootRoomFraction: 0.02,
  /** Vertical platforms overlay captions/titles here. Keep faces out. */
  topCaptionFraction: 0.12,
  bottomCaptionFraction: 0.18,
  actionSafeInsetFraction: 0.05,
  /** Eyeline sits in the upper third; lower reads as a security camera. */
  eyelineMin: 0.24,
  eyelineMax: 0.46,
  /** Minimum lead room ahead of a moving or looking subject. */
  minLeadRoomFraction: 0.06,
  /** Move comfort ceilings: beyond these, phone viewers feel it. */
  maxPushMetersPerSecond: 0.55,
  maxPanDegreesPerSecond: 12,
  /** A shot shorter than this cannot be read, whatever is in it. */
  minShotSeconds: 0.8,
  /** A static shot longer than this without a move or a cut goes dead. */
  maxStaticShotSeconds: 6.5,
  /** Horizon must not tilt for a children's show. */
  maxHorizonTiltDegrees: 0.5,
  /** Camera must stay at least this far from any geometry. */
  minGeometryClearanceMeters: 0.4,
  /**
   * How far the focal plane may sit off the subject before the face goes soft.
   * Generous enough to allow for the subject's own depth and a stopped-down EEVEE
   * depth of field, tight enough that a focus pull that forgot to travel fails.
   */
  maxFocusErrorMeters: 0.35,
  /** Lens change between adjacent shots that reads as a jump. */
  maxLensJumpMm: 40,
  /** Minimum depth layers for a frame to have any dimension. */
  minDepthLayers: 2,
} as const;

/** Physical framing model per composition. Distances are metres from subject. */
const COMPOSITION_GEOMETRY: Readonly<
  Record<Composition, { preset: string; distance: number; lens: number; height: number; subjectHeightFraction: number; layers: number }>
> = {
  ESTABLISHING: { preset: 'ESTABLISHING', distance: 8.0, lens: 28, height: 2.4, subjectHeightFraction: 0.26, layers: 4 },
  WIDE: { preset: 'WIDE', distance: 6.8, lens: 28, height: 2.2, subjectHeightFraction: 0.34, layers: 3 },
  FULL_BODY: { preset: 'MEDIUM', distance: 5.5, lens: 35, height: 1.8, subjectHeightFraction: 0.52, layers: 3 },
  MEDIUM: { preset: 'MEDIUM', distance: 4.6, lens: 35, height: 1.7, subjectHeightFraction: 0.62, layers: 3 },
  TWO_SHOT: { preset: 'TWO_SHOT', distance: 5.2, lens: 35, height: 1.8, subjectHeightFraction: 0.55, layers: 3 },
  CLOSE_UP: { preset: 'CLOSE_UP', distance: 3.2, lens: 50, height: 1.5, subjectHeightFraction: 0.8, layers: 2 },
  REACTION: { preset: 'REACTION', distance: 3.0, lens: 50, height: 1.5, subjectHeightFraction: 0.78, layers: 2 },
};

/** What each beat purpose wants, before scoring adjusts it. */
const PURPOSE_PREFERENCE: Readonly<Record<string, readonly Composition[]>> = {
  HOOK: ['CLOSE_UP', 'MEDIUM', 'REACTION'],
  SETUP: ['ESTABLISHING', 'WIDE', 'TWO_SHOT'],
  DISCOVERY: ['CLOSE_UP', 'MEDIUM', 'REACTION'],
  COMPLICATION: ['MEDIUM', 'TWO_SHOT', 'REACTION'],
  TURN: ['MEDIUM', 'CLOSE_UP', 'FULL_BODY'],
  PAYOFF: ['TWO_SHOT', 'MEDIUM', 'WIDE'],
  RESOLUTION: ['TWO_SHOT', 'WIDE', 'MEDIUM'],
  BUTTON: ['CLOSE_UP', 'REACTION', 'TWO_SHOT'],
};

export type CameraInput = {
  readonly beat: StoryBeat;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly resolution: DeliveryResolution;
  readonly fps: number;
  readonly durationSeconds: number;
  readonly emotions: ReadonlyArray<EmotionPlan>;
  readonly acting: ReadonlyArray<ActingPlan>;
  readonly previous?: { composition: Composition; lensMm: number; screenDirection: CameraPlan['screenDirection'] };
  /** Accessories the beat requires visible; framing may not hide them. */
  readonly requireVisibleAccessories?: readonly string[];
};

export type CameraResult = {
  readonly plan: CameraPlan;
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planCamera(input: CameraInput): CameraResult {
  const { beat, rootSeed, shotId, resolution, durationSeconds } = input;
  const seed = deriveSeed(rootSeed, shotId, 'camera');
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];

  const focusCharacter =
    beat.characters.find((c) => c.focus)?.characterCode ??
    [...beat.characters].sort((a, b) => a.characterCode.localeCompare(b.characterCode))[0]?.characterCode;
  const characterCount = beat.characters.length;

  // Score every composition. The score is the whole point: a framing is chosen
  // because it measured best against vertical constraints, and the alternatives
  // and their scores travel with the plan.
  const scored = COMPOSITIONS.map((composition) => {
    const evaluation = scoreComposition(composition, input, focusCharacter, characterCount);
    return { composition, ...evaluation };
  }).sort((a, b) => b.score - a.score || a.composition.localeCompare(b.composition));

  const winner = scored[0];
  const composition = winner.composition;
  const geometry = COMPOSITION_GEOMETRY[composition];

  const move = chooseMove(input, composition, rng);
  const framing = computeFraming(composition, input, focusCharacter);
  const { width, height } = parseResolution(resolution);

  // Camera path first, so the focus can be derived from it rather than guessed
  // alongside it. A dolly move changes the camera-to-subject distance, and focus
  // that does not travel with the camera is soft at whichever end it was not set for.
  const startLocation: [number, number, number] = [
    quantize(move.lateral, 3),
    quantize(-geometry.distance, 3),
    quantize(geometry.height, 3),
  ];
  const endLocation: [number, number, number] | undefined =
    move.move === 'PUSH_IN' || move.move === 'PULL_OUT'
      ? [
          quantize(move.lateral, 3),
          quantize(-geometry.distance + move.travelMeters, 3),
          quantize(geometry.height - move.travelMeters * 0.18, 3),
        ]
      : undefined;

  const focusDistance = quantize(Math.abs(startLocation[1]), 3);
  const endFocusDistance = quantize(Math.max(0.1, Math.abs((endLocation ?? startLocation)[1])), 3);
  const plan: CameraPlan = CameraPlanSchema.parse({
    composition,
    preset: move.preset ?? geometry.preset,
    move: move.move,
    moveMotivation: move.motivation,
    lensMm: geometry.lens,
    resolution,
    subject: composition === 'ESTABLISHING' ? undefined : focusCharacter,
    subjectPriority: [...beat.characters]
      .sort((a, b) => Number(b.focus) - Number(a.focus) || a.characterCode.localeCompare(b.characterCode))
      .map((c) => c.characterCode),
    framing,
    depth: {
      layers: geometry.layers,
      parallaxMeters: quantize(move.move === 'STATIC' ? 0 : move.travelMeters * 0.35, 3),
      focusDistanceMeters: focusDistance,
      endFocusDistanceMeters: endFocusDistance,
    },
    safeRegions: {
      topCaptionFraction: CAMERA_RULES.topCaptionFraction,
      bottomCaptionFraction: CAMERA_RULES.bottomCaptionFraction,
      actionSafeInsetFraction: CAMERA_RULES.actionSafeInsetFraction,
    },
    screenDirection: resolveScreenDirection(input),
    durationSeconds: quantize(durationSeconds, 3),
    score: boundedUnit(winner.score, 3),
    geometry: {
      location: startLocation,
      // Pitch is derived so the lens points at the subject's eyeline; roll is
      // always zero, which is how the horizon stays level.
      rotationDegrees: [quantize(90 - Math.atan2(geometry.height - 0.9, geometry.distance) * (180 / Math.PI), 2), 0, quantize(move.yawDegrees, 2)],
      endLocation,
    },
    provenance: { system: 'camera', version: SUBSYSTEM_VERSIONS.camera, seed },
  });

  decisions.push({
    system: 'camera',
    shotId,
    decision: 'composition',
    chose: `${composition} (${plan.preset}, ${plan.lensMm}mm)`,
    because: winner.because,
    alternatives: scored.slice(1, 5).map((entry) => ({
      option: entry.composition,
      score: quantize(entry.score, 3),
      rejectedBecause: entry.rejectedBecause,
    })),
    seed,
  });
  decisions.push({
    system: 'camera',
    shotId,
    decision: 'move',
    chose: plan.move,
    because: plan.moveMotivation,
    alternatives: [],
    seed,
  });

  issues.push(...validateCamera(plan, input, { width, height }));
  return { plan, issues, decisions };
}

function scoreComposition(
  composition: Composition,
  input: CameraInput,
  focusCharacter: CharacterCode | undefined,
  characterCount: number,
): { score: number; because: string; rejectedBecause?: string } {
  const geometry = COMPOSITION_GEOMETRY[composition];
  const preferences = PURPOSE_PREFERENCE[input.beat.purpose] ?? ['MEDIUM'];
  const reasons: string[] = [];
  let score = 0.4;

  const preferenceIndex = preferences.indexOf(composition);
  if (preferenceIndex >= 0) {
    const bonus = 0.24 - preferenceIndex * 0.07;
    score += bonus;
    reasons.push(`${input.beat.purpose} beats favour ${composition}`);
  }

  // Vertical readability: the subject must be big enough to read on a phone.
  if (geometry.subjectHeightFraction >= CAMERA_RULES.minSubjectHeightFraction) {
    score += 0.12;
  } else {
    return {
      score: 0.05,
      because: 'unreadable on a phone',
      rejectedBecause: `subject only ${geometry.subjectHeightFraction} of frame height, minimum ${CAMERA_RULES.minSubjectHeightFraction}`,
    };
  }

  // Two characters in a vertical frame: a TWO_SHOT stacks them; anything tighter
  // than MEDIUM will cut one out.
  if (characterCount > 1) {
    if (composition === 'TWO_SHOT') {
      score += 0.16;
      reasons.push('two characters share the beat');
    } else if (['CLOSE_UP', 'REACTION'].includes(composition)) {
      score -= 0.14;
    }
  } else if (composition === 'TWO_SHOT') {
    score -= 0.2;
  }

  // Emotional peaks want the face. That is what close-ups are for.
  const peakIntensity = Math.max(0, ...input.emotions.map((emotion) => emotion.intensity));
  if (peakIntensity > 0.6 && ['CLOSE_UP', 'REACTION', 'MEDIUM'].includes(composition)) {
    score += 0.12;
    reasons.push(`emotional peak ${quantize(peakIntensity, 2)} needs the face`);
  }
  if (peakIntensity > 0.65 && ['ESTABLISHING', 'WIDE'].includes(composition)) {
    score -= 0.15;
    reasons.push('a wide would hide the reaction');
  }

  // Locomotion needs room for the body and the travel.
  const travels = input.acting.some((plan) => plan.locomotion.distanceMeters > 0.4);
  if (travels) {
    if (['FULL_BODY', 'WIDE', 'MEDIUM'].includes(composition)) {
      score += 0.1;
      reasons.push('a character travels, so the feet must be in frame');
    } else if (['CLOSE_UP', 'REACTION'].includes(composition)) {
      score -= 0.16;
    }
  }

  // Required props must be framed with the character.
  if (input.beat.requiredProps.length > 0) {
    if (['MEDIUM', 'FULL_BODY', 'TWO_SHOT'].includes(composition)) {
      score += 0.08;
      reasons.push(`required prop ${input.beat.requiredProps[0]} must share the frame`);
    } else if (composition === 'CLOSE_UP') {
      score -= 0.1;
    }
  }

  // Required accessories: Pip's backpack sits behind her, so a tight frontal
  // close-up cannot show it. Recorded as a scoring penalty, not a hard failure,
  // because most shots do not require it.
  if ((input.requireVisibleAccessories ?? []).length > 0 && ['CLOSE_UP', 'REACTION'].includes(composition)) {
    score -= 0.18;
    reasons.push('an accessory must stay visible, which a tight frame cannot guarantee');
  }

  // Variety: repeating the previous composition back-to-back reads as a stall.
  if (input.previous?.composition === composition) {
    score -= 0.12;
    reasons.push('same composition as the previous shot');
  }

  // Lens continuity: a big jump between adjacent shots reads as a mistake.
  if (input.previous && Math.abs(geometry.lens - input.previous.lensMm) > CAMERA_RULES.maxLensJumpMm) {
    score -= 0.1;
    reasons.push('lens jump from the previous shot would read as an error');
  }

  if (focusCharacter) {
    const lock = characterLock(focusCharacter);
    // Very short characters read small in a wide vertical frame.
    if (lock.species === 'chick' && ['ESTABLISHING'].includes(composition)) score -= 0.06;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    because: reasons.length > 0 ? reasons.join('; ') : 'default scoring with no specific pressure',
    rejectedBecause: reasons.length > 0 ? reasons[reasons.length - 1] : 'lower score',
  };
}

function chooseMove(
  input: CameraInput,
  composition: Composition,
  rng: ReturnType<typeof createRng>,
): { move: CameraMove; motivation: string; travelMeters: number; lateral: number; yawDegrees: number; preset?: string } {
  const { beat, durationSeconds, acting } = input;
  const travels = acting.some((plan) => plan.locomotion.distanceMeters > 0.4);
  const peakIntensity = Math.max(0, ...input.emotions.map((emotion) => emotion.intensity));
  const lateral = quantize(rng.float(-0.15, 0.25), 3);

  // Every move must be motivated. A move without a reason is a static shot.
  if (travels) {
    return {
      move: 'FOLLOW',
      motivation: 'a character travels; the camera follows to keep the feet and the destination in frame',
      travelMeters: quantize(Math.min(1.6, acting[0]?.locomotion.distanceMeters ?? 0.5), 3),
      lateral,
      yawDegrees: 0,
      preset: 'FOLLOW',
    };
  }
  if (['DISCOVERY', 'HOOK', 'TURN'].includes(beat.purpose) && peakIntensity > 0.5) {
    const travel = quantize(Math.min(CAMERA_RULES.maxPushMetersPerSecond * durationSeconds, 1.7), 3);
    return {
      move: 'PUSH_IN',
      motivation: `a ${beat.purpose.toLowerCase()} beat at intensity ${quantize(peakIntensity, 2)}; the push commits the audience to the reaction`,
      travelMeters: travel,
      lateral,
      yawDegrees: 0,
      preset: 'PUSH_IN',
    };
  }
  if (beat.purpose === 'RESOLUTION' && durationSeconds > 2.5) {
    return {
      move: 'PULL_OUT',
      motivation: 'a resolution beat; easing out returns the pair to their world',
      travelMeters: quantize(-Math.min(CAMERA_RULES.maxPushMetersPerSecond * durationSeconds, 1.4), 3),
      lateral,
      yawDegrees: 0,
      preset: 'PUSH_IN',
    };
  }
  return {
    move: 'STATIC',
    motivation: 'nothing in the beat motivates a move; a still frame lets the performance carry it',
    travelMeters: 0,
    lateral,
    yawDegrees: 0,
    preset: COMPOSITION_GEOMETRY[composition].preset,
  };
}

function computeFraming(
  composition: Composition,
  input: CameraInput,
  focusCharacter: CharacterCode | undefined,
): CameraPlan['framing'] {
  const geometry = COMPOSITION_GEOMETRY[composition];
  const subjectHeightFraction = boundedUnit(geometry.subjectHeightFraction, 3);

  // Headroom scales inversely with subject size: a close-up needs a sliver, a wide
  // needs air. Foot room takes what is left after the caption-safe band.
  const headroomFraction = boundedUnit(
    clampQuantize(0.05 + (1 - subjectHeightFraction) * 0.2, CAMERA_RULES.minHeadroomFraction, CAMERA_RULES.maxHeadroomFraction, 3),
    3,
  );
  const footRoomFraction = boundedUnit(
    Math.max(CAMERA_RULES.minFootRoomFraction, 1 - subjectHeightFraction - headroomFraction),
    3,
  );

  // Lead room goes ahead of gaze and travel: a character looking right needs space
  // on the right, or the frame reads as pushing them out of it.
  const acting = focusCharacter ? input.acting.find((plan) => plan.characterCode === focusCharacter) : undefined;
  const facing = acting?.staging.facing ?? 'CENTER';
  const direction = facing === 'RIGHT' ? 1 : facing === 'LEFT' ? -1 : 0;
  const leadRoomFraction = quantize(direction * Math.max(CAMERA_RULES.minLeadRoomFraction, 0.09), 3);

  const eyelineFraction = boundedUnit(
    clampQuantize(headroomFraction + subjectHeightFraction * 0.18, CAMERA_RULES.eyelineMin, CAMERA_RULES.eyelineMax, 3),
    3,
  );

  return { subjectHeightFraction, headroomFraction, footRoomFraction, leadRoomFraction, eyelineFraction };
}

function resolveScreenDirection(input: CameraInput): CameraPlan['screenDirection'] {
  // Continuity first: keep the previous shot's direction unless nothing travels.
  const traveller = input.acting.find((plan) => plan.locomotion.distanceMeters > 0.4);
  if (!traveller) return input.previous?.screenDirection ?? 'NEUTRAL';
  if (input.previous && input.previous.screenDirection !== 'NEUTRAL') return input.previous.screenDirection;
  return traveller.staging.facing === 'LEFT' ? 'RIGHT_TO_LEFT' : 'LEFT_TO_RIGHT';
}

/**
 * Hard framing validation. These are the failures that make a vertical shot
 * unusable, and each one is measured rather than eyeballed.
 */
export function validateCamera(
  plan: CameraPlan,
  input: CameraInput,
  frame: { width: number; height: number },
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const fail = (code: string, message: string, measured?: PlanIssue['measured'], severity: PlanIssue['severity'] = 'ERROR') =>
    issues.push({ code, severity, system: 'camera', shotId: input.shotId, message, measured });

  const { framing } = plan;

  if (framing.subjectHeightFraction > CAMERA_RULES.maxSubjectHeightFraction) {
    fail(
      'CAMERA_SUBJECT_CROPPED',
      `Subject fills ${framing.subjectHeightFraction} of frame height; above ${CAMERA_RULES.maxSubjectHeightFraction} the crest, horns or feet are cropped.`,
      { measured: framing.subjectHeightFraction, tolerance: CAMERA_RULES.maxSubjectHeightFraction },
    );
  }
  if (framing.subjectHeightFraction < CAMERA_RULES.minSubjectHeightFraction) {
    fail(
      'CAMERA_UNREADABLE_WIDE',
      `Subject is only ${framing.subjectHeightFraction} of frame height; unreadable on a phone.`,
      { measured: framing.subjectHeightFraction, tolerance: CAMERA_RULES.minSubjectHeightFraction },
    );
  }
  if (framing.headroomFraction < CAMERA_RULES.minHeadroomFraction) {
    fail('CAMERA_NO_HEADROOM', `Headroom ${framing.headroomFraction} is below ${CAMERA_RULES.minHeadroomFraction}; the crest or horns touch the frame edge.`, {
      measured: framing.headroomFraction,
      tolerance: CAMERA_RULES.minHeadroomFraction,
    });
  }
  if (framing.footRoomFraction < CAMERA_RULES.minFootRoomFraction) {
    fail('CAMERA_NO_FOOT_ROOM', `Foot room ${framing.footRoomFraction} is below ${CAMERA_RULES.minFootRoomFraction}; ground contact is cut off.`, {
      measured: framing.footRoomFraction,
      tolerance: CAMERA_RULES.minFootRoomFraction,
    });
  }

  // Caption-safe: the subject's eyeline must not sit under a platform overlay, or
  // the emotional reaction is hidden behind a caption.
  if (framing.eyelineFraction < CAMERA_RULES.topCaptionFraction) {
    fail(
      'CAMERA_EYELINE_UNDER_CAPTION',
      `Eyeline at ${framing.eyelineFraction} sits inside the top caption band (${CAMERA_RULES.topCaptionFraction}); the reaction would be covered.`,
      { measured: framing.eyelineFraction, tolerance: CAMERA_RULES.topCaptionFraction },
    );
  }
  if (framing.eyelineFraction > 1 - CAMERA_RULES.bottomCaptionFraction) {
    fail('CAMERA_EYELINE_UNDER_CAPTION', `Eyeline at ${framing.eyelineFraction} sits inside the bottom caption band.`, {
      measured: framing.eyelineFraction,
      tolerance: 1 - CAMERA_RULES.bottomCaptionFraction,
    });
  }

  const traveller = input.acting.find((plan_) => plan_.locomotion.distanceMeters > 0.4);
  if (traveller && Math.abs(framing.leadRoomFraction) < CAMERA_RULES.minLeadRoomFraction) {
    fail(
      'CAMERA_NO_LEAD_ROOM',
      `A travelling character needs at least ${CAMERA_RULES.minLeadRoomFraction} of lead room; framing gives ${framing.leadRoomFraction}.`,
      { measured: Math.abs(framing.leadRoomFraction), tolerance: CAMERA_RULES.minLeadRoomFraction },
    );
  }

  // Move comfort.
  if (plan.move === 'PUSH_IN' || plan.move === 'PULL_OUT') {
    const travel = plan.geometry?.endLocation
      ? Math.abs(plan.geometry.endLocation[1] - plan.geometry.location[1])
      : 0;
    const rate = travel / plan.durationSeconds;
    if (rate > CAMERA_RULES.maxPushMetersPerSecond) {
      fail(
        'CAMERA_EXCESSIVE_MOTION',
        `Camera travels ${quantize(rate, 3)} m/s; above ${CAMERA_RULES.maxPushMetersPerSecond} m/s vertical viewers feel it.`,
        { measured: quantize(rate, 3), tolerance: CAMERA_RULES.maxPushMetersPerSecond },
      );
    }
  }

  // Horizon stability: roll is always emitted as zero, so this catches a
  // regression rather than a plan the scorer produced.
  const roll = plan.geometry?.rotationDegrees[1] ?? 0;
  if (Math.abs(roll) > CAMERA_RULES.maxHorizonTiltDegrees) {
    fail('CAMERA_HORIZON_TILT', `Camera roll ${roll}° exceeds ${CAMERA_RULES.maxHorizonTiltDegrees}°.`, {
      measured: Math.abs(roll),
      tolerance: CAMERA_RULES.maxHorizonTiltDegrees,
    });
  }

  // Geometry clearance: the camera must not end up inside the set.
  const nearestSubjectDistance = Math.abs(plan.geometry?.location[1] ?? plan.depth.focusDistanceMeters);
  const endDistance = plan.geometry?.endLocation ? Math.abs(plan.geometry.endLocation[1]) : nearestSubjectDistance;
  const closest = Math.min(nearestSubjectDistance, endDistance);
  if (closest < CAMERA_RULES.minGeometryClearanceMeters) {
    fail(
      'CAMERA_GEOMETRY_COLLISION',
      `Camera comes within ${quantize(closest, 3)} m of the subject; minimum clearance is ${CAMERA_RULES.minGeometryClearanceMeters} m.`,
      { measured: quantize(closest, 3), tolerance: CAMERA_RULES.minGeometryClearanceMeters },
    );
  }

  // Focal plane must be on the subject, not behind it — at both ends of the move,
  // since a focus pull that is right at the start and wrong at the end is still a
  // shot that ends soft.
  const startError = Math.abs(plan.depth.focusDistanceMeters - nearestSubjectDistance);
  const endError = Math.abs(plan.depth.endFocusDistanceMeters - endDistance);
  const focusError = Math.max(startError, endError);
  if (focusError > CAMERA_RULES.maxFocusErrorMeters) {
    fail(
      'CAMERA_FOCAL_PLANE_ERROR',
      `Focus misses the subject by ${quantize(focusError, 3)} m (start ${plan.depth.focusDistanceMeters} m vs ${quantize(nearestSubjectDistance, 3)} m, end ${plan.depth.endFocusDistanceMeters} m vs ${quantize(endDistance, 3)} m).`,
      { measured: quantize(focusError, 3), tolerance: CAMERA_RULES.maxFocusErrorMeters },
      'WARNING',
    );
  }

  if (plan.depth.layers < CAMERA_RULES.minDepthLayers) {
    fail('CAMERA_FLAT_DEPTH', `Only ${plan.depth.layers} depth layer(s); a frame needs at least ${CAMERA_RULES.minDepthLayers}.`, {
      measured: plan.depth.layers,
      tolerance: CAMERA_RULES.minDepthLayers,
    }, 'WARNING');
  }

  // Cut rhythm.
  if (plan.durationSeconds < CAMERA_RULES.minShotSeconds) {
    fail('CAMERA_SHOT_TOO_SHORT', `Shot is ${plan.durationSeconds}s; under ${CAMERA_RULES.minShotSeconds}s nothing reads.`, {
      measured: plan.durationSeconds,
      tolerance: CAMERA_RULES.minShotSeconds,
    });
  }
  if (plan.move === 'STATIC' && plan.durationSeconds > CAMERA_RULES.maxStaticShotSeconds) {
    fail(
      'CAMERA_STATIC_TOO_LONG',
      `A static shot runs ${plan.durationSeconds}s; past ${CAMERA_RULES.maxStaticShotSeconds}s it needs a move or a cut.`,
      { measured: plan.durationSeconds, tolerance: CAMERA_RULES.maxStaticShotSeconds },
      'WARNING',
    );
  }

  // Lens continuity.
  if (input.previous && Math.abs(plan.lensMm - input.previous.lensMm) > CAMERA_RULES.maxLensJumpMm) {
    fail(
      'CAMERA_ABRUPT_LENS_CHANGE',
      `Lens jumps ${Math.abs(plan.lensMm - input.previous.lensMm)}mm from the previous shot; over ${CAMERA_RULES.maxLensJumpMm}mm reads as an error.`,
      { measured: Math.abs(plan.lensMm - input.previous.lensMm), tolerance: CAMERA_RULES.maxLensJumpMm },
      'WARNING',
    );
  }

  // Screen direction continuity.
  if (
    input.previous &&
    input.previous.screenDirection !== 'NEUTRAL' &&
    plan.screenDirection !== 'NEUTRAL' &&
    plan.screenDirection !== input.previous.screenDirection
  ) {
    fail(
      'CAMERA_SCREEN_DIRECTION_BREAK',
      `Screen direction flips from ${input.previous.screenDirection} to ${plan.screenDirection} without a re-establishing shot.`,
    );
  }

  // The frame contract itself: vertical delivery only.
  if (frame.height <= frame.width) {
    fail('CAMERA_NOT_VERTICAL', `Delivery ${frame.width}x${frame.height} is not vertical; this studio delivers 9:16.`);
  }

  return issues;
}

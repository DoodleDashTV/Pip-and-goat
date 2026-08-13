/**
 * Step 6 — Lighting Director.
 *
 * Chooses a cinematic recipe per shot and validates it, then resolves to one of
 * the lighting states `assemble_scene.apply_lighting_state()` already implements
 * (`DAY_SOFT`, `DAY_KEY`, `GOLDEN_HOUR`, `OVERCAST`). That indirection is
 * deliberate: those rigs are the measured ones. DAY_KEY in particular is the state
 * the accepted FINAL_1080P render was graded on, and its energies were tuned
 * against pixel statistics. This layer selects and justifies; it does not retune.
 *
 * The colour-management pipeline is likewise preserved, not re-decided: every
 * recipe asserts `Khronos PBR Neutral`, because AgX desaturated as it rolled off
 * and every attempt to hit a 45–50% mean under it either washed the sky or tripped
 * the saturation floor.
 */
import { z } from 'zod';
import { NonEmptyStringSchema, UnitScalarSchema, type Decision, type PlanIssue } from '../schema/common';
import { boundedUnit, clampQuantize, createRng, deriveSeed, quantize } from '../determinism';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { EmotionPlan } from '../emotion';
import type { StoryBeat } from '../schema/scene-plan';

/** The lighting states the Blender layer implements. Closed on purpose. */
export const LIGHTING_STATES = ['DAY_SOFT', 'DAY_KEY', 'GOLDEN_HOUR', 'OVERCAST'] as const;
export const LightingStateSchema = z.enum(LIGHTING_STATES);
export type LightingState = z.infer<typeof LightingStateSchema>;

/**
 * The one approved view transform. Named as a literal so any attempt to ship a
 * different colour pipeline fails schema validation rather than a render review.
 */
export const APPROVED_VIEW_TRANSFORM = 'Khronos PBR Neutral' as const;
export const APPROVED_LOOK = 'None' as const;

export const LightingPlanSchema = z.object({
  recipe: NonEmptyStringSchema,
  /** Resolved state name handed to Blender via `shot_meta.lightingState`. */
  state: LightingStateSchema,
  /** Emotional intent the recipe serves, in words a director uses. */
  intent: NonEmptyStringSchema,
  key: z.object({ role: z.literal('key'), relativeEnergy: UnitScalarSchema, softness: UnitScalarSchema, azimuthDegrees: z.number() }),
  fill: z.object({ role: z.literal('fill'), relativeEnergy: UnitScalarSchema, softness: UnitScalarSchema }),
  rim: z.object({ role: z.literal('rim'), relativeEnergy: UnitScalarSchema, coneDegrees: z.number().min(10).max(120) }),
  /** Motivated practicals — a glowing map, a lantern. Empty when unmotivated. */
  practicals: z
    .array(z.object({ source: NonEmptyStringSchema, relativeEnergy: UnitScalarSchema, motivation: NonEmptyStringSchema }))
    .default([]),
  palette: z.object({ name: NonEmptyStringSchema, warmthKelvinBias: z.number().min(-2000).max(2000) }),
  timeOfDay: NonEmptyStringSchema,
  colorManagement: z.object({ viewTransform: z.literal(APPROVED_VIEW_TRANSFORM), look: z.literal(APPROVED_LOOK), exposure: z.number().min(-2).max(2) }),
  /** Predicted frame statistics, checked against the fail-closed thresholds. */
  predicted: z.object({
    meanLumaFraction: UnitScalarSchema,
    highlightClipFraction: UnitScalarSchema,
    shadowFloorP01: z.number().min(0).max(255),
    tonalRange: z.number().min(0).max(255),
    meanSaturation: z.number().min(0).max(128),
    subjectSeparationLuma: z.number().min(0).max(255),
    contactShadowLuma: z.number().min(0).max(255),
    catchlightPresent: z.boolean(),
    flickerRisk: UnitScalarSchema,
    shadowAcneRisk: UnitScalarSchema,
  }),
  /** True when this shot must match the previous shot's exposure. */
  exposureContinuityWith: z.string().optional(),
  /** Render-efficiency hint; EEVEE samples the profile should use. */
  samplesHint: z.number().int().min(8).max(128),
  provenance: z.object({ system: z.literal('lighting'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type LightingPlan = z.infer<typeof LightingPlanSchema>;

/**
 * Fail-closed lighting thresholds.
 *
 * These mirror the quantities `scripts/assets/local_acceptance.py` already
 * measures on rendered pixels, at the same values. That is the point: this layer
 * predicts, the Python gate measures, and the two must agree about what
 * "acceptable" means. No existing gate threshold was changed to accommodate a new
 * recipe — the recipes were tuned to the existing thresholds instead.
 */
export const LIGHTING_THRESHOLDS = {
  meanLumaMin: 0.43,
  meanLumaMax: 0.53,
  highlightClipMax: 0.002,
  shadowFloorP01Min: 6,
  tonalRangeMin: 140,
  meanSaturationMin: 20,
  subjectSeparationMin: 20,
  contactShadowMin: 2,
  flickerRiskMax: 0.2,
  shadowAcneRiskMax: 0.2,
  /** Exposure drift allowed between consecutive shots, in stops. */
  exposureContinuityStops: 0.35,
} as const;

type Recipe = {
  readonly name: string;
  readonly state: LightingState;
  readonly intent: string;
  readonly keyEnergy: number;
  readonly keySoftness: number;
  readonly keyAzimuth: number;
  readonly fillEnergy: number;
  readonly fillSoftness: number;
  readonly rimEnergy: number;
  readonly rimCone: number;
  readonly palette: string;
  readonly warmthBias: number;
  readonly exposure: number;
  readonly samples: number;
  /** Measured/derived statistics this recipe lands, used for prediction. */
  readonly predicted: {
    meanLumaFraction: number;
    highlightClipFraction: number;
    shadowFloorP01: number;
    tonalRange: number;
    meanSaturation: number;
    subjectSeparationLuma: number;
    contactShadowLuma: number;
  };
};

/**
 * The recipe library.
 *
 * `MEADOW_DAY_KEY` is the accepted reference: its predicted statistics are the
 * ones actually measured on the accepted DAY_KEY acceptance render (mean luma
 * 48–49% of range, p01 ~48, zero clipped highlights, mean saturation ~62/128,
 * subjects 75–87 luma above the grass, 8–16 luma of contact shadow). The others
 * follow the same shape at their own exposure.
 */
const RECIPES: readonly Recipe[] = [
  {
    name: 'MEADOW_DAY_KEY',
    state: 'DAY_KEY',
    intent: 'bright, confident daylight — the studio reference state',
    keyEnergy: 1.0,
    keySoftness: 0.55,
    keyAzimuth: 135,
    fillEnergy: 0.32,
    fillSoftness: 0.85,
    rimEnergy: 0.45,
    rimCone: 42,
    palette: 'MEADOW_WARM',
    warmthBias: 250,
    exposure: 0,
    samples: 24,
    predicted: {
      meanLumaFraction: 0.485,
      highlightClipFraction: 0,
      shadowFloorP01: 48,
      tonalRange: 165,
      meanSaturation: 62,
      subjectSeparationLuma: 81,
      contactShadowLuma: 12,
    },
  },
  {
    name: 'MEADOW_DAY_SOFT',
    state: 'DAY_SOFT',
    intent: 'gentle, diffuse daylight for tender and quiet beats',
    keyEnergy: 0.8,
    keySoftness: 0.8,
    keyAzimuth: 120,
    fillEnergy: 0.45,
    fillSoftness: 0.92,
    rimEnergy: 0.35,
    rimCone: 50,
    palette: 'MEADOW_COOL',
    warmthBias: 60,
    exposure: 0.05,
    samples: 24,
    predicted: {
      meanLumaFraction: 0.475,
      highlightClipFraction: 0,
      shadowFloorP01: 52,
      tonalRange: 150,
      meanSaturation: 55,
      subjectSeparationLuma: 62,
      contactShadowLuma: 7,
    },
  },
  {
    name: 'DISCOVERY_GOLDEN',
    state: 'GOLDEN_HOUR',
    intent: 'low warm key for wonder, discovery and payoff',
    keyEnergy: 0.92,
    keySoftness: 0.45,
    keyAzimuth: 165,
    fillEnergy: 0.28,
    fillSoftness: 0.8,
    rimEnergy: 0.62,
    rimCone: 36,
    palette: 'GOLDEN_WARM',
    warmthBias: 900,
    exposure: -0.05,
    samples: 28,
    predicted: {
      meanLumaFraction: 0.462,
      highlightClipFraction: 0.0008,
      shadowFloorP01: 38,
      tonalRange: 178,
      meanSaturation: 74,
      subjectSeparationLuma: 88,
      contactShadowLuma: 16,
    },
  },
  {
    name: 'GENTLE_OVERCAST',
    state: 'OVERCAST',
    intent: 'flat cool key for gentle tension and worry, without going dark',
    keyEnergy: 0.7,
    keySoftness: 0.9,
    keyAzimuth: 100,
    fillEnergy: 0.5,
    fillSoftness: 0.95,
    rimEnergy: 0.3,
    rimCone: 55,
    palette: 'OVERCAST_COOL',
    warmthBias: -350,
    exposure: 0.1,
    samples: 24,
    predicted: {
      meanLumaFraction: 0.452,
      highlightClipFraction: 0,
      shadowFloorP01: 44,
      tonalRange: 143,
      meanSaturation: 41,
      subjectSeparationLuma: 48,
      contactShadowLuma: 5,
    },
  },
];

export const LIGHTING_RECIPE_NAMES = RECIPES.map((recipe) => recipe.name).sort();

/**
 * Deliberately rejected fixtures.
 *
 * A threshold nobody has seen fail is a threshold nobody can trust. These are
 * recipes that *should* be refused, kept so the validator is tested against real
 * failures rather than only against passes. They are never selectable.
 */
export const REJECTED_LIGHTING_FIXTURES: ReadonlyArray<{ name: string; why: string; predicted: LightingPlan['predicted'] }> = [
  {
    name: 'BLOWN_NOON',
    why: 'clipped highlights — the sky and the white fur both go to paper',
    predicted: {
      meanLumaFraction: 0.62,
      highlightClipFraction: 0.021,
      shadowFloorP01: 40,
      tonalRange: 190,
      meanSaturation: 38,
      subjectSeparationLuma: 30,
      contactShadowLuma: 3,
      catchlightPresent: true,
      flickerRisk: 0.05,
      shadowAcneRisk: 0.05,
    },
  },
  {
    name: 'CRUSHED_DUSK',
    why: 'crushed shadows and no separation — the goat disappears into the field',
    predicted: {
      meanLumaFraction: 0.28,
      highlightClipFraction: 0,
      shadowFloorP01: 2,
      tonalRange: 96,
      meanSaturation: 18,
      subjectSeparationLuma: 9,
      contactShadowLuma: 1,
      catchlightPresent: false,
      flickerRisk: 0.08,
      shadowAcneRisk: 0.35,
    },
  },
  {
    name: 'AGX_REGRESSION',
    why: 'desaturated roll-off; this is the pipeline the corrected colour management replaced',
    predicted: {
      meanLumaFraction: 0.47,
      highlightClipFraction: 0.0005,
      shadowFloorP01: 30,
      tonalRange: 150,
      meanSaturation: 14,
      subjectSeparationLuma: 40,
      contactShadowLuma: 6,
      catchlightPresent: true,
      flickerRisk: 0.05,
      shadowAcneRisk: 0.05,
    },
  },
];

/** Time of day → the states that are physically plausible for it. */
const TIME_OF_DAY_STATES: Readonly<Record<string, readonly LightingState[]>> = {
  MORNING: ['DAY_SOFT', 'DAY_KEY'],
  MIDDAY: ['DAY_KEY', 'DAY_SOFT'],
  AFTERNOON: ['DAY_KEY', 'GOLDEN_HOUR'],
  GOLDEN_HOUR: ['GOLDEN_HOUR'],
  OVERCAST: ['OVERCAST', 'DAY_SOFT'],
};

export type LightingInput = {
  readonly beat: StoryBeat;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly emotions: ReadonlyArray<EmotionPlan>;
  /** Previous shot's plan, so exposure does not jump across a cut. */
  readonly previous?: { recipe: string; exposure: number; shotId: string };
  /** True when a close framing needs a guaranteed catchlight. */
  readonly requiresCatchlight: boolean;
};

export type LightingResult = {
  readonly plan: LightingPlan;
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planLighting(input: LightingInput): LightingResult {
  const { beat, rootSeed, shotId, emotions } = input;
  const seed = deriveSeed(rootSeed, shotId, 'lighting');
  const rng = createRng(seed);
  const decisions: Decision[] = [];

  const plausible = TIME_OF_DAY_STATES[beat.timeOfDay] ?? ['DAY_KEY'];
  const negative = emotions.some((emotion) => emotion.valence === 'NEGATIVE' && emotion.intensity > 0.35);
  const peak = Math.max(0, ...emotions.map((emotion) => emotion.intensity));

  const scored = RECIPES.map((recipe) => {
    let score = 0.35;
    const reasons: string[] = [];
    if (plausible.includes(recipe.state)) {
      score += 0.3 - plausible.indexOf(recipe.state) * 0.08;
      reasons.push(`${beat.timeOfDay} is plausible for ${recipe.state}`);
    } else {
      score -= 0.35;
      reasons.push(`${recipe.state} is not plausible at ${beat.timeOfDay}`);
    }
    if (negative && recipe.state === 'OVERCAST') {
      score += 0.16;
      reasons.push('a negative-valence beat reads under a flatter, cooler key');
    }
    if (!negative && recipe.state === 'OVERCAST') score -= 0.12;
    if (['PAYOFF', 'RESOLUTION', 'DISCOVERY'].includes(beat.purpose) && recipe.state === 'GOLDEN_HOUR') {
      score += 0.14;
      reasons.push(`${beat.purpose} beats carry warmth`);
    }
    if (peak > 0.6 && recipe.rimEnergy >= 0.45) {
      score += 0.08;
      reasons.push('a strong rim separates the subject at an emotional peak');
    }
    // Exposure continuity: staying with the previous recipe is cheap and safe.
    if (input.previous?.recipe === recipe.name) {
      score += 0.1;
      reasons.push('matches the previous shot, so exposure is continuous across the cut');
    }
    return { recipe, score: Math.max(0, Math.min(1, score)), because: reasons.join('; ') };
  }).sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));

  const winner = scored[0];
  const recipe = winner.recipe;

  // Emotional intent nudges exposure within a narrow band; it never re-tunes the
  // measured rig, and the band is far inside the mean-luma gate.
  const emotionalExposure = quantize(recipe.exposure + (negative ? -0.06 : 0.03) * peak, 3);
  const predicted: LightingPlan['predicted'] = {
    meanLumaFraction: boundedUnit(recipe.predicted.meanLumaFraction + emotionalExposure * 0.06, 4),
    highlightClipFraction: boundedUnit(recipe.predicted.highlightClipFraction, 5),
    shadowFloorP01: clampQuantize(recipe.predicted.shadowFloorP01 + emotionalExposure * 6, 0, 255, 2),
    tonalRange: clampQuantize(recipe.predicted.tonalRange, 0, 255, 2),
    meanSaturation: clampQuantize(recipe.predicted.meanSaturation, 0, 128, 2),
    subjectSeparationLuma: clampQuantize(recipe.predicted.subjectSeparationLuma, 0, 255, 2),
    contactShadowLuma: clampQuantize(recipe.predicted.contactShadowLuma, 0, 255, 2),
    // Catchlights come from the emissive catchlight material the polish pass
    // guarantees, plus a rim with enough energy to register in the eye.
    catchlightPresent: recipe.rimEnergy >= 0.3,
    // Flicker comes from per-frame lighting changes. This layer emits one state for
    // the whole shot, so the risk is structurally low.
    flickerRisk: boundedUnit(0.02 + rng.float(0, 0.02), 4),
    // Shadow acne is what the shadow proxy exists to prevent; a harder key raises
    // the residual risk, which is why the softness floor matters.
    shadowAcneRisk: boundedUnit(0.04 + (1 - recipe.keySoftness) * 0.12, 4),
  };

  const practicals =
    beat.requiredProps.some((prop) => /map/i.test(prop)) && ['DISCOVERY', 'HOOK', 'TURN'].includes(beat.purpose)
      ? [
          {
            source: 'map_glow',
            relativeEnergy: boundedUnit(0.18 + peak * 0.12, 3),
            motivation: 'the map is the beat\u2019s subject; a soft practical draws the eye to it',
          },
        ]
      : [];

  const plan: LightingPlan = LightingPlanSchema.parse({
    recipe: recipe.name,
    state: recipe.state,
    intent: recipe.intent,
    key: {
      role: 'key',
      relativeEnergy: boundedUnit(recipe.keyEnergy, 3),
      softness: boundedUnit(recipe.keySoftness, 3),
      azimuthDegrees: recipe.keyAzimuth,
    },
    fill: { role: 'fill', relativeEnergy: boundedUnit(recipe.fillEnergy, 3), softness: boundedUnit(recipe.fillSoftness, 3) },
    rim: { role: 'rim', relativeEnergy: boundedUnit(recipe.rimEnergy, 3), coneDegrees: recipe.rimCone },
    practicals,
    palette: { name: recipe.palette, warmthKelvinBias: recipe.warmthBias },
    timeOfDay: beat.timeOfDay,
    colorManagement: { viewTransform: APPROVED_VIEW_TRANSFORM, look: APPROVED_LOOK, exposure: emotionalExposure },
    predicted,
    exposureContinuityWith: input.previous?.shotId,
    samplesHint: recipe.samples,
    provenance: { system: 'lighting', version: SUBSYSTEM_VERSIONS.lighting, seed },
  });

  decisions.push({
    system: 'lighting',
    shotId,
    decision: 'recipe',
    chose: `${recipe.name} → ${recipe.state}`,
    because: winner.because,
    alternatives: scored.slice(1, 4).map((entry) => ({
      option: entry.recipe.name,
      score: quantize(entry.score, 3),
      rejectedBecause: entry.because,
    })),
    seed,
  });

  const issues = validateLighting(plan, {
    shotId,
    requiresCatchlight: input.requiresCatchlight,
    previousExposure: input.previous?.exposure,
  });

  return { plan, issues, decisions };
}

/**
 * Fail closed on any of the failures a children's short cannot ship with.
 *
 * Exported and thresholds-driven so the deliberately-rejected fixtures above can
 * be run through the same function in tests.
 */
export function validateLighting(
  plan: Pick<LightingPlan, 'predicted' | 'colorManagement' | 'recipe'>,
  context: { shotId?: string; requiresCatchlight: boolean; previousExposure?: number },
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const fail = (code: string, message: string, measured?: PlanIssue['measured'], severity: PlanIssue['severity'] = 'ERROR') =>
    issues.push({ code, severity, system: 'lighting', shotId: context.shotId, message, measured });

  const p = plan.predicted;

  if (p.highlightClipFraction > LIGHTING_THRESHOLDS.highlightClipMax) {
    fail('LIGHTING_CLIPPED_HIGHLIGHTS', `Highlight clipping ${p.highlightClipFraction} exceeds ${LIGHTING_THRESHOLDS.highlightClipMax}.`, {
      measured: p.highlightClipFraction,
      tolerance: LIGHTING_THRESHOLDS.highlightClipMax,
    });
  }
  if (p.shadowFloorP01 < LIGHTING_THRESHOLDS.shadowFloorP01Min) {
    fail('LIGHTING_CRUSHED_SHADOWS', `Shadow floor p01 ${p.shadowFloorP01} is below ${LIGHTING_THRESHOLDS.shadowFloorP01Min}.`, {
      measured: p.shadowFloorP01,
      tolerance: LIGHTING_THRESHOLDS.shadowFloorP01Min,
    });
  }
  if (p.meanLumaFraction < LIGHTING_THRESHOLDS.meanLumaMin || p.meanLumaFraction > LIGHTING_THRESHOLDS.meanLumaMax) {
    fail(
      'LIGHTING_LUMA_OUT_OF_RANGE',
      `Mean luma ${p.meanLumaFraction} is outside ${LIGHTING_THRESHOLDS.meanLumaMin}–${LIGHTING_THRESHOLDS.meanLumaMax} of range.`,
      { measured: p.meanLumaFraction, min: LIGHTING_THRESHOLDS.meanLumaMin, max: LIGHTING_THRESHOLDS.meanLumaMax },
    );
  }
  if (p.tonalRange < LIGHTING_THRESHOLDS.tonalRangeMin) {
    fail('LIGHTING_TONAL_RANGE_TOO_LOW', `Tonal range ${p.tonalRange} is below ${LIGHTING_THRESHOLDS.tonalRangeMin}.`, {
      measured: p.tonalRange,
      tolerance: LIGHTING_THRESHOLDS.tonalRangeMin,
    });
  }
  if (p.meanSaturation < LIGHTING_THRESHOLDS.meanSaturationMin) {
    fail('LIGHTING_SATURATION_TOO_LOW', `Mean saturation ${p.meanSaturation} is below ${LIGHTING_THRESHOLDS.meanSaturationMin}.`, {
      measured: p.meanSaturation,
      tolerance: LIGHTING_THRESHOLDS.meanSaturationMin,
    });
  }
  if (p.subjectSeparationLuma < LIGHTING_THRESHOLDS.subjectSeparationMin) {
    fail(
      'LIGHTING_INADEQUATE_SEPARATION',
      `Subject separation ${p.subjectSeparationLuma} luma is below ${LIGHTING_THRESHOLDS.subjectSeparationMin}; the character will not read against the field.`,
      { measured: p.subjectSeparationLuma, tolerance: LIGHTING_THRESHOLDS.subjectSeparationMin },
    );
  }
  if (p.contactShadowLuma < LIGHTING_THRESHOLDS.contactShadowMin) {
    fail(
      'LIGHTING_MISSING_CONTACT_SHADOW',
      `Contact shadow ${p.contactShadowLuma} luma is below ${LIGHTING_THRESHOLDS.contactShadowMin}; the cast will not sit on the ground.`,
      { measured: p.contactShadowLuma, tolerance: LIGHTING_THRESHOLDS.contactShadowMin },
    );
  }
  if (context.requiresCatchlight && !p.catchlightPresent) {
    fail('LIGHTING_MISSING_CATCHLIGHT', 'This framing needs an eye catchlight and the recipe provides none.');
  }
  if (p.shadowAcneRisk > LIGHTING_THRESHOLDS.shadowAcneRiskMax) {
    fail('LIGHTING_SHADOW_ACNE_RISK', `Shadow acne risk ${p.shadowAcneRisk} exceeds ${LIGHTING_THRESHOLDS.shadowAcneRiskMax}.`, {
      measured: p.shadowAcneRisk,
      tolerance: LIGHTING_THRESHOLDS.shadowAcneRiskMax,
    });
  }
  if (p.flickerRisk > LIGHTING_THRESHOLDS.flickerRiskMax) {
    fail('LIGHTING_FLICKER_RISK', `Flicker risk ${p.flickerRisk} exceeds ${LIGHTING_THRESHOLDS.flickerRiskMax}.`, {
      measured: p.flickerRisk,
      tolerance: LIGHTING_THRESHOLDS.flickerRiskMax,
    });
  }
  if (plan.colorManagement.viewTransform !== APPROVED_VIEW_TRANSFORM || plan.colorManagement.look !== APPROVED_LOOK) {
    fail(
      'LIGHTING_UNAPPROVED_COLOR_MANAGEMENT',
      `Colour management must be "${APPROVED_VIEW_TRANSFORM}" / look "${APPROVED_LOOK}"; recipe ${plan.recipe} asked for "${plan.colorManagement.viewTransform}" / "${plan.colorManagement.look}".`,
    );
  }
  if (context.previousExposure !== undefined) {
    const drift = Math.abs(plan.colorManagement.exposure - context.previousExposure);
    if (drift > LIGHTING_THRESHOLDS.exposureContinuityStops) {
      fail(
        'LIGHTING_EXPOSURE_DISCONTINUITY',
        `Exposure moves ${quantize(drift, 3)} stops from the previous shot; over ${LIGHTING_THRESHOLDS.exposureContinuityStops} the cut will pop.`,
        { measured: quantize(drift, 3), tolerance: LIGHTING_THRESHOLDS.exposureContinuityStops },
      );
    }
  }
  return issues;
}

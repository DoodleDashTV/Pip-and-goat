/**
 * Quality tiers and the render-tier contract.
 *
 * Two orthogonal axes that are easy to conflate and expensive to conflate:
 *
 *   - **Quality tier** is about the *assets*. `PROTOTYPE` is what exists today:
 *     functional, low detail, sufficient to prove the pipeline. `THEATRICAL` is
 *     the standard the studio is being built toward. An asset is one or the other
 *     and rendering it harder does not promote it.
 *
 *   - **Render tier** is about *this render*. `DRAFT` is EEVEE at low resolution
 *     for blocking and QC. `REVIEW` is a representative look for approval.
 *     `FINAL` is Cycles with global illumination, passes, compositing and a grade.
 *
 * The pairing matters because the two are independently wrong. A Cycles FINAL
 * render of prototype assets is a slow prototype render, not a movie; and a
 * theatrical asset in a DRAFT render is a cheap look at a good asset. Neither may
 * be labelled "final" or "production ready", and `canBeLabelledFinal()` is the one
 * place that judgement lives.
 *
 * Nothing here duplicates `EEVEE_QUALITY_PRESETS` in `packages/production`. That
 * table stays the authority on samples per profile; this file expresses *intent*
 * and maps it onto the existing `CloudRenderProfile` names, with a test asserting
 * the two vocabularies still agree.
 */
import { z } from 'zod';
import { DeliveryResolutionSchema, NonEmptyStringSchema, UnitScalarSchema } from './schema/common';
import { stableHash } from './determinism';

/** Asset quality. A property of the asset, not of how it was rendered. */
export const QUALITY_TIERS = ['PROTOTYPE', 'THEATRICAL'] as const;
export const QualityTierSchema = z.enum(QUALITY_TIERS);
export type QualityTier = z.infer<typeof QualityTierSchema>;

/** Render intent. A property of this render, not of the assets in it. */
export const RENDER_TIERS = ['DRAFT', 'REVIEW', 'FINAL'] as const;
export const RenderTierSchema = z.enum(RENDER_TIERS);
export type RenderTier = z.infer<typeof RenderTierSchema>;

export const RENDER_ENGINES = ['EEVEE', 'CYCLES'] as const;
export const RenderEngineSchema = z.enum(RENDER_ENGINES);
export type RenderEngine = z.infer<typeof RenderEngineSchema>;

/**
 * Render passes, named as Blender names them.
 *
 * `CRYPTO_OBJECT` / `CRYPTO_MATERIAL` / `CRYPTO_ASSET` are Cryptomatte layers; a
 * FINAL render must carry at least one, because selective repair in compositing
 * without a matte means re-rendering the shot to fix a background.
 */
export const RENDER_PASSES = [
  'COMBINED',
  'DEPTH',
  'MIST',
  'NORMAL',
  'POSITION',
  'VECTOR',
  'DIFFUSE_DIRECT',
  'DIFFUSE_COLOR',
  'GLOSSY_DIRECT',
  'GLOSSY_COLOR',
  'TRANSMISSION',
  'EMISSION',
  'ENVIRONMENT',
  'AO',
  'SHADOW',
  'SHADOW_CATCHER',
  'CRYPTO_OBJECT',
  'CRYPTO_MATERIAL',
  'CRYPTO_ASSET',
] as const;
export const RenderPassSchema = z.enum(RENDER_PASSES);
export type RenderPass = z.infer<typeof RenderPassSchema>;

export const CRYPTOMATTE_PASSES: readonly RenderPass[] = ['CRYPTO_OBJECT', 'CRYPTO_MATERIAL', 'CRYPTO_ASSET'];

export const DENOISERS = ['NONE', 'OPENIMAGEDENOISE', 'OPTIX'] as const;
export const DenoiserSchema = z.enum(DENOISERS);
export type Denoiser = z.infer<typeof DenoiserSchema>;

/**
 * The one approved colour pipeline, restated here because the render plan is
 * where a grade could quietly introduce a second one.
 *
 * Kept as literals so an unapproved transform fails schema validation rather than
 * a review. Matches `APPROVED_VIEW_TRANSFORM` in the lighting module and the
 * `view_transform` assemble_scene.py actually sets.
 */
export const APPROVED_RENDER_VIEW_TRANSFORM = 'Khronos PBR Neutral' as const;
export const APPROVED_RENDER_LOOK = 'None' as const;

/** The delivery master. A FINAL render at anything else is not a master. */
export const MASTER_RESOLUTION = '1080x1920' as const;

export const CompositingPlanSchema = z.object({
  enabled: z.boolean(),
  /** Recipe id, versioned so a comp change invalidates the shots it touched. */
  recipeId: z.string(),
  recipeVersion: z.string(),
  /** Comp operations, in order. Named intents, not a node graph. */
  operations: z.array(NonEmptyStringSchema).default([]),
  /** True when the comp consumes a Cryptomatte for selective repair. */
  usesCryptomatte: z.boolean(),
});
export type CompositingPlan = z.infer<typeof CompositingPlanSchema>;

export const ColorGradePlanSchema = z.object({
  enabled: z.boolean(),
  gradeId: z.string(),
  gradeVersion: z.string(),
  /** Locked. A grade may shape contrast and saturation, never the transform. */
  viewTransform: z.literal(APPROVED_RENDER_VIEW_TRANSFORM),
  look: z.literal(APPROVED_RENDER_LOOK),
  exposure: z.number().min(-2).max(2),
  contrast: z.number().min(-1).max(1),
  saturation: z.number().min(0).max(2),
});
export type ColorGradePlan = z.infer<typeof ColorGradePlanSchema>;

export const RenderPlanSchema = z.object({
  tier: RenderTierSchema,
  engine: RenderEngineSchema,
  resolution: DeliveryResolutionSchema,
  /** Sample count. Interpreted per engine; both engines read it as samples. */
  samples: z.number().int().min(1).max(4096),
  adaptiveSampling: z.object({
    enabled: z.boolean(),
    /** Noise threshold. Cycles only; ignored under EEVEE. */
    noiseThreshold: z.number().min(0).max(1),
    minSamples: z.number().int().min(0),
  }),
  denoise: z.object({ enabled: z.boolean(), denoiser: DenoiserSchema }),
  motionBlur: z.object({ enabled: z.boolean(), shutter: UnitScalarSchema }),
  depthOfField: z.object({
    enabled: z.boolean(),
    /** Motivated only. An f-stop without a reason is a blurry shot. */
    motivation: z.string(),
    fStop: z.number().min(0.7).max(32),
  }),
  passes: z.array(RenderPassSchema).min(1),
  compositing: CompositingPlanSchema,
  colorGrade: ColorGradePlanSchema,
  /** True when groom must be validated in this render before it is accepted. */
  groomValidation: z.boolean(),
  atmosphere: z.boolean(),
  /**
   * Whether this render may be described as a master.
   *
   * Derived, never asserted by a caller: FINAL tier, Cycles, master resolution,
   * theatrical assets, comp and grade present. Everything else is a look at
   * work in progress, however good it looks.
   */
  isMasterCandidate: z.boolean(),
  /** Existing `CloudRenderProfile` name this tier maps onto. */
  cloudRenderProfile: z.enum(['AUDIT_FAST', 'DRAFT_FAST', 'DRAFT_HD', 'FINAL_1080P', 'PREMIUM']),
  /** Everything above, hashed. Part of the shot cache key. */
  cacheKey: NonEmptyStringSchema,
});
export type RenderPlan = z.infer<typeof RenderPlanSchema>;

/**
 * Per-tier defaults.
 *
 * DRAFT is deliberately EEVEE-only and local: it is the tier that must never cost
 * money. FINAL is deliberately Cycles-only with passes, comp and grade — that is
 * the directive's three-tier system expressed as a constraint rather than a
 * convention, so a FINAL plan that skipped compositing fails validation.
 */
export const RENDER_TIER_DEFAULTS = {
  DRAFT: {
    engine: 'EEVEE' as RenderEngine,
    resolution: '540x960' as const,
    samples: 16,
    passes: ['COMBINED'] as RenderPass[],
    denoiser: 'NONE' as Denoiser,
    motionBlur: false,
    compositing: false,
    colorGrade: false,
    atmosphere: false,
    groomValidation: false,
    cloudRenderProfile: 'DRAFT_FAST' as const,
    purpose: 'blocking, animatic and automated QC — local, never billable',
  },
  REVIEW: {
    engine: 'EEVEE' as RenderEngine,
    resolution: '720x1280' as const,
    samples: 48,
    passes: ['COMBINED', 'DEPTH'] as RenderPass[],
    denoiser: 'OPENIMAGEDENOISE' as Denoiser,
    motionBlur: false,
    compositing: false,
    colorGrade: true,
    atmosphere: true,
    groomValidation: true,
    cloudRenderProfile: 'DRAFT_HD' as const,
    purpose: 'representative materials and groom for shot approval before FINAL',
  },
  FINAL: {
    engine: 'CYCLES' as RenderEngine,
    resolution: MASTER_RESOLUTION,
    samples: 512,
    passes: [
      'COMBINED',
      'DEPTH',
      'MIST',
      'NORMAL',
      'VECTOR',
      'DIFFUSE_COLOR',
      'GLOSSY_DIRECT',
      'EMISSION',
      'AO',
      'SHADOW',
      'CRYPTO_OBJECT',
      'CRYPTO_MATERIAL',
    ] as RenderPass[],
    denoiser: 'OPENIMAGEDENOISE' as Denoiser,
    motionBlur: true,
    compositing: true,
    colorGrade: true,
    atmosphere: true,
    groomValidation: true,
    cloudRenderProfile: 'PREMIUM' as const,
    purpose: 'Cycles GPU master with global illumination, passes, comp and grade',
  },
} as const;

/**
 * Engines a tier may use.
 *
 * REVIEW accepts reduced-sample Cycles, which is the whole point of the tier:
 * see the real light transport before paying for the real sample count.
 */
export const TIER_ALLOWED_ENGINES: Readonly<Record<RenderTier, readonly RenderEngine[]>> = {
  DRAFT: ['EEVEE'],
  REVIEW: ['EEVEE', 'CYCLES'],
  FINAL: ['CYCLES'],
};

/** Sample ceiling for REVIEW under Cycles. Above this it is a FINAL in disguise. */
export const REVIEW_CYCLES_SAMPLE_CEILING = 128;

/**
 * May this render be called final, production ready, or movie quality?
 *
 * The directive's pass definition, as code. A technically successful render is not
 * a visual pass: the assets must be theatrical, the tier must be FINAL, the engine
 * must be Cycles, comp and grade must be present, and a human must have approved
 * it. The last condition is not knowable here, so this function answers the
 * narrower question — *could* this render be a master — and artistic approval is
 * tracked separately in `acceptance.ts`. Both are required.
 */
export function canBeLabelledFinal(input: {
  readonly tier: RenderTier;
  readonly engine: RenderEngine;
  readonly resolution: string;
  readonly assetQuality: QualityTier;
  readonly compositing: boolean;
  readonly colorGrade: boolean;
}): boolean {
  return (
    input.tier === 'FINAL' &&
    input.engine === 'CYCLES' &&
    input.resolution === MASTER_RESOLUTION &&
    input.assetQuality === 'THEATRICAL' &&
    input.compositing &&
    input.colorGrade
  );
}

/**
 * Map a render tier onto the existing cloud render profile vocabulary.
 *
 * Extends `CloudRenderProfileSchema` rather than replacing it: the queue, cost
 * estimator, routing policy and worker all speak profiles, and a second
 * vocabulary would mean two things to keep in sync. A test asserts every value
 * returned here is a member of that enum.
 */
export function cloudRenderProfileFor(
  tier: RenderTier,
  resolution: string,
  engine: RenderEngine,
): RenderPlan['cloudRenderProfile'] {
  if (tier === 'FINAL') return engine === 'CYCLES' ? 'PREMIUM' : 'FINAL_1080P';
  if (tier === 'REVIEW') return resolution === MASTER_RESOLUTION ? 'FINAL_1080P' : 'DRAFT_HD';
  return resolution === '270x480' ? 'AUDIT_FAST' : 'DRAFT_FAST';
}

/**
 * Does this tier require paid-GPU authorization to execute?
 *
 * DRAFT never does — that is what makes local-first validation free. Cycles at
 * any tier does, because Cycles on this footage is a GPU job. The authorization
 * itself lives in the existing `ALLOW_PAID_GPU_LAUNCH` guard; the plan only
 * records that it would be needed, so a cost estimate can say so before anyone
 * presses anything.
 */
export function requiresPaidAuthorization(tier: RenderTier, engine: RenderEngine): boolean {
  return tier === 'FINAL' || engine === 'CYCLES';
}

export type RenderPlanInput = {
  readonly shotId: string;
  readonly tier: RenderTier;
  readonly assetQuality: QualityTier;
  readonly resolution: RenderPlan['resolution'];
  /** Lighting's own samples hint. Used as the floor for DRAFT. */
  readonly samplesHint: number;
  /** Camera depth-of-field intent, so a blur always has a stated reason. */
  readonly depthOfField?: { readonly motivation: string; readonly fStop: number };
  /** True when any character in this shot has groom to validate. */
  readonly hasGroom: boolean;
  /** Engine override, for reduced-sample Cycles at REVIEW. */
  readonly engine?: RenderEngine;
  readonly grade?: { readonly exposure: number; readonly contrast: number; readonly saturation: number };
};

export type RenderPlanResult = {
  readonly plan: RenderPlan;
  readonly issues: Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }>;
};

/**
 * Build a render plan for one shot and check it against the tier's contract.
 *
 * The checks are the interesting part. A FINAL plan without compositing, without a
 * Cryptomatte, at the wrong resolution, or on the wrong engine is refused here
 * rather than discovered when someone looks at the master; and a FINAL plan of
 * prototype assets is refused as a *master* while remaining perfectly legal as a
 * render, which is the distinction the directive is built around.
 */
export function planRender(input: RenderPlanInput): RenderPlanResult {
  const defaults = RENDER_TIER_DEFAULTS[input.tier];
  const engine = input.engine ?? defaults.engine;
  const issues: RenderPlanResult['issues'] = [];

  if (!TIER_ALLOWED_ENGINES[input.tier].includes(engine)) {
    issues.push({
      code: 'RENDER_ENGINE_NOT_ALLOWED_FOR_TIER',
      severity: 'ERROR',
      message: `${input.tier} renders may use ${TIER_ALLOWED_ENGINES[input.tier].join(' or ')}; got ${engine}.`,
    });
  }

  // DRAFT takes the larger of the tier default and lighting's hint, so a recipe
  // that needs more samples to read is not silently under-sampled; FINAL takes the
  // tier's own count, because a lighting hint tuned for EEVEE says nothing useful
  // about Cycles.
  const samples =
    input.tier === 'DRAFT'
      ? Math.max(defaults.samples, input.samplesHint)
      : input.tier === 'REVIEW' && engine === 'CYCLES'
        ? Math.min(REVIEW_CYCLES_SAMPLE_CEILING, defaults.samples)
        : defaults.samples;

  if (input.tier === 'REVIEW' && engine === 'CYCLES' && samples > REVIEW_CYCLES_SAMPLE_CEILING) {
    issues.push({
      code: 'REVIEW_SAMPLES_TOO_HIGH',
      severity: 'ERROR',
      message: `A REVIEW render above ${REVIEW_CYCLES_SAMPLE_CEILING} Cycles samples is a FINAL render at REVIEW prices.`,
    });
  }

  if (input.tier === 'FINAL' && input.resolution !== MASTER_RESOLUTION) {
    issues.push({
      code: 'FINAL_RESOLUTION_NOT_MASTER',
      severity: 'ERROR',
      message: `A FINAL render must be ${MASTER_RESOLUTION}; got ${input.resolution}.`,
    });
  }

  if (input.tier === 'FINAL' && input.assetQuality !== 'THEATRICAL') {
    issues.push({
      code: 'FINAL_TIER_ON_PROTOTYPE_ASSETS',
      severity: 'WARNING',
      message:
        'A FINAL render of PROTOTYPE assets is a slow prototype render, not a master. It may not be labelled final, production ready or movie quality.',
    });
  }

  const passes = [...defaults.passes];
  if (input.tier === 'FINAL' && !passes.some((pass) => CRYPTOMATTE_PASSES.includes(pass))) {
    issues.push({
      code: 'FINAL_MISSING_CRYPTOMATTE',
      severity: 'ERROR',
      message:
        'A FINAL render must emit a Cryptomatte pass; without one, fixing a background in comp means re-rendering the shot.',
    });
  }

  const compositing: CompositingPlan = {
    enabled: defaults.compositing,
    recipeId: defaults.compositing ? 'tivvlejoy_comp_v1' : '',
    recipeVersion: defaults.compositing ? '1.0.0' : '',
    operations: defaults.compositing
      ? ['denoise_passes', 'atmospheric_depth', 'bloom', 'vignette', 'grain']
      : [],
    usesCryptomatte: defaults.compositing && passes.some((pass) => CRYPTOMATTE_PASSES.includes(pass)),
  };

  const colorGrade: ColorGradePlan = {
    enabled: defaults.colorGrade,
    gradeId: defaults.colorGrade ? 'tivvlejoy_grade_v1' : '',
    gradeVersion: defaults.colorGrade ? '1.0.0' : '',
    viewTransform: APPROVED_RENDER_VIEW_TRANSFORM,
    look: APPROVED_RENDER_LOOK,
    exposure: input.grade?.exposure ?? 0,
    contrast: input.grade?.contrast ?? 0,
    saturation: input.grade?.saturation ?? 1,
  };

  const isMasterCandidate = canBeLabelledFinal({
    tier: input.tier,
    engine,
    resolution: input.resolution,
    assetQuality: input.assetQuality,
    compositing: compositing.enabled,
    colorGrade: colorGrade.enabled,
  });

  const draft = {
    tier: input.tier,
    engine,
    resolution: input.resolution,
    samples,
    adaptiveSampling: {
      enabled: engine === 'CYCLES',
      noiseThreshold: engine === 'CYCLES' ? 0.01 : 0,
      minSamples: engine === 'CYCLES' ? 32 : 0,
    },
    denoise: { enabled: defaults.denoiser !== 'NONE', denoiser: defaults.denoiser },
    motionBlur: { enabled: defaults.motionBlur, shutter: 0.5 },
    depthOfField: {
      enabled: input.depthOfField !== undefined && input.tier !== 'DRAFT',
      motivation: input.depthOfField?.motivation ?? '',
      fStop: input.depthOfField?.fStop ?? 2.8,
    },
    passes,
    compositing,
    colorGrade,
    // Nothing to validate when nothing is groomed; a check that cannot fail is
    // worse than no check, because it reads as coverage.
    groomValidation: defaults.groomValidation && input.hasGroom,
    atmosphere: defaults.atmosphere,
    isMasterCandidate,
    cloudRenderProfile: cloudRenderProfileFor(input.tier, input.resolution, engine),
  };

  const plan = RenderPlanSchema.parse({ ...draft, cacheKey: hashRenderPlan(draft) });
  return { plan, issues };
}

/**
 * Hash of a render plan, excluding its own key.
 *
 * Kept here rather than in `cache.ts` so the plan is self-keying: the render plan
 * is embedded in the shot cache key, and a plan whose key did not cover its own
 * passes would let a comp change reuse an un-composited frame.
 */
function hashRenderPlan(plan: Omit<RenderPlan, 'cacheKey'>): string {
  return stableHash(plan);
}

/**
 * Step 7 — Reusable production-grade VFX library.
 *
 * A versioned registry of parameterised, EEVEE-first effects with deterministic
 * seeds, performance budgets, and hard bounds. The registry is the contract; a
 * shot references an effect id and supplies overrides, so a preset improved once
 * improves everywhere and a small effect change never rebuilds a scene.
 *
 * Three constraints that shaped this:
 *   - a children's short is watched on a phone: an effect that is not readable at
 *     1080×1920 on a small screen is decoration nobody sees, so every preset
 *     declares a minimum on-screen size;
 *   - particles are the easiest way to make a render bill twice as much, so every
 *     preset carries a particle ceiling and a cost weight, and the planner sums
 *     them against a per-shot budget;
 *   - an effect that covers a face or a story prop has destroyed the shot it was
 *     meant to enhance, so occlusion is checked rather than hoped for.
 */
import { z } from 'zod';
import { NonEmptyStringSchema, UnitScalarSchema, type Decision, type PlanIssue } from '../schema/common';
import { boundedUnit, clampQuantize, createRng, deriveSeed, quantize, shortHash } from '../determinism';
import { SUBSYSTEM_VERSIONS } from '../versions';
import type { CameraPlan } from '../camera';
import type { EmotionPlan } from '../emotion';
import type { StoryBeat } from '../schema/scene-plan';

export const VFX_CATEGORIES = [
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
] as const;
export const VfxCategorySchema = z.enum(VFX_CATEGORIES);
export type VfxCategory = z.infer<typeof VfxCategorySchema>;

/** A registry entry. Versioned independently so a preset can improve in place. */
export const VfxPresetSchema = z.object({
  id: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  category: VfxCategorySchema,
  description: NonEmptyStringSchema,
  /** EEVEE-first implementation kind the Blender layer will build. */
  implementation: z.enum(['PARTICLE_EMITTER', 'EMISSIVE_MESH', 'SHADER_OVERLAY', 'SPRITE_BILLBOARD']),
  /** Hard ceiling on particles. There is no "unlimited" option by design. */
  maxParticles: z.number().int().min(0).max(4000),
  /** Seconds the effect may live. Bounded so nothing outlasts its shot. */
  maxLifetimeSeconds: z.number().positive().max(12),
  /** Bounding volume in metres; an effect may not exceed its own bounds. */
  maxBoundsMeters: z.object({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() }),
  /** Relative render cost, summed against the shot budget. */
  costWeight: z.number().min(0).max(10),
  /** Minimum on-screen size as a fraction of frame height, for phone readability. */
  minOnScreenFraction: UnitScalarSchema,
  /** Default palette, overridable per shot within the palette bounds. */
  defaultPalette: z.array(NonEmptyStringSchema).min(1),
  /** Child-safe intensity ceiling. Bright flashing effects are capped here. */
  maxIntensity: UnitScalarSchema,
  /** True when the effect renders in front of characters and can occlude faces. */
  canOcclude: z.boolean(),
  provenance: z.object({
    author: NonEmptyStringSchema,
    license: NonEmptyStringSchema,
    /** Where the look came from, so a licensing question has an answer. */
    origin: NonEmptyStringSchema,
  }),
});
export type VfxPreset = z.infer<typeof VfxPresetSchema>;

export const VfxInstanceSchema = z.object({
  instanceId: NonEmptyStringSchema,
  presetId: NonEmptyStringSchema,
  presetVersion: NonEmptyStringSchema,
  category: VfxCategorySchema,
  /** Deterministic seed for this instance. Same shot, same effect, same particles. */
  seed: z.number().int(),
  startMs: z.number().int().min(0),
  durationMs: z.number().int().positive(),
  intensity: UnitScalarSchema,
  particleCount: z.number().int().min(0),
  /** Anchor: a character, a prop, or a world position. */
  anchor: z.object({ kind: z.enum(['CHARACTER', 'PROP', 'WORLD']), ref: NonEmptyStringSchema }),
  boundsMeters: z.object({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() }),
  palette: z.array(NonEmptyStringSchema).min(1),
  /** Render layer: BEHIND keeps faces clear, FRONT is opt-in and checked. */
  layer: z.enum(['BEHIND_SUBJECT', 'AROUND_SUBJECT', 'FRONT_OF_SUBJECT']),
  /** Predicted on-screen size, checked against the preset's readability floor. */
  onScreenFraction: UnitScalarSchema,
  /** Fraction of the subject's face this instance covers. Must stay tiny. */
  facesOccludedFraction: UnitScalarSchema,
  /** Fraction of a required story prop this instance covers. */
  propOccludedFraction: UnitScalarSchema,
  /**
   * Cache key for this instance alone. Changing one effect re-renders the shots
   * that use it and nothing else.
   */
  cacheKey: NonEmptyStringSchema,
});
export type VfxInstance = z.infer<typeof VfxInstanceSchema>;

export const VfxPlanSchema = z.object({
  instances: z.array(VfxInstanceSchema).default([]),
  /** Sum of instance cost weights. */
  totalCostWeight: z.number().min(0),
  budgetCostWeight: z.number().min(0),
  totalParticles: z.number().int().min(0),
  /** True when this shot's effects can be re-rendered without the whole scene. */
  selectiveRerenderSupported: z.boolean(),
  provenance: z.object({ system: z.literal('vfx'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type VfxPlan = z.infer<typeof VfxPlanSchema>;

export const VFX_BUDGET = {
  /** Cost weight a single shot may spend on effects. */
  perShotCostWeight: 6,
  /** Particles a single shot may spend, across all effects. */
  perShotParticles: 3200,
  /** Fraction of a face an effect may cover before it is refused. */
  maxFaceOcclusion: 0.08,
  /** Fraction of a required story prop an effect may cover. */
  maxPropOcclusion: 0.12,
  /** Child-safe ceiling on any effect intensity, whatever the preset allows. */
  childSafeMaxIntensity: 0.85,
} as const;

const STUDIO_PROVENANCE = {
  author: 'TivvleJoy Studios',
  license: 'Proprietary — TivvleJoy Studios internal use',
  origin: 'Authored in-house as procedural EEVEE setups; no third-party asset imported',
} as const;

/** The registry. Adding a preset is additive; changing one bumps its version. */
export const VFX_REGISTRY: readonly VfxPreset[] = [
  {
    id: 'vfx_magic_sparkles_v1',
    version: '1.0.0',
    category: 'MAGICAL_SPARKLES',
    description: 'Small warm sparkles that rise and fade — wonder without flashing.',
    implementation: 'PARTICLE_EMITTER',
    maxParticles: 420,
    maxLifetimeSeconds: 2.5,
    maxBoundsMeters: { x: 0.9, y: 0.9, z: 1.2 },
    costWeight: 1.2,
    minOnScreenFraction: 0.04,
    defaultPalette: ['#FFE9A8', '#FFF6DA'],
    maxIntensity: 0.7,
    canOcclude: true,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_glow_trail_v1',
    version: '1.0.0',
    category: 'GLOWING_TRAIL',
    description: 'A soft emissive ribbon following a moving anchor.',
    implementation: 'EMISSIVE_MESH',
    maxParticles: 0,
    maxLifetimeSeconds: 3,
    maxBoundsMeters: { x: 3.5, y: 2.0, z: 0.8 },
    costWeight: 0.9,
    minOnScreenFraction: 0.06,
    defaultPalette: ['#BFA6FF', '#E7DEFF'],
    maxIntensity: 0.65,
    canOcclude: false,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_dust_puff_v1',
    version: '1.0.0',
    category: 'DUST_PUFF',
    description: 'Ground dust on a footfall or a landing. Sells weight.',
    implementation: 'PARTICLE_EMITTER',
    maxParticles: 260,
    maxLifetimeSeconds: 1.2,
    maxBoundsMeters: { x: 0.7, y: 0.7, z: 0.45 },
    costWeight: 0.8,
    minOnScreenFraction: 0.03,
    defaultPalette: ['#D8C7A6', '#EFE4CD'],
    maxIntensity: 0.55,
    canOcclude: false,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_leaves_wind_v1',
    version: '1.0.0',
    category: 'LEAVES_WIND',
    description: 'Leaves crossing frame on a breeze; gives the air motion.',
    implementation: 'SPRITE_BILLBOARD',
    maxParticles: 180,
    maxLifetimeSeconds: 4,
    maxBoundsMeters: { x: 5.0, y: 3.0, z: 2.5 },
    costWeight: 1.1,
    minOnScreenFraction: 0.05,
    defaultPalette: ['#8FBF6A', '#C9DE9C', '#E0C27A'],
    maxIntensity: 0.6,
    canOcclude: true,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_map_glow_v1',
    version: '1.0.0',
    category: 'MAP_GLOW',
    description: 'The adventure map lights its own markings. Motivated practical.',
    implementation: 'SHADER_OVERLAY',
    maxParticles: 0,
    maxLifetimeSeconds: 8,
    maxBoundsMeters: { x: 0.8, y: 0.6, z: 0.2 },
    costWeight: 0.5,
    minOnScreenFraction: 0.05,
    defaultPalette: ['#FFD98A', '#FFF0C4'],
    maxIntensity: 0.5,
    canOcclude: false,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_soft_mist_v1',
    version: '1.0.0',
    category: 'SOFT_MIST',
    description: 'Low ground mist for depth separation. Cheap atmosphere.',
    implementation: 'SHADER_OVERLAY',
    maxParticles: 0,
    maxLifetimeSeconds: 10,
    maxBoundsMeters: { x: 8.0, y: 8.0, z: 0.7 },
    costWeight: 0.7,
    minOnScreenFraction: 0.1,
    defaultPalette: ['#E8F0F5'],
    maxIntensity: 0.4,
    canOcclude: false,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_water_splash_v1',
    version: '1.0.0',
    category: 'WATER_SPLASH',
    description: 'A small splash for creek beats. Bounded, never a wave.',
    implementation: 'PARTICLE_EMITTER',
    maxParticles: 320,
    maxLifetimeSeconds: 1.4,
    maxBoundsMeters: { x: 0.9, y: 0.9, z: 0.8 },
    costWeight: 1.4,
    minOnScreenFraction: 0.04,
    defaultPalette: ['#BFE3F2', '#FFFFFF'],
    maxIntensity: 0.6,
    canOcclude: true,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_discovery_burst_v1',
    version: '1.0.0',
    category: 'DISCOVERY_BURST',
    description: 'One soft outward pulse on a discovery beat. No strobe, ever.',
    implementation: 'PARTICLE_EMITTER',
    maxParticles: 380,
    maxLifetimeSeconds: 1.1,
    maxBoundsMeters: { x: 1.3, y: 1.3, z: 1.3 },
    costWeight: 1.3,
    minOnScreenFraction: 0.08,
    defaultPalette: ['#FFE9A8', '#FFCFA0'],
    maxIntensity: 0.62,
    canOcclude: true,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_environment_particles_v1',
    version: '1.0.0',
    category: 'ENVIRONMENTAL_PARTICLES',
    description: 'Gentle pollen/motes drifting in the key light.',
    implementation: 'PARTICLE_EMITTER',
    maxParticles: 220,
    maxLifetimeSeconds: 6,
    maxBoundsMeters: { x: 6.0, y: 4.0, z: 3.0 },
    costWeight: 0.9,
    minOnScreenFraction: 0.02,
    defaultPalette: ['#FFF6DA'],
    maxIntensity: 0.35,
    canOcclude: false,
    provenance: STUDIO_PROVENANCE,
  },
  {
    id: 'vfx_transition_accent_v1',
    version: '1.0.0',
    category: 'TRANSITION_ACCENT',
    description: 'A short wipe accent to carry a cut between locations.',
    implementation: 'SHADER_OVERLAY',
    maxParticles: 0,
    maxLifetimeSeconds: 0.8,
    maxBoundsMeters: { x: 9.0, y: 9.0, z: 9.0 },
    costWeight: 0.6,
    minOnScreenFraction: 0.2,
    defaultPalette: ['#FFFFFF', '#FFE9A8'],
    maxIntensity: 0.45,
    canOcclude: true,
    provenance: STUDIO_PROVENANCE,
  },
];

export const VFX_PRESET_IDS = VFX_REGISTRY.map((preset) => preset.id).sort();

export function vfxPreset(id: string): VfxPreset | undefined {
  return VFX_REGISTRY.find((preset) => preset.id === id);
}

/** Beat purpose → effects the director will reach for unprompted. */
const PURPOSE_EFFECTS: Readonly<Record<string, readonly string[]>> = {
  HOOK: ['vfx_environment_particles_v1'],
  SETUP: ['vfx_environment_particles_v1'],
  DISCOVERY: ['vfx_discovery_burst_v1', 'vfx_map_glow_v1'],
  COMPLICATION: ['vfx_leaves_wind_v1'],
  TURN: ['vfx_magic_sparkles_v1'],
  PAYOFF: ['vfx_magic_sparkles_v1', 'vfx_environment_particles_v1'],
  RESOLUTION: ['vfx_soft_mist_v1'],
  BUTTON: ['vfx_dust_puff_v1'],
};

export type VfxInput = {
  readonly beat: StoryBeat;
  readonly rootSeed: string;
  readonly shotId: string;
  readonly durationSeconds: number;
  readonly emotions: ReadonlyArray<EmotionPlan>;
  readonly camera: CameraPlan;
  /** Characters travelling; a footfall gets dust. */
  readonly travellingCharacters: readonly string[];
  readonly budgetCostWeight?: number;
};

export type VfxResult = {
  readonly plan: VfxPlan;
  readonly issues: PlanIssue[];
  readonly decisions: Decision[];
};

export function planVfx(input: VfxInput): VfxResult {
  const { beat, rootSeed, shotId, durationSeconds, camera } = input;
  const seed = deriveSeed(rootSeed, shotId, 'vfx');
  const rng = createRng(seed);
  const issues: PlanIssue[] = [];
  const decisions: Decision[] = [];
  const budget = input.budgetCostWeight ?? VFX_BUDGET.perShotCostWeight;

  // Story requests come first and are honoured or explicitly refused; never
  // silently dropped, because "the sparkles didn't happen" is not a debuggable
  // report.
  const requested = [...beat.vfxRequests];
  const suggested = PURPOSE_EFFECTS[beat.purpose] ?? [];
  const travelDust = input.travellingCharacters.length > 0 ? ['vfx_dust_puff_v1'] : [];

  const candidates = [...new Set([...requested, ...suggested, ...travelDust])].sort();
  const peak = Math.max(0, ...input.emotions.map((emotion) => emotion.intensity));

  const instances: VfxInstance[] = [];
  let costWeight = 0;
  let particles = 0;

  for (const presetId of candidates) {
    const preset = vfxPreset(presetId);
    if (!preset) {
      issues.push({
        code: 'VFX_UNKNOWN_PRESET',
        severity: requested.includes(presetId) ? 'ERROR' : 'WARNING',
        system: 'vfx',
        shotId,
        message: `No VFX registry entry "${presetId}".`,
      });
      continue;
    }

    if (costWeight + preset.costWeight > budget) {
      issues.push({
        code: 'VFX_BUDGET_EXCEEDED',
        severity: requested.includes(presetId) ? 'ERROR' : 'INFO',
        system: 'vfx',
        shotId,
        message: `Adding ${preset.id} would spend ${quantize(costWeight + preset.costWeight, 2)} of a ${budget} cost budget; skipped.`,
        measured: { would: quantize(costWeight + preset.costWeight, 2), budget },
      });
      continue;
    }

    const instanceSeed = deriveSeed(rootSeed, shotId, 'vfx', preset.id);
    const instanceRng = createRng(instanceSeed);
    const intensity = boundedUnit(
      Math.min(preset.maxIntensity, VFX_BUDGET.childSafeMaxIntensity, 0.3 + peak * 0.5 + instanceRng.float(0, 0.06)),
      3,
    );
    const durationMs = Math.round(Math.min(preset.maxLifetimeSeconds, durationSeconds) * 1000);
    const particleCount = Math.round(preset.maxParticles * intensity);

    if (particles + particleCount > VFX_BUDGET.perShotParticles) {
      issues.push({
        code: 'VFX_PARTICLE_BUDGET_EXCEEDED',
        severity: 'INFO',
        system: 'vfx',
        shotId,
        message: `${preset.id} would push particles to ${particles + particleCount}, over the ${VFX_BUDGET.perShotParticles} shot ceiling; skipped.`,
        measured: { would: particles + particleCount, ceiling: VFX_BUDGET.perShotParticles },
      });
      continue;
    }

    const anchor = resolveAnchor(preset, beat, input);
    // Effects sit behind or around the subject unless the preset is a full-frame
    // overlay. Nothing is placed in front of a face by default.
    const layer: VfxInstance['layer'] =
      preset.category === 'TRANSITION_ACCENT'
        ? 'FRONT_OF_SUBJECT'
        : preset.canOcclude
          ? 'AROUND_SUBJECT'
          : 'BEHIND_SUBJECT';

    // On-screen size scales with how tight the framing is: the same sparkle is
    // bigger on screen in a close-up than in a wide. The characteristic size is the
    // effect's largest extent, not its vertical thickness — a map glow is a flat
    // pool of light 0.8 m across and 0.2 m thick, and judging it by the 0.2 m would
    // call a plainly visible effect invisible. What the audience reads is the widest
    // thing on screen, whichever axis it happens to lie along.
    const largestExtentMeters = Math.max(
      preset.maxBoundsMeters.x,
      preset.maxBoundsMeters.y,
      preset.maxBoundsMeters.z,
    );
    const onScreenFraction = boundedUnit(
      largestExtentMeters * 0.14 * (0.5 + camera.framing.subjectHeightFraction),
      3,
    );
    const facesOccludedFraction =
      layer === 'FRONT_OF_SUBJECT'
        ? boundedUnit(0.02 + intensity * 0.03, 4)
        : layer === 'AROUND_SUBJECT'
          ? boundedUnit(intensity * 0.03, 4)
          : 0;
    const propOccludedFraction =
      beat.requiredProps.length > 0 && layer !== 'BEHIND_SUBJECT' ? boundedUnit(intensity * 0.05, 4) : 0;

    const boundsMeters = {
      x: quantize(preset.maxBoundsMeters.x * (0.6 + intensity * 0.4), 3),
      y: quantize(preset.maxBoundsMeters.y * (0.6 + intensity * 0.4), 3),
      z: quantize(preset.maxBoundsMeters.z * (0.6 + intensity * 0.4), 3),
    };

    const instance: VfxInstance = VfxInstanceSchema.parse({
      instanceId: `${shotId}_${preset.id}`,
      presetId: preset.id,
      presetVersion: preset.version,
      category: preset.category,
      seed: instanceSeed,
      startMs: Math.round(
        // Discovery-style bursts land on the beat, not at the top of the shot.
        preset.category === 'DISCOVERY_BURST' || preset.category === 'DUST_PUFF'
          ? Math.min(durationSeconds * 1000 - durationMs, durationSeconds * 1000 * 0.35)
          : 0,
      ),
      durationMs,
      intensity,
      particleCount,
      anchor,
      boundsMeters,
      palette: preset.defaultPalette,
      layer,
      onScreenFraction,
      facesOccludedFraction,
      propOccludedFraction,
      // Instance-level cache key: everything that changes these pixels, and
      // nothing else. This is what makes "change one effect, re-render one shot"
      // true rather than aspirational.
      cacheKey: shortHash({
        presetId: preset.id,
        presetVersion: preset.version,
        seed: instanceSeed,
        intensity,
        durationMs,
        particleCount,
        boundsMeters,
        palette: preset.defaultPalette,
        layer,
        anchor,
        system: SUBSYSTEM_VERSIONS.vfx,
      }, 24),
    });

    instances.push(instance);
    costWeight += preset.costWeight;
    particles += particleCount;

    decisions.push({
      system: 'vfx',
      shotId,
      decision: 'effect',
      chose: `${preset.id}@${preset.version} at ${intensity}`,
      because: requested.includes(preset.id)
        ? 'requested by the story beat'
        : travelDust.includes(preset.id)
          ? 'a character travels, so footfalls need dust to carry weight'
          : `${beat.purpose} beats use this effect by default`,
      alternatives: [],
      seed: instanceSeed,
    });
  }

  void rng;

  const plan: VfxPlan = VfxPlanSchema.parse({
    instances: instances.sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
    totalCostWeight: quantize(costWeight, 3),
    budgetCostWeight: budget,
    totalParticles: particles,
    // Every instance is independently cache-keyed and anchored, so the renderer can
    // rebuild an effect pass without re-assembling the scene.
    selectiveRerenderSupported: true,
    provenance: { system: 'vfx', version: SUBSYSTEM_VERSIONS.vfx, seed },
  });

  issues.push(...validateVfx(plan, { shotId, requiredProps: beat.requiredProps }));
  return { plan, issues, decisions };
}

function resolveAnchor(preset: VfxPreset, beat: StoryBeat, input: VfxInput): VfxInstance['anchor'] {
  if (preset.category === 'MAP_GLOW' || preset.category === 'DISCOVERY_BURST') {
    const prop = beat.requiredProps[0];
    if (prop) return { kind: 'PROP', ref: prop };
  }
  if (preset.category === 'DUST_PUFF' || preset.category === 'GLOWING_TRAIL') {
    const traveller = [...input.travellingCharacters].sort()[0];
    if (traveller) return { kind: 'CHARACTER', ref: traveller };
  }
  if (preset.category === 'MAGICAL_SPARKLES') {
    const focus = [...beat.characters].sort((a, b) => Number(b.focus) - Number(a.focus) || a.characterCode.localeCompare(b.characterCode))[0];
    if (focus) return { kind: 'CHARACTER', ref: focus.characterCode };
  }
  return { kind: 'WORLD', ref: beat.locationId };
}

export function validateVfx(
  plan: VfxPlan,
  context: { shotId?: string; requiredProps: readonly string[] },
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const fail = (code: string, message: string, measured?: PlanIssue['measured'], severity: PlanIssue['severity'] = 'ERROR') =>
    issues.push({ code, severity, system: 'vfx', shotId: context.shotId, message, measured });

  if (plan.totalCostWeight > plan.budgetCostWeight) {
    fail('VFX_OVER_BUDGET', `Effects cost ${plan.totalCostWeight} against a ${plan.budgetCostWeight} budget.`, {
      measured: plan.totalCostWeight,
      tolerance: plan.budgetCostWeight,
    });
  }
  if (plan.totalParticles > VFX_BUDGET.perShotParticles) {
    fail('VFX_UNCONTROLLED_PARTICLES', `Shot plans ${plan.totalParticles} particles, over the ${VFX_BUDGET.perShotParticles} ceiling.`, {
      measured: plan.totalParticles,
      tolerance: VFX_BUDGET.perShotParticles,
    });
  }

  const faceOcclusion = plan.instances.reduce((sum, instance) => sum + instance.facesOccludedFraction, 0);
  if (faceOcclusion > VFX_BUDGET.maxFaceOcclusion) {
    fail(
      'VFX_OCCLUDES_FACE',
      `Effects cover ${quantize(faceOcclusion, 4)} of the face, over ${VFX_BUDGET.maxFaceOcclusion}; the acting would be hidden.`,
      { measured: quantize(faceOcclusion, 4), tolerance: VFX_BUDGET.maxFaceOcclusion },
    );
  }

  if (context.requiredProps.length > 0) {
    const propOcclusion = plan.instances.reduce((sum, instance) => sum + instance.propOccludedFraction, 0);
    if (propOcclusion > VFX_BUDGET.maxPropOcclusion) {
      fail(
        'VFX_OCCLUDES_REQUIRED_PROP',
        `Effects cover ${quantize(propOcclusion, 4)} of a required story prop, over ${VFX_BUDGET.maxPropOcclusion}.`,
        { measured: quantize(propOcclusion, 4), tolerance: VFX_BUDGET.maxPropOcclusion },
      );
    }
  }

  for (const instance of plan.instances) {
    const preset = vfxPreset(instance.presetId);
    if (!preset) {
      fail('VFX_UNKNOWN_PRESET', `Instance ${instance.instanceId} references unknown preset ${instance.presetId}.`);
      continue;
    }
    if (instance.particleCount > preset.maxParticles) {
      fail('VFX_PARTICLE_CEILING', `${instance.instanceId} asks for ${instance.particleCount} particles; preset ceiling is ${preset.maxParticles}.`, {
        measured: instance.particleCount,
        tolerance: preset.maxParticles,
      });
    }
    if (instance.durationMs > preset.maxLifetimeSeconds * 1000) {
      fail('VFX_LIFETIME_EXCEEDED', `${instance.instanceId} lives ${instance.durationMs}ms; preset ceiling is ${preset.maxLifetimeSeconds * 1000}ms.`, {
        measured: instance.durationMs,
        tolerance: preset.maxLifetimeSeconds * 1000,
      });
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      if (instance.boundsMeters[axis] > preset.maxBoundsMeters[axis] + 1e-6) {
        fail('VFX_BOUNDS_EXCEEDED', `${instance.instanceId} exceeds its preset bounds on ${axis}.`, {
          measured: instance.boundsMeters[axis],
          tolerance: preset.maxBoundsMeters[axis],
        });
      }
    }
    if (instance.intensity > Math.min(preset.maxIntensity, VFX_BUDGET.childSafeMaxIntensity) + 1e-6) {
      fail('VFX_INTENSITY_UNSAFE', `${instance.instanceId} intensity ${instance.intensity} exceeds the child-safe ceiling.`, {
        measured: instance.intensity,
        tolerance: Math.min(preset.maxIntensity, VFX_BUDGET.childSafeMaxIntensity),
      });
    }
    if (instance.onScreenFraction < preset.minOnScreenFraction) {
      fail(
        'VFX_UNREADABLE_ON_PHONE',
        `${instance.instanceId} covers ${instance.onScreenFraction} of frame height; below ${preset.minOnScreenFraction} it is invisible on a phone.`,
        { measured: instance.onScreenFraction, tolerance: preset.minOnScreenFraction },
        'WARNING',
      );
    }
    for (const colour of instance.palette) {
      if (!preset.defaultPalette.includes(colour)) {
        fail('VFX_PALETTE_OUT_OF_BOUNDS', `${instance.instanceId} uses colour ${colour}, outside preset ${preset.id}'s palette.`, undefined, 'WARNING');
      }
    }
  }

  return issues;
}

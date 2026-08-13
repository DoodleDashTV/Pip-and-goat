/**
 * Groom, simulation and secondary motion.
 *
 * Today none of this runs. The prototype characters have no fur, no feather
 * curves, no cloth, and their backpack and collar move because the acting planner
 * lags them a few frames. That is a legitimate prototype answer and it stays the
 * default.
 *
 * What this file adds is the *contract*, so that when the theatrical assets arrive
 * the planner already knows how to ask for groom deformation and a cloth cache,
 * and — more importantly — the cache key already accounts for them. A groom
 * version that is not in the cache key is a groom change that serves stale
 * frames, and it is much cheaper to reserve the field now than to discover the
 * omission against a library of cached theatrical shots.
 *
 * The three tiers of answer, in increasing cost:
 *   - `NONE` — no groom or dynamics. The prototype.
 *   - `PROCEDURAL` — planner-side frame lag and noise. Cheap, no cache, no solver.
 *   - `SIMULATED` — a solver runs and writes a cache that the render reads.
 */
import { z } from 'zod';
import { CharacterCodeSchema, NonEmptyStringSchema, UnitScalarSchema, type CharacterCode } from './schema/common';
import { stableHash } from './determinism';
import type { RigProfile } from './rig';

export const MOTION_SOLVE_MODES = ['NONE', 'PROCEDURAL', 'SIMULATED'] as const;
export const MotionSolveModeSchema = z.enum(MOTION_SOLVE_MODES);
export type MotionSolveMode = z.infer<typeof MotionSolveModeSchema>;

/**
 * A simulation cache reference.
 *
 * Content-addressed by `cacheKey` rather than by path, so two shots with identical
 * motion, identical groom and identical wind share one bake. `frameRange` is
 * inclusive and includes pre-roll: a cloth solve that starts on the shot's first
 * frame starts from a flat rest pose and pops.
 */
export const SimulationCacheSchema = z.object({
  /** Solver that produces the cache. */
  solver: z.enum(['CLOTH', 'HAIR', 'RIGID_BODY', 'SOFT_BODY', 'PARTICLE']),
  /** Everything that affects the bake, hashed. Also the cache's identity. */
  cacheKey: NonEmptyStringSchema,
  /** Frames to bake, including pre-roll before the shot's first frame. */
  frameRange: z.object({ start: z.number().int(), end: z.number().int() }),
  preRollFrames: z.number().int().min(0).max(240),
  /** Substeps. Higher is more stable and more expensive. */
  substeps: z.number().int().min(1).max(32),
  /**
   * Temporal stability requirement.
   *
   * A sim that is stable in isolation and jitters when the camera moves is a
   * failed sim; the QC gate measures against this rather than eyeballing it.
   */
  maxJitterUnit: UnitScalarSchema,
  /** True when the bake must exist before the render may start. */
  requiredBeforeRender: z.boolean(),
});
export type SimulationCache = z.infer<typeof SimulationCacheSchema>;

export const GroomPlanSchema = z.object({
  characterCode: CharacterCodeSchema,
  mode: MotionSolveModeSchema,
  /** Groom asset version this plan is bound to. Absent when mode is NONE. */
  groomVersion: z.string().optional(),
  /** How strongly groom responds to the body's motion, 0..1. */
  motionResponse: UnitScalarSchema,
  /** How strongly groom responds to environmental wind, 0..1. */
  windResponse: UnitScalarSchema,
  /** Named groom regions this shot needs deforming — crest, chest, ears, tail. */
  regions: z.array(NonEmptyStringSchema).default([]),
  /** Present only when mode is SIMULATED. */
  cache: SimulationCacheSchema.optional(),
  /** True when this render must validate groom before the shot is accepted. */
  validationRequired: z.boolean(),
});
export type GroomPlan = z.infer<typeof GroomPlanSchema>;

/**
 * Secondary motion for one part.
 *
 * `PROCEDURAL` mode carries the frame lag and decay the acting planner already
 * produces, so the prototype behaviour is expressible here without changing it.
 * `SIMULATED` mode carries a cache instead. Both name the same part, so switching
 * a backpack from lag to cloth is a mode change, not a re-plan.
 */
export const SecondaryMotionItemSchema = z.object({
  part: NonEmptyStringSchema,
  mode: MotionSolveModeSchema,
  /** Frames this part trails the body by. Procedural mode only. */
  lagFrames: z.number().int().min(0).max(24),
  decay: UnitScalarSchema,
  /** Amplitude ceiling, so a swinging tag never leaves its arc. */
  maxAmplitudeUnit: UnitScalarSchema,
  cache: SimulationCacheSchema.optional(),
});
export type SecondaryMotionItem = z.infer<typeof SecondaryMotionItemSchema>;

export const SimulationPlanSchema = z.object({
  /** Per-character groom. One entry per character in the shot, always. */
  groom: z.array(GroomPlanSchema),
  /** Accessory and appendage dynamics: backpack, collar, tag, ears, tail. */
  secondaryMotion: z.array(SecondaryMotionItemSchema),
  /** Environmental motion the shot needs — grass, foliage, dust in air. */
  environment: z
    .array(z.object({ element: NonEmptyStringSchema, mode: MotionSolveModeSchema, intensity: UnitScalarSchema }))
    .default([]),
  /** Caches that must be baked before this shot renders, deduplicated. */
  requiredCaches: z.array(SimulationCacheSchema).default([]),
  /** Total solver cost weight, advisory, for the cost estimate. */
  costWeight: z.number().min(0),
  provenance: z.object({ system: z.literal('simulation'), version: NonEmptyStringSchema, seed: z.number().int() }),
});
export type SimulationPlan = z.infer<typeof SimulationPlanSchema>;

export type SimulationInput = {
  readonly shotId: string;
  readonly seed: number;
  readonly version: string;
  readonly fps: number;
  readonly frameRange: { readonly start: number; readonly end: number };
  readonly characters: ReadonlyArray<{
    readonly characterCode: CharacterCode;
    readonly rig: RigProfile;
    /** Groom asset version from the character's asset binding, when it has one. */
    readonly groomVersion?: string;
    /** Body energy from the acting plan; groom follows the body. */
    readonly energy: number;
    /** Overlap parts and lags the acting planner already decided. */
    readonly overlap: ReadonlyArray<{ part: string; lagFrames: number; decay: number }>;
    readonly secondaryMotion: number;
  }>;
  /** Wind in the environment, 0..1. Drives groom and foliage together. */
  readonly windUnit: number;
  /** True when this render must validate groom (REVIEW and FINAL tiers). */
  readonly groomValidationRequired: boolean;
};

/**
 * Plan groom and secondary motion for one shot.
 *
 * Pure and deterministic, like every other planner here. For prototype rigs the
 * result is the procedural behaviour that already exists, expressed in the new
 * shape; for a rig that reports `groomDeformation` or `accessoryDynamics` it
 * escalates to `SIMULATED` and emits the caches the render will need. The
 * escalation is driven entirely by rig capability, so no planner has to know
 * which generation of asset it is working with.
 */
export function planSimulation(input: SimulationInput): SimulationPlan {
  const groom: GroomPlan[] = [];
  const secondaryMotion: SecondaryMotionItem[] = [];
  const caches: SimulationCache[] = [];
  let costWeight = 0;

  const preRollFrames = 12;

  for (const character of [...input.characters].sort((a, b) => a.characterCode.localeCompare(b.characterCode))) {
    const groomCapable = character.rig.capabilities.groomDeformation && character.groomVersion !== undefined;
    const mode: MotionSolveMode = groomCapable ? 'SIMULATED' : 'NONE';

    let cache: SimulationCache | undefined;
    if (groomCapable) {
      cache = SimulationCacheSchema.parse({
        solver: 'HAIR',
        cacheKey: stableHash({
          kind: 'groom',
          characterCode: character.characterCode,
          rigId: character.rig.rigId,
          rigVersion: character.rig.rigVersion,
          groomVersion: character.groomVersion,
          energy: character.energy,
          wind: input.windUnit,
          frameRange: input.frameRange,
        }),
        frameRange: { start: input.frameRange.start - preRollFrames, end: input.frameRange.end },
        preRollFrames,
        substeps: 4,
        maxJitterUnit: 0.05,
        requiredBeforeRender: true,
      });
      caches.push(cache);
      costWeight += 2;
    }

    groom.push(
      GroomPlanSchema.parse({
        characterCode: character.characterCode,
        mode,
        groomVersion: character.groomVersion,
        motionResponse: groomCapable ? Math.min(1, character.energy * 0.8) : 0,
        windResponse: groomCapable ? Math.min(1, input.windUnit) : 0,
        regions: groomCapable ? [...character.rig.overlapParts].sort() : [],
        cache,
        // Groom validation is required whenever groom exists and the tier asks
        // for it. A NONE groom has nothing to validate, and claiming otherwise
        // would produce a QC check that always passes.
        validationRequired: groomCapable && input.groomValidationRequired,
      }),
    );

    const dynamicsCapable = character.rig.capabilities.accessoryDynamics;
    for (const overlap of [...character.overlap].sort((a, b) => a.part.localeCompare(b.part))) {
      let partCache: SimulationCache | undefined;
      if (dynamicsCapable) {
        partCache = SimulationCacheSchema.parse({
          solver: 'CLOTH',
          cacheKey: stableHash({
            kind: 'secondary',
            characterCode: character.characterCode,
            part: overlap.part,
            rigVersion: character.rig.rigVersion,
            energy: character.energy,
            wind: input.windUnit,
            frameRange: input.frameRange,
          }),
          frameRange: { start: input.frameRange.start - preRollFrames, end: input.frameRange.end },
          preRollFrames,
          substeps: 6,
          maxJitterUnit: 0.04,
          requiredBeforeRender: true,
        });
        caches.push(partCache);
        costWeight += 1;
      }
      secondaryMotion.push(
        SecondaryMotionItemSchema.parse({
          part: overlap.part,
          mode: dynamicsCapable ? 'SIMULATED' : 'PROCEDURAL',
          lagFrames: dynamicsCapable ? 0 : overlap.lagFrames,
          decay: overlap.decay,
          maxAmplitudeUnit: Math.min(1, character.secondaryMotion),
          cache: partCache,
        }),
      );
    }
  }

  // Environmental motion is procedural for prototype environments: the grass in
  // the approved meadow does not simulate, and pretending it does would put a
  // cache in the manifest that nothing writes.
  const environment =
    input.windUnit > 0
      ? [{ element: 'grass', mode: 'PROCEDURAL' as MotionSolveMode, intensity: Math.min(1, input.windUnit) }]
      : [];

  const requiredCaches = [...new Map(caches.map((cache) => [cache.cacheKey, cache])).values()].sort((a, b) =>
    a.cacheKey.localeCompare(b.cacheKey),
  );

  return SimulationPlanSchema.parse({
    groom,
    secondaryMotion,
    environment,
    requiredCaches,
    costWeight,
    provenance: { system: 'simulation', version: input.version, seed: input.seed },
  });
}

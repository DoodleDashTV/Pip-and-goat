/**
 * `ddp-production-blueprint-v1` — the Director AI's output contract.
 *
 * One document per episode that every downstream system reads: the Blender bridge,
 * the render cache, the cost estimator, and the studio UI. Its `content` is fully
 * deterministic; the `meta` envelope holds the things that are not (wall clock,
 * who generated it) and is excluded from every hash by construction.
 */
import { z } from 'zod';
import {
  DecisionSchema,
  DeliverySchema,
  NonEmptyStringSchema,
  PlanIssueSchema,
  UnitScalarSchema,
} from './common';
import { BLUEPRINT_SCHEMA_VERSION } from '../versions';
import { ActingPlanSchema, MotionMeasurementSchema } from '../acting';
import { CameraPlanSchema } from '../camera';
import { EmotionPlanSchema } from '../emotion';
import { FacialMeasurementSchema, FacialPlanSchema } from '../face';
import { LightingPlanSchema } from '../lighting';
import { SoundMeasurementSchema, SoundPlanSchema } from '../sound';
import { VfxPlanSchema } from '../vfx';
import { BeatPurposeSchema } from './scene-plan';

export const ShotCostEstimateSchema = z.object({
  frameCount: z.number().int().min(1),
  /** Advisory only. Never an authorization to spend. */
  estimatedLocalMinutes: z.number().min(0),
  estimatedCloudGpuMinutes: z.number().min(0),
  estimatedCloudCostUsd: z.number().min(0),
  /** Effect cost weight, so an expensive shot can be traced to its effects. */
  vfxCostWeight: z.number().min(0),
  /** True when a cached render already satisfies this shot's cache key. */
  cacheHit: z.boolean(),
});
export type ShotCostEstimate = z.infer<typeof ShotCostEstimateSchema>;

export const ShotBlueprintSchema = z.object({
  shotId: NonEmptyStringSchema,
  index: z.number().int().min(0),
  beatId: NonEmptyStringSchema,
  beatPurpose: BeatPurposeSchema,
  /** Why this shot exists, in the director's words. */
  purpose: NonEmptyStringSchema,
  /** Whether this shot carries the episode's hook or its payoff. */
  hookRole: z.enum(['HOOK', 'PAYOFF', 'NONE']),
  durationSeconds: z.number().positive(),
  frameRange: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }),
  seed: z.number().int(),
  characters: z
    .array(
      z.object({
        characterCode: NonEmptyStringSchema,
        objective: NonEmptyStringSchema,
        blocking: NonEmptyStringSchema,
        performanceIntent: NonEmptyStringSchema,
      }),
    )
    .min(1),
  emotion: z.array(EmotionPlanSchema).min(1),
  acting: z.array(ActingPlanSchema).min(1),
  face: z.array(FacialPlanSchema).min(1),
  camera: CameraPlanSchema,
  lighting: LightingPlanSchema,
  vfx: VfxPlanSchema,
  audio: SoundPlanSchema,
  continuity: z.object({
    /** Beats this shot must remain continuous with. */
    references: z.array(NonEmptyStringSchema).default([]),
    screenDirection: z.enum(['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'NEUTRAL']),
    /** Previous shot id, for exposure and staging continuity. */
    previousShotId: z.string().optional(),
  }),
  /** Reusable assets this shot needs, by logical id. */
  requiredAssets: z.array(NonEmptyStringSchema).min(1),
  cost: ShotCostEstimateSchema,
  qc: z.object({
    motion: z.array(MotionMeasurementSchema),
    facial: z.array(FacialMeasurementSchema),
    sound: z.array(SoundMeasurementSchema),
    status: z.enum(['PASS', 'FAIL']),
  }),
  /** Everything that can change this shot's output, hashed. */
  cacheKey: NonEmptyStringSchema,
  /** Blender-ready projection: exactly what `--shot-meta-json` receives. */
  shotMeta: z.record(z.unknown()),
});
export type ShotBlueprint = z.infer<typeof ShotBlueprintSchema>;

export const AppliedOverrideSchema = z.object({
  path: NonEmptyStringSchema,
  from: z.unknown(),
  to: z.unknown(),
  by: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
  /** Set when the override was refused for violating a lock or a bound. */
  refusedBecause: z.string().optional(),
});
export type AppliedOverride = z.infer<typeof AppliedOverrideSchema>;

/**
 * The deterministic part of a blueprint. Hashing this — and only this — is what
 * makes "same input, same output" a testable claim.
 */
export const BlueprintContentSchema = z.object({
  schemaVersion: z.literal(BLUEPRINT_SCHEMA_VERSION),
  episodeId: NonEmptyStringSchema,
  episodeTitle: NonEmptyStringSchema,
  seed: NonEmptyStringSchema,
  delivery: DeliverySchema,
  systemVersions: z.record(NonEmptyStringSchema),
  shots: z.array(ShotBlueprintSchema).min(1),
  totals: z.object({
    shotCount: z.number().int().min(1),
    durationSeconds: z.number().positive(),
    frameCount: z.number().int().min(1),
    estimatedCloudCostUsd: z.number().min(0),
    estimatedLocalMinutes: z.number().min(0),
    /** Fraction of shots already satisfied by cache. */
    cacheHitFraction: UnitScalarSchema,
  }),
  /** Explainable decision trace: every choice, its reason, and its runners-up. */
  decisionTrace: z.array(DecisionSchema),
  issues: z.array(PlanIssueSchema),
  overrides: z.array(AppliedOverrideSchema).default([]),
  validation: z.object({
    status: z.enum(['PASS', 'FAIL']),
    errorCount: z.number().int().min(0),
    warningCount: z.number().int().min(0),
  }),
  /** Hash of everything above except this field. */
  contentHash: NonEmptyStringSchema,
  cacheKey: NonEmptyStringSchema,
});
export type BlueprintContent = z.infer<typeof BlueprintContentSchema>;

/** The non-deterministic envelope. Never hashed, never compared. */
export const BlueprintMetaSchema = z.object({
  generatedAt: z.string().optional(),
  generatedBy: z.string().optional(),
  studioName: z.string().optional(),
  /** Which subsystem versions were current when this was stored. */
  storedSchemaVersion: NonEmptyStringSchema,
});
export type BlueprintMeta = z.infer<typeof BlueprintMetaSchema>;

export const ProductionBlueprintSchema = z.object({
  content: BlueprintContentSchema,
  meta: BlueprintMetaSchema,
});
export type ProductionBlueprint = z.infer<typeof ProductionBlueprintSchema>;

export function parseBlueprint(input: unknown): ProductionBlueprint {
  return ProductionBlueprintSchema.parse(input);
}

import { z } from 'zod';
import { FOUNDING_CODES } from '@doodle-dash/domain';

/** Bounded 0..1 parameter. Every intensity in the direction layer is one of these. */
export const UnitScalarSchema = z.number().min(0).max(1);

export const NonEmptyStringSchema = z.string().trim().min(1);

/**
 * Character codes the direction layer knows how to plan for.
 *
 * Deliberately closed. An unknown character cannot be planned against a lock, and
 * planning a locked studio's characters without a lock is exactly the failure this
 * tranche exists to prevent.
 */
export const CharacterCodeSchema = z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]);
export type CharacterCode = z.infer<typeof CharacterCodeSchema>;

export const DELIVERY_RESOLUTIONS = [
  '270x480',
  '360x640',
  '540x960',
  '720x1280',
  '1080x1920',
] as const;
export const DeliveryResolutionSchema = z.enum(DELIVERY_RESOLUTIONS);
export type DeliveryResolution = z.infer<typeof DeliveryResolutionSchema>;

export const DeliverySchema = z.object({
  /** Vertical-first by contract; the studio delivers 9:16. */
  aspect: z.literal('9:16').default('9:16'),
  resolution: DeliveryResolutionSchema.default('1080x1920'),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  /**
   * Draft planning renders at a small resolution but must frame for the delivery
   * aspect, so framing decisions are resolution-independent.
   */
  targetDurationSeconds: z.number().positive().max(600).default(30),
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const ISSUE_SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;
export const IssueSeveritySchema = z.enum(ISSUE_SEVERITIES);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

/**
 * One validation finding. `ERROR` fails the blueprint closed; there is no
 * "proceed anyway" path, because a plan that silently degrades is how a studio
 * ships a motionless goat.
 */
export const PlanIssueSchema = z.object({
  code: NonEmptyStringSchema,
  severity: IssueSeveritySchema,
  system: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  shotId: z.string().optional(),
  characterCode: CharacterCodeSchema.optional(),
  /** Machine-readable measurement behind the finding, for QC evidence. */
  measured: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
});
export type PlanIssue = z.infer<typeof PlanIssueSchema>;

/** One step of the explainable decision trace. */
export const DecisionSchema = z.object({
  system: NonEmptyStringSchema,
  shotId: z.string().optional(),
  characterCode: CharacterCodeSchema.optional(),
  decision: NonEmptyStringSchema,
  chose: NonEmptyStringSchema,
  because: NonEmptyStringSchema,
  /** Candidates considered, with their scores, so a framing can be argued with. */
  alternatives: z
    .array(z.object({ option: NonEmptyStringSchema, score: z.number(), rejectedBecause: z.string().optional() }))
    .default([]),
  seed: z.number().int().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const ProvenanceSchema = z.object({
  system: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  seed: z.number().int(),
  /** Set when a human override replaced the planned value. */
  overriddenBy: z.string().optional(),
  overrideReason: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export function errorsOf(issues: readonly PlanIssue[]): PlanIssue[] {
  return issues.filter((issue) => issue.severity === 'ERROR');
}

export function issueStatus(issues: readonly PlanIssue[]): 'PASS' | 'FAIL' {
  return errorsOf(issues).length === 0 ? 'PASS' : 'FAIL';
}

export function parseResolution(resolution: DeliveryResolution): { width: number; height: number } {
  const [width, height] = resolution.split('x').map((part) => Number.parseInt(part, 10));
  return { width, height };
}

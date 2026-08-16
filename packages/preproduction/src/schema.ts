import { z } from 'zod';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { PREPRODUCTION_SCHEMA_VERSION } from './versions';

export const NonEmptyStringSchema = z.string().trim().min(1);
export const UnitScalarSchema = z.number().min(0).max(1);

export const ISSUE_SEVERITIES = ['ERROR', 'WARNING', 'INFO'] as const;
export const IssueSeveritySchema = z.enum(ISSUE_SEVERITIES);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const PlanIssueSchema = z.object({
  code: NonEmptyStringSchema,
  severity: IssueSeveritySchema,
  system: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  measured: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
});
export type PlanIssue = z.infer<typeof PlanIssueSchema>;

export function errorsOf(issues: readonly PlanIssue[]): PlanIssue[] {
  return issues.filter((issue) => issue.severity === 'ERROR');
}

export function issueStatus(issues: readonly PlanIssue[]): 'PASS' | 'FAIL' {
  return errorsOf(issues).length === 0 ? 'PASS' : 'FAIL';
}

/**
 * Character occupancy in this package.
 *
 * Canonical founding codes may appear in *story* drafts that later emit a
 * ScenePlan. Proxy codes may appear only in pipeline-test work. Mixing them in
 * one brief is refused: a proxy standing in for Pip is how a proxy leaks into
 * a production-looking plan.
 */
export const CANONICAL_CHARACTER_CODES = [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] as const;
export type CanonicalCharacterCode = (typeof CANONICAL_CHARACTER_CODES)[number];

export const PROXY_CHARACTER_CODES = [
  'PROXY_NONCANONICAL_BIRD_A',
  'PROXY_NONCANONICAL_QUADRUPED_A',
] as const;
export type ProxyCharacterCode = (typeof PROXY_CHARACTER_CODES)[number];

export const OccupantCodeSchema = z.enum([
  ...CANONICAL_CHARACTER_CODES,
  ...PROXY_CHARACTER_CODES,
]);
export type OccupantCode = z.infer<typeof OccupantCodeSchema>;

export const CHARACTER_MODES = ['PROXY', 'CANONICAL'] as const;
export const CharacterModeSchema = z.enum(CHARACTER_MODES);
export type CharacterMode = z.infer<typeof CharacterModeSchema>;

export const OUTPUT_CLASSES = [
  'PIPELINE_TEST',
  'STORY_DRAFT',
  'STORY_APPROVED_PLAN',
  'FINAL_PRODUCTION',
] as const;
export const OutputClassSchema = z.enum(OUTPUT_CLASSES);
export type OutputClass = z.infer<typeof OutputClassSchema>;

export const DecisionSchema = z.object({
  system: NonEmptyStringSchema,
  decision: NonEmptyStringSchema,
  chose: NonEmptyStringSchema,
  because: NonEmptyStringSchema,
});
export type Decision = z.infer<typeof DecisionSchema>;

export const PREPRODUCTION_SCHEMA_VERSION_LITERAL = z.literal(PREPRODUCTION_SCHEMA_VERSION);

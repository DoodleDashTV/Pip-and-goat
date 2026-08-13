/**
 * Human overrides, with provenance.
 *
 * A director must be able to say "not that framing, this one" and have the studio
 * keep the change. Three properties make that safe:
 *
 *   1. an override is recorded, with who and why, and travels with the blueprint,
 *      so a shot's framing can always be traced to a person or to the planner;
 *   2. an override is bounded by the same locks and thresholds as a planned value.
 *      A human may not override Pip's voice id, her species, or a child-safe
 *      ceiling; the attempt is refused and recorded rather than applied;
 *   3. an override changes the cache key, because it changes the output.
 */
import { z } from 'zod';
import { NonEmptyStringSchema } from './schema/common';
import type { PlanIssue } from './schema/common';
import type { AppliedOverride } from './schema/blueprint';
import { CHILD_SAFE_POLICY } from './locks';

export const DirectorOverrideSchema = z.object({
  /** Dotted path into a shot blueprint, e.g. `camera.composition`. */
  path: NonEmptyStringSchema,
  /** Shot this applies to; omit for an episode-wide override. */
  shotId: z.string().optional(),
  value: z.unknown(),
  by: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
});
export type DirectorOverride = z.infer<typeof DirectorOverrideSchema>;

/**
 * Paths a human may never override.
 *
 * Everything here is either character identity, voice identity, provenance, or a
 * child-safety ceiling. An override targeting one of these is refused with an
 * ERROR: the studio would rather stop than quietly ship a different Pip.
 */
export const PROTECTED_OVERRIDE_PATHS: readonly string[] = [
  'characters',
  'emotion.provenance',
  'acting.provenance',
  'face.provenance',
  'camera.provenance',
  'lighting.provenance',
  'vfx.provenance',
  'audio.provenance',
  'audio.voiceRequests',
  'lighting.colorManagement',
  'seed',
  'cacheKey',
  'shotMeta',
];

/** Editable paths, with their bounds. Anything not listed is not overridable. */
export const OVERRIDE_BOUNDS: Readonly<
  Record<string, { kind: 'enum' | 'number' | 'string'; values?: readonly string[]; min?: number; max?: number; describe: string }>
> = {
  'camera.composition': {
    kind: 'enum',
    values: ['ESTABLISHING', 'WIDE', 'FULL_BODY', 'MEDIUM', 'TWO_SHOT', 'CLOSE_UP', 'REACTION'],
    describe: 'framing choice',
  },
  'camera.move': {
    kind: 'enum',
    values: ['STATIC', 'PUSH_IN', 'PULL_OUT', 'PAN', 'TILT', 'TRACK', 'FOLLOW'],
    describe: 'camera move',
  },
  'lighting.recipe': { kind: 'string', describe: 'lighting recipe name' },
  'emotion.intensity': {
    kind: 'number',
    min: 0,
    max: CHILD_SAFE_POLICY.maxIntensity,
    describe: 'emotion intensity, capped by the child-safe ceiling',
  },
  'acting.gesture': { kind: 'string', describe: 'gesture code, still checked against the character vocabulary' },
  'vfx.budgetCostWeight': { kind: 'number', min: 0, max: 12, describe: 'per-shot VFX cost budget' },
  'audio.loudness.targetLufs': { kind: 'number', min: -24, max: -14, describe: 'loudness target' },
  durationSeconds: { kind: 'number', min: 0.8, max: 30, describe: 'shot duration' },
};

export const OVERRIDABLE_PATHS = Object.keys(OVERRIDE_BOUNDS).sort();

export type OverrideCheck = {
  readonly accepted: DirectorOverride[];
  readonly refused: AppliedOverride[];
  readonly issues: PlanIssue[];
};

/**
 * Validate a batch of overrides before any of them is applied.
 *
 * Returns the accepted set plus a refusal record for each rejected one, so the UI
 * can show a director exactly which of their edits did not take and why.
 */
export function checkOverrides(overrides: readonly DirectorOverride[]): OverrideCheck {
  const accepted: DirectorOverride[] = [];
  const refused: AppliedOverride[] = [];
  const issues: PlanIssue[] = [];

  for (const override of [...overrides].sort((a, b) => `${a.shotId ?? ''}${a.path}`.localeCompare(`${b.shotId ?? ''}${b.path}`))) {
    const refuse = (message: string) => {
      refused.push({
        path: override.path,
        from: undefined,
        to: override.value,
        by: override.by,
        reason: override.reason,
        refusedBecause: message,
      });
      issues.push({
        code: 'OVERRIDE_REFUSED',
        severity: 'ERROR',
        system: 'director',
        shotId: override.shotId,
        message: `Override of "${override.path}" refused: ${message}`,
      });
    };

    if (PROTECTED_OVERRIDE_PATHS.some((protectedPath) => override.path === protectedPath || override.path.startsWith(`${protectedPath}.`))) {
      refuse('this path is locked (character identity, voice identity, provenance, colour management, or a cache key)');
      continue;
    }

    const bound = OVERRIDE_BOUNDS[override.path];
    if (!bound) {
      refuse(`not an overridable path; overridable paths are ${OVERRIDABLE_PATHS.join(', ')}`);
      continue;
    }

    if (bound.kind === 'enum') {
      if (typeof override.value !== 'string' || !(bound.values ?? []).includes(override.value)) {
        refuse(`must be one of ${(bound.values ?? []).join(', ')}`);
        continue;
      }
    } else if (bound.kind === 'number') {
      if (typeof override.value !== 'number' || !Number.isFinite(override.value)) {
        refuse('must be a finite number');
        continue;
      }
      if (bound.min !== undefined && override.value < bound.min) {
        refuse(`must be at least ${bound.min} (${bound.describe})`);
        continue;
      }
      if (bound.max !== undefined && override.value > bound.max) {
        refuse(`must be at most ${bound.max} (${bound.describe})`);
        continue;
      }
    } else if (typeof override.value !== 'string' || override.value.trim().length === 0) {
      refuse('must be a non-empty string');
      continue;
    }

    accepted.push(override);
  }

  return { accepted, refused, issues };
}

/** Read a dotted path out of an object, for recording an override's `from` value. */
export function readPath(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, segment) => {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    return (cursor as Record<string, unknown>)[segment];
  }, target);
}

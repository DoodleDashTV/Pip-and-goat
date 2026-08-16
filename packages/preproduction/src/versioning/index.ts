/**
 * Versioning and rollback for story, storyboard, animatic and shot-plan drafts.
 *
 * Every version is DRAFT_NONCANONICAL. Rollback restores a prior draft snapshot.
 * It cannot mark a story approved, promote a proxy, or open a FINAL path.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';

export const ARTIFACT_KINDS = ['STORY', 'STORYBOARD', 'ANIMATIC', 'SHOT_PLAN'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ArtifactVersionSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),
  version: z.number().int().min(1),
  cacheKey: z.string(),
  label: z.literal('DRAFT_NONCANONICAL'),
  parentVersion: z.number().int().min(1).nullable(),
  rolledBackFrom: z.number().int().min(1).optional(),
  canonical: z.literal(false),
  productionEligible: z.literal(false),
});
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;

export type ArtifactHistory = {
  kind: ArtifactKind;
  versions: ArtifactVersion[];
  current: ArtifactVersion;
};

export function recordArtifactVersion(input: {
  kind: ArtifactKind;
  cacheKey: string;
  history?: ArtifactHistory;
}): ArtifactHistory {
  const parent = input.history?.current ?? null;
  const version = ArtifactVersionSchema.parse({
    kind: input.kind,
    version: (parent?.version ?? 0) + 1,
    cacheKey: input.cacheKey,
    label: 'DRAFT_NONCANONICAL',
    parentVersion: parent?.version ?? null,
    canonical: false,
    productionEligible: false,
  });
  const versions = [...(input.history?.versions ?? []), version];
  return { kind: input.kind, versions, current: version };
}

export function rollbackArtifact(history: ArtifactHistory, toVersion: number): ArtifactHistory {
  const target = history.versions.find((entry) => entry.version === toVersion);
  if (!target) {
    throw new Error(`Refuse: no draft version ${toVersion} for ${history.kind}.`);
  }
  if (target.canonical || target.productionEligible || target.label !== 'DRAFT_NONCANONICAL') {
    throw new Error('Refuse: rollback cannot promote a draft to canon or production.');
  }
  const rolled = ArtifactVersionSchema.parse({
    ...target,
    version: history.current.version + 1,
    parentVersion: history.current.version,
    rolledBackFrom: history.current.version,
    label: 'DRAFT_NONCANONICAL',
    canonical: false,
    productionEligible: false,
    cacheKey: stableHash({
      kind: target.kind,
      restored: target.cacheKey,
      from: history.current.version,
      versioning: PREPRODUCTION_SUBSYSTEM_VERSIONS.versioning,
    }),
  });
  return { kind: history.kind, versions: [...history.versions, rolled], current: rolled };
}

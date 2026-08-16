/**
 * Continuity ledger for pre-production.
 *
 * Tracks planted facts, payoffs, and dangling references across beats. Pure and
 * deterministic. Does not lock canon and does not write EpisodeMemory rows —
 * those stay in the existing `@doodle-dash/story` service.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { StoryDraft } from '../story';

export const ContinuityFactSchema = z.object({
  factId: z.string(),
  plantedIn: z.string(),
  statement: z.string(),
  paidOffIn: z.string().optional(),
  status: z.enum(['PLANTED', 'PAID_OFF', 'DANGLING']),
});
export type ContinuityFact = z.infer<typeof ContinuityFactSchema>;

export const ContinuityLedgerSchema = z.object({
  episodeId: z.string(),
  facts: z.array(ContinuityFactSchema),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.continuity),
});
export type ContinuityLedger = z.infer<typeof ContinuityLedgerSchema>;

export function planContinuity(draft: StoryDraft): {
  ledger: ContinuityLedger;
  issues: PlanIssue[];
} {
  const issues: PlanIssue[] = [];
  const facts: ContinuityFact[] = [];

  for (const beat of draft.beats) {
    if (beat.requiredProps.length > 0) {
      const factId = `prop_${beat.requiredProps[0]}_${beat.beatId}`;
      facts.push({
        factId,
        plantedIn: beat.beatId,
        statement: `${beat.requiredProps[0]} is visible in ${beat.beatId}`,
        status: 'PLANTED',
      });
    }
    for (const ref of beat.continuityRefs) {
      const exists = draft.beats.some((candidate) => candidate.beatId === ref);
      if (!exists) {
        issues.push({
          code: 'CONTINUITY_DANGLING_REF',
          severity: 'ERROR',
          system: 'continuity',
          message: `${beat.beatId} references missing beat ${ref}.`,
          measured: { beatId: beat.beatId, ref },
        });
      }
    }
  }

  const mapBeats = draft.beats.filter((beat) => beat.requiredProps.includes('prop_adventure_map_v1'));
  if (mapBeats.length >= 2) {
    const first = mapBeats[0]!;
    const last = mapBeats[mapBeats.length - 1]!;
    const planted = facts.find((fact) => fact.plantedIn === first.beatId);
    if (planted) {
      planted.paidOffIn = last.beatId;
      planted.status = 'PAID_OFF';
    }
  }

  for (const fact of facts) {
    if (fact.status === 'PLANTED' && !fact.paidOffIn) {
      fact.status = 'DANGLING';
      issues.push({
        code: 'CONTINUITY_UNPAID_FACT',
        severity: 'WARNING',
        system: 'continuity',
        message: `${fact.factId} is planted and never paid off.`,
        measured: { factId: fact.factId },
      });
    }
  }

  const locations = draft.beats.map((beat) => beat.locationId);
  for (let index = 1; index < locations.length; index += 1) {
    const previous = locations[index - 1];
    const current = locations[index];
    if (previous !== current) {
      const jump = `${previous}->${current}`;
      if (!draft.beats[index]!.continuityRefs.includes(draft.beats[index - 1]!.beatId)) {
        issues.push({
          code: 'CONTINUITY_LOCATION_JUMP_UNLINKED',
          severity: 'ERROR',
          system: 'continuity',
          message: `Location jump ${jump} is not linked by a continuityRef.`,
          measured: { jump },
        });
      }
    }
  }

  const ledger = ContinuityLedgerSchema.parse({
    episodeId: draft.episodeId,
    facts,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.continuity,
  });
  ledger.cacheKey = stableHash({ version: ledger.version, facts: ledger.facts, episodeId: ledger.episodeId });

  return { ledger, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}

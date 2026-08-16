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

  const factsByProp = new Map<string, ContinuityFact[]>();
  for (const beat of draft.beats) {
    for (const prop of beat.requiredProps) {
      const fact: ContinuityFact = {
        factId: `prop_${prop}_${beat.beatId}`,
        plantedIn: beat.beatId,
        statement: `${prop} is visible in ${beat.beatId}`,
        status: 'PLANTED',
      };
      facts.push(fact);
      const planted = factsByProp.get(prop) ?? [];
      planted.push(fact);
      factsByProp.set(prop, planted);
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

  for (const planted of factsByProp.values()) {
    if (planted.length < 2) continue;
    const lastBeatId = planted[planted.length - 1]!.plantedIn;
    for (const fact of planted) {
      fact.paidOffIn = lastBeatId;
      fact.status = 'PAID_OFF';
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

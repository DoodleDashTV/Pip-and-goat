/**
 * Step 10 — Continuity and canon database (draft only).
 *
 * Reports readiness. Never promotes canon. Never writes EpisodeMemory.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { planContinuity, type ContinuityLedger } from '../continuity';
import { evaluateCanonPromotion, validateContinuityAgainstCanon } from '../canon';
import { isProxyCode } from '../proxy';
import type { StoryDraft } from '../story';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export function compileContinuityDatabase(draft: StoryDraft): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  canonical: false;
  promoted: false;
  identities: string[];
  locations: string[];
  props: string[];
  mapClues: string[];
  establishedFacts: ContinuityLedger['facts'];
  setupPayoffLinks: Array<{ plantedIn: string; paidOffIn: string; factId: string }>;
  timeline: Array<{ beatId: string; purpose: string; locationId: string; occupants: string[] }>;
  objectOwnership: Array<{ prop: string; heldBy: string; beatId: string }>;
  entranceExit: Array<{ beatId: string; enter: string[]; exit: string[] }>;
  unresolved: string[];
  prohibitedContradictions: string[];
  ledger: ContinuityLedger;
  readiness: { ok: boolean; dangling: number; canPromote: false };
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.continuityDb;
} {
  const planned = planContinuity(draft);
  const canon = evaluateCanonPromotion(draft);
  const againstCanon = validateContinuityAgainstCanon({ draft, ledger: planned.ledger });
  const identities = draft.occupants.filter(isProxyCode);
  const locations = [...new Set(draft.beats.map((beat) => beat.locationId))];
  const props = [...new Set(draft.beats.flatMap((beat) => beat.requiredProps))];
  const mapClues = props.filter((prop) => prop.includes('map'));
  const setupPayoffLinks = planned.ledger.facts
    .filter((fact) => fact.status === 'PAID_OFF' && fact.paidOffIn)
    .map((fact) => ({ factId: fact.factId, plantedIn: fact.plantedIn, paidOffIn: fact.paidOffIn! }));
  const unresolved = planned.ledger.facts.filter((fact) => fact.status === 'DANGLING').map((fact) => fact.factId);
  const contradictions: string[] = [];
  if (draft.occupants.some((code) => !isProxyCode(code))) {
    contradictions.push('CANONICAL_OCCUPANT_IN_PROXY_CONTINUITY');
  }
  if (canon.allowed) {
    contradictions.push('AUTO_PROMOTION_MUST_STAY_FALSE');
  }

  const timeline = draft.beats.map((beat) => ({
    beatId: beat.beatId,
    purpose: beat.purpose,
    locationId: beat.locationId,
    occupants: [...beat.occupants],
  }));
  const objectOwnership = draft.beats.flatMap((beat) =>
    beat.requiredProps.map((prop) => ({
      prop,
      heldBy: beat.focus,
      beatId: beat.beatId,
    })),
  );
  const entranceExit = draft.beats.map((beat, index) => {
    const previous = new Set(draft.beats[index - 1]?.occupants ?? []);
    const current = new Set(beat.occupants);
    return {
      beatId: beat.beatId,
      enter: beat.occupants.filter((code) => !previous.has(code)),
      exit: [...previous].filter((code) => !current.has(code)),
    };
  });

  const record = {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    canonical: false as const,
    promoted: false as const,
    identities,
    locations,
    props,
    mapClues,
    establishedFacts: planned.ledger.facts,
    setupPayoffLinks,
    timeline,
    objectOwnership,
    entranceExit,
    unresolved,
    prohibitedContradictions: contradictions,
    ledger: planned.ledger,
    readiness: {
      ok: againstCanon.ok && contradictions.length === 0,
      dangling: againstCanon.dangling,
      canPromote: false as const,
    },
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.continuityDb,
  };
  return {
    ...record,
    cacheKey: stableHash({
      version: record.version,
      episodeId: draft.episodeId,
      facts: planned.ledger.facts,
      timeline,
    }),
  };
}

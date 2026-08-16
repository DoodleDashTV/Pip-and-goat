/**
 * Step 9 — Story Brain (character-independent, closed-gate).
 *
 * Compiles a deterministic, versioned draft story plan from the existing
 * story planner. Refuses canonical promotion. Does not unlock theatrical
 * Steps 9–16.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { CHILD_SAFE_REFUSALS, type StoryBrief, type StoryDraft } from '../story';
import { evaluateCanonPromotion } from '../canon';
import { isProxyCode } from '../proxy';

export const DRAFT_PIPELINE_CLASS = 'PIPELINE_TEST_ONLY' as const;
export const DRAFT_NONCANONICAL = 'DRAFT_NONCANONICAL' as const;

const EIGHT_BEATS = [
  'HOOK',
  'SETUP',
  'DISCOVERY',
  'COMPLICATION',
  'TURN',
  'PAYOFF',
  'RESOLUTION',
  'BUTTON',
] as const;

export function compileStoryBrain(input: { brief: StoryBrief; draft: StoryDraft }): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  canonical: false;
  productionEligible: false;
  theatricalEligible: false;
  premise: string;
  episodeGoal: string;
  openingHook: string;
  placeholderRoles: string[];
  eightBeatStructure: Array<{ purpose: string; beatId: string; summary: string }>;
  escalation: string;
  setback: string;
  discovery: string;
  payoff: string;
  closingButton: string;
  ageAppropriate: {
    safe: boolean;
    refusedNeedles: string[];
    preschoolReadable: true;
  };
  seed: string;
  cacheKey: string;
  promotion: ReturnType<typeof evaluateCanonPromotion>;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.storyBrain;
} {
  const { brief, draft } = input;
  const byPurpose = (purpose: string) => draft.beats.find((beat) => beat.purpose === purpose);
  const text = `${brief.title} ${brief.logline} ${brief.theme} ${draft.lesson}`;
  const refusedNeedles = CHILD_SAFE_REFUSALS.filter((needle) => text.toLowerCase().includes(needle));
  const promotion = evaluateCanonPromotion(draft);
  const roles = draft.occupants.filter(isProxyCode);
  const record = {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    canonical: false as const,
    productionEligible: false as const,
    theatricalEligible: false as const,
    premise: brief.logline,
    episodeGoal: draft.lesson,
    openingHook: byPurpose('HOOK')?.summary ?? brief.logline,
    placeholderRoles: roles,
    eightBeatStructure: EIGHT_BEATS.map((purpose) => {
      const beat = byPurpose(purpose);
      return {
        purpose,
        beatId: beat?.beatId ?? `missing_${purpose}`,
        summary: beat?.summary ?? 'missing beat',
      };
    }),
    escalation: byPurpose('COMPLICATION')?.summary ?? '',
    setback: byPurpose('COMPLICATION')?.objective ?? 'pause and think',
    discovery: byPurpose('DISCOVERY')?.summary ?? '',
    payoff: byPurpose('PAYOFF')?.summary ?? '',
    closingButton: byPurpose('BUTTON')?.summary ?? '',
    ageAppropriate: {
      safe: refusedNeedles.length === 0,
      refusedNeedles,
      preschoolReadable: true as const,
    },
    seed: brief.seed,
    promotion,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.storyBrain,
  };
  return {
    ...record,
    cacheKey: stableHash({
      version: record.version,
      seed: brief.seed,
      episodeId: draft.episodeId,
      beats: record.eightBeatStructure,
      occupants: roles,
    }),
  };
}

export function refuseCanonicalStoryPromotion(draft: StoryDraft): {
  allowed: false;
  code: string;
  reason: string;
} {
  const promotion = evaluateCanonPromotion(draft);
  return {
    allowed: false,
    code: promotion.code,
    reason: promotion.reason,
  };
}

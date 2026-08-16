/**
 * Continuity and canon validation for draft / proxy stories.
 *
 * A draft cannot become canonical automatically. A proxy cannot enter canon.
 * This does not write EpisodeMemory or unlock founding characters.
 */
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode } from '../proxy';
import type { StoryDraft } from '../story';
import type { ContinuityLedger } from '../continuity';

export function evaluateCanonPromotion(draft: StoryDraft): {
  allowed: boolean;
  canonical: false;
  code: 'PROXY_CANNOT_ENTER_CANON' | 'DRAFT_CANNOT_AUTO_PROMOTE' | 'MIXED_OCCUPANTS_REFUSED';
  reason: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.canon;
} {
  const proxies = draft.occupants.filter(isProxyCode);
  if (draft.characterMode === 'PROXY' || proxies.length > 0) {
    return {
      allowed: false,
      canonical: false,
      code: 'PROXY_CANNOT_ENTER_CANON',
      reason: 'Proxy / noncanonical drafts cannot enter canon.',
      version: PREPRODUCTION_SUBSYSTEM_VERSIONS.canon,
    };
  }
  return {
    allowed: false,
    canonical: false,
    code: 'DRAFT_CANNOT_AUTO_PROMOTE',
    reason: 'A draft story cannot become canonical automatically. Human approval is required elsewhere.',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.canon,
  };
}

export function validateContinuityAgainstCanon(input: {
  draft: StoryDraft;
  ledger: ContinuityLedger;
}): { ok: boolean; dangling: number; proxyInCanon: false } {
  const dangling = input.ledger.facts.filter((fact) => fact.status === 'DANGLING').length;
  return {
    ok: dangling === 0 && evaluateCanonPromotion(input.draft).allowed === false,
    dangling,
    proxyInCanon: false,
  };
}

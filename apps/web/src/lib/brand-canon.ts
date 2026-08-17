import { VoiceProductionError } from './voice-production/types';

/** Temporary neutral Pip phrase. Not a permanent signature catchphrase. */
export const PIP_TEMPORARY_NEUTRAL_PHRASE = 'Let’s explore!';

export const PROHIBITED_LEGACY_BRAND_PATTERN = /doodle[\s\u00a0\-_–—./\\]+dash/i;

export const LEGACY_BRAND_REWRITE_MESSAGE =
  'Legacy brand wording is not allowed. The line must be rewritten using TivvleJoy-compatible language. ElevenLabs was not contacted.';

function foldAudienceBrandText(text: string): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

export function containsProhibitedLegacyBrand(text: string | null | undefined): boolean {
  const raw = String(text ?? '');
  if (!raw) return false;
  if (PROHIBITED_LEGACY_BRAND_PATTERN.test(raw)) return true;
  const folded = foldAudienceBrandText(raw);
  const compact = folded.replace(/[^a-z]+/g, '');
  if (compact.includes('doodledash')) return true;
  if (/(^|[^a-z])d[\W_]*d[\W_]*p([^a-z]|$)/i.test(folded)) return true;
  return false;
}

export function assertNoProhibitedLegacyBrand(
  text: string | null | undefined,
  errorFactory: (message: string, code: string) => Error = (message, code) =>
    new VoiceProductionError(message, code),
): void {
  if (containsProhibitedLegacyBrand(text)) {
    throw errorFactory(LEGACY_BRAND_REWRITE_MESSAGE, 'LEGACY_BRAND_REFUSED');
  }
}

export function assertNoProhibitedLegacyBrandFields(
  fields: Record<string, string | null | undefined>,
  errorFactory?: (message: string, code: string) => Error,
): void {
  for (const value of Object.values(fields)) {
    assertNoProhibitedLegacyBrand(value, errorFactory);
  }
}

export function assertAudienceFacingContent(
  fields: {
    dialogue?: string | null;
    narration?: string | null;
    caption?: string | null;
    title?: string | null;
    description?: string | null;
    text?: string | null;
    metadata?: string | null;
  },
  errorFactory?: (message: string, code: string) => Error,
): void {
  assertNoProhibitedLegacyBrandFields(fields, errorFactory);
}

import { VoiceProductionError } from './voice-production/types';

/** Temporary neutral Pip phrase. Not a permanent signature catchphrase. */
export const PIP_TEMPORARY_NEUTRAL_PHRASE = 'Let’s explore!';

export const PROHIBITED_LEGACY_BRAND_PATTERN = /doodle[\s\u00a0\-_–—]+dash/i;

export function containsProhibitedLegacyBrand(text: string | null | undefined): boolean {
  return PROHIBITED_LEGACY_BRAND_PATTERN.test(String(text ?? ''));
}

export function assertNoProhibitedLegacyBrand(
  text: string | null | undefined,
  errorFactory: (message: string, code: string) => Error = (message, code) =>
    new VoiceProductionError(message, code),
): void {
  if (containsProhibitedLegacyBrand(text)) {
    throw errorFactory(
      'Legacy brand wording is not allowed in audience-facing voice or episode text.',
      'LEGACY_BRAND_REFUSED',
    );
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

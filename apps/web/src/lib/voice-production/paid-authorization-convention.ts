type VoiceEnv = Partial<Record<string, string | undefined>>;

/** Canonical Preview voice-authorization flag. Fail closed on any other value. */
export const CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE = 'true' as const;

/** Legacy draft-audio path only. Must not authorize Preview EP012 generation. */
export const LEGACY_DRAFT_AUDIO_VOICE_AUTHORIZE_PAID_VALUE = '1' as const;

export function readVoiceAuthorizePaidRaw(env: VoiceEnv = process.env): string {
  return String(env.TIVVLEJOY_VOICE_AUTHORIZE_PAID ?? '').trim();
}

export function isCanonicalPaidVoiceAuthorization(env: VoiceEnv = process.env): boolean {
  return readVoiceAuthorizePaidRaw(env) === CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE;
}

export function isPaidVoiceAuthorizationConventionMismatch(env: VoiceEnv = process.env): boolean {
  const raw = readVoiceAuthorizePaidRaw(env);
  return raw !== CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE;
}

export function paidAuthorizationConventionSnapshot(env: VoiceEnv = process.env) {
  const raw = readVoiceAuthorizePaidRaw(env);
  return {
    canonicalValue: CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE,
    rawValuePresent: raw.length > 0,
    matchesCanonical: raw === CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE,
    matchesLegacyDraftAudio: raw === LEGACY_DRAFT_AUDIO_VOICE_AUTHORIZE_PAID_VALUE,
    mismatch: isPaidVoiceAuthorizationConventionMismatch(env),
  };
}

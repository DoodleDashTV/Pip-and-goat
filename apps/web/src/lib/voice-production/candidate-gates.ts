import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CANDIDATE_SLOT_ENV,
  CANDIDATES_MISSING_MESSAGE,
  CANDIDATE_SLOTS,
  DEFAULT_VOICE_TEST_MAX_CHARACTERS,
  LIVE_TEST_LOCKED_MESSAGE,
  publicCandidateDirectory,
  type CandidateSlot,
} from './candidates';
import { hasElevenLabsApiKey, isPaidVoiceGenerationEnabled, type VoiceEnv } from './safety';
import { VoiceProductionError } from './types';

function read(env: VoiceEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

export function isVoiceAuthorizePaidTrue(env: VoiceEnv = process.env): boolean {
  return read(env, 'TIVVLEJOY_VOICE_AUTHORIZE_PAID') === 'true';
}

export function isProductionVoiceRuntime(env: VoiceEnv = process.env): boolean {
  return read(env, 'VERCEL_ENV') === 'production';
}

export function readVoiceTestMaxCharacters(env: VoiceEnv = process.env): number {
  const raw = Number(read(env, 'TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_VOICE_TEST_MAX_CHARACTERS;
}

export function testTokenConfigured(env: VoiceEnv = process.env): boolean {
  return Boolean(read(env, 'TIVVLEJOY_VOICE_TEST_TOKEN'));
}

export function tokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export function readCandidateVoiceId(slot: CandidateSlot, env: VoiceEnv = process.env): string {
  return read(env, CANDIDATE_SLOT_ENV[slot]);
}

export function candidateSlotsConfigured(env: VoiceEnv = process.env): Record<CandidateSlot, boolean> {
  return Object.fromEntries(CANDIDATE_SLOTS.map((slot) => [slot, Boolean(readCandidateVoiceId(slot, env))])) as Record<
    CandidateSlot,
    boolean
  >;
}

export function anyCandidateConfigured(env: VoiceEnv = process.env): boolean {
  return CANDIDATE_SLOTS.some((slot) => Boolean(readCandidateVoiceId(slot, env)));
}

export function serverGatesOpen(env: VoiceEnv = process.env): boolean {
  return (
    !isProductionVoiceRuntime(env) &&
    isPaidVoiceGenerationEnabled(env) &&
    isVoiceAuthorizePaidTrue(env) &&
    hasElevenLabsApiKey(env) &&
    testTokenConfigured(env)
  );
}

export type LiveTestPublicStatus = 'locked' | 'candidates-missing' | 'awaiting-confirmation';

export function publicLiveTestSnapshot(env: VoiceEnv = process.env) {
  const configured = candidateSlotsConfigured(env);
  const candidates = publicCandidateDirectory(configured);
  if (isProductionVoiceRuntime(env) || !serverGatesOpen(env)) {
    return {
      status: 'locked' as LiveTestPublicStatus,
      locked: true,
      message: LIVE_TEST_LOCKED_MESSAGE,
      candidatesConfigured: anyCandidateConfigured(env),
      candidates,
      maxCharacters: 300,
      testMaxCharacters: readVoiceTestMaxCharacters(env),
      productionEnabled: false,
    };
  }
  if (!anyCandidateConfigured(env)) {
    return {
      status: 'candidates-missing' as LiveTestPublicStatus,
      locked: true,
      message: CANDIDATES_MISSING_MESSAGE,
      candidatesConfigured: false,
      candidates,
      maxCharacters: 300,
      testMaxCharacters: readVoiceTestMaxCharacters(env),
      productionEnabled: false,
    };
  }
  return {
    status: 'awaiting-confirmation' as LiveTestPublicStatus,
    locked: false,
    message: 'Live voice test stays off until you confirm one candidate. ElevenLabs is not contacted on page load.',
    candidatesConfigured: true,
    candidates,
    maxCharacters: 300,
    testMaxCharacters: readVoiceTestMaxCharacters(env),
    productionEnabled: false,
  };
}

export function assertCandidateOriginAllowed(request: { origin?: string | null; host?: string | null }, env: VoiceEnv = process.env): void {
  const origin = String(request.origin ?? '').trim();
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new VoiceProductionError(LIVE_TEST_LOCKED_MESSAGE, 'LIVE_TEST_LOCKED');
  }
  const host = String(request.host ?? '').split(':')[0];
  const vercelHost = read(env, 'VERCEL_URL').replace(/^https?:\/\//, '').split(':')[0];
  if (host && parsed.hostname === host) return;
  if (vercelHost && parsed.hostname === vercelHost) return;
  throw new VoiceProductionError(LIVE_TEST_LOCKED_MESSAGE, 'LIVE_TEST_LOCKED');
}

export function assertLiveCandidateGates(
  env: VoiceEnv,
  providedToken: string,
): void {
  if (isProductionVoiceRuntime(env)) {
    throw new VoiceProductionError('Live voice test is not enabled for Production.', 'PRODUCTION_VOICE_REFUSED');
  }
  if (!serverGatesOpen(env)) {
    throw new VoiceProductionError(LIVE_TEST_LOCKED_MESSAGE, 'LIVE_TEST_LOCKED');
  }
  if (!tokensMatch(providedToken, read(env, 'TIVVLEJOY_VOICE_TEST_TOKEN'))) {
    throw new VoiceProductionError('The live voice test token was not accepted.', 'INVALID_TEST_TOKEN');
  }
  if (!anyCandidateConfigured(env)) {
    throw new VoiceProductionError(CANDIDATES_MISSING_MESSAGE, 'CANDIDATES_MISSING');
  }
}

export function sanitizeVoiceErrorMessage(message: string): string {
  return message
    .replace(/xi-api-key/gi, '[redacted]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/ELEVENLABS_API_KEY/g, '[redacted]')
    .replace(/TIVVLEJOY_VOICE_TEST_TOKEN/g, '[redacted]');
}

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_VOICE_TEST_MAX_CHARACTERS,
  LIVE_TEST_LOCKED_MESSAGE,
  REQUIRED_VOICE_TEST_MAX_CHARACTERS,
  publicApprovedSamples,
} from './candidates';
import { publicVoiceIdentitySnapshot } from './approved-voice-settings';
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

export function voiceTestMaxCharactersGateOpen(env: VoiceEnv = process.env): boolean {
  return read(env, 'TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS') === String(REQUIRED_VOICE_TEST_MAX_CHARACTERS);
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

export function serverGatesOpen(env: VoiceEnv = process.env): boolean {
  return (
    !isProductionVoiceRuntime(env) &&
    isPaidVoiceGenerationEnabled(env) &&
    isVoiceAuthorizePaidTrue(env) &&
    hasElevenLabsApiKey(env) &&
    testTokenConfigured(env) &&
    voiceTestMaxCharactersGateOpen(env)
  );
}

export type LiveTestPublicStatus = 'locked' | 'awaiting-confirmation';

export function publicLiveTestSnapshot(env: VoiceEnv = process.env) {
  const samples = publicApprovedSamples();
  const maxCharacters = REQUIRED_VOICE_TEST_MAX_CHARACTERS;
  const voiceIdentity = publicVoiceIdentitySnapshot();
  if (isProductionVoiceRuntime(env) || !serverGatesOpen(env)) {
    return {
      status: 'locked' as LiveTestPublicStatus,
      locked: true,
      message: LIVE_TEST_LOCKED_MESSAGE,
      samples,
      maxCharacters,
      testMaxCharacters: maxCharacters,
      productionEnabled: false,
      voiceIdentity,
    };
  }
  return {
    status: 'awaiting-confirmation' as LiveTestPublicStatus,
    locked: false,
    message: 'Live voice test stays off until you confirm one approved sample. ElevenLabs is not contacted on page load.',
    samples,
    maxCharacters,
    testMaxCharacters: maxCharacters,
    productionEnabled: false,
    voiceIdentity,
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

export function assertLiveApprovedSampleGates(env: VoiceEnv, providedToken: string): void {
  if (isProductionVoiceRuntime(env)) {
    throw new VoiceProductionError('Live voice test is not enabled for Production.', 'PRODUCTION_VOICE_REFUSED');
  }
  if (!serverGatesOpen(env)) {
    throw new VoiceProductionError(LIVE_TEST_LOCKED_MESSAGE, 'LIVE_TEST_LOCKED');
  }
  if (!tokensMatch(providedToken, read(env, 'TIVVLEJOY_VOICE_TEST_TOKEN'))) {
    throw new VoiceProductionError('The live voice test token was not accepted.', 'INVALID_TEST_TOKEN');
  }
}

export function sanitizeVoiceErrorMessage(message: string): string {
  return message
    .replace(/xi-api-key/gi, '[redacted]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/ELEVENLABS_API_KEY/g, '[redacted]')
    .replace(/TIVVLEJOY_VOICE_TEST_TOKEN/g, '[redacted]')
    .replace(/93w5H37WdqeS6HoyL5cV/g, '[redacted]')
    .replace(/SbxjwBKw2PefbSupcoXV/g, '[redacted]');
}

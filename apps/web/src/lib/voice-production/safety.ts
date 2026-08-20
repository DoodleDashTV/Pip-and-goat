import { LEGACY_DRAFT_AUDIO_VOICE_AUTHORIZE_PAID_VALUE, readVoiceAuthorizePaidRaw } from './paid-authorization-convention';
import {
  DEFAULT_MAX_CHARS_PER_EPISODE,
  DEFAULT_MAX_CHARS_PER_REQUEST,
  DEFAULT_MONTHLY_CHAR_LIMIT,
  VoiceProductionError,
  type VoiceSafetySnapshot,
  type VoiceUsageLedger,
} from './types';

export type VoiceEnv = Partial<Record<string, string | undefined>>;

function read(env: VoiceEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function readInt(env: VoiceEnv, name: string, fallback: number): number {
  const raw = Number(read(env, name));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export function currentUsageMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function emptyLedger(month = currentUsageMonth()): VoiceUsageLedger {
  return {
    month,
    paidCharactersUsed: 0,
    fixtureCharactersUsed: 0,
    paidRequests: 0,
    fixtureRequests: 0,
    hardStopped: false,
  };
}

export function isPaidVoiceGenerationEnabled(env: VoiceEnv = process.env): boolean {
  return read(env, 'ALLOW_PAID_VOICE_GENERATION') === 'true';
}

export function isPaidVoiceGenerationAuthorized(env: VoiceEnv = process.env): boolean {
  return (
    isPaidVoiceGenerationEnabled(env) &&
    readVoiceAuthorizePaidRaw(env) === LEGACY_DRAFT_AUDIO_VOICE_AUTHORIZE_PAID_VALUE
  );
}

export function hasElevenLabsApiKey(env: VoiceEnv = process.env): boolean {
  return Boolean(read(env, 'ELEVENLABS_API_KEY'));
}

export function readVoiceLimits(env: VoiceEnv = process.env): {
  maxCharsPerRequest: number;
  maxCharsPerEpisode: number;
  monthlyCharLimit: number;
} {
  return {
    maxCharsPerRequest: readInt(env, 'VOICE_GENERATION_MAX_CHARS_PER_REQUEST', DEFAULT_MAX_CHARS_PER_REQUEST),
    maxCharsPerEpisode: readInt(env, 'VOICE_GENERATION_MAX_CHARS_PER_EPISODE', DEFAULT_MAX_CHARS_PER_EPISODE),
    monthlyCharLimit: readInt(env, 'VOICE_GENERATION_MONTHLY_CHAR_LIMIT', DEFAULT_MONTHLY_CHAR_LIMIT),
  };
}

export function readVoiceSafetySnapshot(
  env: VoiceEnv = process.env,
  ledger: VoiceUsageLedger = emptyLedger(),
): VoiceSafetySnapshot {
  const limits = readVoiceLimits(env);
  return {
    paidGenerationEnabled: isPaidVoiceGenerationEnabled(env),
    paidGenerationAuthorized: isPaidVoiceGenerationAuthorized(env),
    apiKeyConfigured: hasElevenLabsApiKey(env),
    providerContactedDefault: false,
    ...limits,
    ledger,
  };
}

export function estimateUsage(text: string): { characterCount: number; unit: 'characters' } {
  return { characterCount: Array.from(text).length, unit: 'characters' };
}

export function assertWithinLimits(input: {
  text: string;
  episodeCharacterCount: number;
  ledger: VoiceUsageLedger;
  paid: boolean;
  env?: VoiceEnv;
}): { characterCount: number } {
  const { maxCharsPerRequest, maxCharsPerEpisode, monthlyCharLimit } = readVoiceLimits(input.env);
  const { characterCount } = estimateUsage(input.text);
  if (characterCount <= 0) {
    throw new VoiceProductionError('Dialogue text is empty.', 'EMPTY_DIALOGUE');
  }
  if (characterCount > maxCharsPerRequest) {
    throw new VoiceProductionError(
      `Line exceeds the per-request limit of ${maxCharsPerRequest} characters.`,
      'REQUEST_LIMIT',
    );
  }
  if (input.episodeCharacterCount + characterCount > maxCharsPerEpisode) {
    throw new VoiceProductionError(
      `Episode would exceed the per-episode limit of ${maxCharsPerEpisode} characters.`,
      'EPISODE_LIMIT',
    );
  }
  if (input.paid && input.ledger.paidCharactersUsed + characterCount > monthlyCharLimit) {
    throw new VoiceProductionError(
      `Monthly paid voice ledger would exceed ${monthlyCharLimit} characters. Hard stop.`,
      'MONTHLY_HARD_STOP',
    );
  }
  return { characterCount };
}

export function assertPaidProviderReady(env: VoiceEnv = process.env): void {
  if (!isPaidVoiceGenerationEnabled(env)) {
    throw new VoiceProductionError(
      'Paid voice generation is disabled. Preview fixtures stay selected.',
      'PAID_VOICE_DISABLED',
    );
  }
  if (!isPaidVoiceGenerationAuthorized(env)) {
    throw new VoiceProductionError(
      'Paid voice generation is not explicitly authorized on the server.',
      'PAID_VOICE_UNAUTHORIZED',
    );
  }
  if (!hasElevenLabsApiKey(env)) {
    throw new VoiceProductionError(
      'ELEVENLABS_API_KEY is missing. Provider was not contacted.',
      'MISSING_API_KEY',
    );
  }
}

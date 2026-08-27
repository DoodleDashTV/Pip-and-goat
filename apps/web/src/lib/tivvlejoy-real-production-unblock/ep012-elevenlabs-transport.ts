import { createHash } from 'node:crypto';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  elevenLabsVoiceSettingsBody,
} from '@/lib/voice-production/approved-voice-settings';
import { sanitizeVoiceErrorMessage } from '@/lib/voice-production/candidate-gates';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';
import { assertApprovedModel, assertExclusiveVoiceAssignment, lockedVoiceIdFor } from '@/lib/voice-production/voice-identity';
import { resolveVoiceAssignment } from '@/lib/voice-production/registry';
import {
  EP012_ELEVENLABS_TTS_HOST,
  EP012_ELEVENLABS_TTS_WITH_TIMESTAMPS_PATH,
  EP012_MAX_AUDIO_BYTES,
  EP012_MAX_PROVIDER_RESPONSE_BYTES,
  EP012_PROVIDER_TIMEOUT_MS,
} from './ep012-paid-voice-constants';
import type { Ep012DerivedVoiceRequest } from './ep012-no-provider-preflight';

export type Ep012Alignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};

export type Ep012AcceptedProviderAudio = {
  audioBytes: Uint8Array;
  audioBase64: string;
  audioSha256: string;
  alignment: Ep012Alignment;
};

export type Ep012ResolvedProviderRequest = {
  text: string;
  modelId: typeof APPROVED_ELEVENLABS_MODEL;
  outputFormat: typeof APPROVED_OUTPUT_FORMAT;
  voiceSettings: ReturnType<typeof elevenLabsVoiceSettingsBody>;
  voiceId: string;
};

export type Ep012ProviderTransport = (request: Ep012ResolvedProviderRequest) => Promise<Ep012AcceptedProviderAudio>;

export type Ep012HttpTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; redirect: 'error'; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; contentType?: string; body: ArrayBuffer }>;

export function deriveEp012ProviderRequest(derived: Ep012DerivedVoiceRequest): Ep012ResolvedProviderRequest {
  const assignment = resolveVoiceAssignment(derived.characterId);
  assertExclusiveVoiceAssignment(assignment.characterId, assignment.providerVoiceId);
  assertApprovedModel(APPROVED_ELEVENLABS_MODEL);
  return {
    text: derived.canonicalText,
    modelId: APPROVED_ELEVENLABS_MODEL,
    outputFormat: APPROVED_OUTPUT_FORMAT,
    voiceSettings: elevenLabsVoiceSettingsBody(),
    voiceId: lockedVoiceIdFor(derived.characterId),
  };
}

export function ep012ProviderUrl(voiceId: string): string {
  return `${EP012_ELEVENLABS_TTS_HOST}${EP012_ELEVENLABS_TTS_WITH_TIMESTAMPS_PATH}/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${APPROVED_OUTPUT_FORMAT}`;
}

function providerError(code: string, message: string): VoiceProductionError {
  return new VoiceProductionError(sanitizeVoiceErrorMessage(message), code);
}

function isLikelyHtml(text: string): boolean {
  const trimmed = text.trim().slice(0, 64).toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<body');
}

function isLikelyMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  if (typeof value === 'string' && value.length > 0) return Array.from(value);
  return null;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return value;
}

export function acceptEp012ProviderPayload(raw: unknown, contentType?: string): Ep012AcceptedProviderAudio {
  if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (bytes.byteLength > EP012_MAX_PROVIDER_RESPONSE_BYTES) {
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider response exceeded the defensive size limit.');
    }
    const asText = Buffer.from(bytes).toString('utf8');
    if (isLikelyHtml(asText) || (contentType && /html|text\/plain/i.test(contentType))) {
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
    try {
      return acceptEp012ProviderPayload(JSON.parse(asText), contentType);
    } catch (error) {
      if (error instanceof VoiceProductionError) throw error;
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
  }
  if (typeof raw === 'string') {
    if (isLikelyHtml(raw) || raw.length > EP012_MAX_PROVIDER_RESPONSE_BYTES) {
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
    try {
      return acceptEp012ProviderPayload(JSON.parse(raw), contentType);
    } catch (error) {
      if (error instanceof VoiceProductionError) throw error;
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.audio_base64 !== 'string' || !body.audio_base64.trim()) {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  let audioBytes: Uint8Array;
  try {
    audioBytes = new Uint8Array(Buffer.from(body.audio_base64, 'base64'));
  } catch {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  if (!audioBytes.byteLength || audioBytes.byteLength > EP012_MAX_AUDIO_BYTES || !isLikelyMp3(audioBytes)) {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  const alignmentRaw = body.alignment;
  if (!alignmentRaw || typeof alignmentRaw !== 'object' || Array.isArray(alignmentRaw)) {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  const alignmentBody = alignmentRaw as Record<string, unknown>;
  const characters = asStringArray(alignmentBody.characters);
  const starts = asNumberArray(alignmentBody.character_start_times_seconds);
  const ends = asNumberArray(alignmentBody.character_end_times_seconds);
  if (!characters || !starts || !ends || characters.length !== starts.length || characters.length !== ends.length) {
    throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
  }
  return {
    audioBytes,
    audioBase64: body.audio_base64,
    audioSha256: createHash('sha256').update(audioBytes).digest('hex'),
    alignment: {
      characters,
      characterStartTimesSeconds: starts,
      characterEndTimesSeconds: ends,
    },
  };
}

export function createEp012ElevenLabsTransport(
  env: VoiceEnv,
  http: Ep012HttpTransport = defaultEp012HttpTransport,
): Ep012ProviderTransport {
  let attempts = 0;
  return async (request) => {
    attempts += 1;
    if (attempts > 1) {
      throw providerError('EP012_PROVIDER_RETRY_REFUSED', 'Automatic provider retries are refused.');
    }
    const apiKey = String(env.ELEVENLABS_API_KEY ?? '').trim();
    if (!apiKey) {
      throw providerError('EP012_API_KEY_NOT_CONFIGURED', 'The provider API key is not configured. Provider was not contacted.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EP012_PROVIDER_TIMEOUT_MS);
    let result: { ok: boolean; status: number; contentType?: string; body: ArrayBuffer };
    try {
      result = await http(ep012ProviderUrl(request.voiceId), {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: request.modelId,
          voice_settings: request.voiceSettings,
        }),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'timeout';
      if (/redirect/i.test(message)) {
        throw providerError('EP012_PROVIDER_REDIRECT_REFUSED', 'Provider redirects are refused. The request was not retried.');
      }
      if (/timeout|aborted|network/i.test(message)) {
        throw providerError('EP012_PROVIDER_TIMEOUT', 'The provider timed out. The request was not retried.');
      }
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    } finally {
      clearTimeout(timer);
    }
    if (result.status >= 300 && result.status < 400) {
      throw providerError('EP012_PROVIDER_REDIRECT_REFUSED', 'Provider redirects are refused. The request was not retried.');
    }
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        throw providerError('EP012_PROVIDER_AUTHORIZATION', 'Provider authorization failed. Provider details were not shown.');
      }
      if (result.status === 429) {
        throw providerError('EP012_PROVIDER_QUOTA', 'Provider quota or rate limit was reached. Provider details were not shown.');
      }
      if (result.status === 408 || result.status === 504) {
        throw providerError('EP012_PROVIDER_TIMEOUT', 'The provider timed out. The request was not retried.');
      }
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
    if (result.body.byteLength > EP012_MAX_PROVIDER_RESPONSE_BYTES) {
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider response exceeded the defensive size limit.');
    }
    return acceptEp012ProviderPayload(result.body, result.contentType);
  };
}

export async function defaultEp012HttpTransport(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; redirect: 'error'; signal: AbortSignal },
): Promise<{ ok: boolean; status: number; contentType?: string; body: ArrayBuffer }> {
  const response = await fetch(url, { ...init, redirect: 'error' });
  const body = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
    body,
  };
}

export function createFakeEp012ProviderTransport(
  payload: unknown | (() => unknown | Promise<unknown>),
  options: { fail?: boolean; calls?: { count: number } } = {},
): Ep012ProviderTransport {
  return async () => {
    if (options.calls) options.calls.count += 1;
    if (options.fail) {
      throw providerError('EP012_PROVIDER_RESPONSE_INVALID', 'The provider returned an unsupported response. Provider details were not shown.');
    }
    const raw = typeof payload === 'function' ? await payload() : payload;
    return acceptEp012ProviderPayload(raw);
  };
}

export function fakeEp012Mp3Bytes(label = 'EP012'): Uint8Array {
  const id3 = Buffer.from('ID3');
  const rest = Buffer.from(label.padEnd(96, '0'));
  const frame = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  return new Uint8Array(Buffer.concat([id3, rest, frame]));
}

export function fakeEp012ProviderPayload(text: string, label = 'EP012') {
  const audioBytes = fakeEp012Mp3Bytes(label);
  const characters = Array.from(text);
  return {
    audio_base64: Buffer.from(audioBytes).toString('base64'),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.04),
      character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.04),
    },
  };
}

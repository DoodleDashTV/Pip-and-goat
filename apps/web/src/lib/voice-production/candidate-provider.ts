import { assertAudienceFacingContent } from '../brand-canon';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  elevenLabsVoiceSettingsBody,
} from './approved-voice-settings';
import { sanitizeVoiceErrorMessage } from './candidate-gates';
import { resolveElevenLabsModel } from './models';
import { assertNoClientVoiceId, resolveVoiceAssignment } from './registry';
import { type VoiceEnv } from './safety';
import { VoiceProductionError, type RegisteredCharacterId } from './types';
import { assertApprovedModel, assertExclusiveVoiceAssignment } from './voice-identity';

export const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
export const ELEVENLABS_TTS_OUTPUT_FORMAT = APPROVED_OUTPUT_FORMAT;

export type CandidateTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; contentType?: string; body?: ArrayBuffer | string }>;

export type CandidateConvertInput = {
  characterId: RegisteredCharacterId;
  text: string;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
};

function encodeAudio(body: ArrayBuffer | string | undefined): string {
  if (!body) return '';
  if (typeof body === 'string') {
    if (typeof Buffer !== 'undefined') return Buffer.from(body, 'binary').toString('base64');
    return btoa(body);
  }
  if (typeof Buffer !== 'undefined') return Buffer.from(body).toString('base64');
  let binary = '';
  const bytes = new Uint8Array(body);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function mapProviderFailure(status: number): VoiceProductionError {
  if (status === 401 || status === 403) {
    return new VoiceProductionError('Provider authorization failed. Provider details were not shown.', 'PROVIDER_AUTHORIZATION');
  }
  if (status === 429) {
    return new VoiceProductionError('Provider quota or rate limit was reached. Provider details were not shown.', 'PROVIDER_QUOTA');
  }
  if (status === 408 || status === 504) {
    return new VoiceProductionError('The provider timed out. The request was not retried.', 'PROVIDER_TIMEOUT');
  }
  return new VoiceProductionError('The provider returned an unsupported response. Provider details were not shown.', 'PROVIDER_UNSUPPORTED');
}

/**
 * Official ElevenLabs convert contract used for the approved samples:
 * POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 * Header xi-api-key, JSON { text, model_id, voice_settings }.
 * Voice IDs are resolved from the locked registry only.
 */
export async function convertCandidateSpeech(
  input: CandidateConvertInput,
  env: VoiceEnv,
  transport: CandidateTransport,
): Promise<{ audioBase64: string; contentType: string }> {
  assertNoClientVoiceId(input);
  assertAudienceFacingContent({ dialogue: input.text, text: input.text });
  const assignment = resolveVoiceAssignment(input.characterId);
  assertExclusiveVoiceAssignment(assignment.characterId, assignment.providerVoiceId);
  const model = resolveElevenLabsModel(APPROVED_ELEVENLABS_MODEL);
  assertApprovedModel(model);
  const apiKey = String(env.ELEVENLABS_API_KEY ?? '').trim();
  const url = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(assignment.providerVoiceId)}?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`;
  let result: { ok: boolean; status: number; contentType?: string; body?: ArrayBuffer | string };
  try {
    result = await transport(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: model,
        voice_settings: elevenLabsVoiceSettingsBody(),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'timeout';
    if (/timeout|aborted|network/i.test(message)) {
      throw new VoiceProductionError('The provider timed out. The request was not retried.', 'PROVIDER_TIMEOUT');
    }
    throw new VoiceProductionError(
      sanitizeVoiceErrorMessage('The provider returned an unsupported response. Provider details were not shown.'),
      'PROVIDER_UNSUPPORTED',
    );
  }
  if (!result.ok) throw mapProviderFailure(result.status);
  const contentType = result.contentType ?? 'audio/mpeg';
  if (!contentType.includes('audio')) {
    throw new VoiceProductionError('The provider returned an unsupported response. Provider details were not shown.', 'PROVIDER_UNSUPPORTED');
  }
  const audioBase64 = encodeAudio(result.body);
  if (!audioBase64) {
    throw new VoiceProductionError('The provider returned an unsupported response. Provider details were not shown.', 'PROVIDER_UNSUPPORTED');
  }
  return { audioBase64, contentType };
}

export async function defaultCandidateTransport(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
): Promise<{ ok: boolean; status: number; contentType?: string; body?: ArrayBuffer }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

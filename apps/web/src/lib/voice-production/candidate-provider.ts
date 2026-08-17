import { resolveElevenLabsModel } from './models';
import { sanitizeVoiceErrorMessage } from './candidate-gates';
import { type VoiceEnv } from './safety';
import { DEFAULT_ELEVENLABS_MODEL, VoiceProductionError } from './types';

export const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
export const ELEVENLABS_TTS_OUTPUT_FORMAT = 'mp3_44100_128';

export type CandidateTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; contentType?: string; body?: ArrayBuffer | string }>;

export type CandidateConvertInput = {
  voiceId: string;
  text: string;
  model?: string;
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
 * Official ElevenLabs convert contract:
 * POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 * Header xi-api-key, JSON { text, model_id }.
 * This function is only called after live approved-sample gates pass.
 */
export async function convertCandidateSpeech(
  input: CandidateConvertInput,
  env: VoiceEnv,
  transport: CandidateTransport,
): Promise<{ audioBase64: string; contentType: string }> {
  const model = resolveElevenLabsModel(input.model ?? env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL);
  const apiKey = String(env.ELEVENLABS_API_KEY ?? '').trim();
  const url = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(input.voiceId)}?output_format=${ELEVENLABS_TTS_OUTPUT_FORMAT}`;
  let result: { ok: boolean; status: number; contentType?: string; body?: ArrayBuffer | string };
  try {
    result = await transport(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: input.text, model_id: model }),
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

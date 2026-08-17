import { resolveElevenLabsModel } from './models';
import { assertNoClientVoiceId, resolveVoiceAssignment } from './registry';
import { assertPaidProviderReady, type VoiceEnv } from './safety';
import { VoiceProductionError, type RegisteredCharacterId } from './types';

export type ElevenLabsTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export type ProviderGenerateInput = {
  characterId: RegisteredCharacterId;
  text: string;
  model?: string;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
};

/**
 * Paid ElevenLabs adapter. This increment never calls it from Preview or tests.
 * The transport is injected so tests can prove the network is not used.
 */
export async function generateElevenLabsAudio(
  input: ProviderGenerateInput,
  env: VoiceEnv = process.env,
  transport?: ElevenLabsTransport,
): Promise<never> {
  assertNoClientVoiceId(input);
  assertPaidProviderReady(env);
  resolveElevenLabsModel(input.model ?? env.ELEVENLABS_MODEL_ID);
  resolveVoiceAssignment(input.characterId);
  if (!transport) {
    throw new VoiceProductionError(
      'Paid ElevenLabs transport is not attached. Provider was not contacted.',
      'PROVIDER_TRANSPORT_UNAVAILABLE',
    );
  }
  throw new VoiceProductionError(
    'Paid ElevenLabs generation is implemented as a fail-closed boundary. Provider was not contacted.',
    'PROVIDER_NOT_CONTACTED',
  );
}

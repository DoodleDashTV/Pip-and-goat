import {
  DEFAULT_ELEVENLABS_MODEL,
  SUPPORTED_ELEVENLABS_MODELS,
  VoiceProductionError,
  type SupportedElevenLabsModel,
} from './types';

export function isSupportedElevenLabsModel(model: string): model is SupportedElevenLabsModel {
  return (SUPPORTED_ELEVENLABS_MODELS as readonly string[]).includes(model);
}

export function resolveElevenLabsModel(raw?: string): SupportedElevenLabsModel {
  const model = (raw || DEFAULT_ELEVENLABS_MODEL).trim();
  if (!isSupportedElevenLabsModel(model)) {
    throw new VoiceProductionError(
      `ElevenLabs model ${model} is not on the supported allowlist.`,
      'UNSUPPORTED_MODEL',
    );
  }
  return model;
}

/**
 * Effective ElevenLabs contract used for Justin’s approved Pip and Goat samples.
 * The live requests sent model_id + text and output_format only; these voice
 * settings are the official API defaults that applied when voice_settings was omitted.
 */
export const APPROVED_ELEVENLABS_MODEL = 'eleven_multilingual_v2' as const;
export const APPROVED_OUTPUT_FORMAT = 'mp3_44100_128' as const;

export const APPROVED_VOICE_SETTINGS = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1,
  speakerBoost: true,
} as const;

export const VOICE_IDENTITY_CHECKPOINT = 'TIVVLEJOY_VOICE_IDENTITY_LOCK_V1' as const;
export const VOICE_IDENTITY_APPROVED_ON = '2026-08-17' as const;

export type PublicApprovedVoiceSettings = {
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  speakerBoost: boolean;
};

export function publicApprovedVoiceSettings(): PublicApprovedVoiceSettings {
  return {
    stability: APPROVED_VOICE_SETTINGS.stability,
    similarity: APPROVED_VOICE_SETTINGS.similarityBoost,
    style: APPROVED_VOICE_SETTINGS.style,
    speed: APPROVED_VOICE_SETTINGS.speed,
    speakerBoost: APPROVED_VOICE_SETTINGS.speakerBoost,
  };
}

export function publicVoiceIdentitySnapshot() {
  return {
    status: 'final-approved' as const,
    checkpoint: VOICE_IDENTITY_CHECKPOINT,
    approvedOn: VOICE_IDENTITY_APPROVED_ON,
    model: APPROVED_ELEVENLABS_MODEL,
    outputFormat: APPROVED_OUTPUT_FORMAT,
    settings: publicApprovedVoiceSettings(),
    productionEnabled: false,
  };
}

export function elevenLabsVoiceSettingsBody() {
  return {
    stability: APPROVED_VOICE_SETTINGS.stability,
    similarity_boost: APPROVED_VOICE_SETTINGS.similarityBoost,
    style: APPROVED_VOICE_SETTINGS.style,
    speed: APPROVED_VOICE_SETTINGS.speed,
    use_speaker_boost: APPROVED_VOICE_SETTINGS.speakerBoost,
  };
}

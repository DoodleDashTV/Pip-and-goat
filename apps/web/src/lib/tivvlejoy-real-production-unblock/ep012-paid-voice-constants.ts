export const EP012_PAID_VOICE_EXECUTION_SCHEMA = 'TIVVLEJOY_EP012_PAID_VOICE_EXECUTION_V1' as const;
export const EP012_VOICE_RECEIPT_SCHEMA = 'TIVVLEJOY_EP012_VOICE_RECEIPT_V1' as const;
export const EP012_STORAGE_PROBE_SCHEMA = 'TIVVLEJOY_EP012_STORAGE_PROBE_V1' as const;
export const EP012_STORAGE_PROBE_MARKER_SCHEMA = 'TIVVLEJOY_EP012_STORAGE_PROBE_MARKER_V1' as const;
export const EP012_AUDIO_RETRIEVAL_SCHEMA = 'TIVVLEJOY_EP012_AUDIO_RETRIEVAL_V1' as const;

export const EP012_AUTHORIZED_REQUEST_COUNT = 11 as const;
export const EP012_AUTHORIZED_CHARACTER_COUNT = 460 as const;
export const EP012_HISTORICAL_PAID_REQUESTS = 4 as const;
export const EP012_HISTORICAL_PAID_CHARACTERS = 235 as const;
export const EP012_FINAL_GLOBAL_REQUEST_CEILING = 15 as const;
export const EP012_FINAL_GLOBAL_CHARACTER_CEILING = 695 as const;

export const EP012_REQUEST_ID_PREFIX = 'ep012_voice_' as const;
export const EP012_AUDIO_KEY_PREFIX = 'audio/EP012/' as const;
export const EP012_CONTROL_KEY_PREFIX = 'audio/EP012/control/' as const;
export const EP012_STORAGE_PROBE_MARKER_KEY = 'audio/EP012/control/storage-probe.marker.json' as const;

export const EP012_ELEVENLABS_TTS_WITH_TIMESTAMPS_PATH = '/v1/text-to-speech' as const;
export const EP012_ELEVENLABS_TTS_HOST = 'https://api.elevenlabs.io' as const;
export const EP012_PROVIDER_TIMEOUT_MS = 20_000 as const;
export const EP012_MAX_PROVIDER_RESPONSE_BYTES = 6 * 1024 * 1024;
export const EP012_MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export function isEp012RequestId(requestId: string): boolean {
  return requestId.startsWith(EP012_REQUEST_ID_PREFIX) && requestId.length === EP012_REQUEST_ID_PREFIX.length + 24;
}

export function ep012AudioObjectKey(segmentId: string): string {
  return `${EP012_AUDIO_KEY_PREFIX}${segmentId}.mp3`;
}

export function ep012ReceiptObjectKey(segmentId: string): string {
  return `${EP012_AUDIO_KEY_PREFIX}${segmentId}.receipt.json`;
}

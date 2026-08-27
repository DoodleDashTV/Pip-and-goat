import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type VoiceEnv } from '@/lib/voice-production/safety';
import { VoiceProductionError } from '@/lib/voice-production/types';
import {
  EP012_AUDIO_KEY_PREFIX,
  EP012_CONTROL_KEY_PREFIX,
  EP012_STORAGE_PROBE_MARKER_KEY,
  EP012_VOICE_RECEIPT_SCHEMA,
  ep012AudioObjectKey,
  ep012ReceiptObjectKey,
} from './ep012-paid-voice-constants';
import { EP012_AUTHORIZED_SEGMENT_IDS, type Ep012AuthorizedSegmentId } from './ep012-no-provider-preflight';
import type { Ep012Alignment } from './ep012-elevenlabs-transport';
import type { Ep012DerivedVoiceRequest } from './ep012-no-provider-preflight';

export type Ep012AudioStorage = {
  kind: 'memory' | 'r2' | 'unavailable';
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
};

export type Ep012PublicReceipt = {
  schemaVersion: typeof EP012_VOICE_RECEIPT_SCHEMA;
  episodeId: 'EP012';
  segmentId: string;
  requestId: string;
  speaker: string;
  characterCount: number;
  audioSha256: string;
  audioBytes: number;
  providerAttemptedAt: string;
  storageVerified: true;
  alignment: {
    characterCount: number;
    hasStartTimes: true;
    hasEndTimes: true;
  };
  productionEnabled: false;
};

const SCENERY_KEY_MARKERS = [
  'scenery',
  'environments/',
  'original_uploads/',
  'approved_assets/',
  'character-models/',
  'canonical-references/',
];

export function isAuthorizedEp012SegmentId(segmentId: string): segmentId is Ep012AuthorizedSegmentId {
  return (EP012_AUTHORIZED_SEGMENT_IDS as readonly string[]).includes(segmentId);
}

export function assertSafeEp012ObjectKey(key: string): string {
  const normalized = String(key ?? '').trim();
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    normalized.startsWith('/') ||
    SCENERY_KEY_MARKERS.some((marker) => normalized.toLowerCase().includes(marker))
  ) {
    throw new VoiceProductionError('Arbitrary storage keys are refused.', 'EP012_PATH_TRAVERSAL_REFUSED');
  }
  if (!normalized.startsWith(EP012_AUDIO_KEY_PREFIX)) {
    throw new VoiceProductionError('Only audio/EP012/ object keys are permitted.', 'EP012_PATH_TRAVERSAL_REFUSED');
  }
  return normalized;
}

export function deriveEp012ObjectKeys(segmentId: string): { audioKey: string; receiptKey: string } {
  if (!isAuthorizedEp012SegmentId(segmentId) || segmentId.includes('/') || segmentId.includes('\\') || segmentId.includes('..')) {
    throw new VoiceProductionError('Arbitrary storage keys are refused.', 'EP012_PATH_TRAVERSAL_REFUSED');
  }
  const audioKey = assertSafeEp012ObjectKey(ep012AudioObjectKey(segmentId));
  const receiptKey = assertSafeEp012ObjectKey(ep012ReceiptObjectKey(segmentId));
  return { audioKey, receiptKey };
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildEp012PublicReceipt(input: {
  derived: Ep012DerivedVoiceRequest;
  audioSha256: string;
  audioBytes: number;
  providerAttemptedAt: string;
  alignment: Ep012Alignment;
}): Ep012PublicReceipt {
  return {
    schemaVersion: EP012_VOICE_RECEIPT_SCHEMA,
    episodeId: 'EP012',
    segmentId: input.derived.segmentId,
    requestId: input.derived.requestId,
    speaker: input.derived.speaker,
    characterCount: input.derived.characterCount,
    audioSha256: input.audioSha256,
    audioBytes: input.audioBytes,
    providerAttemptedAt: input.providerAttemptedAt,
    storageVerified: true,
    alignment: {
      characterCount: input.alignment.characters.length,
      hasStartTimes: true,
      hasEndTimes: true,
    },
    productionEnabled: false,
  };
}

export function createMemoryEp012AudioStorage(seed: Record<string, Uint8Array> = {}): Ep012AudioStorage & {
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>(Object.entries(seed).map(([key, value]) => [key, new Uint8Array(value)]));
  return {
    kind: 'memory',
    objects,
    async putObject(key, body) {
      const safe = assertSafeEp012ObjectKey(key);
      objects.set(safe, new Uint8Array(body));
    },
    async getObject(key) {
      const safe = assertSafeEp012ObjectKey(key);
      const found = objects.get(safe);
      if (!found) {
        throw new VoiceProductionError('Stored EP012 audio was not found.', 'EP012_ARTIFACT_NOT_FINALIZED');
      }
      return new Uint8Array(found);
    },
  };
}

export function createUnavailableEp012AudioStorage(): Ep012AudioStorage {
  const blocked = async () => {
    throw new VoiceProductionError('EP012 audio storage is not configured.', 'EP012_STORAGE_NOT_CONFIGURED');
  };
  return { kind: 'unavailable', putObject: blocked, getObject: blocked };
}

function readEnv(env: VoiceEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

export function ep012AudioStorageConfigured(env: VoiceEnv = process.env): boolean {
  const bucket = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_BUCKET') || readEnv(env, 'R2_BUCKET');
  const endpoint = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_ENDPOINT') || readEnv(env, 'R2_ENDPOINT');
  const access = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID') || readEnv(env, 'R2_ACCESS_KEY_ID');
  const secret = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY') || readEnv(env, 'R2_SECRET_ACCESS_KEY');
  return Boolean(bucket && endpoint && access && secret);
}

export function createR2Ep012AudioStorage(env: VoiceEnv = process.env): Ep012AudioStorage {
  if (!ep012AudioStorageConfigured(env)) {
    return createUnavailableEp012AudioStorage();
  }
  const bucket = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_BUCKET') || readEnv(env, 'R2_BUCKET');
  const endpoint = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_ENDPOINT') || readEnv(env, 'R2_ENDPOINT');
  const accessKeyId = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID') || readEnv(env, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY') || readEnv(env, 'R2_SECRET_ACCESS_KEY');
  const region = readEnv(env, 'TIVVLEJOY_EP012_AUDIO_REGION') || readEnv(env, 'R2_REGION') || 'auto';
  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return {
    kind: 'r2',
    async putObject(key, body, contentType) {
      const safe = assertSafeEp012ObjectKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: safe,
          Body: Buffer.from(body),
          ContentType: contentType,
        }),
      );
    },
    async getObject(key) {
      const safe = assertSafeEp012ObjectKey(key);
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: safe }));
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new VoiceProductionError('Stored EP012 audio was not found.', 'EP012_ARTIFACT_NOT_FINALIZED');
      }
      return new Uint8Array(bytes);
    },
  };
}

export async function writeAndVerifyEp012Objects(input: {
  storage: Ep012AudioStorage;
  segmentId: string;
  audioBytes: Uint8Array;
  receipt: Ep012PublicReceipt;
}): Promise<{ audioKey: string; receiptKey: string; audioSha256: string; audioBytes: number; receiptBytes: number }> {
  const { audioKey, receiptKey } = deriveEp012ObjectKeys(input.segmentId);
  const expectedAudioSha = sha256Bytes(input.audioBytes);
  const receiptBytes = new TextEncoder().encode(JSON.stringify(input.receipt));
  const expectedReceiptSha = sha256Bytes(receiptBytes);
  try {
    await input.storage.putObject(audioKey, input.audioBytes, 'audio/mpeg');
    await input.storage.putObject(receiptKey, receiptBytes, 'application/json');
  } catch (error) {
    if (error instanceof VoiceProductionError) throw error;
    throw new VoiceProductionError('EP012 audio storage write failed.', 'EP012_STORAGE_VERIFICATION_FAILED');
  }
  const readAudio = await input.storage.getObject(audioKey);
  const readReceipt = await input.storage.getObject(receiptKey);
  if (sha256Bytes(readAudio) !== expectedAudioSha || readAudio.byteLength !== input.audioBytes.byteLength) {
    throw new VoiceProductionError('EP012 audio storage verification failed.', 'EP012_STORAGE_VERIFICATION_FAILED');
  }
  if (sha256Bytes(readReceipt) !== expectedReceiptSha || readReceipt.byteLength !== receiptBytes.byteLength) {
    throw new VoiceProductionError('EP012 audio storage verification failed.', 'EP012_STORAGE_VERIFICATION_FAILED');
  }
  return {
    audioKey,
    receiptKey,
    audioSha256: expectedAudioSha,
    audioBytes: input.audioBytes.byteLength,
    receiptBytes: receiptBytes.byteLength,
  };
}

export function storageProbeMarkerBytes(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 'TIVVLEJOY_EP012_STORAGE_PROBE_MARKER_V1',
      episodeId: 'EP012',
      purpose: 'harmless-storage-verification',
      key: EP012_STORAGE_PROBE_MARKER_KEY,
      prefix: EP012_CONTROL_KEY_PREFIX,
      productionEnabled: false,
    }),
  );
}

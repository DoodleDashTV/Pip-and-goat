import { createHash, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { compileEp001VoiceExecutionReadiness } from '@/lib/tivvlejoy-ep001-voice-execution-readiness';
import { APPROVED_ELEVENLABS_MODEL, APPROVED_OUTPUT_FORMAT, elevenLabsVoiceSettingsBody } from '@/lib/voice-production/approved-voice-settings';
import { lockedVoiceIdFor } from '@/lib/voice-production/voice-identity';
import { createEp012ElevenLabsTransport } from '@/lib/tivvlejoy-real-production-unblock/ep012-elevenlabs-transport';

export const EP001_CONNECTED_VOICE_EXECUTION_SCHEMA = 'TIVVLEJOY_EP001_CONNECTED_VOICE_EXECUTION_V1' as const;
const AUTH_TOKEN_SHA256 = 'd7f6e533ddafedb6273d6b4ba78b72c21c5e5718cc7942106051556b8cfd35d4';
const PREFIX = 'audio/EP001/';
const MAX_LINE_AUDIO_BYTES = 8 * 1024 * 1024;

type R2 = { client: S3Client; bucket: string };

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function tokenAuthorized(token: string): boolean {
  const actual = Buffer.from(sha256Text(token), 'hex');
  const expected = Buffer.from(AUTH_TOKEN_SHA256, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function readEnv(name: string): string { return String(process.env[name] ?? '').trim(); }
function resolveR2(): R2 | null {
  const bucket = readEnv('TIVVLEJOY_EP012_AUDIO_BUCKET') || readEnv('R2_BUCKET');
  const endpoint = readEnv('TIVVLEJOY_EP012_AUDIO_ENDPOINT') || readEnv('R2_ENDPOINT');
  const accessKeyId = readEnv('TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID') || readEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = readEnv('TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY') || readEnv('R2_SECRET_ACCESS_KEY');
  const region = readEnv('TIVVLEJOY_EP012_AUDIO_REGION') || readEnv('R2_REGION') || 'auto';
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, client: new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true }) };
}
function keyFor(lineId: string, kind: 'reservation' | 'audio' | 'receipt'): string {
  if (!/^EP001_DL_0[1-8]$/.test(lineId)) throw new Error('EP001_LINE_NOT_AUTHORIZED');
  if (kind === 'reservation') return `${PREFIX}control/${lineId}.reservation.json`;
  if (kind === 'audio') return `${PREFIX}${lineId}.mp3`;
  return `${PREFIX}${lineId}.receipt.json`;
}
async function optionalObject(r2: R2, key: string): Promise<Uint8Array | null> {
  try {
    const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error('EP001_STORAGE_EMPTY_OBJECT');
    return new Uint8Array(bytes);
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (candidate?.$metadata?.httpStatusCode === 404 || candidate?.name === 'NoSuchKey' || candidate?.name === 'NotFound') return null;
    throw error;
  }
}
async function putAndVerify(r2: R2, key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: Buffer.from(bytes), ContentType: contentType }));
  const reread = await optionalObject(r2, key);
  if (!reread || reread.byteLength !== bytes.byteLength || sha256Bytes(reread) !== sha256Bytes(bytes)) {
    throw new Error('EP001_STORAGE_VERIFICATION_FAILED');
  }
}

export async function executeOneEp001VoiceLine(input: { token: string; lineId: string }) {
  if (process.env.VERCEL_ENV !== 'preview') return blocked('EP001_PREVIEW_RUNTIME_REQUIRED');
  if (!tokenAuthorized(input.token)) return blocked('EP001_EXECUTION_TOKEN_INVALID');
  const readiness = compileEp001VoiceExecutionReadiness();
  const line = readiness.lines.find((candidate) => candidate.lineId === input.lineId);
  if (!line) return blocked('EP001_LINE_NOT_AUTHORIZED');
  const apiKey = readEnv('ELEVENLABS_API_KEY');
  if (!apiKey) return blocked('EP001_API_KEY_NOT_CONFIGURED');
  const r2 = resolveR2();
  if (!r2) return blocked('EP001_STORAGE_NOT_CONFIGURED');

  const reservationKey = keyFor(line.lineId, 'reservation');
  const audioKey = keyFor(line.lineId, 'audio');
  const receiptKey = keyFor(line.lineId, 'receipt');

  const existingReceipt = await optionalObject(r2, receiptKey);
  if (existingReceipt) {
    const receiptSha256 = sha256Bytes(existingReceipt);
    return { schemaVersion: EP001_CONNECTED_VOICE_EXECUTION_SCHEMA, ok: true, status: 'ALREADY_SUCCEEDED' as const, episodeId: 'EP001', lineId: line.lineId, providerContacted: false, providerRequestsMade: 0, storageVerified: true, receiptSha256, humanApproved: false, productionEnabled: false };
  }
  const existingReservation = await optionalObject(r2, reservationKey);
  if (existingReservation) return blocked('EP001_RECOVERY_REQUIRED', line.lineId);

  const reservedAt = new Date().toISOString();
  const textSha256 = sha256Text(line.text);
  const reservation = new TextEncoder().encode(JSON.stringify({ schemaVersion: 'TIVVLEJOY_EP001_VOICE_RESERVATION_V1', episodeId: 'EP001', lineId: line.lineId, textSha256, reservedAt, providerAttempted: false, productionEnabled: false }));
  await putAndVerify(r2, reservationKey, reservation, 'application/json');

  let providerContacted = false;
  try {
    const transport = createEp012ElevenLabsTransport(process.env);
    providerContacted = true;
    const providerAudio = await transport({
      text: line.text,
      modelId: APPROVED_ELEVENLABS_MODEL,
      outputFormat: APPROVED_OUTPUT_FORMAT,
      voiceSettings: elevenLabsVoiceSettingsBody(),
      voiceId: lockedVoiceIdFor(line.characterId),
    });
    if (!providerAudio.audioBytes.byteLength || providerAudio.audioBytes.byteLength > MAX_LINE_AUDIO_BYTES) throw new Error('EP001_AUDIO_SIZE_INVALID');
    const audioSha256 = sha256Bytes(providerAudio.audioBytes);
    const timingSha256 = sha256Text(JSON.stringify(providerAudio.alignment));
    const receiptBody = {
      schemaVersion: 'TIVVLEJOY_EP001_VOICE_RECEIPT_V1',
      episodeId: 'EP001', lineId: line.lineId, shotId: line.shotId, speaker: line.speaker, characterId: line.characterId,
      voiceProfileVersion: line.voiceProfileVersion, textSha256, pictureWindow: line.pictureWindow,
      audioSha256, audioBytes: providerAudio.audioBytes.byteLength, alignmentPresent: true, timingSha256,
      providerAttemptedAt: new Date().toISOString(), storageVerified: true, humanApproved: false, productionEnabled: false,
    };
    const receiptBytes = new TextEncoder().encode(JSON.stringify(receiptBody));
    await putAndVerify(r2, audioKey, providerAudio.audioBytes, 'audio/mpeg');
    await putAndVerify(r2, receiptKey, receiptBytes, 'application/json');
    return { schemaVersion: EP001_CONNECTED_VOICE_EXECUTION_SCHEMA, ok: true, status: 'SUCCEEDED' as const, episodeId: 'EP001', lineId: line.lineId, providerContacted: true, providerRequestsMade: 1, storageVerified: true, audioSha256, audioBytes: providerAudio.audioBytes.byteLength, timingSha256, receiptSha256: sha256Bytes(receiptBytes), humanApproved: false, productionEnabled: false };
  } catch {
    return { ...blocked('EP001_RECOVERY_REQUIRED', line.lineId), providerContacted, providerRequestsMade: providerContacted ? 1 : 0 };
  }
}

function blocked(code: string, lineId: string | null = null) {
  return { schemaVersion: EP001_CONNECTED_VOICE_EXECUTION_SCHEMA, ok: false, status: 'BLOCKED' as const, episodeId: 'EP001', lineId, blockers: [code], providerContacted: false, providerRequestsMade: 0, storageVerified: false, humanApproved: false, productionEnabled: false };
}

import { createHash, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  elevenLabsVoiceSettingsBody,
} from '@/lib/voice-production/approved-voice-settings';
import { lockedVoiceIdFor } from '@/lib/voice-production/voice-identity';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from '@/lib/voice-production/types';

const SCHEMA = 'TIVVLEJOY_EP001_TEMP_CONNECTED_VOICE_EXECUTION_V1' as const;
const AUTHORIZATION_SHA256 = '' as const; // Fail closed until an explicit paid authorization is SHA-pinned.
const PREFIX = 'audio/EP001/';
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

type Line = {
  lineId: string;
  shotId: string;
  speaker: 'PIP' | 'GOAT';
  characterId: typeof PIP_CHARACTER_ID | typeof GOAT_CHARACTER_ID;
  text: string;
  textSha256: string;
  startFrame: number;
  endFrame: number;
};

const LINES: readonly Line[] = [
  { lineId: 'EP001_DL_01', shotId: 'EP001_SH02', speaker: 'PIP', characterId: PIP_CHARACTER_ID, text: 'Goat, look! A doodle map—with a piece missing.', textSha256: '5aa3981ca11ef611f69ff006df583e574bbbb6f4876094971f1fe2b15cec2552', startFrame: 170, endFrame: 300 },
  { lineId: 'EP001_DL_02', shotId: 'EP001_SH03', speaker: 'GOAT', characterId: GOAT_CHARACTER_ID, text: 'Maybe the wind knows where it went.', textSha256: '8e5cfb14399a49f0ff53cea910b4eea82b3337f1dd56b2af1ea9667e65b5ce92', startFrame: 350, endFrame: 450 },
  { lineId: 'EP001_DL_03', shotId: 'EP001_SH04', speaker: 'PIP', characterId: PIP_CHARACTER_ID, text: "Then let's follow that flutter!", textSha256: 'a75eda2549085ee1f10b5e051028718e394759b53e9b926edd59aa2622a3ff49', startFrame: 500, endFrame: 630 },
  { lineId: 'EP001_DL_04', shotId: 'EP001_SH06', speaker: 'GOAT', characterId: GOAT_CHARACTER_ID, text: 'I can look low!', textSha256: '981e7dcc7a2d54698b0465321193fb1c9ac6b07ec5f2ed2a24250842c9db0577', startFrame: 865, endFrame: 985 },
  { lineId: 'EP001_DL_05', shotId: 'EP001_SH07', speaker: 'PIP', characterId: PIP_CHARACTER_ID, text: 'And I can look high!', textSha256: 'd98d190e26df2a0a461fe859779ba3521f9d9fa2ba14a3e05c529b3928743d81', startFrame: 1045, endFrame: 1180 },
  { lineId: 'EP001_DL_06', shotId: 'EP001_SH08', speaker: 'PIP', characterId: PIP_CHARACTER_ID, text: 'Together, we found it!', textSha256: 'a6fc56558385250b0b179f9123ce592935267e89222281a3f87fc4770ae13516', startFrame: 1265, endFrame: 1390 },
  { lineId: 'EP001_DL_07', shotId: 'EP001_SH09', speaker: 'GOAT', characterId: GOAT_CHARACTER_ID, text: 'It drew a brand-new path!', textSha256: '666945474add51211d80c5f9611bd80cd005f6de44b0e854733f5da4b40b28e5', startFrame: 1465, endFrame: 1575 },
  { lineId: 'EP001_DL_08', shotId: 'EP001_SH10', speaker: 'PIP', characterId: PIP_CHARACTER_ID, text: 'Adventure first. Snack second?', textSha256: 'cc57e843f7d540ff96ab4b48cff0f976b661d3dea723a8abc69e3e14b9ab4502', startFrame: 1645, endFrame: 1760 },
] as const;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function canonicalTextSha(text: string): string {
  return sha256(JSON.stringify({ text }));
}
function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function readEnv(name: string): string { return String(process.env[name] ?? '').trim(); }
function storageConfig() {
  return {
    bucket: readEnv('TIVVLEJOY_EP012_AUDIO_BUCKET') || readEnv('R2_BUCKET'),
    endpoint: readEnv('TIVVLEJOY_EP012_AUDIO_ENDPOINT') || readEnv('R2_ENDPOINT'),
    accessKeyId: readEnv('TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID') || readEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: readEnv('TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY') || readEnv('R2_SECRET_ACCESS_KEY'),
    region: readEnv('TIVVLEJOY_EP012_AUDIO_REGION') || readEnv('R2_REGION') || 'auto',
  };
}
function makeStorage() {
  const c = storageConfig();
  if (!c.bucket || !c.endpoint || !c.accessKeyId || !c.secretAccessKey) return null;
  return { bucket: c.bucket, client: new S3Client({ region: c.region, endpoint: c.endpoint, forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } }) };
}
async function readObject(storage: NonNullable<ReturnType<typeof makeStorage>>, key: string): Promise<Uint8Array | null> {
  try {
    const result = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return bytes ? new Uint8Array(bytes) : null;
  } catch (error) {
    const status = Number((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ?? 0);
    const name = String((error as { name?: string })?.name ?? '');
    if (status === 404 || /NoSuchKey|NotFound/i.test(name)) return null;
    throw error;
  }
}
async function putVerified(storage: NonNullable<ReturnType<typeof makeStorage>>, key: string, bytes: Uint8Array, contentType: string, ifAbsent = false) {
  await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: Buffer.from(bytes), ContentType: contentType, ...(ifAbsent ? { IfNoneMatch: '*' } : {}) }));
  const back = await readObject(storage, key);
  if (!back || back.byteLength !== bytes.byteLength || sha256(back) !== sha256(bytes)) throw new Error('EP001_STORAGE_VERIFICATION_FAILED');
}
function result(status: string, extra: Record<string, unknown> = {}) {
  return { schemaVersion: SCHEMA, episodeId: 'EP001', status, providerContacted: false, providerRequestsMade: 0, humanApproved: false, productionEnabled: false, ...extra };
}
function likelyMp3(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

export async function runTemporaryEp001VoiceExecution(input: { lineId: string | null; authorizationSha256: string | null }) {
  if (process.env.VERCEL_ENV !== 'preview') return result('BLOCKED', { blocker: 'EP001_PREVIEW_REQUIRED' });
  if (!AUTHORIZATION_SHA256) return result('BLOCKED', { blocker: 'EP001_PAID_AUTHORIZATION_NOT_PINNED' });
  if (!input.authorizationSha256 || !safeEqual(input.authorizationSha256, AUTHORIZATION_SHA256)) return result('BLOCKED', { blocker: 'EP001_PAID_AUTHORIZATION_INVALID' });
  const line = LINES.find((candidate) => candidate.lineId === input.lineId);
  if (!line || !/^EP001_DL_0[1-8]$/.test(line.lineId)) return result('BLOCKED', { blocker: 'EP001_LINE_NOT_AUTHORIZED' });
  if (canonicalTextSha(line.text) !== line.textSha256) return result('BLOCKED', { blocker: 'EP001_DIALOGUE_IDENTITY_MISMATCH' });
  if (!readEnv('ELEVENLABS_API_KEY')) return result('BLOCKED', { blocker: 'EP001_API_KEY_NOT_CONFIGURED' });
  const storage = makeStorage();
  if (!storage) return result('BLOCKED', { blocker: 'EP001_STORAGE_NOT_CONFIGURED' });

  const audioKey = `${PREFIX}${line.lineId}.mp3`;
  const receiptKey = `${PREFIX}${line.lineId}.receipt.json`;
  const reservationKey = `${PREFIX}${line.lineId}.reservation.json`;
  const existingReceipt = await readObject(storage, receiptKey);
  if (existingReceipt) {
    const receipt = JSON.parse(Buffer.from(existingReceipt).toString('utf8')) as Record<string, unknown>;
    return result('ALREADY_SUCCEEDED', { lineId: line.lineId, audioSha256: receipt.audioSha256 ?? null, audioBytes: receipt.audioBytes ?? null, storageVerified: true });
  }
  if (await readObject(storage, reservationKey)) return result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PRIOR_RESERVATION_WITHOUT_FINAL_RECEIPT' });

  const reservation = new TextEncoder().encode(JSON.stringify({ schemaVersion: 'TIVVLEJOY_EP001_VOICE_RESERVATION_V1', episodeId: 'EP001', lineId: line.lineId, textSha256: line.textSha256, createdAt: new Date().toISOString(), productionEnabled: false }));
  try { await putVerified(storage, reservationKey, reservation, 'application/json', true); }
  catch { return result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_RESERVATION_UNCERTAIN' }); }

  const voiceId = lockedVoiceIdFor(line.characterId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${APPROVED_OUTPUT_FORMAT}`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'xi-api-key': readEnv('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text: line.text, model_id: APPROVED_ELEVENLABS_MODEL, voice_settings: elevenLabsVoiceSettingsBody() }),
    });
  } catch {
    return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PROVIDER_NETWORK_OR_TIMEOUT' }), providerContacted: true, providerRequestsMade: 1 };
  } finally { clearTimeout(timer); }
  if (!response.ok || response.status >= 300) return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PROVIDER_RESPONSE_NOT_OK' }), providerContacted: true, providerRequestsMade: 1 };
  const raw = new Uint8Array(await response.arrayBuffer());
  if (!raw.byteLength || raw.byteLength > MAX_RESPONSE_BYTES) return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PROVIDER_RESPONSE_INVALID' }), providerContacted: true, providerRequestsMade: 1 };
  let payload: { audio_base64?: string; alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } };
  try { payload = JSON.parse(Buffer.from(raw).toString('utf8')); } catch { return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PROVIDER_JSON_INVALID' }), providerContacted: true, providerRequestsMade: 1 }; }
  if (!payload.audio_base64 || !payload.alignment) return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_PROVIDER_PAYLOAD_INCOMPLETE' }), providerContacted: true, providerRequestsMade: 1 };
  const audio = new Uint8Array(Buffer.from(payload.audio_base64, 'base64'));
  const starts = payload.alignment.character_start_times_seconds;
  const ends = payload.alignment.character_end_times_seconds;
  const chars = payload.alignment.characters;
  if (!audio.byteLength || audio.byteLength > MAX_AUDIO_BYTES || !likelyMp3(audio) || !chars?.length || chars.length !== starts?.length || chars.length !== ends?.length) return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_AUDIO_OR_ALIGNMENT_INVALID' }), providerContacted: true, providerRequestsMade: 1 };
  const audioSha256 = sha256(audio);
  const timingSha256 = sha256(JSON.stringify({ characters: chars, starts, ends }));
  const receipt = {
    schemaVersion: 'TIVVLEJOY_EP001_REAL_VOICE_RECEIPT_V1', episodeId: 'EP001', lineId: line.lineId, shotId: line.shotId,
    speaker: line.speaker, characterId: line.characterId, textSha256: line.textSha256, voiceIdSha256: sha256(voiceId),
    modelId: APPROVED_ELEVENLABS_MODEL, outputFormat: APPROVED_OUTPUT_FORMAT, audioSha256, audioBytes: audio.byteLength,
    timingSha256, alignmentCharacterCount: chars.length, pictureWindow: { startFrame: line.startFrame, endFrame: line.endFrame },
    storageVerified: true, humanApproved: false, productionEnabled: false, createdAt: new Date().toISOString(),
  };
  const receiptBytes = new TextEncoder().encode(JSON.stringify(receipt));
  try {
    await putVerified(storage, audioKey, audio, 'audio/mpeg');
    await putVerified(storage, receiptKey, receiptBytes, 'application/json');
  } catch {
    return { ...result('RECOVERY_REQUIRED', { lineId: line.lineId, blocker: 'EP001_STORAGE_FINALIZATION_FAILED', audioSha256, audioBytes: audio.byteLength }), providerContacted: true, providerRequestsMade: 1 };
  }
  return { ...result('SUCCEEDED', { lineId: line.lineId, audioSha256, audioBytes: audio.byteLength, timingSha256, storageVerified: true }), providerContacted: true, providerRequestsMade: 1 };
}

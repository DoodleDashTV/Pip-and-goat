import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { planMultipartParts } from '@/lib/scenery/intake/keys';
import { sha256StoredObjectByRange } from '@/lib/tivvlejoy-ep001-rig-delivery-stream-hash';

export const EP001_RIG_DELIVERY_INTAKE_SCHEMA = 'TIVVLEJOY_EP001_RIG_DELIVERY_INTAKE_V1' as const;
export const EP001_RIG_INTAKE_TOKEN_HEADER = 'x-tivvlejoy-character-intake-token' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const VERSION_ID = /^[a-f0-9-]{36}$/;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const PART_BYTES = 16 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.blend', '.fbx', '.glb', '.zip'] as const;

type CharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
type IntakeAction = 'status' | 'create' | 'sign-part' | 'complete' | 'abort' | 'receipt';

type SessionRecord = {
  schemaVersion: typeof EP001_RIG_DELIVERY_INTAKE_SCHEMA;
  episodeId: 'EP001';
  versionId: string;
  characterId: CharacterId;
  originalFilename: string;
  normalizedFilename: string;
  byteSize: number;
  clientSha256: string | null;
  artistVersionNote: string;
  objectKey: string;
  uploadId: string;
  partCount: number;
  createdAt: string;
  state: 'UPLOADING' | 'COMPLETED' | 'ABORTED';
};

type CompletePart = { partNumber: number; etag: string };

function normalizeFilename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 180 || /[\\/\0]/.test(trimmed) || trimmed.includes('..')) {
    throw new Error('RIG_FILENAME_INVALID');
  }
  return trimmed.replace(/[^A-Za-z0-9._ -]/g, '_');
}

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? '';
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function configuredToken(env: Record<string, string | undefined>): string {
  return String(env.TIVVLEJOY_CHARACTER_INTAKE_TOKEN ?? '').trim();
}

export function characterIntakeAuthorized(input: { token: string; env?: Record<string, string | undefined> }): boolean {
  const expected = configuredToken(input.env ?? process.env);
  return Boolean(expected && input.token && safeEqual(expected, input.token));
}

function assertPreview(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV !== 'preview') throw new Error('RIG_INTAKE_PREVIEW_REQUIRED');
}

function assertCharacterId(value: unknown): CharacterId {
  if (value === 'CHAR_PIP_001' || value === 'CHAR_GOAT_001') return value;
  throw new Error('RIG_CHARACTER_ID_INVALID');
}

function characterSlug(characterId: CharacterId): string {
  return characterId === 'CHAR_PIP_001' ? 'pip' : 'goat';
}

function deliveryPrefix(characterId: CharacterId): string {
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries`;
}

function objectKeyFor(input: { characterId: CharacterId; versionId: string; filename: string }): string {
  return `${deliveryPrefix(input.characterId)}/${input.versionId}/source/${input.filename}`;
}

function sessionKey(characterId: CharacterId, versionId: string): string {
  return `${deliveryPrefix(characterId)}/${versionId}/intake-session.json`;
}

function receiptKey(characterId: CharacterId, versionId: string): string {
  return `${deliveryPrefix(characterId)}/${versionId}/receipt.json`;
}

async function readJson<T>(storage: MultipartStoragePort, key: string): Promise<T | null> {
  const bytes = await storage.getObject?.(key);
  if (!bytes) return null;
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as T; }
  catch { throw new Error('RIG_INTAKE_STATE_CORRUPT'); }
}

async function writeJson(storage: MultipartStoragePort, key: string, value: unknown) {
  if (!storage.putObject) throw new Error('RIG_INTAKE_STORAGE_WRITE_UNAVAILABLE');
  await storage.putObject(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
}

async function loadSession(storage: MultipartStoragePort, characterId: CharacterId, versionId: string) {
  if (!VERSION_ID.test(versionId)) throw new Error('RIG_VERSION_ID_INVALID');
  const session = await readJson<SessionRecord>(storage, sessionKey(characterId, versionId));
  if (!session || session.characterId !== characterId || session.versionId !== versionId) throw new Error('RIG_SESSION_NOT_FOUND');
  return session;
}

export function publicRigIntakeStatus(env: Record<string, string | undefined> = process.env) {
  return {
    schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA,
    episodeId: 'EP001' as const,
    previewRuntime: env.VERCEL_ENV === 'preview',
    tokenConfigured: Boolean(configuredToken(env)),
    acceptedCharacters: ['CHAR_PIP_001', 'CHAR_GOAT_001'] as const,
    allowedExtensions: ALLOWED_EXTENSIONS,
    maxBytes: MAX_BYTES,
    multipartPartBytes: PART_BYTES,
    uploaded: false as const,
    approved: false as const,
    productionEnabled: false as const,
  };
}

export async function handleEp001RigDeliveryIntake(input: {
  action: IntakeAction;
  body?: Record<string, unknown>;
  token?: string;
  env?: Record<string, string | undefined>;
  storage?: MultipartStoragePort;
}) {
  const env = input.env ?? process.env;
  if (input.action === 'status') return { status: 200, body: publicRigIntakeStatus(env) };
  assertPreview(env);
  if (!characterIntakeAuthorized({ token: input.token ?? '', env })) throw new Error('RIG_INTAKE_UNAUTHORIZED');
  const storage = input.storage ?? await createConfiguredMultipartStorage(env);
  const body = input.body ?? {};
  const characterId = assertCharacterId(body.characterId);

  if (input.action === 'create') {
    const originalFilename = String(body.originalFilename ?? '');
    const normalizedFilename = normalizeFilename(originalFilename);
    const extension = extensionOf(normalizedFilename);
    if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) throw new Error('RIG_EXTENSION_INVALID');
    const byteSize = Number(body.byteSize ?? 0);
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) throw new Error('RIG_BYTE_SIZE_INVALID');
    const clientSha256 = String(body.sha256 ?? '').trim().toLowerCase() || null;
    if (clientSha256 && !SHA256.test(clientSha256)) throw new Error('RIG_SHA256_INVALID');
    const artistVersionNote = String(body.artistVersionNote ?? '').trim();
    if (!artistVersionNote || artistVersionNote.length > 1000) throw new Error('RIG_ARTIST_VERSION_NOTE_REQUIRED');

    const versionId = randomUUID();
    const objectKey = objectKeyFor({ characterId, versionId, filename: normalizedFilename });
    const parts = planMultipartParts(byteSize, PART_BYTES);
    const created = await storage.createMultipartUpload({ key: objectKey, contentType: 'application/octet-stream' });
    const session: SessionRecord = {
      schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA,
      episodeId: 'EP001', versionId, characterId, originalFilename, normalizedFilename, byteSize,
      clientSha256, artistVersionNote, objectKey, uploadId: created.uploadId, partCount: parts.length,
      createdAt: new Date().toISOString(), state: 'UPLOADING',
    };
    await writeJson(storage, sessionKey(characterId, versionId), session);
    return { status: 200, body: { schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA, action: 'create', versionId, characterId, partCount: parts.length, parts, uploaded: false, approved: false } };
  }

  const versionId = String(body.versionId ?? '');
  const session = await loadSession(storage, characterId, versionId);
  if (session.state === 'ABORTED') throw new Error('RIG_SESSION_ABORTED');

  if (input.action === 'sign-part') {
    if (session.state !== 'UPLOADING') throw new Error('RIG_SESSION_NOT_UPLOADABLE');
    const partNumber = Number(body.partNumber ?? 0);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) throw new Error('RIG_PART_NUMBER_INVALID');
    const signed = await storage.signPart({ key: session.objectKey, uploadId: session.uploadId, partNumber, ttlSeconds: 900 });
    return { status: 200, body: { schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA, action: 'sign-part', versionId, partNumber, ...signed, uploaded: false, approved: false } };
  }

  if (input.action === 'abort') {
    if (session.state === 'COMPLETED') throw new Error('RIG_COMPLETED_SESSION_IMMUTABLE');
    await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    const aborted: SessionRecord = { ...session, state: 'ABORTED' };
    await writeJson(storage, sessionKey(characterId, versionId), aborted);
    return { status: 200, body: { schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA, action: 'abort', versionId, aborted: true, approved: false } };
  }

  if (input.action === 'complete') {
    if (session.state !== 'UPLOADING') {
      const existing = await readJson<Record<string, unknown>>(storage, receiptKey(characterId, versionId));
      if (session.state === 'COMPLETED' && existing) return { status: 200, body: { ...existing, idempotent: true } };
      throw new Error('RIG_SESSION_NOT_COMPLETABLE');
    }
    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    const parts: CompletePart[] = rawParts.map((value) => {
      const item = value as Record<string, unknown>;
      return { partNumber: Number(item.partNumber ?? 0), etag: String(item.etag ?? '').trim() };
    });
    if (parts.length !== session.partCount || parts.some((part) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > session.partCount || !part.etag)) throw new Error('RIG_MULTIPART_COMPLETION_INVALID');
    if (new Set(parts.map((part) => part.partNumber)).size !== session.partCount) throw new Error('RIG_MULTIPART_COMPLETION_DUPLICATE_PART');
    const completed = await storage.completeMultipartUpload({ key: session.objectKey, uploadId: session.uploadId, parts });
    if (completed.size !== session.byteSize) throw new Error('RIG_STORED_SIZE_MISMATCH');
    const verifiedHash = await sha256StoredObjectByRange({ storage, key: session.objectKey, byteSize: session.byteSize });
    if (verifiedHash.bytesRead !== session.byteSize) throw new Error('RIG_STORED_BYTES_UNREADABLE');
    const storedSha256 = verifiedHash.sha256;
    if (session.clientSha256 && storedSha256 !== session.clientSha256) throw new Error('RIG_STORED_SHA256_MISMATCH');
    const receiptBody = {
      schemaVersion: 'TIVVLEJOY_EP001_RIG_DELIVERY_RECEIPT_V1', episodeId: 'EP001', versionId,
      characterId, characterSlug: characterSlug(characterId), originalFilename: session.originalFilename,
      normalizedFilename: session.normalizedFilename, byteSize: session.byteSize, sourceSha256: storedSha256,
      hashVerification: { method: 'BOUNDED_RANGE_SHA256', chunksRead: verifiedHash.chunksRead, chunkBytes: verifiedHash.chunkBytes },
      artistVersionNote: session.artistVersionNote, objectKey: session.objectKey, receivedAt: new Date().toISOString(),
      immutableOriginal: true, uploadVerified: true, technicalInspectionPassed: false,
      humanApproved: false, episodeAdmitted: false, productionEnabled: false,
    };
    const receiptSha256 = createHash('sha256').update(JSON.stringify(receiptBody)).digest('hex');
    const receipt = { ...receiptBody, receiptSha256 };
    await writeJson(storage, receiptKey(characterId, versionId), receipt);
    await writeJson(storage, sessionKey(characterId, versionId), { ...session, state: 'COMPLETED' });
    return { status: 200, body: { ...receipt, idempotent: false } };
  }

  if (input.action === 'receipt') {
    const receipt = await readJson<Record<string, unknown>>(storage, receiptKey(characterId, versionId));
    if (!receipt) return { status: 404, body: { schemaVersion: EP001_RIG_DELIVERY_INTAKE_SCHEMA, versionId, receiptFound: false, approved: false } };
    return { status: 200, body: receipt };
  }

  throw new Error('RIG_INTAKE_ACTION_INVALID');
}

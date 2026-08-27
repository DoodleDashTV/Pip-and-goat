import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { planMultipartParts } from '@/lib/scenery/intake/keys';
import { compileEp001RigInspectionEvidenceSlots, validateRigEvidenceFilename, type RigCharacterId } from './tivvlejoy-ep001-rig-inspection-evidence';

export const EP001_RIG_EVIDENCE_INTAKE_SCHEMA = 'TIVVLEJOY_EP001_RIG_EVIDENCE_INTAKE_V1' as const;
export const EP001_RIG_EVIDENCE_TOKEN_HEADER = 'x-tivvlejoy-character-intake-token' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/;
const MAX_BYTES = 1024 * 1024 * 1024;
const PART_BYTES = 16 * 1024 * 1024;

type Action = 'status' | 'create' | 'sign-part' | 'complete' | 'abort' | 'receipt';
type Session = {
  schemaVersion: typeof EP001_RIG_EVIDENCE_INTAKE_SCHEMA;
  evidenceId: string;
  rigVersionId: string;
  rigSourceSha256: string;
  characterId: RigCharacterId;
  slotId: string;
  originalFilename: string;
  objectKey: string;
  uploadId: string;
  byteSize: number;
  partCount: number;
  createdAt: string;
  state: 'UPLOADING' | 'COMPLETED' | 'ABORTED';
};

type CompletePart = { partNumber: number; etag: string };

function token(env: Record<string, string | undefined>) {
  return String(env.TIVVLEJOY_CHARACTER_INTAKE_TOKEN ?? '').trim();
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function authorized(value: string, env: Record<string, string | undefined>) {
  const expected = token(env);
  return Boolean(expected && value && safeEqual(expected, value));
}

function assertPreview(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV !== 'preview') throw new Error('RIG_EVIDENCE_PREVIEW_REQUIRED');
}

function assertCharacter(value: unknown): RigCharacterId {
  if (value === 'CHAR_PIP_001' || value === 'CHAR_GOAT_001') return value;
  throw new Error('RIG_EVIDENCE_CHARACTER_INVALID');
}

function sessionKey(characterId: RigCharacterId, rigVersionId: string, evidenceId: string) {
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries/${rigVersionId}/evidence/${evidenceId}/session.json`;
}

function receiptKey(characterId: RigCharacterId, rigVersionId: string, evidenceId: string) {
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries/${rigVersionId}/evidence/${evidenceId}/receipt.json`;
}

function objectKey(characterId: RigCharacterId, rigVersionId: string, slotId: string, evidenceId: string, filename: string) {
  const safe = filename.replace(/[^A-Za-z0-9._ -]/g, '_');
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries/${rigVersionId}/evidence/${slotId}/${evidenceId}/${safe}`;
}

async function readJson<T>(storage: MultipartStoragePort, key: string): Promise<T | null> {
  const bytes = await storage.getObject?.(key);
  if (!bytes) return null;
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as T; }
  catch { throw new Error('RIG_EVIDENCE_STATE_CORRUPT'); }
}

async function writeJson(storage: MultipartStoragePort, key: string, value: unknown) {
  if (!storage.putObject) throw new Error('RIG_EVIDENCE_STORAGE_WRITE_UNAVAILABLE');
  await storage.putObject(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
}

async function hashStored(storage: MultipartStoragePort, key: string, byteSize: number) {
  if (!storage.getObjectRange) throw new Error('RIG_EVIDENCE_RANGE_READ_UNAVAILABLE');
  const hash = createHash('sha256');
  for (let offset = 0; offset < byteSize; offset += PART_BYTES) {
    const length = Math.min(PART_BYTES, byteSize - offset);
    const chunk = await storage.getObjectRange(key, offset, length);
    if (!chunk || chunk.byteLength !== length) throw new Error('RIG_EVIDENCE_STORED_BYTES_UNREADABLE');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function loadSession(storage: MultipartStoragePort, characterId: RigCharacterId, rigVersionId: string, evidenceId: string) {
  if (!UUID.test(rigVersionId) || !UUID.test(evidenceId)) throw new Error('RIG_EVIDENCE_ID_INVALID');
  const session = await readJson<Session>(storage, sessionKey(characterId, rigVersionId, evidenceId));
  if (!session) throw new Error('RIG_EVIDENCE_SESSION_NOT_FOUND');
  return session;
}

export function publicRigEvidenceIntakeStatus(env: Record<string, string | undefined> = process.env) {
  const contract = compileEp001RigInspectionEvidenceSlots();
  return {
    schemaVersion: EP001_RIG_EVIDENCE_INTAKE_SCHEMA,
    episodeId: 'EP001' as const,
    previewRuntime: env.VERCEL_ENV === 'preview',
    tokenConfigured: Boolean(token(env)),
    requiredSlots: contract.requiredCount,
    contractSha256: contract.contractSha256,
    maxBytes: MAX_BYTES,
    multipartPartBytes: PART_BYTES,
    uploadedEvidence: 0,
    approved: false as const,
    productionEnabled: false as const,
  };
}

export async function handleEp001RigEvidenceIntake(input: {
  action: Action;
  body?: Record<string, unknown>;
  token?: string;
  env?: Record<string, string | undefined>;
  storage?: MultipartStoragePort;
}) {
  const env = input.env ?? process.env;
  if (input.action === 'status') return { status: 200, body: publicRigEvidenceIntakeStatus(env) };
  assertPreview(env);
  if (!authorized(input.token ?? '', env)) throw new Error('RIG_EVIDENCE_UNAUTHORIZED');
  const storage = input.storage ?? await createConfiguredMultipartStorage(env);
  const body = input.body ?? {};
  const characterId = assertCharacter(body.characterId);
  const rigVersionId = String(body.rigVersionId ?? '').trim();
  if (!UUID.test(rigVersionId)) throw new Error('RIG_EVIDENCE_RIG_VERSION_INVALID');
  const rigSourceSha256 = String(body.rigSourceSha256 ?? '').trim().toLowerCase();
  if (!SHA256.test(rigSourceSha256)) throw new Error('RIG_EVIDENCE_RIG_SHA256_INVALID');

  if (input.action === 'create') {
    const slotId = String(body.slotId ?? '').trim();
    const originalFilename = String(body.originalFilename ?? '').trim();
    const validated = validateRigEvidenceFilename({ slotId, filename: originalFilename });
    if (!validated.valid || !validated.slot) throw new Error(validated.errors[0] ?? 'RIG_EVIDENCE_FILE_INVALID');
    if (validated.slot.characterId !== characterId) throw new Error('RIG_EVIDENCE_SLOT_CHARACTER_MISMATCH');
    const byteSize = Number(body.byteSize ?? 0);
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) throw new Error('RIG_EVIDENCE_BYTE_SIZE_INVALID');
    const evidenceId = randomUUID();
    const key = objectKey(characterId, rigVersionId, slotId, evidenceId, originalFilename);
    const parts = planMultipartParts(byteSize, PART_BYTES);
    const created = await storage.createMultipartUpload({ key, contentType: 'application/octet-stream' });
    const session: Session = {
      schemaVersion: EP001_RIG_EVIDENCE_INTAKE_SCHEMA, evidenceId, rigVersionId, rigSourceSha256,
      characterId, slotId, originalFilename, objectKey: key, uploadId: created.uploadId,
      byteSize, partCount: parts.length, createdAt: new Date().toISOString(), state: 'UPLOADING',
    };
    await writeJson(storage, sessionKey(characterId, rigVersionId, evidenceId), session);
    return { status: 200, body: { action: 'create', evidenceId, rigVersionId, characterId, slotId, parts, partCount: parts.length, uploaded: false, approved: false } };
  }

  const evidenceId = String(body.evidenceId ?? '').trim();
  const session = await loadSession(storage, characterId, rigVersionId, evidenceId);
  if (session.rigSourceSha256 !== rigSourceSha256) throw new Error('RIG_EVIDENCE_RIG_BINDING_MISMATCH');
  if (session.state === 'ABORTED') throw new Error('RIG_EVIDENCE_SESSION_ABORTED');

  if (input.action === 'sign-part') {
    if (session.state !== 'UPLOADING') throw new Error('RIG_EVIDENCE_SESSION_NOT_UPLOADABLE');
    const partNumber = Number(body.partNumber ?? 0);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) throw new Error('RIG_EVIDENCE_PART_INVALID');
    const signed = await storage.signPart({ key: session.objectKey, uploadId: session.uploadId, partNumber, ttlSeconds: 900 });
    return { status: 200, body: { action: 'sign-part', evidenceId, partNumber, ...signed, approved: false } };
  }

  if (input.action === 'abort') {
    if (session.state === 'COMPLETED') throw new Error('RIG_EVIDENCE_COMPLETED_IMMUTABLE');
    await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    await writeJson(storage, sessionKey(characterId, rigVersionId, evidenceId), { ...session, state: 'ABORTED' });
    return { status: 200, body: { evidenceId, aborted: true, approved: false } };
  }

  if (input.action === 'complete') {
    if (session.state === 'COMPLETED') {
      const existing = await readJson<Record<string, unknown>>(storage, receiptKey(characterId, rigVersionId, evidenceId));
      if (existing) return { status: 200, body: { ...existing, idempotent: true } };
      throw new Error('RIG_EVIDENCE_RECEIPT_MISSING');
    }
    const rawParts = Array.isArray(body.parts) ? body.parts : [];
    const parts: CompletePart[] = rawParts.map((value) => {
      const item = value as Record<string, unknown>;
      return { partNumber: Number(item.partNumber ?? 0), etag: String(item.etag ?? '').trim() };
    });
    if (parts.length !== session.partCount || new Set(parts.map((p) => p.partNumber)).size !== session.partCount || parts.some((p) => !p.etag || p.partNumber < 1 || p.partNumber > session.partCount)) throw new Error('RIG_EVIDENCE_COMPLETION_INVALID');
    const completed = await storage.completeMultipartUpload({ key: session.objectKey, uploadId: session.uploadId, parts });
    if (completed.size !== session.byteSize) throw new Error('RIG_EVIDENCE_STORED_SIZE_MISMATCH');
    const evidenceSha256 = await hashStored(storage, session.objectKey, session.byteSize);
    const receiptBody = {
      schemaVersion: 'TIVVLEJOY_EP001_RIG_EVIDENCE_RECEIPT_V1', episodeId: 'EP001', evidenceId,
      rigVersionId, rigSourceSha256, characterId, slotId: session.slotId, originalFilename: session.originalFilename,
      byteSize: session.byteSize, evidenceSha256, objectKey: session.objectKey, receivedAt: new Date().toISOString(),
      immutableOriginal: true, uploadVerified: true, evidenceBoundToRigVersion: true,
      technicalInspectionPassed: false, humanApproved: false, episodeAdmitted: false, productionEnabled: false,
    };
    const receiptSha256 = createHash('sha256').update(JSON.stringify(receiptBody)).digest('hex');
    const receipt = { ...receiptBody, receiptSha256 };
    await writeJson(storage, receiptKey(characterId, rigVersionId, evidenceId), receipt);
    await writeJson(storage, sessionKey(characterId, rigVersionId, evidenceId), { ...session, state: 'COMPLETED' });
    return { status: 200, body: { ...receipt, idempotent: false } };
  }

  if (input.action === 'receipt') {
    const receipt = await readJson<Record<string, unknown>>(storage, receiptKey(characterId, rigVersionId, evidenceId));
    return receipt ? { status: 200, body: receipt } : { status: 404, body: { evidenceId, receiptFound: false, approved: false } };
  }

  throw new Error('RIG_EVIDENCE_ACTION_INVALID');
}

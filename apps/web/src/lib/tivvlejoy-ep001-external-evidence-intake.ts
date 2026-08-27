import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { planMultipartParts } from '@/lib/scenery/intake/keys';
import { sha256StoredObjectByRange } from '@/lib/tivvlejoy-ep001-rig-delivery-stream-hash';

export const EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA = 'TIVVLEJOY_EP001_EXTERNAL_EVIDENCE_INTAKE_V1' as const;
export const EP001_EVIDENCE_INTAKE_TOKEN_HEADER = 'x-tivvlejoy-evidence-intake-token' as const;

const VERSION_ID = /^[a-f0-9-]{36}$/;
const SOURCE_ID = /^[A-Z0-9_:-]{3,120}$/;
const MAX_BYTES = 100 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.json'] as const;
const EVIDENCE_KINDS = ['PURCHASE_RECEIPT', 'LICENSE_TEXT', 'SELLER_GRANT'] as const;
type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
type Action = 'status' | 'create' | 'sign-part' | 'complete' | 'abort' | 'receipt';

type Session = {
  schemaVersion: typeof EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA;
  episodeId: 'EP001';
  evidenceId: string;
  sourceId: string;
  evidenceKind: EvidenceKind;
  productIdentity: string;
  originalFilename: string;
  normalizedFilename: string;
  byteSize: number;
  note: string;
  objectKey: string;
  uploadId: string;
  partCount: number;
  createdAt: string;
  state: 'UPLOADING' | 'COMPLETED' | 'ABORTED';
};

type CompletePart = { partNumber: number; etag: string };

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function configuredToken(env: Record<string, string | undefined>) { return String(env.TIVVLEJOY_EVIDENCE_INTAKE_TOKEN ?? '').trim(); }
export function evidenceIntakeAuthorized(input: { token: string; env?: Record<string, string | undefined> }) {
  const expected = configuredToken(input.env ?? process.env);
  return Boolean(expected && input.token && safeEqual(expected, input.token));
}
function normalizeFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 180 || /[\\/\0]/.test(trimmed) || trimmed.includes('..')) throw new Error('EVIDENCE_FILENAME_INVALID');
  return trimmed.replace(/[^A-Za-z0-9._ -]/g, '_');
}
function extensionOf(filename: string) { return filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''; }
function evidencePrefix(sourceId: string, evidenceId?: string) {
  return `tivvlejoy-assets/evidence/EP001/scenery-license/${sourceId}${evidenceId ? `/${evidenceId}` : ''}`;
}
function sessionKey(sourceId: string, evidenceId: string) { return `${evidencePrefix(sourceId, evidenceId)}/intake-session.json`; }
function receiptKey(sourceId: string, evidenceId: string) { return `${evidencePrefix(sourceId, evidenceId)}/receipt.json`; }
async function readJson<T>(storage: MultipartStoragePort, key: string): Promise<T | null> {
  const bytes = await storage.getObject?.(key); if (!bytes) return null;
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as T; } catch { throw new Error('EVIDENCE_STATE_CORRUPT'); }
}
async function writeJson(storage: MultipartStoragePort, key: string, value: unknown) {
  if (!storage.putObject) throw new Error('EVIDENCE_STORAGE_WRITE_UNAVAILABLE');
  await storage.putObject(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
}
async function loadSession(storage: MultipartStoragePort, sourceId: string, evidenceId: string) {
  if (!SOURCE_ID.test(sourceId)) throw new Error('EVIDENCE_SOURCE_ID_INVALID');
  if (!VERSION_ID.test(evidenceId)) throw new Error('EVIDENCE_ID_INVALID');
  const session = await readJson<Session>(storage, sessionKey(sourceId, evidenceId));
  if (!session || session.sourceId !== sourceId || session.evidenceId !== evidenceId) throw new Error('EVIDENCE_SESSION_NOT_FOUND');
  return session;
}

export function publicExternalEvidenceIntakeStatus(env: Record<string, string | undefined> = process.env) {
  return {
    schemaVersion: EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA, episodeId: 'EP001' as const,
    previewRuntime: env.VERCEL_ENV === 'preview', tokenConfigured: Boolean(configuredToken(env)),
    evidenceTypes: ['SCENERY_LICENSE_DOCUMENT'] as const, evidenceKinds: EVIDENCE_KINDS,
    allowedExtensions: ALLOWED_EXTENSIONS, maxBytes: MAX_BYTES, multipartPartBytes: PART_BYTES,
    evidenceReceived: false as const, commercialUseVerified: false as const, humanReviewed: false as const,
    admissionGranted: false as const, productionEnabled: false as const,
  };
}

export async function handleEp001ExternalEvidenceIntake(input: {
  action: Action; body?: Record<string, unknown>; token?: string; env?: Record<string, string | undefined>; storage?: MultipartStoragePort;
}) {
  const env = input.env ?? process.env;
  if (input.action === 'status') return { status: 200, body: publicExternalEvidenceIntakeStatus(env) };
  if (env.VERCEL_ENV !== 'preview') throw new Error('EVIDENCE_INTAKE_PREVIEW_REQUIRED');
  if (!evidenceIntakeAuthorized({ token: input.token ?? '', env })) throw new Error('EVIDENCE_INTAKE_UNAUTHORIZED');
  const storage = input.storage ?? await createConfiguredMultipartStorage(env);
  const body = input.body ?? {};
  const sourceId = String(body.sourceId ?? '').trim();
  if (!SOURCE_ID.test(sourceId)) throw new Error('EVIDENCE_SOURCE_ID_INVALID');

  if (input.action === 'create') {
    const evidenceKind = String(body.evidenceKind ?? '') as EvidenceKind;
    if (!EVIDENCE_KINDS.includes(evidenceKind)) throw new Error('EVIDENCE_KIND_INVALID');
    const productIdentity = String(body.productIdentity ?? '').trim();
    if (!productIdentity || productIdentity.length > 500) throw new Error('EVIDENCE_PRODUCT_IDENTITY_REQUIRED');
    const originalFilename = String(body.originalFilename ?? '');
    const normalizedFilename = normalizeFilename(originalFilename);
    const extension = extensionOf(normalizedFilename);
    if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) throw new Error('EVIDENCE_EXTENSION_INVALID');
    const byteSize = Number(body.byteSize ?? 0);
    if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) throw new Error('EVIDENCE_BYTE_SIZE_INVALID');
    const note = String(body.note ?? '').trim();
    if (note.length > 1000) throw new Error('EVIDENCE_NOTE_TOO_LONG');
    const evidenceId = randomUUID();
    const objectKey = `${evidencePrefix(sourceId, evidenceId)}/source/${normalizedFilename}`;
    const parts = planMultipartParts(byteSize, PART_BYTES);
    const created = await storage.createMultipartUpload({ key: objectKey, contentType: 'application/octet-stream' });
    const session: Session = {
      schemaVersion: EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA, episodeId: 'EP001', evidenceId, sourceId,
      evidenceKind, productIdentity, originalFilename, normalizedFilename, byteSize, note, objectKey,
      uploadId: created.uploadId, partCount: parts.length, createdAt: new Date().toISOString(), state: 'UPLOADING',
    };
    await writeJson(storage, sessionKey(sourceId, evidenceId), session);
    return { status: 200, body: { schemaVersion: EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA, action: 'create', evidenceId, sourceId, partCount: parts.length, parts, evidenceReceived: false, admitted: false } };
  }

  const evidenceId = String(body.evidenceId ?? '');
  const session = await loadSession(storage, sourceId, evidenceId);
  if (session.state === 'ABORTED') throw new Error('EVIDENCE_SESSION_ABORTED');

  if (input.action === 'sign-part') {
    if (session.state !== 'UPLOADING') throw new Error('EVIDENCE_SESSION_NOT_UPLOADABLE');
    const partNumber = Number(body.partNumber ?? 0);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) throw new Error('EVIDENCE_PART_NUMBER_INVALID');
    const signed = await storage.signPart({ key: session.objectKey, uploadId: session.uploadId, partNumber, ttlSeconds: 900 });
    return { status: 200, body: { schemaVersion: EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA, action: 'sign-part', evidenceId, partNumber, ...signed, admitted: false } };
  }

  if (input.action === 'abort') {
    if (session.state === 'COMPLETED') throw new Error('EVIDENCE_COMPLETED_IMMUTABLE');
    await storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
    await writeJson(storage, sessionKey(sourceId, evidenceId), { ...session, state: 'ABORTED' });
    return { status: 200, body: { schemaVersion: EP001_EXTERNAL_EVIDENCE_INTAKE_SCHEMA, evidenceId, aborted: true, admitted: false } };
  }

  if (input.action === 'complete') {
    if (session.state !== 'UPLOADING') {
      const existing = await readJson<Record<string, unknown>>(storage, receiptKey(sourceId, evidenceId));
      if (session.state === 'COMPLETED' && existing) return { status: 200, body: { ...existing, idempotent: true } };
      throw new Error('EVIDENCE_SESSION_NOT_COMPLETABLE');
    }
    const parts: CompletePart[] = (Array.isArray(body.parts) ? body.parts : []).map((raw) => {
      const value = raw as Record<string, unknown>;
      return { partNumber: Number(value.partNumber ?? 0), etag: String(value.etag ?? '').trim() };
    });
    if (parts.length !== session.partCount || new Set(parts.map((item) => item.partNumber)).size !== session.partCount || parts.some((item) => !item.etag || item.partNumber < 1 || item.partNumber > session.partCount)) throw new Error('EVIDENCE_MULTIPART_COMPLETION_INVALID');
    const completed = await storage.completeMultipartUpload({ key: session.objectKey, uploadId: session.uploadId, parts });
    if (completed.size !== session.byteSize) throw new Error('EVIDENCE_STORED_SIZE_MISMATCH');
    const hash = await sha256StoredObjectByRange({ storage, key: session.objectKey, byteSize: session.byteSize, chunkBytes: PART_BYTES });
    const receiptBody = {
      schemaVersion: 'TIVVLEJOY_EP001_SCENERY_LICENSE_EVIDENCE_RECEIPT_V1', episodeId: 'EP001', evidenceId,
      sourceId, evidenceKind: session.evidenceKind, productIdentity: session.productIdentity,
      originalFilename: session.originalFilename, byteSize: session.byteSize, evidenceSha256: hash.sha256,
      objectKey: session.objectKey, note: session.note, receivedAt: new Date().toISOString(), immutableOriginal: true,
      evidenceReceived: true, commercialUseVerified: false, humanReviewed: false, admittedForEp001: false,
      productionEnabled: false,
    };
    const receiptSha256 = createHash('sha256').update(JSON.stringify(receiptBody)).digest('hex');
    const receipt = { ...receiptBody, receiptSha256 };
    await writeJson(storage, receiptKey(sourceId, evidenceId), receipt);
    await writeJson(storage, sessionKey(sourceId, evidenceId), { ...session, state: 'COMPLETED' });
    return { status: 200, body: { ...receipt, idempotent: false } };
  }

  if (input.action === 'receipt') {
    const receipt = await readJson<Record<string, unknown>>(storage, receiptKey(sourceId, evidenceId));
    return receipt ? { status: 200, body: receipt } : { status: 404, body: { evidenceId, receiptFound: false, admitted: false } };
  }
  throw new Error('EVIDENCE_INTAKE_ACTION_INVALID');
}

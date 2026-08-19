import { randomUUID } from 'node:crypto';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { sanitizeFilename } from '@/lib/scenery/intake/keys';
import { resolveSceneryAssetPrefix } from '@/lib/scenery/intake/config';
import {
  getPurchasedToolPackage,
  validatePurchasedToolSelection,
  type PurchasedToolPackage,
} from './catalog';

const PART_BYTES = 32 * 1024 * 1024;
const SESSION_TTL_MS = 72 * 60 * 60 * 1000;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export type PurchasedToolPart = {
  partNumber: number;
  start: number;
  end: number;
  etag: string | null;
};

export type PurchasedToolUploadSession = {
  version: 'TIVVLEJOY_PURCHASED_TOOL_UPLOAD_SESSION_V1';
  sessionId: string;
  uploadId: string;
  sourceId: string;
  filename: string;
  byteSize: number;
  mimeType: string;
  lastModified: string | null;
  objectKey: string;
  state: 'created' | 'uploading' | 'paused' | 'completed' | 'aborted';
  parts: PurchasedToolPart[];
  clientSha256: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

function utf8(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decode(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Unsafe session/source id.');
  return value;
}

function prefix(env: Record<string, string | undefined>): string {
  return resolveSceneryAssetPrefix(env).replace(/^\/+|\/+$/g, '');
}

function sessionKey(env: Record<string, string | undefined>, sessionId: string): string {
  return `${prefix(env)}/catalogs/purchased-tool-upload-sessions/${safeId(sessionId)}.json`;
}

function receiptKey(env: Record<string, string | undefined>, sourceId: string): string {
  return `${prefix(env)}/catalogs/purchased-tool-receipts/${safeId(sourceId)}.json`;
}

function sourceObjectKey(
  env: Record<string, string | undefined>,
  pkg: PurchasedToolPackage,
  filename: string,
): string {
  const clean = sanitizeFilename(filename);
  return `${prefix(env)}/source/purchased-blender-tools/${safeId(pkg.sourceId)}/${clean}`;
}

export function planPurchasedToolParts(byteSize: number): PurchasedToolPart[] {
  if (!Number.isFinite(byteSize) || byteSize <= 0) throw new Error('Invalid upload size.');
  const parts: PurchasedToolPart[] = [];
  let start = 0;
  let partNumber = 1;
  while (start < byteSize) {
    const end = Math.min(byteSize, start + PART_BYTES);
    parts.push({ partNumber, start, end, etag: null });
    start = end;
    partNumber += 1;
  }
  if (parts.length > 1000) throw new Error('Upload would require too many parts.');
  return parts;
}

async function persistSession(
  storage: MultipartStoragePort,
  env: Record<string, string | undefined>,
  session: PurchasedToolUploadSession,
): Promise<void> {
  if (!storage.putObject) throw new Error('Private storage cannot persist upload sessions.');
  await storage.putObject(sessionKey(env, session.sessionId), utf8(session), 'application/json');
}

export async function loadPurchasedToolSession(
  storage: MultipartStoragePort,
  env: Record<string, string | undefined>,
  sessionId: string,
): Promise<PurchasedToolUploadSession> {
  if (!storage.getObject) throw new Error('Private storage cannot restore upload sessions.');
  const bytes = await storage.getObject(sessionKey(env, sessionId));
  if (!bytes) throw new Error('Upload session was not found.');
  const session = decode(bytes) as PurchasedToolUploadSession;
  if (session.sessionId !== sessionId || session.version !== 'TIVVLEJOY_PURCHASED_TOOL_UPLOAD_SESSION_V1') {
    throw new Error('Upload session is invalid.');
  }
  if (Date.parse(session.expiresAt) < Date.now() && session.state !== 'completed') {
    throw new Error('Upload session expired. Start a new session; the old multipart upload may be aborted later.');
  }
  return session;
}

export async function createPurchasedToolSession(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sourceId?: string;
  filename: string;
  byteSize: number;
  mimeType?: string;
  lastModified?: string | null;
}): Promise<{ session: PurchasedToolUploadSession; alreadyStored: boolean }> {
  const validated = validatePurchasedToolSelection({
    sourceId: input.sourceId,
    filename: input.filename,
    byteSize: input.byteSize,
  });
  if (!validated.ok) throw new Error(validated.reason);
  const pkg = validated.package;
  const key = sourceObjectKey(input.env, pkg, input.filename);
  const head = await input.storage.headObject(key);
  if (head.exists) {
    if (head.size !== input.byteSize) throw new Error('A different immutable object already uses this purchased source key.');
    const now = new Date().toISOString();
    const session: PurchasedToolUploadSession = {
      version: 'TIVVLEJOY_PURCHASED_TOOL_UPLOAD_SESSION_V1',
      sessionId: randomUUID(),
      uploadId: '[already-stored]',
      sourceId: pkg.sourceId,
      filename: input.filename,
      byteSize: input.byteSize,
      mimeType: input.mimeType || 'application/octet-stream',
      lastModified: input.lastModified ?? null,
      objectKey: key,
      state: 'completed',
      parts: [],
      clientSha256: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    await persistSession(input.storage, input.env, session);
    return { session, alreadyStored: true };
  }
  const created = await input.storage.createMultipartUpload({
    key,
    contentType: input.mimeType || 'application/octet-stream',
  });
  const now = new Date().toISOString();
  const session: PurchasedToolUploadSession = {
    version: 'TIVVLEJOY_PURCHASED_TOOL_UPLOAD_SESSION_V1',
    sessionId: randomUUID(),
    uploadId: created.uploadId,
    sourceId: pkg.sourceId,
    filename: input.filename,
    byteSize: input.byteSize,
    mimeType: input.mimeType || 'application/octet-stream',
    lastModified: input.lastModified ?? null,
    objectKey: key,
    state: 'created',
    parts: planPurchasedToolParts(input.byteSize),
    clientSha256: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  await persistSession(input.storage, input.env, session);
  return { session, alreadyStored: false };
}

export function publicPurchasedToolSession(session: PurchasedToolUploadSession) {
  return {
    sessionId: session.sessionId,
    sourceId: session.sourceId,
    filename: session.filename,
    byteSize: session.byteSize,
    state: session.state,
    clientSha256Recorded: Boolean(session.clientSha256),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    partCount: session.parts.length,
    parts: session.parts.map((part) => ({
      partNumber: part.partNumber,
      start: part.start,
      end: part.end,
      completed: Boolean(part.etag),
    })),
  };
}

export async function signPurchasedToolPart(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sessionId: string;
  partNumber: number;
}) {
  const session = await loadPurchasedToolSession(input.storage, input.env, input.sessionId);
  if (session.state === 'completed' || session.state === 'aborted') throw new Error('Upload session is not writable.');
  const part = session.parts.find((item) => item.partNumber === input.partNumber);
  if (!part) throw new Error('Unknown multipart part.');
  if (part.etag) return { alreadyCompleted: true, signedUrl: null, expiresAt: null };
  const signed = await input.storage.signPart({
    key: session.objectKey,
    uploadId: session.uploadId,
    partNumber: part.partNumber,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
  });
  return { alreadyCompleted: false, signedUrl: signed.url, expiresAt: signed.expiresAt };
}

export async function recordPurchasedToolPart(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sessionId: string;
  partNumber: number;
  etag: string;
}) {
  const session = await loadPurchasedToolSession(input.storage, input.env, input.sessionId);
  const part = session.parts.find((item) => item.partNumber === input.partNumber);
  if (!part) throw new Error('Unknown multipart part.');
  const etag = String(input.etag ?? '').trim();
  if (!etag || etag.length > 256 || /[\r\n]/.test(etag)) throw new Error('Invalid multipart ETag.');
  part.etag = etag;
  session.state = 'uploading';
  session.updatedAt = new Date().toISOString();
  await persistSession(input.storage, input.env, session);
  return session;
}

async function persistReceipt(
  storage: MultipartStoragePort,
  env: Record<string, string | undefined>,
  session: PurchasedToolUploadSession,
): Promise<void> {
  if (!storage.putObject) throw new Error('Private storage cannot persist receipts.');
  const pkg = getPurchasedToolPackage(session.sourceId);
  const receipt = {
    receiptVersion: 'TIVVLEJOY_PURCHASED_TOOL_SOURCE_RECEIPT_V1',
    sourceId: session.sourceId,
    displayName: pkg.displayName,
    version: pkg.version,
    role: pkg.role,
    activation: pkg.activation,
    originalFilename: session.filename,
    byteSize: session.byteSize,
    objectKey: session.objectKey,
    stored: session.state === 'completed',
    clientSha256: session.clientSha256,
    hashVerification: session.clientSha256 ? 'CLIENT_SHA256_RECORDED' : 'CHECKSUM_PENDING',
    rawRedistributionAllowed: false,
    sourceImmutable: true,
    uploadedAt: session.updatedAt,
  };
  await storage.putObject(receiptKey(env, session.sourceId), utf8(receipt), 'application/json');
}

export async function completePurchasedToolSession(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sessionId: string;
}) {
  const session = await loadPurchasedToolSession(input.storage, input.env, input.sessionId);
  if (session.state === 'completed') {
    const head = await input.storage.headObject(session.objectKey);
    return { session, storedSize: head.size, alreadyCompleted: true };
  }
  const missing = session.parts.filter((part) => !part.etag);
  if (missing.length) throw new Error(`${missing.length} multipart parts are still missing.`);
  const completed = await input.storage.completeMultipartUpload({
    key: session.objectKey,
    uploadId: session.uploadId,
    parts: session.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag! })),
  });
  if (completed.size !== session.byteSize) throw new Error('Stored Botaniq/tool object size does not match the selected file.');
  session.state = 'completed';
  session.updatedAt = new Date().toISOString();
  await persistSession(input.storage, input.env, session);
  await persistReceipt(input.storage, input.env, session);
  return { session, storedSize: completed.size, alreadyCompleted: false };
}

export async function recordPurchasedToolHash(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sessionId: string;
  sha256: string;
}) {
  const session = await loadPurchasedToolSession(input.storage, input.env, input.sessionId);
  if (session.state !== 'completed') throw new Error('Checksum can be finalized only after storage completion.');
  const sha256 = String(input.sha256 ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('SHA-256 is invalid.');
  session.clientSha256 = sha256;
  session.updatedAt = new Date().toISOString();
  await persistSession(input.storage, input.env, session);
  await persistReceipt(input.storage, input.env, session);
  return session;
}

export async function abortPurchasedToolSession(input: {
  storage: MultipartStoragePort;
  env: Record<string, string | undefined>;
  sessionId: string;
}) {
  const session = await loadPurchasedToolSession(input.storage, input.env, input.sessionId);
  if (session.state === 'completed') return session;
  await input.storage.abortMultipartUpload({ key: session.objectKey, uploadId: session.uploadId });
  session.state = 'aborted';
  session.updatedAt = new Date().toISOString();
  await persistSession(input.storage, input.env, session);
  return session;
}

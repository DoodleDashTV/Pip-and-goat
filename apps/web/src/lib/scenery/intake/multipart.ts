import { randomUUID } from 'node:crypto';
import { SceneryError } from '../types';
import { describeSceneryStorageConfiguration, resolveSceneryAssetPrefix } from './config';
import { detectDuplicate, type StoredSourceIndexEntry } from './duplicates';
import { assessFilenameSafety } from './filename-safety';
import type { ExpectedSourceFile } from './inventory';
import { matchExpectedSourceFile } from './inventory';
import { PREVIEW_SYNTHETIC_SOURCE_ID } from './fixtures';
import {
  assertAllowedExtension,
  assertChunkBoundaries,
  assertCollectionId,
  planMultipartParts,
  sanitizeFilename,
  sceneryInternalObjectKey,
  sceneryObjectKey,
} from './keys';
import { resolveIntakeLimits } from './limits';
import { createEmptyManifestRecord, type SourceObjectManifest } from './manifest';
import { shouldExcludeWorldShadersGiveaway } from './world-shaders';

export type UploadSessionState =
  | 'created'
  | 'signing'
  | 'uploading'
  | 'paused'
  | 'completing'
  | 'completed'
  | 'aborted'
  | 'rejected'
  | 'already_present';

export type MultipartPartRecord = {
  partNumber: number;
  start: number;
  end: number;
  etag?: string;
  signed: boolean;
  failed: boolean;
};

export type IntakePurpose = 'purchased' | 'preview-synthetic';

export type UploadSession = {
  sessionId: string;
  uploadId: string | null;
  purpose: IntakePurpose;
  collectionId: ReturnType<typeof assertCollectionId>;
  expectedSourceId: string;
  originalFilename: string;
  normalizedFilename: string;
  objectKey: string;
  byteSize: number;
  sha256: string | null;
  mimeType: string;
  extension: string;
  lastModified: string | null;
  state: UploadSessionState;
  parts: MultipartPartRecord[];
  createdAt: string;
  updatedAt: string;
  publicAcl: false;
  storageConfigured: boolean;
  connectionReadyOnly: boolean;
  notes: string[];
};

export type MultipartStoragePort = {
  createMultipartUpload(input: { key: string; contentType: string }): Promise<{ uploadId: string }>;
  signPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
    ttlSeconds: number;
  }): Promise<{
    url: string;
    expiresAt: string;
  }>;
  completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<{ size: number }>;
  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>;
  headObject(key: string): Promise<{ exists: boolean; size: number | null }>;
  putObject?(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  getObject?(key: string): Promise<Uint8Array | null>;
  deleteObject?(key: string): Promise<void>;
  listPrefix?(prefix: string): Promise<Array<{ key: string; size: number }>>;
};

export class ConnectionReadyMultipartStorage implements MultipartStoragePort {
  async createMultipartUpload(): Promise<{ uploadId: string }> {
    throw new SceneryError(
      'Private R2 credentials are not available. Intake is connection-ready only.',
      'STORAGE_UNAVAILABLE',
    );
  }
  async signPart(): Promise<{ url: string; expiresAt: string }> {
    throw new SceneryError(
      'Private R2 credentials are not available. Part signing did not run.',
      'STORAGE_UNAVAILABLE',
    );
  }
  async completeMultipartUpload(): Promise<{ size: number }> {
    throw new SceneryError('Private R2 credentials are not available.', 'STORAGE_UNAVAILABLE');
  }
  async abortMultipartUpload(): Promise<void> {
    return;
  }
  async headObject(): Promise<{ exists: boolean; size: number | null }> {
    return { exists: false, size: null };
  }
  async putObject(): Promise<void> {
    return;
  }
  async getObject(): Promise<Uint8Array | null> {
    return null;
  }
  async deleteObject(): Promise<void> {
    return;
  }
  async listPrefix(): Promise<Array<{ key: string; size: number }>> {
    return [];
  }
}

export class MemoryMultipartStorage implements MultipartStoragePort {
  readonly objects = new Map<string, Uint8Array>();
  readonly uploads = new Map<string, { key: string; parts: Map<number, Uint8Array> }>();
  signedUrls: string[] = [];

  async createMultipartUpload(input: { key: string }): Promise<{ uploadId: string }> {
    const uploadId = `mem-${randomUUID()}`;
    this.uploads.set(uploadId, { key: input.key, parts: new Map() });
    return { uploadId };
  }

  async signPart(input: {
    key: string;
    uploadId: string;
    partNumber: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!this.uploads.has(input.uploadId)) {
      throw new SceneryError('Unknown multipart upload.', 'UNKNOWN_UPLOAD');
    }
    const url = `memory://sign/${input.key}?part=${input.partNumber}&upload=${input.uploadId}`;
    this.signedUrls.push(url);
    return { url, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }

  async putPart(uploadId: string, partNumber: number, body: Uint8Array): Promise<string> {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new SceneryError('Unknown multipart upload.', 'UNKNOWN_UPLOAD');
    upload.parts.set(partNumber, new Uint8Array(body));
    return `"etag-${partNumber}"`;
  }

  async completeMultipartUpload(input: {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<{ size: number }> {
    const upload = this.uploads.get(input.uploadId);
    if (!upload) throw new SceneryError('Unknown multipart upload.', 'UNKNOWN_UPLOAD');
    const ordered = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    if (ordered.length !== upload.parts.size) {
      throw new SceneryError('Multipart completion is missing parts.', 'INCOMPLETE_MULTIPART');
    }
    const pieces = ordered.map((part) => {
      const body = upload.parts.get(part.partNumber);
      if (!body) throw new SceneryError(`Missing part ${part.partNumber}.`, 'INCOMPLETE_MULTIPART');
      return body;
    });
    const size = pieces.reduce((sum, part) => sum + part.byteLength, 0);
    const joined = new Uint8Array(size);
    let cursor = 0;
    for (const part of pieces) {
      joined.set(part, cursor);
      cursor += part.byteLength;
    }
    this.objects.set(input.key, joined);
    this.uploads.delete(input.uploadId);
    return { size };
  }

  async abortMultipartUpload(input: { uploadId: string }): Promise<void> {
    this.uploads.delete(input.uploadId);
  }

  async headObject(key: string): Promise<{ exists: boolean; size: number | null }> {
    const body = this.objects.get(key);
    return body ? { exists: true, size: body.byteLength } : { exists: false, size: null };
  }

  async putObject(key: string, body: Uint8Array): Promise<void> {
    this.objects.set(key, new Uint8Array(body));
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    const body = this.objects.get(key);
    return body ? new Uint8Array(body) : null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async listPrefix(prefix: string): Promise<Array<{ key: string; size: number }>> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.byteLength }));
  }
}

export function createUploadSession(input: {
  collectionId: string;
  originalFilename: string;
  byteSize: number;
  mimeType?: string;
  lastModified?: string | null;
  sha256?: string | null;
  expectedSourceId?: string;
  existingIndex?: StoredSourceIndexEntry[];
  env?: Record<string, string | undefined>;
  now?: string;
  purpose?: IntakePurpose;
}): {
  session: UploadSession;
  expected: ExpectedSourceFile | null;
  manifest: SourceObjectManifest;
} {
  const env = input.env ?? process.env;
  const limits = resolveIntakeLimits(env);
  const config = describeSceneryStorageConfiguration(env);
  const collectionId = assertCollectionId(input.collectionId);
  const filenameSafety = assessFilenameSafety(input.originalFilename);
  if (!filenameSafety.safe && input.purpose !== 'preview-synthetic') {
    throw new SceneryError(
      `Filename is unsafe (${filenameSafety.issues.join(', ')}). Source files are not renamed.`,
      'UNSAFE_FILENAME',
    );
  }
  if (
    shouldExcludeWorldShadersGiveaway({ filename: input.originalFilename }) &&
    !matchExpectedSourceFile({ collectionId, filename: input.originalFilename }) &&
    input.purpose !== 'preview-synthetic'
  ) {
    throw new SceneryError(
      'This World Shaders filename is not part of the approved official delivery.',
      'UNEXPECTED_SOURCE',
    );
  }
  const normalizedFilename = sanitizeFilename(input.originalFilename);
  const extension = assertAllowedExtension(normalizedFilename);
  const purpose = input.purpose === 'preview-synthetic' ? 'preview-synthetic' : 'purchased';
  if (input.byteSize <= 0) {
    throw new SceneryError('Zero-byte files are rejected before upload.', 'ZERO_BYTE_FILE');
  }
  if (input.byteSize > limits.maxUploadBytes) {
    throw new SceneryError(
      'File exceeds the configured scenery upload size limit.',
      'FILE_TOO_LARGE',
    );
  }
  if (purpose === 'preview-synthetic') {
    if (!normalizedFilename.startsWith('tivvlejoy-preview-synthetic-') || extension !== '.txt') {
      throw new SceneryError(
        'Preview synthetic fixtures must be newly generated tiny text files under the preview-tests prefix.',
        'SYNTHETIC_FIXTURE_REQUIRED',
      );
    }
    if (matchExpectedSourceFile({ collectionId, filename: normalizedFilename })) {
      throw new SceneryError(
        'Preview synthetic fixtures cannot use a purchased inventory filename.',
        'PURCHASED_FILENAME_REFUSED',
      );
    }
    const objectKey = sceneryInternalObjectKey({
      prefix: resolveSceneryAssetPrefix(env),
      folder: 'preview-tests',
      filename: normalizedFilename,
    });
    const parts = planMultipartParts(input.byteSize, limits.multipartPartBytes).map((part) => ({
      ...part,
      signed: false,
      failed: false,
    }));
    const session: UploadSession = {
      sessionId: randomUUID(),
      uploadId: null,
      purpose,
      collectionId,
      expectedSourceId: PREVIEW_SYNTHETIC_SOURCE_ID,
      originalFilename: input.originalFilename,
      normalizedFilename,
      objectKey,
      byteSize: input.byteSize,
      sha256: input.sha256 ?? null,
      mimeType: input.mimeType || 'text/plain',
      extension,
      lastModified: input.lastModified ?? null,
      state: 'created',
      parts,
      createdAt: input.now ?? new Date().toISOString(),
      updatedAt: input.now ?? new Date().toISOString(),
      publicAcl: false,
      storageConfigured: config.configured,
      connectionReadyOnly: !config.configured,
      notes: [
        'Preview-only synthetic fixture. This is not a purchased scenery source.',
        'Upload does not mean asset approval.',
      ],
    };
    return {
      session,
      expected: null,
      manifest: createEmptyManifestRecord({
        sourceId: PREVIEW_SYNTHETIC_SOURCE_ID,
        collectionId,
        originalFilename: input.originalFilename,
        normalizedFilename,
        objectKey,
        byteSize: input.byteSize,
        sha256: input.sha256 ?? '',
        mimeType: session.mimeType,
        extension,
        now: session.createdAt,
      }),
    };
  }
  const expected = matchExpectedSourceFile({
    collectionId,
    filename: input.originalFilename,
    expectedSourceId: input.expectedSourceId,
  });
  if (!expected) {
    throw new SceneryError(
      'Filename is not in the expected TivvleJoy scenery inventory for that collection.',
      'UNEXPECTED_SOURCE',
    );
  }
  const duplicate = input.sha256
    ? detectDuplicate({
        sha256: input.sha256,
        filename: normalizedFilename,
        collectionId,
        existing: input.existingIndex ?? [],
      })
    : { status: 'unique' as const };
  if (duplicate.status === 'already_present' || duplicate.status === 'exact_duplicate') {
    const existing = duplicate.existing!;
    const session: UploadSession = {
      sessionId: randomUUID(),
      uploadId: null,
      purpose,
      collectionId,
      expectedSourceId: expected.sourceId,
      originalFilename: input.originalFilename,
      normalizedFilename,
      objectKey: existing.objectKey,
      byteSize: input.byteSize,
      sha256: input.sha256 ?? null,
      mimeType: input.mimeType || expected.mimeType,
      extension,
      lastModified: input.lastModified ?? null,
      state: 'already_present',
      parts: [],
      createdAt: input.now ?? new Date().toISOString(),
      updatedAt: input.now ?? new Date().toISOString(),
      publicAcl: false,
      storageConfigured: config.configured,
      connectionReadyOnly: !config.configured,
      notes: ['Identical SHA-256 is already present. A second stored copy was not created.'],
    };
    return {
      session,
      expected,
      manifest: createEmptyManifestRecord({
        sourceId: expected.sourceId,
        collectionId,
        originalFilename: input.originalFilename,
        normalizedFilename,
        objectKey: existing.objectKey,
        byteSize: input.byteSize,
        sha256: input.sha256 ?? existing.sha256,
        mimeType: session.mimeType,
        extension,
        now: session.createdAt,
      }),
    };
  }
  if (duplicate.status === 'filename_conflict') {
    throw new SceneryError(
      'A different object already uses this filename. Version the key explicitly; silent overwrite is refused.',
      'IMMUTABLE_SOURCE_CONFLICT',
    );
  }
  const objectKey = sceneryObjectKey({
    prefix: resolveSceneryAssetPrefix(env),
    kind: 'source',
    collection: collectionId,
    filename: normalizedFilename,
  });
  const planned = planMultipartParts(input.byteSize, limits.multipartPartBytes);
  if (planned.length > limits.maxParts) {
    throw new SceneryError(
      'File would require more multipart parts than Preview allows.',
      'PART_COUNT_LIMIT',
    );
  }
  assertChunkBoundaries(planned, input.byteSize, limits.multipartPartBytes);
  const parts = planned.map((part) => ({
    ...part,
    signed: false,
    failed: false,
  }));
  const session: UploadSession = {
    sessionId: randomUUID(),
    uploadId: null,
    purpose,
    collectionId,
    expectedSourceId: expected.sourceId,
    originalFilename: input.originalFilename,
    normalizedFilename,
    objectKey,
    byteSize: input.byteSize,
    sha256: input.sha256 ?? null,
    mimeType: input.mimeType || expected.mimeType,
    extension,
    lastModified: input.lastModified ?? null,
    state: config.configured ? 'created' : 'created',
    parts,
    createdAt: input.now ?? new Date().toISOString(),
    updatedAt: input.now ?? new Date().toISOString(),
    publicAcl: false,
    storageConfigured: config.configured,
    connectionReadyOnly: !config.configured,
    notes: config.configured
      ? ['Direct-to-storage multipart session created. Upload does not mean asset approval.']
      : [
          'Storage credentials are absent. Session is connection-ready only and did not contact R2.',
          'Upload does not mean asset approval.',
        ],
  };
  return {
    session,
    expected,
    manifest: createEmptyManifestRecord({
      sourceId: expected.sourceId,
      collectionId,
      originalFilename: input.originalFilename,
      normalizedFilename,
      objectKey,
      byteSize: input.byteSize,
      sha256: input.sha256 ?? '',
      mimeType: session.mimeType,
      extension,
      now: session.createdAt,
    }),
  };
}

export function markPartSigned(session: UploadSession, partNumber: number): UploadSession {
  const part = session.parts.find((item) => item.partNumber === partNumber);
  if (!part) throw new SceneryError(`Unknown part ${partNumber}.`, 'UNKNOWN_PART');
  return {
    ...session,
    state: 'signing',
    updatedAt: new Date().toISOString(),
    parts: session.parts.map((item) =>
      item.partNumber === partNumber ? { ...item, signed: true, failed: false } : item,
    ),
  };
}

export function markPartFailed(session: UploadSession, partNumber: number): UploadSession {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    parts: session.parts.map((item) =>
      item.partNumber === partNumber ? { ...item, failed: true } : item,
    ),
  };
}

export function recordPartEtag(
  session: UploadSession,
  partNumber: number,
  etag: string,
): UploadSession {
  return {
    ...session,
    state: 'uploading',
    updatedAt: new Date().toISOString(),
    parts: session.parts.map((item) =>
      item.partNumber === partNumber ? { ...item, etag, failed: false } : item,
    ),
  };
}

export function assertCompleteParts(
  session: UploadSession,
): Array<{ partNumber: number; etag: string }> {
  const complete = session.parts.map((part) => {
    if (!part.etag) {
      throw new SceneryError(
        `Part ${part.partNumber} has no ETag and cannot complete.`,
        'INCOMPLETE_MULTIPART',
      );
    }
    return { partNumber: part.partNumber, etag: part.etag };
  });
  return complete;
}

export function resumeSession(session: UploadSession): {
  nextPart: MultipartPartRecord | null;
  session: UploadSession;
} {
  const nextPart = session.parts.find((part) => !part.etag) ?? null;
  return {
    nextPart,
    session: {
      ...session,
      state:
        session.state === 'aborted' || session.state === 'completed' ? session.state : 'paused',
      notes: [
        ...session.notes,
        'Resume requested. Completed parts are kept; remaining parts can be re-signed.',
      ],
      updatedAt: new Date().toISOString(),
    },
  };
}

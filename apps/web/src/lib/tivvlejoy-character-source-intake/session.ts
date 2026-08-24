import { randomUUID } from 'node:crypto';
import { planMultipartParts } from '@/lib/scenery/intake/keys';
import { resolveIntakeLimits } from '@/lib/scenery/intake/limits';
import { GOAT_SOURCE_FILENAME, GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { CharacterSourceError, goatSourceObjectKey } from './keys';
import { preflightGoatUpload, verifyGoatSourceHash } from './validation';
import type { GoatSourceIntakeState } from './types';

export type CharacterUploadPart = {
  partNumber: number;
  start: number;
  end: number;
  etag?: string;
  signed: boolean;
  failed: boolean;
};

export type CharacterUploadSession = {
  sessionId: string;
  uploadId: string | null;
  filename: typeof GOAT_SOURCE_FILENAME;
  objectKey: ReturnType<typeof goatSourceObjectKey>;
  byteSize: number;
  sha256: string;
  state: GoatSourceIntakeState;
  parts: CharacterUploadPart[];
  createdAt: string;
  updatedAt: string;
  connectionReadyOnly: boolean;
  alreadyVerified: boolean;
  notes: string[];
};

export function createGoatUploadSession(input: {
  filename: string;
  byteSize: number;
  sha256: string;
  existingLockedSha256?: string | null;
  env?: Record<string, string | undefined>;
}): CharacterUploadSession {
  const preflight = preflightGoatUpload(input);
  if (!preflight.ok) {
    throw new CharacterSourceError(preflight.reason, preflight.code);
  }
  const hash = verifyGoatSourceHash(input.sha256);
  if (!hash.ok) {
    throw new CharacterSourceError(hash.reason, hash.code);
  }
  const alreadyVerified = input.existingLockedSha256 === GOAT_SOURCE_SHA256;
  const limits = resolveIntakeLimits(input.env);
  const parts = planMultipartParts(GOAT_SOURCE_SIZE_BYTES, limits.multipartPartBytes).map((part) => ({
    ...part,
    signed: false,
    failed: false,
  }));
  const now = new Date().toISOString();
  return {
    sessionId: `goat-${randomUUID()}`,
    uploadId: null,
    filename: GOAT_SOURCE_FILENAME,
    objectKey: goatSourceObjectKey(),
    byteSize: GOAT_SOURCE_SIZE_BYTES,
    sha256: GOAT_SOURCE_SHA256,
    state: alreadyVerified ? 'SOURCE_LOCKED' : 'NOT_UPLOADED',
    parts,
    createdAt: now,
    updatedAt: now,
    connectionReadyOnly: false,
    alreadyVerified,
    notes: alreadyVerified
      ? ['SOURCE already hash-verified. Duplicate upload is reused, not overwritten.']
      : ['Multipart session planned. Bytes travel browser → signed R2, never through a Vercel body.'],
  };
}

export function remainingParts(session: CharacterUploadSession): CharacterUploadPart[] {
  return session.parts.filter((part) => !part.etag);
}

export function recordPartEtag(session: CharacterUploadSession, partNumber: number, etag: string): CharacterUploadSession {
  return {
    ...session,
    state: 'UPLOADING',
    updatedAt: new Date().toISOString(),
    parts: session.parts.map((part) =>
      part.partNumber === partNumber ? { ...part, etag, signed: true, failed: false } : part,
    ),
  };
}

export function markPartFailed(session: CharacterUploadSession, partNumber: number): CharacterUploadSession {
  return {
    ...session,
    state: 'RESUMABLE',
    updatedAt: new Date().toISOString(),
    parts: session.parts.map((part) => (part.partNumber === partNumber ? { ...part, failed: true } : part)),
  };
}

export function resumeGuidance(session: CharacterUploadSession) {
  const missing = remainingParts(session);
  return {
    resumable: missing.length > 0 && session.parts.some((part) => part.etag),
    nextPartNumbers: missing.map((part) => part.partNumber),
    completedParts: session.parts.filter((part) => part.etag).length,
    totalParts: session.parts.length,
    restartCompletedUpload: false,
  };
}

export function assertCompleteParts(session: CharacterUploadSession): Array<{ partNumber: number; etag: string }> {
  const complete = session.parts.map((part) => {
    if (!part.etag) {
      throw new CharacterSourceError(`Part ${part.partNumber} has no ETag.`, 'INCOMPLETE_MULTIPART');
    }
    return { partNumber: part.partNumber, etag: part.etag };
  });
  return complete;
}

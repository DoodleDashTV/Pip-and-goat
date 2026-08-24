import { GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { validateGoatFilename } from './keys';

export function verifyGoatSourceHash(observed: string | null | undefined): {
  ok: boolean;
  hashVerified: boolean;
  code: string;
  reason: string;
} {
  const value = String(observed ?? '').trim().toLowerCase();
  if (!value) {
    return { ok: false, hashVerified: false, code: 'MISSING_SHA256', reason: 'SHA-256 is required before SOURCE_INTAKE can advance.' };
  }
  if (!/^[a-f0-9]{64}$/.test(value)) {
    return { ok: false, hashVerified: false, code: 'INVALID_SHA256', reason: 'SHA-256 must be 64 lowercase hex characters.' };
  }
  if (value !== GOAT_SOURCE_SHA256) {
    return {
      ok: false,
      hashVerified: false,
      code: 'SHA256_MISMATCH',
      reason: 'Hash does not match the locked Goat_FINN.zip. SOURCE_INTAKE stays closed.',
    };
  }
  return { ok: true, hashVerified: true, code: 'HASH_VERIFIED', reason: 'SHA-256 matches the locked Goat source.' };
}

export function verifyGoatSourceSize(byteSize: number): { ok: boolean; code: string; reason: string } {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return { ok: false, code: 'INVALID_SIZE', reason: 'Byte size is missing or zero.' };
  }
  if (byteSize !== GOAT_SOURCE_SIZE_BYTES) {
    return {
      ok: false,
      code: 'SIZE_MISMATCH',
      reason: `Expected ${GOAT_SOURCE_SIZE_BYTES} bytes. Received ${byteSize}.`,
    };
  }
  return { ok: true, code: 'SIZE_VERIFIED', reason: 'Byte size matches the locked Goat source.' };
}

export function preflightGoatUpload(input: { filename: string; byteSize: number; sha256?: string | null }) {
  const filename = validateGoatFilename(input.filename);
  if (!filename.ok) {
    return { ok: false as const, code: filename.code, reason: filename.reason, hashVerified: false };
  }
  const size = verifyGoatSourceSize(input.byteSize);
  if (!size.ok) {
    return { ok: false as const, code: size.code, reason: size.reason, hashVerified: false };
  }
  if (input.sha256) {
    const hash = verifyGoatSourceHash(input.sha256);
    if (!hash.ok) {
      return { ok: false as const, code: hash.code, reason: hash.reason, hashVerified: false };
    }
    return { ok: true as const, code: 'PREFLIGHT_OK', reason: hash.reason, hashVerified: true };
  }
  return { ok: true as const, code: 'PREFLIGHT_PENDING_HASH', reason: 'Filename and size match. Hash still required.', hashVerified: false };
}

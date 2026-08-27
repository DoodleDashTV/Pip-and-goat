import { describe, expect, it } from 'vitest';
import {
  parseRigUploadRecovery,
  rigUploadRecoveryKey,
  serializeRigUploadRecovery,
  TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA,
  TIVVLEJOY_RIG_UPLOAD_RECOVERY_TTL_MS,
  validateRigUploadRecovery,
  type RigUploadBrowserRecovery,
} from './tivvlejoy-rig-upload-browser-recovery';

const NOW = Date.parse('2026-08-27T19:30:00.000Z');
const VERSION = '66666666-6666-4666-8666-666666666666';

function record(): RigUploadBrowserRecovery {
  return {
    recoverySchema: TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA,
    characterId: 'CHAR_PIP_001',
    versionId: VERSION,
    partCount: 2,
    parts: [
      { partNumber: 1, start: 0, end: 16 },
      { partNumber: 2, start: 16, end: 30 },
    ],
    approved: false,
    filename: 'Pip_Final.blend',
    byteSize: 30,
    lastModified: 123456,
    artistVersionNote: 'final rig delivery',
    completedParts: [{ partNumber: 1, etag: '"etag-1"' }],
    openedAt: '2026-08-27T19:00:00.000Z',
    updatedAt: '2026-08-27T19:20:00.000Z',
  };
}

describe('rig upload browser recovery', () => {
  it('uses a character-specific browser key', () => {
    expect(rigUploadRecoveryKey('CHAR_PIP_001')).not.toBe(rigUploadRecoveryKey('CHAR_GOAT_001'));
  });

  it('round-trips non-secret recovery metadata and ETags', () => {
    const raw = serializeRigUploadRecovery(record());
    expect(raw).toContain('etag-1');
    expect(raw).toContain(VERSION);
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('authorization');
    const parsed = parseRigUploadRecovery(raw, 'CHAR_PIP_001', NOW);
    expect(parsed).toMatchObject({ versionId: VERSION, completedParts: [{ partNumber: 1, etag: '"etag-1"' }] });
  });

  it('rejects records containing token-like secret fields', () => {
    expect(validateRigUploadRecovery({ ...record(), token: 'secret' }, 'CHAR_PIP_001', NOW)).toBe(false);
    expect(validateRigUploadRecovery({ ...record(), intakeToken: 'secret' }, 'CHAR_PIP_001', NOW)).toBe(false);
    expect(validateRigUploadRecovery({ ...record(), authorization: 'secret' }, 'CHAR_PIP_001', NOW)).toBe(false);
  });

  it('rejects expired and cross-character recovery records', () => {
    expect(validateRigUploadRecovery(record(), 'CHAR_GOAT_001', NOW)).toBe(false);
    const expired = { ...record(), updatedAt: new Date(NOW - TIVVLEJOY_RIG_UPLOAD_RECOVERY_TTL_MS - 1).toISOString() };
    expect(validateRigUploadRecovery(expired, 'CHAR_PIP_001', NOW)).toBe(false);
  });

  it('rejects malformed part state and duplicate completed parts', () => {
    expect(validateRigUploadRecovery({ ...record(), parts: [{ partNumber: 1, start: 10, end: 5 }] }, 'CHAR_PIP_001', NOW)).toBe(false);
    expect(validateRigUploadRecovery({ ...record(), completedParts: [{ partNumber: 1, etag: 'a' }, { partNumber: 1, etag: 'b' }] }, 'CHAR_PIP_001', NOW)).toBe(false);
  });
});

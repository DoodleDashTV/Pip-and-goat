export const TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA = 'TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_V1' as const;
export const TIVVLEJOY_RIG_UPLOAD_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RigUploadRecoveryCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
export type RigUploadRecoveryPart = { partNumber: number; start: number; end: number };
export type RigUploadRecoveryCompletedPart = { partNumber: number; etag: string };

export type RigUploadBrowserRecovery = {
  recoverySchema: typeof TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA;
  characterId: RigUploadRecoveryCharacterId;
  versionId: string;
  partCount: number;
  parts: RigUploadRecoveryPart[];
  approved: false;
  filename: string;
  byteSize: number;
  lastModified: number;
  artistVersionNote: string;
  completedParts: RigUploadRecoveryCompletedPart[];
  openedAt: string;
  updatedAt: string;
};

export function rigUploadRecoveryKey(characterId: RigUploadRecoveryCharacterId) {
  return `tivvlejoy:ep001:rig-upload-recovery:${characterId}`;
}

function validIso(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateRigUploadRecovery(
  value: unknown,
  characterId: RigUploadRecoveryCharacterId,
  nowMs = Date.now(),
): value is RigUploadBrowserRecovery {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RigUploadBrowserRecovery> & Record<string, unknown>;
  if (record.recoverySchema !== TIVVLEJOY_RIG_UPLOAD_BROWSER_RECOVERY_SCHEMA || record.characterId !== characterId) return false;
  if (!/^[a-f0-9-]{36}$/i.test(String(record.versionId ?? ''))) return false;
  if (!record.filename || !Number.isSafeInteger(record.byteSize) || Number(record.byteSize) <= 0) return false;
  if (!Number.isSafeInteger(record.lastModified) || Number(record.lastModified) < 0) return false;
  if (!Number.isInteger(record.partCount) || Number(record.partCount) <= 0) return false;
  if (!Array.isArray(record.parts) || record.parts.length !== record.partCount) return false;
  if (!Array.isArray(record.completedParts) || record.completedParts.length > record.partCount) return false;
  if (!validIso(record.openedAt) || !validIso(record.updatedAt)) return false;
  const updatedMs = Date.parse(String(record.updatedAt));
  if (updatedMs > nowMs + 60_000 || nowMs - updatedMs > TIVVLEJOY_RIG_UPLOAD_RECOVERY_TTL_MS) return false;
  if (record.parts.some((part) => !part || !Number.isInteger(part.partNumber) || part.partNumber < 1 || !Number.isInteger(part.start) || !Number.isInteger(part.end) || part.start < 0 || part.end <= part.start)) return false;
  if (record.completedParts.some((part) => !part || !Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > record.partCount! || typeof part.etag !== 'string' || !part.etag.trim())) return false;
  if (new Set(record.completedParts.map((part) => part.partNumber)).size !== record.completedParts.length) return false;
  if ('token' in record || 'intakeToken' in record || 'authorization' in record) return false;
  return true;
}

export function parseRigUploadRecovery(raw: string, characterId: RigUploadRecoveryCharacterId, nowMs = Date.now()): RigUploadBrowserRecovery | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateRigUploadRecovery(parsed, characterId, nowMs) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeRigUploadRecovery(record: RigUploadBrowserRecovery) {
  const serializable = {
    recoverySchema: record.recoverySchema,
    characterId: record.characterId,
    versionId: record.versionId,
    partCount: record.partCount,
    parts: record.parts,
    approved: false as const,
    filename: record.filename,
    byteSize: record.byteSize,
    lastModified: record.lastModified,
    artistVersionNote: record.artistVersionNote,
    completedParts: record.completedParts,
    openedAt: record.openedAt,
    updatedAt: record.updatedAt,
  };
  return JSON.stringify(serializable);
}

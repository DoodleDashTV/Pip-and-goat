import { PersistenceError, TIVVLEJOY_RECORD_SCHEMA_VERSION } from './types';

const RECORD_ID_RE =
  /^(prv_[a-z]+_[a-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|preview-workspace|preview-production)$/i;
const SECRET_KEY_RE = /(password|secret|token|authorization|database_url|api[_-]?key|credential)/i;
const INSECURE_URL_RE = /[a-z]+:\/\/[^/\s:]+:[^/\s@]+@/i;
const TOKEN_RE = /\b(?:sk-|rpa_|ghp_|github_pat_)[A-Za-z0-9._-]{8,}\b/;

export function assertRecordId(id: string, label = 'id'): void {
  if (!RECORD_ID_RE.test(id)) {
    throw new PersistenceError(`Malformed ${label}.`, 'RECORD_ID_INVALID');
  }
}

export function assertSchemaVersion(version: number): void {
  if (version !== TIVVLEJOY_RECORD_SCHEMA_VERSION) {
    throw new PersistenceError('Unsupported persistence schema version.', 'SCHEMA_VERSION_INVALID');
  }
}

export function assertWorkspaceOwnership(input: {
  workspaceId: string;
  recordWorkspaceId: string;
}): void {
  if (input.workspaceId !== input.recordWorkspaceId) {
    throw new PersistenceError('Workspace ownership boundary refused.', 'WORKSPACE_OWNERSHIP');
  }
}

export function fingerprintRecord(parts: Array<string | number>): string {
  return parts.map((part) => String(part).trim().toLowerCase()).join('|');
}

export function sanitizeAuditDetail(
  detail: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (SECRET_KEY_RE.test(key)) continue;
    if (typeof value === 'string' && (INSECURE_URL_RE.test(value) || TOKEN_RE.test(value))) {
      clean[key] = '[REDACTED]';
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export function wrapDatabaseError(error: unknown): PersistenceError {
  const message = error instanceof Error ? error.message : 'Database error';
  const redacted = message
    .replace(INSECURE_URL_RE, '[REDACTED]')
    .replace(TOKEN_RE, '[REDACTED]')
    .replace(/postgresql:\/\/\S+/gi, '[REDACTED]');
  return new PersistenceError(`Preview database error. ${redacted}`.slice(0, 180), 'DATABASE_ERROR');
}

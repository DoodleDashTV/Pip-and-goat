/**
 * Step 25 — Security and secret rotation (closed-gate).
 *
 * Validates secret *names* and rotation metadata. Never prints values.
 * Does not access or rotate real external credentials.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { stamp } from './labels';

export const FAKE_TEST_SECRET = 'FAKESECRET_testonly_v1' as const;

const SECRET_NAME_RE = /^(?:[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE)[A-Z0-9_]*)$/;
const PLACEHOLDERS = ['changeme', 'xxx', 'your-key-here', 'todo', 'replace-me', 'example'];
const INSECURE_URL_RE = /[a-z]+:\/\/[^/\s:]+:[^/\s@]+@/i;
const KEY_BLOCK_RE = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/;
const TOKEN_RE = /\b(?:sk-|rpa_|ghp_|github_pat_)[A-Za-z0-9._-]{8,}\b/;

export type SecretRotationRecord = {
  name: string;
  owner: string;
  provider: string;
  lastRotation: string;
  deadline: string;
  status: 'CURRENT' | 'DUE' | 'EXPIRED' | 'MISSING' | 'MALFORMED' | 'PLACEHOLDER' | 'INSECURE';
};

export function redactSecrets(text: string, knownValues: readonly string[] = []): string {
  let out = String(text ?? '');
  for (const value of knownValues) {
    if (value && value.length >= 6) out = out.split(value).join('[REDACTED]');
  }
  out = out.replace(INSECURE_URL_RE, (match) => {
    const scheme = match.split('://')[0];
    return `${scheme}://[REDACTED]@`;
  });
  out = out.replace(TOKEN_RE, '[REDACTED]');
  out = out.replace(KEY_BLOCK_RE, '[REDACTED PRIVATE KEY]');
  out = out.replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
  return out;
}

export function classifySecretName(name: string): { valid: boolean; reason: string } {
  if (!name) return { valid: false, reason: 'missing name' };
  if (!SECRET_NAME_RE.test(name) && !['DATABASE_URL', 'RUNPOD_API_KEY', 'R2_SECRET_ACCESS_KEY'].includes(name)) {
    return { valid: false, reason: 'malformed secret name' };
  }
  return { valid: true, reason: 'name ok' };
}

export function inspectSecretPresence(input: {
  name: string;
  present: boolean;
  length?: number;
  looksPlaceholder?: boolean;
  looksExpired?: boolean;
  containsCredentialUrl?: boolean;
}): { status: SecretRotationRecord['status']; reason: string } {
  if (!input.present) return { status: 'MISSING', reason: 'required secret not present' };
  if (input.looksPlaceholder) return { status: 'PLACEHOLDER', reason: 'placeholder value refused' };
  if (input.looksExpired) return { status: 'EXPIRED', reason: 'rotation deadline passed' };
  if (input.containsCredentialUrl) return { status: 'INSECURE', reason: 'credential URL refused' };
  if ((input.length ?? 0) > 0 && (input.length ?? 0) < 8) return { status: 'INSECURE', reason: 'value too short' };
  if (!classifySecretName(input.name).valid) return { status: 'MALFORMED', reason: 'malformed name' };
  return { status: 'CURRENT', reason: 'metadata only; value not printed' };
}

export function buildRotationRegistry(nowIso: string): SecretRotationRecord[] {
  return [
    {
      name: 'RUNPOD_API_KEY',
      owner: 'studio-security',
      provider: 'runpod',
      lastRotation: '2026-01-01T00:00:00.000Z',
      deadline: '2026-12-31T00:00:00.000Z',
      status: nowIso > '2026-12-31T00:00:00.000Z' ? 'EXPIRED' : 'DUE',
    },
    {
      name: 'R2_SECRET_ACCESS_KEY',
      owner: 'studio-security',
      provider: 'r2',
      lastRotation: '2026-01-01T00:00:00.000Z',
      deadline: '2026-12-31T00:00:00.000Z',
      status: 'DUE',
    },
  ];
}

export function scanTextForSecrets(text: string, fileName = 'memory'): {
  findings: Array<{ file: string; kind: string; redacted: true }>;
  refused: boolean;
} {
  const findings: Array<{ file: string; kind: string; redacted: true }> = [];
  if (fileName === '.env' || fileName.endsWith('/.env')) {
    findings.push({ file: fileName, kind: 'COMMITTED_ENV', redacted: true });
  }
  if (KEY_BLOCK_RE.test(text)) findings.push({ file: fileName, kind: 'PRIVATE_KEY', redacted: true });
  if (TOKEN_RE.test(text) && !text.includes(FAKE_TEST_SECRET)) {
    findings.push({ file: fileName, kind: 'TOKEN', redacted: true });
  }
  if (INSECURE_URL_RE.test(text) && !fileName.endsWith('.example') && !fileName.includes('test')) {
    findings.push({ file: fileName, kind: 'CREDENTIAL_URL', redacted: true });
  }
  if (PLACEHOLDERS.some((needle) => text.toLowerCase().includes(needle)) && SECRET_NAME_RE.test(fileName)) {
    findings.push({ file: fileName, kind: 'PLACEHOLDER', redacted: true });
  }
  return { findings, refused: findings.length > 0 };
}

export function assertSecurityServiceAvailable(available: boolean): void {
  if (!available) {
    throw new Error('PERSISTENCE_FAILED: required security service unavailable. Fail closed.');
  }
}

export function compileSecurityReport(input: {
  trackedFiles: Array<{ path: string; content: string }>;
  securityServiceAvailable: boolean;
  nowIso?: string;
}) {
  if (!input.securityServiceAvailable) {
    return stamp({
      available: false as const,
      refused: true as const,
      reason: 'required security service unavailable',
      findings: [] as Array<{ file: string; kind: string; redacted: true }>,
      rotation: [] as SecretRotationRecord[],
      cacheKey: createHash('sha256').update('unavailable').digest('hex'),
      version: PREPRODUCTION_SUBSYSTEM_VERSIONS.security,
    });
  }
  const findings = input.trackedFiles.flatMap((file) => scanTextForSecrets(file.content, file.path).findings);
  const rotation = buildRotationRegistry(input.nowIso ?? '2026-08-16T00:00:00.000Z');
  return stamp({
    available: true as const,
    refused: findings.some((finding) => finding.kind === 'COMMITTED_ENV' || finding.kind === 'PRIVATE_KEY'),
    reason: findings.length ? 'secret-pattern findings (values redacted)' : 'no committed secrets',
    findings,
    rotation,
    cacheKey: createHash('sha256').update(JSON.stringify({ findings, rotation })).digest('hex'),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.security,
  });
}

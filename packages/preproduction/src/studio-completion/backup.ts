/**
 * Step 30 — Backup and disaster recovery (disposable local fixtures only).
 *
 * Does not access or overwrite real production data.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { stamp } from './labels';

export type BackupFile = { path: string; bytes: string; checksum: string };

export const BACKUP_ORDER = [
  'workflow.json',
  'continuity.json',
  'dependencies.json',
  'cache.json',
  'checkpoint.json',
  'provenance.json',
  'audit.json',
  'release.json',
  'config-fingerprint.json',
] as const;

export function checksumOf(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createBackup(records: Record<string, unknown>): {
  files: BackupFile[];
  manifestChecksum: string;
  complete: boolean;
} {
  const files = BACKUP_ORDER.map((path) => {
    const bytes = JSON.stringify(records[path] ?? null);
    return { path, bytes, checksum: checksumOf(bytes) };
  });
  return {
    files,
    manifestChecksum: checksumOf(files.map((file) => file.checksum).join('.')),
    complete: BACKUP_ORDER.every((path) => path in records),
  };
}

export function validateBackup(files: readonly BackupFile[]): { ok: boolean; reason: string } {
  for (const required of BACKUP_ORDER) {
    if (!files.some((file) => file.path === required)) {
      return { ok: false, reason: `missing ${required}` };
    }
  }
  for (const file of files) {
    if (checksumOf(file.bytes) !== file.checksum) return { ok: false, reason: `corrupt ${file.path}` };
  }
  return { ok: true, reason: 'complete and checksums match' };
}

export function restoreBackup(files: readonly BackupFile[]): {
  ok: boolean;
  order: string[];
  restored: Record<string, unknown>;
  reason: string;
} {
  const validation = validateBackup(files);
  if (!validation.ok) return { ok: false, order: [], restored: {}, reason: validation.reason };
  const byPath = new Map(files.map((file) => [file.path, file]));
  const restored: Record<string, unknown> = {};
  for (const path of BACKUP_ORDER) {
    restored[path] = JSON.parse(byPath.get(path)!.bytes);
  }
  return { ok: true, order: [...BACKUP_ORDER], restored, reason: 'restored into fresh disposable target' };
}

export function recoverInterruptedBackup(partial: readonly BackupFile[]): {
  ok: false;
  reason: string;
} {
  return { ok: false, reason: validateBackup(partial).reason };
}

export function compileBackupRestoreEvidence(input: {
  backup: ReturnType<typeof createBackup>;
  restore: ReturnType<typeof restoreBackup>;
  startedMs: number;
  finishedMs: number;
}) {
  return stamp({
    complete: input.backup.complete,
    restoreOk: input.restore.ok,
    restoreOrder: input.restore.order,
    productionDataTouched: false as const,
    recoveryTimeMs: Math.max(0, input.finishedMs - input.startedMs),
    recoveryPoint: 'last-complete-local-fixture',
    cacheKey: input.backup.manifestChecksum,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.backup,
  });
}

import { sha256Canonical } from './hash';
import { assertNoSecrets, sanitizeForPersistence } from './sanitizer';
import { ProductionPersistenceStore } from './store';
import { BACKUP_SCHEMA, type WorkspaceBackup } from './types';

export const BACKUP_MAX_BYTES = 8 * 1024 * 1024;

export function exportWorkspaceBackup(store: ProductionPersistenceStore): WorkspaceBackup {
  if (store.getFaultInjection() === 'BEFORE_BACKUP' || store.getFaultInjection() === 'MID_BACKUP') {
    const fault = store.getFaultInjection();
    store.setFault(null);
    throw new Error(`fault ${fault}; backup aborted without mutating workspace`);
  }
  const view = store.serialize();
  const counts: Record<string, number> = {};
  for (const record of view.records) counts[record.entityType] = (counts[record.entityType] ?? 0) + 1;
  const snapshot = store.latestSnapshot() ?? {
    schemaVersion: 'TIVVLEJOY_PRODUCTION_SNAPSHOT_V1' as const,
    workspaceId: view.workspaceId,
    journalPosition: view.journalPosition,
    revision: view.revision,
    records: view.records,
    snapshotSha256: view.snapshotSha256,
  };
  const events = sanitizeForPersistence(view.events);
  assertNoSecrets(events, 'backup events');
  assertNoSecrets(snapshot, 'backup snapshot');
  const body = {
    schemaVersion: BACKUP_SCHEMA,
    workspaceId: view.workspaceId,
    entityCounts: counts,
    snapshot,
    events,
    contentHashes: [...view.records.map((record) => record.dependencySha256), ...events.map((event) => event.payloadSha256)].sort(),
    secretsExcluded: true as const,
    commercialBytesExcluded: true as const,
  };
  const backup = { ...body, backupSha256: sha256Canonical(body) };
  if (store.getFaultInjection() === 'AFTER_BACKUP') {
    store.setFault(null);
    throw new Error('fault AFTER_BACKUP; backup file discarded');
  }
  return backup;
}

export function importWorkspaceBackup(
  store: ProductionPersistenceStore,
  backup: WorkspaceBackup,
  options: { confirm: boolean; expectedWorkspaceId?: string },
): { ok: true } | { ok: false; reason: string } {
  if (!options.confirm) return { ok: false, reason: 'explicit confirmation required' };
  if (backup.schemaVersion !== BACKUP_SCHEMA) {
    if (String(backup.schemaVersion).includes('V9') || String(backup.schemaVersion).includes('FUTURE')) {
      return { ok: false, reason: 'unsupported future version' };
    }
    return { ok: false, reason: 'invalid schema' };
  }
  if (options.expectedWorkspaceId && backup.workspaceId !== options.expectedWorkspaceId) {
    return { ok: false, reason: 'wrong workspace' };
  }
  const copy = { ...backup } as WorkspaceBackup & { backupSha256?: string };
  const { backupSha256, ...rest } = copy;
  if (backupSha256 !== sha256Canonical(rest)) return { ok: false, reason: 'hash mismatch' };
  const serialized = JSON.stringify(backup);
  if (serialized.length > BACKUP_MAX_BYTES) return { ok: false, reason: 'size limit exceeded' };
  try {
    assertNoSecrets(backup, 'import backup');
  } catch {
    return { ok: false, reason: 'secrets rejected' };
  }
  if (store.readWorkspace() && store.workspaceId === backup.workspaceId && store.serialize().revision > 0) {
    const existing = store.latestSnapshot()?.snapshotSha256;
    if (existing === backup.snapshot.snapshotSha256) return { ok: false, reason: 'duplicate backup' };
  }
  if (store.getFaultInjection() === 'MID_IMPORT') {
    store.setFault(null);
    return { ok: false, reason: 'fault MID_IMPORT; existing state unchanged' };
  }
  store.replaceState({
    workspaceId: backup.workspaceId,
    revision: backup.snapshot.revision,
    snapshotSha256: backup.snapshot.snapshotSha256,
    journalPosition: backup.events.length,
    records: backup.snapshot.records,
    events: backup.events,
  });
  return { ok: true };
}

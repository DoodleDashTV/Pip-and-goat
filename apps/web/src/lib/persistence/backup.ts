import {
  emptyPreviewWorkspace,
  loadPreviewWorkspace,
  savePreviewWorkspace,
} from '../preview-workspace/store';
import type { PreviewStoreBackend, PreviewWorkspace } from '../preview-workspace/types';
import { assertBackupSize, previewBackupSchema, type PreviewBackup } from './schema';
import { PersistenceError, TIVVLEJOY_BACKUP_KIND, TIVVLEJOY_BACKUP_VERSION } from './types';

export function exportPreviewBackup(backend: PreviewStoreBackend): PreviewBackup {
  const workspace = loadPreviewWorkspace(backend) ?? emptyPreviewWorkspace();
  return {
    kind: TIVVLEJOY_BACKUP_KIND,
    version: TIVVLEJOY_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace,
  };
}

export function serializePreviewBackup(backup: PreviewBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function parsePreviewBackup(raw: string, byteLength = raw.length): PreviewBackup {
  assertBackupSize(byteLength);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PersistenceError('Backup file is not valid JSON.', 'BACKUP_MALFORMED');
  }
  const result = previewBackupSchema.safeParse(parsed);
  if (!result.success) {
    throw new PersistenceError('Backup schema or version is not valid.', 'BACKUP_INVALID');
  }
  return result.data;
}

export function importPreviewBackup(
  raw: string,
  backend: PreviewStoreBackend,
  options: { confirm: boolean; byteLength?: number },
): PreviewWorkspace {
  if (!options.confirm) {
    throw new PersistenceError('Import cancelled. Current browser data was not replaced.', 'BACKUP_UNCONFIRMED');
  }
  const backup = parsePreviewBackup(raw, options.byteLength ?? raw.length);
  return savePreviewWorkspace(backup.workspace, backend);
}

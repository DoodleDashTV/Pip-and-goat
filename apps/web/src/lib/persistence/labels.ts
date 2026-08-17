import type { PersistenceAdapterId, SafePersistenceSnapshot } from './types';

export function persistenceModeLabel(mode: PersistenceAdapterId): string {
  if (mode === 'preview-localStorage') return 'preview-localStorage';
  if (mode === 'preview-database') return 'preview-database';
  return 'production-database';
}

export function connectionStatusLabel(
  status: 'available' | 'not_connected' | 'configured_not_connected' | 'not_configured',
): string {
  if (status === 'available') return 'Available';
  return 'Not connected';
}

export function lastSuccessfulSaveLabel(
  value: SafePersistenceSnapshot['lastSuccessfulSave'],
): string {
  return value === 'browser-only' ? 'This browser only' : 'None';
}

export function durabilityLabel(snapshot: SafePersistenceSnapshot): string {
  return snapshot.dataDurability === 'browser-only-non-durable'
    ? 'Stored only in this browser and non-durable'
    : 'Production blocked — not durable';
}

export function previewDatabaseHeadline(): string {
  return 'Preview database: Not connected';
}

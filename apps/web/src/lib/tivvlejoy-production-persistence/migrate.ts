import { sha256Canonical } from './hash';
import { PERSISTENCE_SCHEMA, type DurableWorkspaceView, type MigrationResult } from './types';

export const PERSISTENCE_SCHEMA_V2 = 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V2' as const;

export function inspectSchema(schemaVersion: string): MigrationResult {
  if (schemaVersion === PERSISTENCE_SCHEMA) return 'MIGRATION_NOT_REQUIRED';
  if (schemaVersion === PERSISTENCE_SCHEMA_V2) return 'MIGRATION_NOT_REQUIRED';
  if (schemaVersion === 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V0') return 'MIGRATION_AVAILABLE';
  if (/V[3-9]|FUTURE/.test(schemaVersion)) return 'UNSUPPORTED_FUTURE_SCHEMA';
  return 'MIGRATION_BLOCKED';
}

export function migrateWorkspace(view: DurableWorkspaceView, from: string, to: string): {
  result: MigrationResult;
  view: DurableWorkspaceView;
} {
  const status = inspectSchema(from);
  if (from === to) return { result: 'MIGRATION_NOT_REQUIRED', view };
  if (status === 'UNSUPPORTED_FUTURE_SCHEMA' || status === 'MIGRATION_BLOCKED') return { result: status, view };
  if (from === PERSISTENCE_SCHEMA && to === PERSISTENCE_SCHEMA_V2) {
    const migrated: DurableWorkspaceView = {
      ...view,
      records: view.records.map((record) => ({
        ...record,
        entityVersion: '2',
        payload: { ...record.payload, migratedTo: PERSISTENCE_SCHEMA_V2 },
      })),
      snapshotSha256: sha256Canonical({ from, to, sha: view.snapshotSha256 }),
    };
    return { result: 'MIGRATION_COMPLETE', view: migrated };
  }
  if (from === 'TIVVLEJOY_DURABLE_PRODUCTION_PERSISTENCE_V0' && to === PERSISTENCE_SCHEMA) {
    return {
      result: 'MIGRATION_COMPLETE',
      view: { ...view, snapshotSha256: sha256Canonical({ upgraded: view.snapshotSha256 }) },
    };
  }
  return { result: 'MIGRATION_BLOCKED', view };
}

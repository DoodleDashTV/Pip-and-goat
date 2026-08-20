import { evaluatePersistenceHealth } from './health';
import { persistSeasonInMemory } from './season-persist';
import { ProductionPersistenceStore } from './store';
import type { PersistenceHealth, PersistenceMode } from './types';

export type PersistenceConsoleModel = {
  schemaVersion: 'TIVVLEJOY_PERSISTENT_OPERATOR_CONTROL_ROOM_V1';
  mode: PersistenceMode;
  durable: 'YES' | 'NO';
  previewDatabase: 'CONNECTED' | 'NOT_CONNECTED' | 'ERROR';
  productionDatabase: 'NOT_CONNECTED' | 'CONNECTED';
  lastSuccessfulSave: string | null;
  workspaceRevision: number;
  latestSnapshotHash: string | null;
  journalEventCount: number;
  pendingWriteConflicts: number;
  recoveryStatus: string;
  backupAvailable: boolean;
  health: PersistenceHealth;
  detail: string;
  workspaceId: string;
  episodeCount: number;
  shotCount: number;
  jobCount: number;
  secretsVisible: false;
};

export function buildPersistenceConsoleModel(store: ProductionPersistenceStore): PersistenceConsoleModel {
  const health = evaluatePersistenceHealth(store);
  const snapshot = store.latestSnapshot();
  const records = store.listRecords();
  const events = store.listEvents();
  return {
    schemaVersion: 'TIVVLEJOY_PERSISTENT_OPERATOR_CONTROL_ROOM_V1',
    mode: store.getMode(),
    durable: store.durable ? 'YES' : 'NO',
    previewDatabase: health.previewDatabase,
    productionDatabase: 'NOT_CONNECTED',
    lastSuccessfulSave: events.at(-1)?.timestamp ?? null,
    workspaceRevision: store.getRevision(),
    latestSnapshotHash: snapshot?.snapshotSha256 ?? null,
    journalEventCount: store.listEvents().length,
    pendingWriteConflicts: store.conflictCount(),
    recoveryStatus: health.health === 'CORRUPT' ? 'UNSAFE' : health.health === 'CONFLICTED' ? 'CONFLICT' : 'LAST_VALID_REVISION_RECOVERABLE',
    backupAvailable: Boolean(snapshot),
    health: health.health,
    detail: health.detail,
    workspaceId: store.getWorkspaceId(),
    episodeCount: records.filter((record) => record.entityType === 'EPISODE').length,
    shotCount: records.filter((record) => record.entityType === 'SHOT').length,
    jobCount: records.filter((record) => record.entityType === 'PRODUCTION_JOB').length,
    secretsVisible: false,
  };
}

let cachedPreview: PersistenceConsoleModel | null = null;

export function buildPreviewPersistenceConsoleModel(): PersistenceConsoleModel {
  if (cachedPreview) return cachedPreview;
  const { store } = persistSeasonInMemory('ws_preview_control_room');
  cachedPreview = buildPersistenceConsoleModel(store);
  return cachedPreview;
}

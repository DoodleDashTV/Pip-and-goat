import { validateJournalSequence } from './journal';
import { ProductionPersistenceStore } from './store';
import { HEALTH_SCHEMA, type PersistenceHealthReport } from './types';

export function evaluatePersistenceHealth(store: ProductionPersistenceStore): PersistenceHealthReport {
  const events = store.readEvents();
  const journal = validateJournalSequence(events);
  const snapshot = store.latestSnapshot();
  const snapshotIntegrity = !snapshot || snapshot.snapshotSha256.length === 64;
  const revisionConsistent = !snapshot || snapshot.revision === store.serialize().revision;
  let health: PersistenceHealthReport['health'] = 'HEALTHY';
  let detail = 'adapter selected';
  let previewDatabase: PersistenceHealthReport['previewDatabase'] = 'NOT_CONNECTED';
  const productionDatabase: PersistenceHealthReport['productionDatabase'] = 'NOT_CONNECTED';

  if (store.mode === 'PRODUCTION_DATABASE') {
    health = 'UNAVAILABLE';
    detail = 'Production database is not connected';
  } else if (store.mode === 'PREVIEW_DATABASE' && !store.connected) {
    health = 'NOT_CONFIGURED';
    detail = 'PREVIEW_DATABASE NOT_CONNECTED';
  } else if (store.mode === 'PREVIEW_DATABASE' && store.connected) {
    previewDatabase = 'CONNECTED';
  }

  if (!journal.ok) {
    health = 'CORRUPT';
    detail = journal.reason;
  } else if (!snapshotIntegrity || !revisionConsistent) {
    health = 'CORRUPT';
    detail = 'snapshot or revision mismatch';
  } else if (store.conflictCount() > 0 && health === 'HEALTHY') {
    health = 'CONFLICTED';
    detail = `${store.conflictCount()} pending write conflict(s)`;
  } else if (store.mode === 'PREVIEW_MEMORY' && health === 'HEALTHY') {
    health = store.serialize().revision > 0 ? 'DEGRADED' : 'HEALTHY';
    detail = store.serialize().revision > 0 ? 'in-memory only; not durable across process restart unless exported' : 'empty memory adapter';
  }

  return {
    schemaVersion: HEALTH_SCHEMA,
    mode: store.mode,
    health,
    durable: store.durable,
    previewDatabase,
    productionDatabase,
    adapterSelected: store.mode,
    schemaCompatible: true,
    snapshotIntegrity,
    journalIntegrity: journal.ok,
    revisionConsistent,
    detail,
  };
}

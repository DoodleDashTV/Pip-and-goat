import {
  PersistenceError,
  PRODUCTION_ADAPTER_ID,
  type PersistenceSnapshot,
  type StudioPersistenceAdapter,
} from './types';

const BLOCKED =
  'Production persistence is not connected. Preview stays in this browser. No database, object store, or paid provider is opened.';

function blocked(): never {
  throw new PersistenceError(BLOCKED, 'PRODUCTION_PERSISTENCE_UNAVAILABLE');
}

const emptySnapshot = (): PersistenceSnapshot => ({
  adapterId: PRODUCTION_ADAPTER_ID,
  durable: false,
  settings: null,
  productions: [],
  episodes: [],
  assets: [],
  voices: [],
  workflows: [],
  readiness: null,
  renderRequests: [],
  auditEvents: [],
});

/**
 * Production database adapter boundary.
 *
 * This adapter never opens Prisma, never reads DATABASE_URL values, never
 * contacts object storage, and never spends. It exists so the studio can
 * later attach a real store without changing Preview localStorage.
 */
export function createProductionPersistenceAdapter(): StudioPersistenceAdapter {
  return {
    id: PRODUCTION_ADAPTER_ID,
    durable: false,
    assertWritable: blocked,
    readSnapshot() {
      return emptySnapshot();
    },
    writeAudit: blocked,
  };
}

export function assertProductionActionsBlocked(adapter: StudioPersistenceAdapter): void {
  expectBlocked(() => adapter.assertWritable());
  expectBlocked(() => adapter.writeAudit({
    workspaceId: 'x',
    action: 'connect',
    entityType: 'database',
    entityId: null,
    detail: {},
  }));
}

function expectBlocked(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof PersistenceError && error.code === 'PRODUCTION_PERSISTENCE_UNAVAILABLE') {
      return;
    }
    throw error;
  }
  throw new PersistenceError('Production adapter allowed a write.', 'PRODUCTION_WRITE_LEAK');
}

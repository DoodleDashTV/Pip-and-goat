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
 * contacts object storage, and never spends. Failed production writes are
 * not rewritten to localStorage.
 */
export function createProductionPersistenceAdapter(): StudioPersistenceAdapter {
  return {
    id: PRODUCTION_ADAPTER_ID,
    durable: false,
    connected: false,
    assertWritable: blocked,
    readSnapshot() {
      return emptySnapshot();
    },
    saveSettings: blocked,
    saveProduction: blocked,
    saveEpisode: blocked,
    saveAsset: blocked,
    saveVoice: blocked,
    saveWorkflow: blocked,
    saveReadiness: blocked,
    saveRenderRequest: blocked,
    writeAudit: blocked,
  };
}

export function assertProductionActionsBlocked(adapter: StudioPersistenceAdapter): void {
  expectBlocked(() => adapter.assertWritable());
  expectBlocked(() =>
    adapter.writeAudit({
      workspaceId: 'x',
      action: 'connect',
      entityType: 'database',
      entityId: null,
      detail: {},
    }),
  );
  expectBlocked(() =>
    adapter.saveEpisode({
      id: 'prv_ep_blocked',
      productionId: 'preview-production',
      title: 'Blocked',
      episodeNumber: 1,
      durationSec: 30,
      premise: 'Must fail closed.',
      classification: 'PREVIEW_NONCANONICAL',
      currentStage: 'BRIEF',
      completedStages: [],
    }),
  );
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

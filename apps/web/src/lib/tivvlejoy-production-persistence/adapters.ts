import { ProductionPersistenceStore, type StoreOptions } from './store';
import type { DurableWorkspaceView, PersistenceMode } from './types';

export type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function persistenceStorageKey(workspaceId: string): string {
  return `tivvlejoy.production-persistence.v1:${workspaceId}`;
}

export function createMemoryStore(overrides: Partial<StoreOptions> = {}): ProductionPersistenceStore {
  return new ProductionPersistenceStore({ mode: 'PREVIEW_MEMORY', ...overrides });
}

export function createMemoryPersistenceStore(workspaceId = 'ws_preview_season1'): ProductionPersistenceStore {
  return createMemoryStore({ workspaceId });
}

export function hydrateStoreFromJson(
  json: string,
  mode: PersistenceMode,
  workspaceId?: string,
): ProductionPersistenceStore {
  const view = JSON.parse(json) as DurableWorkspaceView;
  const store = new ProductionPersistenceStore({
    mode,
    workspaceId: workspaceId ?? view.workspaceId,
  });
  store.replaceState(view);
  return store;
}

export function createBrowserStore(storage: BrowserStorage, overrides: Partial<StoreOptions> = {}): ProductionPersistenceStore {
  const store = new ProductionPersistenceStore({ mode: 'PREVIEW_BROWSER', ...overrides });
  const raw = storage.getItem(persistenceStorageKey(store.workspaceId));
  if (raw) store.replaceState(JSON.parse(raw) as DurableWorkspaceView);
  return store;
}

export function persistBrowserStore(store: ProductionPersistenceStore, storage: BrowserStorage): void {
  storage.setItem(persistenceStorageKey(store.workspaceId), JSON.stringify(store.serialize()));
}

export function createFileStore(directory: Map<string, string>, overrides: Partial<StoreOptions> = {}): ProductionPersistenceStore {
  const store = new ProductionPersistenceStore({ mode: 'PREVIEW_BROWSER', ...overrides, workspaceId: overrides.workspaceId ?? 'ws_preview_season1' });
  const key = persistenceStorageKey(store.workspaceId);
  const raw = directory.get(key);
  if (raw) store.replaceState(JSON.parse(raw) as DurableWorkspaceView);
  return store;
}

export function persistFileStore(store: ProductionPersistenceStore, directory: Map<string, string>): void {
  directory.set(persistenceStorageKey(store.workspaceId), JSON.stringify(store.serialize()));
}

export function createPreviewDatabaseStore(configured: boolean, overrides: Partial<StoreOptions> = {}): ProductionPersistenceStore {
  return new ProductionPersistenceStore({ mode: 'PREVIEW_DATABASE', configured, ...overrides });
}

export function createProductionDatabaseStore(overrides: Partial<StoreOptions> = {}): ProductionPersistenceStore {
  return new ProductionPersistenceStore({ mode: 'PRODUCTION_DATABASE', configured: false, ...overrides });
}

export function selectPersistenceMode(input: {
  prefer?: PersistenceMode;
  previewDatabaseConfigured?: boolean;
  productionDatabaseConfigured?: boolean;
}): PersistenceMode {
  if (input.prefer === 'PRODUCTION_DATABASE') {
    return input.productionDatabaseConfigured ? 'PRODUCTION_DATABASE' : 'PREVIEW_MEMORY';
  }
  if (input.prefer === 'PREVIEW_DATABASE') return 'PREVIEW_DATABASE';
  if (input.prefer === 'PREVIEW_BROWSER') return 'PREVIEW_BROWSER';
  return input.prefer ?? 'PREVIEW_MEMORY';
}

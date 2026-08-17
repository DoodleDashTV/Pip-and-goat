import type { PreviewStoreBackend } from '../preview-workspace/types';
import { resolveSelectedPersistenceMode, type PersistenceEnv } from './env';
import { createPreviewPersistenceAdapter } from './preview-adapter';
import { createPreviewDatabaseAdapter } from './preview-database-adapter';
import { createProductionPersistenceAdapter } from './production-adapter';
import {
  PREVIEW_ADAPTER_ID,
  PREVIEW_DATABASE_ADAPTER_ID,
  PRODUCTION_ADAPTER_ID,
  type StudioPersistenceAdapter,
} from './types';

export function resolvePersistenceAdapter(
  backend: PreviewStoreBackend,
  env: PersistenceEnv = process.env,
): StudioPersistenceAdapter {
  const selected = resolveSelectedPersistenceMode(env);
  if (selected === PRODUCTION_ADAPTER_ID) {
    return createProductionPersistenceAdapter();
  }
  if (selected === PREVIEW_DATABASE_ADAPTER_ID) {
    // Explicit preview-database mode without a provided in-process store stays
    // disconnected. Callers must not rewrite those failures to localStorage.
    return createPreviewDatabaseAdapter();
  }
  void PREVIEW_ADAPTER_ID;
  return createPreviewPersistenceAdapter(backend);
}

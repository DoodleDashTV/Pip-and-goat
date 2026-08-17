import type { PreviewStoreBackend } from '../preview-workspace/types';
import { validatePersistenceEnvironment, type PersistenceEnv } from './env';
import { createPreviewPersistenceAdapter } from './preview-adapter';
import { createProductionPersistenceAdapter } from './production-adapter';
import type { StudioPersistenceAdapter } from './types';

export function resolvePersistenceAdapter(
  backend: PreviewStoreBackend,
  env: PersistenceEnv = process.env,
): StudioPersistenceAdapter {
  const validation = validatePersistenceEnvironment(env);
  if (validation.preview) {
    return createPreviewPersistenceAdapter(backend);
  }
  // Production configuration may be present, but this increment never connects.
  return createProductionPersistenceAdapter();
}

import { describeSceneryStorageConfiguration } from './config';
import { hydrateIntakeStore } from './durable-state';
import { createConfiguredMultipartStorage } from './r2-multipart';

export async function hydratePreviewIntakeStoreSafely(
  env: Record<string, string | undefined> = process.env,
): Promise<{ hydrated: boolean; manifests: number; reason: string }> {
  const config = describeSceneryStorageConfiguration(env);
  if (!config.configured) {
    return {
      hydrated: false,
      manifests: 0,
      reason: 'Private storage is not configured in this process.',
    };
  }
  try {
    const storage = await createConfiguredMultipartStorage(env);
    const result = await hydrateIntakeStore(storage, env);
    return {
      hydrated: true,
      manifests: result.manifests,
      reason: 'Preview intake manifests were hydrated from private storage metadata.',
    };
  } catch {
    return {
      hydrated: false,
      manifests: 0,
      reason: 'Private storage could not be read safely. Inspection results were not invented.',
    };
  }
}

import { DEFAULT_SCENERY_ASSET_PREFIX, publicSceneryStorageConfiguration } from './intake/config';

export const SCENERY_STORAGE_ENV = {
  provider: 'OBJECT_STORAGE_PROVIDER',
  bucket: 'OBJECT_STORAGE_BUCKET',
  endpoint: 'OBJECT_STORAGE_ENDPOINT',
  region: 'OBJECT_STORAGE_REGION',
  accessKeyId: 'OBJECT_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  r2Bucket: 'R2_BUCKET',
  r2Endpoint: 'R2_ENDPOINT',
  r2AccessKeyId: 'R2_ACCESS_KEY_ID',
  r2SecretAccessKey: 'R2_SECRET_ACCESS_KEY',
  prefix: 'TIVVLEJOY_SCENERY_ASSET_PREFIX',
} as const;

export const SCENERY_STORAGE_PREFIX = DEFAULT_SCENERY_ASSET_PREFIX;

export const SCENERY_STORAGE_LAYOUT = [
  'source',
  'quarantine',
  'inspection',
  'normalized',
  'proxies',
  'previews',
  'catalogs',
  'scenes',
  'licenses',
  'reports',
  'validation',
] as const;

export function sceneryStorageUri(kind: (typeof SCENERY_STORAGE_LAYOUT)[number], rest = ''): string {
  const suffix = rest ? `/${rest.replace(/^\/+/, '')}` : '';
  return `${SCENERY_STORAGE_PREFIX}/${kind}${suffix}`;
}

export function localMaterializationPath(kind: (typeof SCENERY_STORAGE_LAYOUT)[number], rest = ''): string {
  return sceneryStorageUri(kind, rest);
}

export function publicSceneryStoragePolicy(env: Record<string, string | undefined> = process.env) {
  const configuration = publicSceneryStorageConfiguration(env);
  return {
    title: 'Existing private R2 durable storage',
    gitPolicy: 'Purchased binaries stay out of normal Git history.',
    prefix: configuration.prefix,
    layout: SCENERY_STORAGE_LAYOUT,
    envPlaceholders: Object.values(SCENERY_STORAGE_ENV),
    secretsPresent: false,
    connected: false,
    configurationStatus: configuration.state,
    reusedExistingProvider: configuration.reusedExistingProvider,
    bucketPresent: configuration.bucketPresent,
    message: configuration.message,
  };
}

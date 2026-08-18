export const SCENERY_STORAGE_ENV = {
  bucket: 'TIVVLEJOY_SCENERY_ASSET_BUCKET',
  endpoint: 'TIVVLEJOY_SCENERY_ASSET_ENDPOINT',
  region: 'TIVVLEJOY_SCENERY_ASSET_REGION',
  accessKeyId: 'TIVVLEJOY_SCENERY_ASSET_ACCESS_KEY_ID',
  secretAccessKey: 'TIVVLEJOY_SCENERY_ASSET_SECRET_ACCESS_KEY',
} as const;

export const SCENERY_STORAGE_PREFIX = 'tivvlejoy-assets';

export const SCENERY_STORAGE_LAYOUT = [
  'source',
  'normalized',
  'proxies',
  'previews',
  'catalogs',
  'scenes',
  'licenses',
  'validation',
] as const;

export function sceneryStorageUri(kind: (typeof SCENERY_STORAGE_LAYOUT)[number], rest = ''): string {
  const suffix = rest ? `/${rest.replace(/^\/+/, '')}` : '';
  return `${SCENERY_STORAGE_PREFIX}/${kind}${suffix}`;
}

export function localMaterializationPath(kind: (typeof SCENERY_STORAGE_LAYOUT)[number], rest = ''): string {
  return sceneryStorageUri(kind, rest);
}

export function publicSceneryStoragePolicy() {
  return {
    title: 'Durable private object storage',
    gitPolicy: 'Purchased binaries stay out of normal Git history.',
    prefix: SCENERY_STORAGE_PREFIX,
    layout: SCENERY_STORAGE_LAYOUT,
    envPlaceholders: Object.values(SCENERY_STORAGE_ENV),
    secretsPresent: false,
    connected: false,
  };
}

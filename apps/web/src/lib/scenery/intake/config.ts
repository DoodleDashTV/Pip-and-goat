import {
  describeObjectStorageStatus,
  resolveObjectStorageConfig,
  type ObjectStorageConfig,
} from '@doodle-dash/shared';
import { resolveIntakeLimits, type SceneryIntakeLimits } from './limits';

export const DEFAULT_SCENERY_ASSET_PREFIX = 'tivvlejoy-assets';

export const SCENERY_INTAKE_SCHEMA_VERSION = 'TIVVLEJOY_SCENERY_ASSET_INTAKE_V1';

export const REUSED_STORAGE_ENV_NAMES = [
  'OBJECT_STORAGE_PROVIDER',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_FORCE_PATH_STYLE',
  'R2_ENDPOINT',
  'R2_REGION',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

export const SCENERY_PREFIX_ENV_NAMES = [
  'TIVVLEJOY_SCENERY_ASSET_PREFIX',
  'TIVVLEJOY_SCENERY_SIGNED_TTL_SECONDS',
  'TIVVLEJOY_SCENERY_MAX_UPLOAD_BYTES',
  'TIVVLEJOY_SCENERY_MULTIPART_PART_BYTES',
  'TIVVLEJOY_SCENERY_MAX_CONCURRENT_PARTS',
  'TIVVLEJOY_SCENERY_MAX_RETRIES',
] as const;

export const OPTIONAL_SCENERY_OVERRIDE_ENV_NAMES = [
  'TIVVLEJOY_SCENERY_ASSET_BUCKET',
  'TIVVLEJOY_SCENERY_ASSET_ENDPOINT',
  'TIVVLEJOY_SCENERY_ASSET_REGION',
  'TIVVLEJOY_SCENERY_ASSET_ACCESS_KEY_ID',
  'TIVVLEJOY_SCENERY_ASSET_SECRET_ACCESS_KEY',
] as const;

export const STORAGE_CONFIG_STATES = [
  'configured',
  'partially_configured',
  'unavailable',
  'invalid',
] as const;
export type StorageConfigState = (typeof STORAGE_CONFIG_STATES)[number];

const SECRET_ENV_NAMES = new Set([
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ACCESS_KEY_ID',
  'TIVVLEJOY_SCENERY_ASSET_SECRET_ACCESS_KEY',
  'TIVVLEJOY_SCENERY_ASSET_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
]);

function present(env: Record<string, string | undefined>, name: string): boolean {
  return Boolean(env[name] && String(env[name]).trim());
}

function firstPresent(env: Record<string, string | undefined>, names: string[]): string | null {
  for (const name of names) {
    if (present(env, name)) return name;
  }
  return null;
}

export function sceneryStorageEnvForResolver(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  return {
    ...env,
    OBJECT_STORAGE_PROVIDER: env.OBJECT_STORAGE_PROVIDER || (present(env, 'R2_BUCKET') ? 'r2' : env.OBJECT_STORAGE_PROVIDER),
    OBJECT_STORAGE_BUCKET: env.OBJECT_STORAGE_BUCKET || env.R2_BUCKET || env.TIVVLEJOY_SCENERY_ASSET_BUCKET,
    OBJECT_STORAGE_ENDPOINT: env.OBJECT_STORAGE_ENDPOINT || env.R2_ENDPOINT || env.TIVVLEJOY_SCENERY_ASSET_ENDPOINT,
    OBJECT_STORAGE_REGION:
      env.OBJECT_STORAGE_REGION || env.R2_REGION || env.TIVVLEJOY_SCENERY_ASSET_REGION || env.AWS_REGION,
    OBJECT_STORAGE_ACCESS_KEY_ID:
      env.OBJECT_STORAGE_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || env.TIVVLEJOY_SCENERY_ASSET_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY:
      env.OBJECT_STORAGE_SECRET_ACCESS_KEY ||
      env.R2_SECRET_ACCESS_KEY ||
      env.TIVVLEJOY_SCENERY_ASSET_SECRET_ACCESS_KEY,
  };
}

export function resolveSceneryAssetPrefix(env: Record<string, string | undefined> = process.env): string {
  const configured = env.TIVVLEJOY_SCENERY_ASSET_PREFIX?.trim();
  return (configured || DEFAULT_SCENERY_ASSET_PREFIX).replace(/^\/+|\/+$/g, '');
}

export type SceneryStorageConfiguration = {
  schemaVersion: typeof SCENERY_INTAKE_SCHEMA_VERSION;
  state: StorageConfigState;
  configured: boolean;
  durable: boolean;
  provider: string;
  bucketPresent: boolean;
  endpointPresent: boolean;
  region: string | null;
  prefix: string;
  reusedExistingProvider: boolean;
  secretNamesPresent: string[];
  missingNames: string[];
  message: string;
  requiredPrivateSetup: string[];
  limits: SceneryIntakeLimits;
};

function classifyState(input: {
  provider: string;
  bucket: boolean;
  endpoint: boolean;
  access: boolean;
  secret: boolean;
  invalid?: boolean;
}): StorageConfigState {
  if (input.invalid) return 'invalid';
  const durableBits = [input.bucket, input.endpoint, input.access, input.secret];
  const presentCount = durableBits.filter(Boolean).length;
  if (presentCount === 0 && (input.provider === 'local' || input.provider === 'none' || input.provider === 'missing' || !input.provider)) {
    return 'unavailable';
  }
  if (presentCount === 4) return 'configured';
  if (presentCount > 0) return 'partially_configured';
  return 'unavailable';
}

export function describeSceneryStorageConfiguration(
  env: Record<string, string | undefined> = process.env,
): SceneryStorageConfiguration {
  const resolvedEnv = sceneryStorageEnvForResolver(env);
  const bucketPresent = Boolean(
    firstPresent(env, ['OBJECT_STORAGE_BUCKET', 'R2_BUCKET', 'TIVVLEJOY_SCENERY_ASSET_BUCKET']),
  );
  const endpointPresent = Boolean(
    firstPresent(env, ['OBJECT_STORAGE_ENDPOINT', 'R2_ENDPOINT', 'TIVVLEJOY_SCENERY_ASSET_ENDPOINT']),
  );
  const accessPresent = Boolean(
    firstPresent(env, ['OBJECT_STORAGE_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID', 'TIVVLEJOY_SCENERY_ASSET_ACCESS_KEY_ID']),
  );
  const secretPresent = Boolean(
    firstPresent(env, [
      'OBJECT_STORAGE_SECRET_ACCESS_KEY',
      'R2_SECRET_ACCESS_KEY',
      'TIVVLEJOY_SCENERY_ASSET_SECRET_ACCESS_KEY',
    ]),
  );
  const secretNamesPresent = [
    accessPresent ? 'ACCESS_KEY_ID' : '',
    secretPresent ? 'SECRET_ACCESS_KEY' : '',
  ].filter(Boolean);
  const missingNames = [
    !bucketPresent ? 'OBJECT_STORAGE_BUCKET or R2_BUCKET' : '',
    !endpointPresent ? 'OBJECT_STORAGE_ENDPOINT or R2_ENDPOINT' : '',
    !accessPresent ? 'OBJECT_STORAGE_ACCESS_KEY_ID or R2_ACCESS_KEY_ID' : '',
    !secretPresent ? 'OBJECT_STORAGE_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY' : '',
  ].filter(Boolean);

  let objectConfig: ObjectStorageConfig | null = null;
  let invalidMessage: string | null = null;
  let incompleteDurable = false;
  try {
    objectConfig = resolveObjectStorageConfig(resolvedEnv);
  } catch (error) {
    const message = (error as Error).message;
    if (/incomplete|Refusing silent local fallback/i.test(message) && (bucketPresent || endpointPresent || accessPresent || secretPresent)) {
      incompleteDurable = true;
    } else {
      invalidMessage = message;
    }
  }

  const provider = objectConfig?.provider ?? resolvedEnv.OBJECT_STORAGE_PROVIDER ?? 'unavailable';
  const state = classifyState({
    provider,
    bucket: bucketPresent,
    endpoint: endpointPresent,
    access: accessPresent,
    secret: secretPresent,
    invalid: Boolean(invalidMessage) && !incompleteDurable,
  });
  const reusedExistingProvider = Boolean(
    firstPresent(env, ['OBJECT_STORAGE_BUCKET', 'R2_BUCKET', 'OBJECT_STORAGE_PROVIDER', 'R2_ENDPOINT']),
  );

  const messages: Record<StorageConfigState, string> = {
    configured:
      'Existing private R2 / S3-compatible credentials are present. Bucket reachability has not been proven in this process.',
    partially_configured:
      'Some existing storage variables are present, but the durable scenery connection is incomplete.',
    unavailable:
      'Existing R2 / OBJECT_STORAGE credentials are not available in this environment. Intake is connection-ready only.',
    invalid: invalidMessage ?? 'Storage configuration is invalid. Credential values were not printed.',
  };

  return {
    schemaVersion: SCENERY_INTAKE_SCHEMA_VERSION,
    state,
    configured: state === 'configured',
    durable: state === 'configured' && provider === 's3',
    provider,
    bucketPresent,
    endpointPresent,
    region: objectConfig && objectConfig.provider === 's3' ? objectConfig.region : null,
    prefix: resolveSceneryAssetPrefix(env),
    reusedExistingProvider,
    secretNamesPresent,
    missingNames,
    message: messages[state],
    requiredPrivateSetup: [
      'Reuse the existing private R2 bucket. Do not create a second provider.',
      'Set OBJECT_STORAGE_PROVIDER=r2 or leave R2_* aliases in place.',
      'Set OBJECT_STORAGE_BUCKET or R2_BUCKET privately.',
      'Set OBJECT_STORAGE_ENDPOINT or R2_ENDPOINT privately.',
      'Set OBJECT_STORAGE_ACCESS_KEY_ID or R2_ACCESS_KEY_ID privately.',
      'Set OBJECT_STORAGE_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY privately.',
      `Optional prefix override: TIVVLEJOY_SCENERY_ASSET_PREFIX=${DEFAULT_SCENERY_ASSET_PREFIX}`,
    ],
    limits: resolveIntakeLimits(env),
  };
}

export function publicSceneryStorageConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const config = describeSceneryStorageConfiguration(env);
  const status = describeObjectStorageStatus({ env: sceneryStorageEnvForResolver(env) });
  return {
    schemaVersion: config.schemaVersion,
    state: config.state,
    configured: config.configured,
    durable: config.durable,
    provider: config.provider,
    bucketPresent: config.bucketPresent,
    endpointPresent: config.endpointPresent,
    region: config.region,
    prefix: config.prefix,
    reusedExistingProvider: config.reusedExistingProvider,
    secretNamesPresent: config.secretNamesPresent,
    missingNames: config.missingNames,
    message: config.message,
    requiredPrivateSetup: config.requiredPrivateSetup,
    banner: status.banner,
    writable: status.writable,
    readable: status.readable,
    limits: {
      maxUploadBytes: config.limits.maxUploadBytes,
      maxConcurrentParts: config.limits.maxConcurrentParts,
      multipartPartBytes: config.limits.multipartPartBytes,
      maxRetries: config.limits.maxRetries,
      signedOperationTtlSeconds: config.limits.signedOperationTtlSeconds,
      maxInspectionConcurrency: config.limits.maxInspectionConcurrency,
      maxMaterializedBytesPerJob: config.limits.maxMaterializedBytesPerJob,
    },
  };
}

export function assertNoSecretLeak(text: string, env: Record<string, string | undefined> = process.env): void {
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (value && value.trim() && text.includes(value)) {
      throw new Error('Refusing to emit storage credential contents.');
    }
  }
}

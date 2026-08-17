import {
  PREVIEW_ADAPTER_ID,
  PREVIEW_DATABASE_ADAPTER_ID,
  PRODUCTION_ADAPTER_ID,
  type PersistenceAdapterId,
  type ProviderMode,
  type SafePersistenceSnapshot,
  type StudioRuntimeMode,
} from './types';

const SECRET_ENV_NAMES = [
  'DATABASE_URL',
  'DURABLE_STORAGE_SECRET_ACCESS_KEY',
  'DURABLE_STORAGE_ACCESS_KEY_ID',
  'VOICE_PROVIDER_API_KEY',
  'ELEVENLABS_API_KEY',
  'RUNPOD_API_KEY',
  'R2_SECRET_ACCESS_KEY',
] as const;

const INSECURE_URL_RE = /[a-z]+:\/\/[^/\s:]+:[^/\s@]+@/i;
const TOKEN_RE = /\b(?:sk-|rpa_|ghp_|github_pat_)[A-Za-z0-9._-]{8,}\b/;

export type PersistenceEnv = Partial<Record<string, string | undefined>>;

export type EnvironmentCheck = {
  name: string;
  present: boolean;
  configured: boolean;
  reason: string;
};

export type EnvironmentValidation = {
  mode: StudioRuntimeMode;
  providerMode: ProviderMode;
  preview: boolean;
  previewDatabaseConnectAuthorized: false;
  productionConnectAuthorized: false;
  selectedPersistenceMode: PersistenceAdapterId;
  activePersistenceMode: PersistenceAdapterId;
  checks: EnvironmentCheck[];
  safe: SafePersistenceSnapshot;
};

function read(env: PersistenceEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

export function redactSecrets(text: string): string {
  let out = String(text ?? '');
  out = out.replace(INSECURE_URL_RE, (match) => `${match.split('://')[0]}://[REDACTED]@`);
  out = out.replace(TOKEN_RE, '[REDACTED]');
  out = out.replace(/(password|token|secret|api[_-]?key|database_url)\s*[:=]\s*\S+/gi, '$1=[REDACTED]');
  return out;
}

export function envHasSecretName(name: string): boolean {
  return (SECRET_ENV_NAMES as readonly string[]).includes(name);
}

function presence(env: PersistenceEnv, name: string, reasonWhenMissing: string): EnvironmentCheck {
  const value = read(env, name);
  return {
    name,
    present: Boolean(value),
    configured: Boolean(value),
    reason: value ? 'present (value not returned)' : reasonWhenMissing,
  };
}

function resolveProviderMode(env: PersistenceEnv): ProviderMode {
  const raw = read(env, 'PROVIDER_MODE').toLowerCase();
  if (raw === 'production' || raw === 'local' || raw === 'preview') return raw;
  return read(env, 'DATABASE_URL') ? 'local' : 'preview';
}

export function resolveSelectedPersistenceMode(env: PersistenceEnv): PersistenceAdapterId {
  const raw = read(env, 'TIVVLEJOY_PERSISTENCE_MODE');
  if (raw === PREVIEW_ADAPTER_ID || raw === PREVIEW_DATABASE_ADAPTER_ID || raw === PRODUCTION_ADAPTER_ID) {
    return raw;
  }
  return read(env, 'DATABASE_URL') ? PRODUCTION_ADAPTER_ID : PREVIEW_ADAPTER_ID;
}

export function isPreviewDatabaseExplicitlyConfigured(env: PersistenceEnv): boolean {
  return (
    resolveSelectedPersistenceMode(env) === PREVIEW_DATABASE_ADAPTER_ID &&
    read(env, 'TIVVLEJOY_PREVIEW_DATABASE_CONNECT') === '1'
  );
}

export function validatePersistenceEnvironment(
  env: PersistenceEnv = process.env,
): EnvironmentValidation {
  const database = presence(env, 'DATABASE_URL', 'absent — public Preview stays browser-only');
  const bucket = presence(env, 'DURABLE_STORAGE_BUCKET', 'absent — durable object storage is not configured');
  const endpoint = presence(env, 'DURABLE_STORAGE_ENDPOINT', 'absent — durable object storage is not configured');
  const region = presence(env, 'DURABLE_STORAGE_REGION', 'absent — durable object storage is not configured');
  const accessKey = presence(
    env,
    'DURABLE_STORAGE_ACCESS_KEY_ID',
    'absent — durable object storage credentials are not configured',
  );
  const secretKey = presence(
    env,
    'DURABLE_STORAGE_SECRET_ACCESS_KEY',
    'absent — durable object storage credentials are not configured',
  );
  const providerMode = resolveProviderMode(env);
  const connectFlag = read(env, 'TIVVLEJOY_CONNECT_PRODUCTION');
  const preview = !database.present;
  const storageConfigured =
    bucket.configured && endpoint.configured && region.configured && accessKey.configured && secretKey.configured;
  const selectedPersistenceMode = resolveSelectedPersistenceMode(env);
  const previewDatabaseExplicit = isPreviewDatabaseExplicitlyConfigured(env);

  // Never authorize a live Preview or production database connection in this increment.
  const productionConnectAuthorized = false as const;
  const previewDatabaseConnectAuthorized = false as const;
  void connectFlag;

  const mode: StudioRuntimeMode = preview
    ? 'preview'
    : storageConfigured && providerMode === 'production'
      ? 'production-ready'
      : 'production-incomplete';

  const activePersistenceMode: PersistenceAdapterId =
    selectedPersistenceMode === PRODUCTION_ADAPTER_ID ? PRODUCTION_ADAPTER_ID : PREVIEW_ADAPTER_ID;

  const safe: SafePersistenceSnapshot = {
    mode: preview ? 'preview' : mode === 'production-ready' ? 'production-incomplete' : mode,
    selectedPersistenceMode,
    activePersistenceMode,
    previewWorkspace: 'available',
    browserStorage: 'available',
    previewDatabase: previewDatabaseExplicit ? 'configured_not_connected' : 'not_connected',
    productionDatabase: database.present || selectedPersistenceMode === PRODUCTION_ADAPTER_ID
      ? 'configured_not_connected'
      : 'not_connected',
    durableStorage: storageConfigured ? 'configured_not_connected' : 'not_configured',
    backupAvailable: true,
    lastSuccessfulSave: selectedPersistenceMode === PRODUCTION_ADAPTER_ID ? null : 'browser-only',
    providerMode: preview ? 'preview' : providerMode === 'production' ? 'local' : providerMode,
    dataDurability: 'browser-only-non-durable',
    productionActions: 'blocked',
  };

  return {
    mode: safe.mode,
    providerMode: safe.providerMode,
    preview,
    previewDatabaseConnectAuthorized,
    productionConnectAuthorized,
    selectedPersistenceMode,
    activePersistenceMode,
    checks: [database, bucket, endpoint, region, accessKey, secretKey],
    safe,
  };
}

export function readSafePersistenceSnapshot(
  env: PersistenceEnv = process.env,
): SafePersistenceSnapshot {
  return validatePersistenceEnvironment(env).safe;
}

export function assertNoSecretLeak(payload: unknown): void {
  const text = redactSecrets(JSON.stringify(payload));
  if (INSECURE_URL_RE.test(JSON.stringify(payload))) {
    throw new Error('Secret leakage refused: credential URL.');
  }
  if (TOKEN_RE.test(JSON.stringify(payload))) {
    throw new Error('Secret leakage refused: token-shaped value.');
  }
  void text;
}

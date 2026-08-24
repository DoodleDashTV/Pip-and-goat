import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
  type ObjectStorage,
} from '@doodle-dash/shared';
import type { GoatV4AuthorizationReceipt } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-v4-authorization';

export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-goat-paid-execution-v4');
export const AUTHORIZATION_FILE = path.join(OUT_DIR, 'authorization.json');
export const PREFLIGHT_FILE = path.join(OUT_DIR, 'preflight.json');
export const LAUNCH_FILE = path.join(OUT_DIR, 'launch.json');
export const FINAL_REPORT_FILE = path.join(OUT_DIR, 'final-report.json');

export function ensureOutputDir(): void {
  mkdirSync(OUT_DIR, { recursive: true });
}

export function writeJson(file: string, value: unknown): void {
  ensureOutputDir();
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readIssuedAuthorization(): GoatV4AuthorizationReceipt {
  if (!existsSync(AUTHORIZATION_FILE)) throw new Error('V4_AUTHORIZATION_NOT_ISSUED');
  const value = readJson<GoatV4AuthorizationReceipt>(AUTHORIZATION_FILE);
  if (value.authorizationName !== 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4') {
    throw new Error('V4_AUTHORIZATION_NAME_MISMATCH');
  }
  return value;
}

export function makeStorage(): ObjectStorage {
  const env = { ...process.env } as Record<string, string | undefined>;
  if (!env.OBJECT_STORAGE_PROVIDER && (env.R2_BUCKET || env.OBJECT_STORAGE_BUCKET)) {
    env.OBJECT_STORAGE_PROVIDER = 'r2';
  }
  const config = resolveObjectStorageConfig(env);
  if (config.provider !== 's3') throw new Error('DURABLE_R2_NOT_CONFIGURED');
  return createObjectStorageFromConfig(config);
}

export function credentialPresence(env: Record<string, string | undefined> = process.env) {
  return {
    runpodApiKeyPresent: Boolean(env.RUNPOD_API_KEY),
    r2BucketPresent: Boolean(env.R2_BUCKET || env.OBJECT_STORAGE_BUCKET),
    r2EndpointPresent: Boolean(env.R2_ENDPOINT || env.OBJECT_STORAGE_ENDPOINT),
    r2AccessKeyPresent: Boolean(env.R2_ACCESS_KEY_ID || env.OBJECT_STORAGE_ACCESS_KEY_ID),
    r2SecretPresent: Boolean(env.R2_SECRET_ACCESS_KEY || env.OBJECT_STORAGE_SECRET_ACCESS_KEY),
    allowPaidGpuLaunch: env.ALLOW_PAID_GPU_LAUNCH === 'true',
    cloudRenderEnabled: env.CLOUD_RENDER_ENABLED === 'true',
  };
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/ghcr\.io\/[^/]+\//g, 'ghcr.io/<org>/')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:token|X-Amz-Signature)=)[^&\s]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|password|apiKey|accessKey/i.test(key)) {
        out[key] = typeof nested === 'boolean' ? nested : '[REDACTED]';
      } else {
        out[key] = redact(nested);
      }
    }
    return out;
  }
  return value;
}

export function activePod(pod: { desiredStatus?: string | null; costPerHr?: number | null }): boolean {
  const status = String(pod.desiredStatus || '').toUpperCase();
  return !['', 'EXITED', 'TERMINATED', 'DEAD'].includes(status) || Number(pod.costPerHr || 0) > 0;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}MS`)), ms);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

export async function readJsonKey(storage: ObjectStorage, key: string): Promise<any | null> {
  try {
    if (!storage.readObject) throw new Error('STORAGE_READ_UNAVAILABLE');
    if (storage.exists && !(await withTimeout(storage.exists(key), 15_000, 'R2_EXISTS'))) return null;
    const bytes = await withTimeout(storage.readObject(key), 30_000, 'R2_READ');
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return null;
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

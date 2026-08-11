import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AppError, assertSafePath } from './errors';

/** Logical durable prefixes for production binaries. */
export type StorageCategory =
  | 'canonical-references'
  | 'character-models'
  | 'textures'
  | 'rigs'
  | 'facial-maps'
  | 'environments'
  | 'props'
  | 'voices'
  | 'audio'
  | 'draft-renders'
  | 'final-renders'
  | 'captions'
  | 'thumbnails'
  | 'reports'
  | 'manifests'
  | 'worker-tests'
  // Legacy aliases (still accepted; mapped to durable prefixes)
  | 'original_uploads'
  | 'approved_assets'
  | 'working_files'
  | 'draft_renders'
  | 'final_renders'
  | 'worker_tests';

export const DURABLE_STORAGE_PREFIXES = [
  'canonical-references',
  'character-models',
  'textures',
  'rigs',
  'facial-maps',
  'environments',
  'props',
  'voices',
  'audio',
  'draft-renders',
  'final-renders',
  'captions',
  'thumbnails',
  'reports',
  'manifests',
  'worker-tests',
] as const;

export interface ObjectStorage {
  readonly providerName: string;
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<string>;
  getObjectUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  exists?(key: string): Promise<boolean>;
  readObject?(key: string): Promise<Uint8Array>;
}

export type ObjectStorageConfig =
  | { provider: 'none' | 'missing' }
  | { provider: 'local'; root: string }
  | {
      provider: 's3';
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl?: string;
      forcePathStyle: boolean;
    };

export function normalizeStorageCategory(category: StorageCategory | string): string {
  const map: Record<string, string> = {
    original_uploads: 'canonical-references',
    approved_assets: 'canonical-references',
    working_files: 'character-models',
    draft_renders: 'draft-renders',
    final_renders: 'final-renders',
    worker_tests: 'worker-tests',
  };
  return map[category] ?? category;
}

export function storageKeyFor(
  category: StorageCategory | string,
  parts: Array<string | number>,
): string {
  const prefix = normalizeStorageCategory(category);
  const cleaned = parts
    .map((p) => String(p).replace(/[^A-Za-z0-9._@+-]+/g, '_'))
    .filter(Boolean);
  return [prefix, ...cleaned].join('/');
}

export function resolveObjectStorageConfig(
  env: Record<string, string | undefined> = process.env,
): ObjectStorageConfig {
  const provider = (env.OBJECT_STORAGE_PROVIDER ?? 'local').toLowerCase();
  if (provider === 'none' || provider === 'missing') {
    return { provider: provider as 'none' | 'missing' };
  }
  if (provider === 'local') {
    return {
      provider: 'local',
      root: env.OBJECT_STORAGE_ROOT || `${process.cwd()}/.doodle-dash-storage`,
    };
  }
  if (provider === 's3' || provider === 'r2' || provider === 'b2' || provider === 'minio') {
    const bucket = env.OBJECT_STORAGE_BUCKET ?? '';
    const accessKeyId =
      env.OBJECT_STORAGE_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? '';
    const secretAccessKey =
      env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '';
    const region =
      env.OBJECT_STORAGE_REGION ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'auto';
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new AppError(
        'OBJECT_STORAGE_PROVIDER is set to an S3-compatible mode, but OBJECT_STORAGE_BUCKET / ACCESS_KEY / SECRET_ACCESS_KEY are incomplete. Refusing silent local fallback.',
        'STORAGE_MISCONFIGURED',
        501,
      );
    }
    return {
      provider: 's3',
      bucket,
      region,
      endpoint: env.OBJECT_STORAGE_ENDPOINT || undefined,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl: env.OBJECT_STORAGE_PUBLIC_BASE_URL || undefined,
      forcePathStyle:
        String(env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? '').toLowerCase() === 'true' ||
        Boolean(env.OBJECT_STORAGE_ENDPOINT),
    };
  }
  throw new AppError(
    `Unknown OBJECT_STORAGE_PROVIDER="${provider}". Use local | s3 | r2 | b2 | minio | none.`,
    'STORAGE_MISCONFIGURED',
    501,
  );
}

export class MissingObjectStorage implements ObjectStorage {
  readonly providerName = 'missing';
  async putObject(): Promise<string> {
    throw new AppError(
      'Object storage is not configured. Asset binaries must live in durable object storage.',
      'STORAGE_NOT_CONFIGURED',
      501,
    );
  }
  async getObjectUrl(): Promise<string> {
    throw new AppError('Object storage is not configured.', 'STORAGE_NOT_CONFIGURED', 501);
  }
  async deleteObject(): Promise<void> {
    throw new AppError('Object storage is not configured.', 'STORAGE_NOT_CONFIGURED', 501);
  }
}

export class LocalFilesystemStorage implements ObjectStorage {
  readonly providerName = 'local';
  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    const safe = assertSafePath(key, { allowRelative: true });
    return join(this.rootDir, safe);
  }

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<string> {
    const full = this.resolve(key);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, body);
    if (contentType) {
      await fs.writeFile(`${full}.contentType`, contentType, 'utf8');
    }
    return `local://${key}`;
  }

  async getObjectUrl(key: string): Promise<string> {
    return `file://${this.resolve(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      /* missing is fine */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async readObject(key: string): Promise<Uint8Array> {
    const buf = await fs.readFile(this.resolve(key));
    return new Uint8Array(buf);
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly providerName = 'memory';
  private readonly objects = new Map<string, { body: Uint8Array; contentType?: string }>();

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<string> {
    this.objects.set(key, { body: new Uint8Array(body), contentType });
    return `memory://${key}`;
  }

  async getObjectUrl(key: string): Promise<string> {
    return `memory://${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async readObject(key: string): Promise<Uint8Array> {
    const hit = this.objects.get(key);
    if (!hit) throw new AppError(`Missing object ${key}`, 'OBJECT_NOT_FOUND', 404);
    return new Uint8Array(hit.body);
  }
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  readonly providerName = 's3';
  private readonly client: S3Client;

  constructor(
    private readonly config: Extract<ObjectStorageConfig, { provider: 's3' }>,
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private uriFor(key: string): string {
    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    return `s3://${this.config.bucket}/${key}`;
  }

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return this.uriFor(key);
    } catch (error) {
      throw new AppError(
        `S3 putObject failed for key=${key}: ${(error as Error).message}`,
        'STORAGE_WRITE_FAILED',
        502,
      );
    }
  }

  async getObjectUrl(key: string): Promise<string> {
    return this.uriFor(key);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      throw new AppError(
        `S3 deleteObject failed for key=${key}: ${(error as Error).message}`,
        'STORAGE_DELETE_FAILED',
        502,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.readObject(key);
      return true;
    } catch {
      return false;
    }
  }

  async readObject(key: string): Promise<Uint8Array> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) {
        throw new AppError(`Empty body for key=${key}`, 'OBJECT_NOT_FOUND', 404);
      }
      return bytes;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        `S3 readObject failed for key=${key}: ${(error as Error).message}`,
        'STORAGE_READ_FAILED',
        502,
      );
    }
  }

  async assertBucketReachable(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      throw new AppError(
        `S3 bucket not reachable: ${(error as Error).message}`,
        'STORAGE_BUCKET_UNREACHABLE',
        502,
      );
    }
  }
}

export function createObjectStorageFromConfig(config: ObjectStorageConfig): ObjectStorage {
  if (config.provider === 'none' || config.provider === 'missing') {
    return new MissingObjectStorage();
  }
  if (config.provider === 'local') {
    return new LocalFilesystemStorage(config.root);
  }
  if (config.provider === 's3') {
    return new S3CompatibleObjectStorage(config);
  }
  throw new AppError('Unsupported object storage config', 'STORAGE_MISCONFIGURED', 501);
}

export function createDefaultObjectStorage(
  env: Record<string, string | undefined> = process.env,
): ObjectStorage {
  return createObjectStorageFromConfig(resolveObjectStorageConfig(env));
}

export type ObjectStorageStatus = {
  provider: string;
  configured: boolean;
  durable: boolean;
  writable: boolean | null;
  readable: boolean | null;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  root: string | null;
  banner: 'OK' | 'DURABLE STORAGE NOT CONFIGURED' | 'STORAGE NOT CONFIGURED' | 'STORAGE MISCONFIGURED';
  message: string;
  requiredConfig: string[];
  lastSuccessfulWrite: string | null;
  lastFailedWrite: string | null;
};

export function describeObjectStorageStatus(options?: {
  lastSuccessfulWrite?: string | null;
  lastFailedWrite?: string | null;
  writable?: boolean | null;
  readable?: boolean | null;
  env?: Record<string, string | undefined>;
}): ObjectStorageStatus {
  const env = options?.env ?? process.env;
  const lastSuccessfulWrite = options?.lastSuccessfulWrite ?? null;
  const lastFailedWrite = options?.lastFailedWrite ?? null;
  try {
    const config = resolveObjectStorageConfig(env);
    if (config.provider === 'none' || config.provider === 'missing') {
      return {
        provider: config.provider,
        configured: false,
        durable: false,
        writable: false,
        readable: false,
        bucket: null,
        endpoint: null,
        region: null,
        root: null,
        banner: 'STORAGE NOT CONFIGURED',
        message:
          'Object storage is disabled. Uploads cannot persist binaries until a storage provider is configured.',
        requiredConfig: [
          'Set OBJECT_STORAGE_PROVIDER=s3 (or r2/b2/minio).',
          'Set OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_ACCESS_KEY_ID, OBJECT_STORAGE_SECRET_ACCESS_KEY.',
          'Set OBJECT_STORAGE_REGION (and OBJECT_STORAGE_ENDPOINT for R2/B2/MinIO).',
        ],
        lastSuccessfulWrite,
        lastFailedWrite,
      };
    }
    if (config.provider === 'local') {
      return {
        provider: 'local',
        configured: true,
        durable: false,
        writable: options?.writable ?? null,
        readable: options?.readable ?? null,
        bucket: null,
        endpoint: null,
        region: null,
        root: config.root,
        banner: 'DURABLE STORAGE NOT CONFIGURED',
        message:
          'Uploads use local filesystem storage. Survives process restart on the same disk, but NOT Cloud Agent redeploys / ephemeral VMs.',
        requiredConfig: [
          'Set OBJECT_STORAGE_PROVIDER=s3 (works with AWS S3, Cloudflare R2, Backblaze B2, MinIO).',
          'OBJECT_STORAGE_BUCKET=<bucket>',
          'OBJECT_STORAGE_REGION=<region or auto>',
          'OBJECT_STORAGE_ACCESS_KEY_ID=<key>',
          'OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret>',
          'OBJECT_STORAGE_ENDPOINT=<https://...> (required for R2/B2/MinIO)',
          'OBJECT_STORAGE_FORCE_PATH_STYLE=true (often required for non-AWS endpoints)',
          'OBJECT_STORAGE_PUBLIC_BASE_URL=<https://cdn...> (optional)',
        ],
        lastSuccessfulWrite,
        lastFailedWrite,
      };
    }
    if (config.provider === 's3') {
      return {
        provider: 's3',
        configured: true,
        durable: true,
        writable: options?.writable ?? null,
        readable: options?.readable ?? null,
        bucket: config.bucket,
        endpoint: config.endpoint ?? null,
        region: config.region,
        root: null,
        banner: 'OK',
        message: 'Using S3-compatible durable object storage.',
        requiredConfig: [],
        lastSuccessfulWrite,
        lastFailedWrite,
      };
    }
    return {
      provider: 'unknown',
      configured: false,
      durable: false,
      writable: false,
      readable: false,
      bucket: null,
      endpoint: null,
      region: null,
      root: null,
      banner: 'STORAGE MISCONFIGURED',
      message: 'Unsupported object storage configuration.',
      requiredConfig: [],
      lastSuccessfulWrite,
      lastFailedWrite,
    };
  } catch (error) {
    return {
      provider: env.OBJECT_STORAGE_PROVIDER ?? 'unknown',
      configured: false,
      durable: false,
      writable: false,
      readable: false,
      bucket: env.OBJECT_STORAGE_BUCKET ?? null,
      endpoint: env.OBJECT_STORAGE_ENDPOINT ?? null,
      region: env.OBJECT_STORAGE_REGION ?? null,
      root: null,
      banner: 'STORAGE MISCONFIGURED',
      message: (error as Error).message,
      requiredConfig: [
        'Fix OBJECT_STORAGE_* env vars. Production mode never falls back to local when s3 is selected.',
      ],
      lastSuccessfulWrite,
      lastFailedWrite,
    };
  }
}

export function parseStorageKeyFromUri(uri: string): { scheme: string; key: string; bucket?: string } | null {
  if (uri.startsWith('local://')) {
    return { scheme: 'local', key: uri.slice('local://'.length) };
  }
  if (uri.startsWith('memory://')) {
    return { scheme: 'memory', key: uri.slice('memory://'.length) };
  }
  if (uri.startsWith('s3://')) {
    const rest = uri.slice('s3://'.length);
    const slash = rest.indexOf('/');
    if (slash < 0) return null;
    return { scheme: 's3', bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return null;
}

/** @deprecated use parseStorageKeyFromUri */
export function parseLocalStorageKey(uri: string): string | null {
  return parseStorageKeyFromUri(uri)?.scheme === 'local'
    ? parseStorageKeyFromUri(uri)!.key
    : parseStorageKeyFromUri(uri)?.key ?? null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type StorageSelfTestResult = {
  ok: boolean;
  provider: string;
  key: string;
  wrote: boolean;
  read: boolean;
  hashMatched: boolean;
  deleted: boolean;
  error?: string;
};

export async function runObjectStorageSelfTest(
  storage: ObjectStorage = createDefaultObjectStorage(),
): Promise<StorageSelfTestResult> {
  const payload = new TextEncoder().encode(
    `doodle-dash-storage-self-test:${Date.now()}:${Math.random()}`,
  );
  const expectedHash = sha256Hex(payload);
  const key = storageKeyFor('worker-tests', ['self-test', Date.now(), 'probe.txt']);
  const result: StorageSelfTestResult = {
    ok: false,
    provider: storage.providerName,
    key,
    wrote: false,
    read: false,
    hashMatched: false,
    deleted: false,
  };
  try {
    await storage.putObject(key, payload, 'text/plain');
    result.wrote = true;
    if (!storage.readObject) {
      throw new AppError('Storage provider cannot read objects', 'STORAGE_READ_UNSUPPORTED', 501);
    }
    const readBack = await storage.readObject(key);
    result.read = true;
    result.hashMatched = sha256Hex(readBack) === expectedHash;
    if (!result.hashMatched) {
      throw new AppError('Self-test hash mismatch', 'STORAGE_HASH_MISMATCH', 500);
    }
    await storage.deleteObject(key);
    result.deleted = true;
    result.ok = true;
    return result;
  } catch (error) {
    result.error = (error as Error).message;
    try {
      await storage.deleteObject(key);
      result.deleted = true;
    } catch {
      /* ignore cleanup */
    }
    return result;
  }
}

export type LocalMigrationResult = {
  scanned: number;
  migrated: number;
  verified: number;
  skipped: number;
  errors: string[];
  deletedLocal: false;
  note: string;
};

/**
 * Copy local:// StoredProductionObject binaries into the target durable storage.
 * Never deletes local originals. Caller must verify before any manual cleanup.
 */
export async function migrateLocalUriToStorage(params: {
  localUri: string;
  localRoot: string;
  target: ObjectStorage;
  targetKey?: string;
}): Promise<{ targetUri: string; checksum: string; key: string; verified: boolean }> {
  const parsed = parseStorageKeyFromUri(params.localUri);
  if (!parsed || parsed.scheme !== 'local') {
    throw new AppError('Only local:// URIs can be migrated', 'MIGRATION_UNSUPPORTED_URI', 400);
  }
  const full = join(params.localRoot, assertSafePath(parsed.key, { allowRelative: true }));
  const bytes = new Uint8Array(await fs.readFile(full));
  const checksum = sha256Hex(bytes);
  const key = params.targetKey ?? parsed.key;
  const targetUri = await params.target.putObject(key, bytes);
  let verified = false;
  if (params.target.readObject) {
    const readBack = await params.target.readObject(key);
    verified = sha256Hex(readBack) === checksum;
    if (!verified) {
      throw new AppError('Migration verification failed', 'MIGRATION_VERIFY_FAILED', 500);
    }
  }
  return { targetUri, checksum, key, verified };
}

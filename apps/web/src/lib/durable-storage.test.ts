import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  InMemoryObjectStorage,
  LocalFilesystemStorage,
  MissingObjectStorage,
  createObjectStorageFromConfig,
  describeObjectStorageStatus,
  migrateLocalUriToStorage,
  normalizeStorageCategory,
  resolveObjectStorageConfig,
  runObjectStorageSelfTest,
  sha256Hex,
  storageKeyFor,
  AppError,
} from '@doodle-dash/shared';

describe('durable S3-compatible object storage', () => {
  it('maps legacy categories onto durable prefixes', () => {
    expect(normalizeStorageCategory('original_uploads')).toBe('canonical-references');
    expect(normalizeStorageCategory('draft_renders')).toBe('draft-renders');
    expect(normalizeStorageCategory('character-models')).toBe('character-models');
    expect(storageKeyFor('character-models', ['pip', 'v1', 'pip.blend']).startsWith('character-models/')).toBe(
      true,
    );
    expect(storageKeyFor('manifests', ['ep', 'DRAFT']).startsWith('manifests/')).toBe(true);
  });

  it('resolves s3 config and refuses silent local fallback when misconfigured', () => {
    expect(() =>
      resolveObjectStorageConfig({
        OBJECT_STORAGE_PROVIDER: 's3',
        OBJECT_STORAGE_BUCKET: '',
      }),
    ).toThrowError(/Refusing silent local fallback/);

    const cfg = resolveObjectStorageConfig({
      OBJECT_STORAGE_PROVIDER: 'r2',
      OBJECT_STORAGE_BUCKET: 'dd-prod',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'ak',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'sk',
      OBJECT_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      OBJECT_STORAGE_REGION: 'auto',
      OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    });
    expect(cfg.provider).toBe('s3');
    if (cfg.provider === 's3') {
      expect(cfg.bucket).toBe('dd-prod');
      expect(cfg.endpoint).toContain('r2');
      expect(cfg.forcePathStyle).toBe(true);
    }
  });

  it('trims trailing whitespace from R2 alias secrets', () => {
    const cfg = resolveObjectStorageConfig({
      R2_BUCKET: 'dd-prod ',
      R2_ENDPOINT: ' https://example.r2.cloudflarestorage.com/ ',
      R2_ACCESS_KEY_ID: 'akid ',
      R2_SECRET_ACCESS_KEY: ' secret ',
    });
    expect(cfg.provider).toBe('s3');
    if (cfg.provider === 's3') {
      expect(cfg.bucket).toBe('dd-prod');
      expect(cfg.endpoint).toBe('https://example.r2.cloudflarestorage.com/');
      expect(cfg.accessKeyId).toBe('akid');
      expect(cfg.secretAccessKey).toBe('secret');
    }
  });

  it('runs write/read/delete self-test with hash verification on memory storage', async () => {
    const memory = new InMemoryObjectStorage();
    const result = await runObjectStorageSelfTest(memory);
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.read).toBe(true);
    expect(result.hashMatched).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.key.startsWith('worker-tests/')).toBe(true);
  });

  it('persists binaries on local provider and migrates to another storage with verification', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'doodle-local-'));
    const local = new LocalFilesystemStorage(dir);
    const bytes = new TextEncoder().encode('pip-canonical-bytes');
    const key = storageKeyFor('canonical-references', ['pip', 'primary.jpeg']);
    const uri = await local.putObject(key, bytes, 'image/jpeg');
    expect(uri).toBe(`local://${key}`);

    const target = new InMemoryObjectStorage();
    const migrated = await migrateLocalUriToStorage({
      localUri: uri,
      localRoot: dir,
      target,
      targetKey: key,
    });
    expect(migrated.verified).toBe(true);
    expect(migrated.checksum).toBe(sha256Hex(bytes));
    expect(await target.readObject(key)).toEqual(bytes);
  });

  it('describes durability status for local vs s3', () => {
    const local = describeObjectStorageStatus({
      env: { OBJECT_STORAGE_PROVIDER: 'local' },
    });
    expect(local.durable).toBe(false);
    expect(local.banner).toBe('DURABLE STORAGE NOT CONFIGURED');

    const s3 = describeObjectStorageStatus({
      env: {
        OBJECT_STORAGE_PROVIDER: 's3',
        OBJECT_STORAGE_BUCKET: 'b',
        OBJECT_STORAGE_ACCESS_KEY_ID: 'a',
        OBJECT_STORAGE_SECRET_ACCESS_KEY: 's',
        OBJECT_STORAGE_REGION: 'us-east-1',
      },
    });
    expect(s3.durable).toBe(true);
    expect(s3.configured).toBe(true);
    expect(s3.bucket).toBe('b');
  });

  it('MissingObjectStorage fails closed', async () => {
    const missing = new MissingObjectStorage();
    await expect(missing.putObject()).rejects.toBeInstanceOf(AppError);
    expect(createObjectStorageFromConfig({ provider: 'none' }).providerName).toBe('missing');
  });

  it('keeps a local file after migration source write (no auto-delete)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'doodle-keep-'));
    mkdirSync(path.join(dir, 'canonical-references'), { recursive: true });
    const rel = 'canonical-references/keep.bin';
    writeFileSync(path.join(dir, rel), Buffer.from('keep-me'));
    const target = new InMemoryObjectStorage();
    await migrateLocalUriToStorage({
      localUri: `local://${rel}`,
      localRoot: dir,
      target,
    });
    // Source still present
    expect(await new LocalFilesystemStorage(dir).exists(rel)).toBe(true);
  });
});

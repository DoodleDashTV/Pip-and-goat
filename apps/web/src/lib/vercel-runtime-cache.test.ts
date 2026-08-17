/**
 * Vercel/serverless cache path — GET / must not mkdir under /var/task.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ensureWritableDir,
  isServerlessRuntime,
  resolveObjectStorageConfig,
  resolveWritableRuntimeDir,
} from '@doodle-dash/shared';
import { ContentAddressedCache, resolveCacheRoot, resolvePerformanceConfig } from '@doodle-dash/production';
import { readStudioDashboardStatus } from './studio-status';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('Vercel-safe runtime cache', () => {
  it('places the Vercel runtime cache under os.tmpdir()', () => {
    const tmpdir = '/tmp';
    const vercelCwd = '/var/task/apps/web';
    const root = resolveCacheRoot({ VERCEL: '1' }, vercelCwd, tmpdir);
    expect(root).toBe(path.join(tmpdir, '.doodle-dash-cache'));
    expect(root).not.toContain('/var/task');
    expect(root).not.toContain(path.join('apps/web', 'apps/web'));
    expect(isServerlessRuntime({ VERCEL: '1' })).toBe(true);
    expect(isServerlessRuntime({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isServerlessRuntime({ AWS_LAMBDA_FUNCTION_NAME: 'pip-and-goat' })).toBe(true);
  });

  it('keeps the local cache next to process.cwd() without appending apps/web', () => {
    const tmpdir = '/tmp';
    const repoCwd = '/workspace';
    const webCwd = '/workspace/apps/web';
    expect(resolveCacheRoot({}, repoCwd, tmpdir)).toBe(path.resolve(repoCwd, '.doodle-dash-cache'));
    expect(resolveCacheRoot({}, webCwd, tmpdir)).toBe(path.resolve(webCwd, '.doodle-dash-cache'));
    expect(resolveCacheRoot({}, webCwd, tmpdir)).not.toBe(
      path.resolve(webCwd, 'apps/web', '.doodle-dash-cache'),
    );
    expect(isServerlessRuntime({})).toBe(false);
    expect(resolvePerformanceConfig({ cacheRoot: '/explicit-cache' }).cacheRoot).toBe('/explicit-cache');
  });

  it('creates missing parent directories with recursive mkdir', () => {
    const nested = path.join(
      os.tmpdir(),
      `ddp-cache-parents-${Date.now()}`,
      'missing',
      'parents',
      '.doodle-dash-cache',
    );
    expect(existsSync(nested)).toBe(false);
    const cache = new ContentAddressedCache(nested);
    expect(cache.writable).toBe(true);
    expect(existsSync(nested)).toBe(true);
    expect(ensureWritableDir(nested)).toBe(true);
    const helper = readRepo('packages/shared/src/runtime-fs.ts');
    expect(helper).toContain('mkdirSync(dir, { recursive: true })');
  });

  it('does not crash GET / when cache creation fails', async () => {
    const blocker = path.join(os.tmpdir(), `ddp-cache-file-${Date.now()}`);
    writeFileSync(blocker, 'not-a-directory');
    const unwritable = path.join(blocker, '.doodle-dash-cache');

    expect(() => new ContentAddressedCache(unwritable)).not.toThrow();
    const cache = new ContentAddressedCache(unwritable);
    expect(cache.writable).toBe(false);
    await expect(cache.has('shots', 'abc', 'out.mp4')).resolves.toBe(false);
    await expect(cache.get('shots', 'abc', 'out.mp4')).resolves.toBeNull();
    await expect(cache.put('shots', 'abc', 'out.mp4', Buffer.from('x'))).resolves.toBeNull();

    expect(() =>
      resolveCacheRoot({ VERCEL: '1' }, '/var/task/apps/web', os.tmpdir()),
    ).not.toThrow();
    expect(() => readStudioDashboardStatus()).not.toThrow();

    const home = readRepo('apps/web/src/app/page.tsx');
    const performance = readRepo('packages/production/src/performance.ts');
    expect(home).toContain("from '@doodle-dash/production'");
    expect(performance).toContain('export const contentAddressedCache = new ContentAddressedCache()');
    expect(performance).toContain('ensureWritableDir');
    expect(performance).toContain('resolveCacheRoot');
  });

  it('points local object storage at tmpdir on Vercel instead of cwd', () => {
    const cfg = resolveObjectStorageConfig({
      OBJECT_STORAGE_PROVIDER: 'local',
      VERCEL: '1',
    });
    expect(cfg.provider).toBe('local');
    if (cfg.provider === 'local') {
      expect(cfg.root).toBe(resolveWritableRuntimeDir('.doodle-dash-storage', { env: { VERCEL: '1' } }));
      expect(cfg.root).toContain(os.tmpdir());
      expect(cfg.root).not.toContain(path.join('apps/web', 'apps/web'));
    }
  });
});

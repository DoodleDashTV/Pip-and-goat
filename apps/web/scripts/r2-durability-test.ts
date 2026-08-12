/**
 * Real Cloudflare R2 durability test: WRITE -> READ -> HASH VERIFY -> DELETE.
 *
 * Reads R2 credentials from injected environment variables only
 * (R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — or the
 * OBJECT_STORAGE_* equivalents). It intentionally REFUSES to run against local
 * storage so a green result always means the actual configured bucket passed.
 *
 * Usage (from repo root):
 *   pnpm --filter @doodle-dash/web exec tsx --env-file=../.env scripts/r2-durability-test.ts
 */
import {
  resolveObjectStorageConfig,
  createObjectStorageFromConfig,
  runObjectStorageSelfTest,
  describeObjectStorageStatus,
} from '@doodle-dash/shared';

const REMOTE_PROVIDERS = new Set(['r2', 's3', 'b2', 'minio']);

async function main() {
  const config = resolveObjectStorageConfig();
  const status = describeObjectStorageStatus();
  console.log(`[r2-durability] provider=${config.provider} bucket=${status.bucket ?? '(none)'}`);

  if (!REMOTE_PROVIDERS.has(config.provider)) {
    console.error(
      `[r2-durability] BLOCKED: no remote object storage configured (provider=${config.provider}). ` +
        'Set R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY as injected secrets.',
    );
    process.exit(2);
  }

  const storage = createObjectStorageFromConfig(config);
  const result = await runObjectStorageSelfTest(storage);

  const report = {
    provider: result.provider,
    key: result.key,
    WRITE: result.wrote ? 'PASS' : 'FAIL',
    READ: result.read ? 'PASS' : 'FAIL',
    HASH_VERIFY: result.hashMatched ? 'PASS' : 'FAIL',
    DELETE: result.deleted ? 'PASS' : 'FAIL',
    OVERALL: result.ok ? 'PASS' : 'FAIL',
    ...(result.error ? { error: result.error } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('[r2-durability] unexpected error:', error);
  process.exit(1);
});

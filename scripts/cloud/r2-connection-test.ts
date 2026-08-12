#!/usr/bin/env tsx
/**
 * Non-production R2 connection test (TypeScript).
 * Never prints secret values.
 */
import {
  createObjectStorageFromConfig,
  resolveObjectStorageConfig,
  resolveR2BucketWithFallback,
  sha256Hex,
} from '@doodle-dash/shared';

function yesNo(name: string, alt?: string) {
  const a = process.env[name];
  const b = alt ? process.env[alt] : undefined;
  return (a && a.trim()) || (b && b.trim()) ? 'YES' : 'NO';
}

async function main() {
  console.log('R2_BUCKET PRESENT:', yesNo('R2_BUCKET', 'OBJECT_STORAGE_BUCKET'));
  console.log('R2_ENDPOINT PRESENT:', yesNo('R2_ENDPOINT', 'OBJECT_STORAGE_ENDPOINT'));
  console.log('R2_ACCESS_KEY_ID PRESENT:', yesNo('R2_ACCESS_KEY_ID', 'OBJECT_STORAGE_ACCESS_KEY_ID'));
  console.log('R2_SECRET_ACCESS_KEY PRESENT:', yesNo('R2_SECRET_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_ACCESS_KEY'));

  let auth: 'PASS' | 'FAIL' = 'FAIL';
  let upload: 'PASS' | 'FAIL' = 'FAIL';
  let download: 'PASS' | 'FAIL' = 'FAIL';
  let checksum: 'PASS' | 'FAIL' = 'FAIL';
  let del: 'PASS' | 'FAIL' = 'FAIL';

  try {
    const env = { ...process.env } as Record<string, string | undefined>;
    if (!env.OBJECT_STORAGE_PROVIDER && (env.R2_BUCKET || env.R2_ENDPOINT)) {
      env.OBJECT_STORAGE_PROVIDER = 'r2';
    }
    const resolved = await resolveR2BucketWithFallback(env);
    env.R2_BUCKET = resolved.bucket;
    console.log(
      'R2_BUCKET_AUTORESOLVED:',
      resolved.autoResolved ? 'YES' : 'NO',
      'REASON:',
      resolved.reason,
    );
    const cfg = resolveObjectStorageConfig(env);
    if (cfg.provider !== 's3') throw new Error('R2/S3 provider not configured');
    const storage = createObjectStorageFromConfig(cfg);
    if ('assertBucketReachable' in storage && typeof (storage as { assertBucketReachable?: () => Promise<void> }).assertBucketReachable === 'function') {
      await (storage as { assertBucketReachable: () => Promise<void> }).assertBucketReachable();
    }
    auth = 'PASS';

    const key = 'ddp-system-tests/r2-connection-test.txt';
    const body = new TextEncoder().encode(`ddp-r2-test-${Date.now()}\n`);
    const expected = sha256Hex(body);
    await storage.putObject(key, body, 'text/plain');
    upload = 'PASS';
    if (!storage.readObject) throw new Error('readObject unsupported');
    const got = await storage.readObject(key);
    download = 'PASS';
    checksum = sha256Hex(got) === expected ? 'PASS' : 'FAIL';
    await storage.deleteObject(key);
    const still = storage.exists ? await storage.exists(key) : false;
    del = still ? 'FAIL' : 'PASS';
  } catch (e) {
    const msg = String((e as Error).message || e)
      .replace(/\brpa_[A-Za-z0-9]+/g, '[REDACTED]')
      .replace(process.env.R2_SECRET_ACCESS_KEY || '___', '[REDACTED]')
      .replace(process.env.R2_ACCESS_KEY_ID || '___', '[REDACTED]');
    console.error('R2_TEST_ERROR:', msg);
  }

  console.log('R2 AUTH:', auth);
  console.log('R2 UPLOAD:', upload);
  console.log('R2 DOWNLOAD:', download);
  console.log('R2 CHECKSUM:', checksum);
  console.log('R2 DELETE:', del);
  process.exit(
    auth === 'PASS' && upload === 'PASS' && download === 'PASS' && checksum === 'PASS' && del === 'PASS'
      ? 0
      : 1,
  );
}

main();

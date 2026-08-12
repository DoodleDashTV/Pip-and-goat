#!/usr/bin/env node
/**
 * Non-production R2 connection test.
 * upload → download → checksum → delete → confirm
 * Never prints secret values.
 */
const { createHash } = require('node:crypto');
const {
  resolveObjectStorageConfig,
  createObjectStorageFromConfig,
  sha256Hex,
} = require('../../packages/shared/src/object-storage.ts');

function present(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim()) ? 'YES' : 'NO';
}

async function main() {
  console.log('R2_BUCKET PRESENT:', present('R2_BUCKET') === 'YES' || present('OBJECT_STORAGE_BUCKET') === 'YES' ? 'YES' : 'NO');
  console.log('R2_ENDPOINT PRESENT:', present('R2_ENDPOINT') === 'YES' || present('OBJECT_STORAGE_ENDPOINT') === 'YES' ? 'YES' : 'NO');
  console.log('R2_ACCESS_KEY_ID PRESENT:', present('R2_ACCESS_KEY_ID') === 'YES' || present('OBJECT_STORAGE_ACCESS_KEY_ID') === 'YES' ? 'YES' : 'NO');
  console.log(
    'R2_SECRET_ACCESS_KEY PRESENT:',
    present('R2_SECRET_ACCESS_KEY') === 'YES' || present('OBJECT_STORAGE_SECRET_ACCESS_KEY') === 'YES' ? 'YES' : 'NO',
  );

  const env = {
    ...process.env,
    OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER || (process.env.R2_BUCKET ? 'r2' : process.env.OBJECT_STORAGE_PROVIDER),
  };

  let auth = 'FAIL';
  let upload = 'FAIL';
  let download = 'FAIL';
  let checksum = 'FAIL';
  let del = 'FAIL';

  try {
    const cfg = resolveObjectStorageConfig(env);
    if (cfg.provider !== 's3') {
      throw new Error('R2/S3 provider not configured');
    }
    const storage = createObjectStorageFromConfig(cfg);
    if (typeof storage.assertBucketReachable === 'function') {
      await storage.assertBucketReachable();
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
    const actual = sha256Hex(got);
    checksum = actual === expected ? 'PASS' : 'FAIL';

    await storage.deleteObject(key);
    const stillThere = storage.exists ? await storage.exists(key) : false;
    del = stillThere ? 'FAIL' : 'PASS';
  } catch (e) {
    const msg = String(e.message || e)
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
  process.exit(auth === 'PASS' && upload === 'PASS' && download === 'PASS' && checksum === 'PASS' && del === 'PASS' ? 0 : 1);
}

main();

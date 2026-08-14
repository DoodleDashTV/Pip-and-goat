#!/usr/bin/env node
/**
 * Read-only R2 object fetch (diagnostics). Never writes or deletes.
 *
 * Usage: node scripts/cloud/r2-get.mjs <key> [destPath]
 * Without destPath the object is printed to stdout (text) and its sha256 is
 * written to stderr; with destPath the bytes are saved and sha256 reported.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../packages/shared/package.json'));
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const key = process.argv[2];
const dest = process.argv[3];
if (!key) {
  console.error('usage: r2-get.mjs <key> [destPath]');
  process.exit(2);
}

const client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const res = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
const bytes = Buffer.from(await res.Body.transformToByteArray());
const sha = createHash('sha256').update(bytes).digest('hex');
if (dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  console.error(JSON.stringify({ key, dest, bytes: bytes.length, sha256: sha }));
} else {
  process.stdout.write(bytes.toString('utf8'));
  console.error(JSON.stringify({ key, bytes: bytes.length, sha256: sha }));
}

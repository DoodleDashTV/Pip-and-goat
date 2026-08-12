#!/usr/bin/env node
/**
 * Read-only R2 object listing (diagnostics). Never writes or deletes.
 *
 * Usage: node scripts/cloud/r2-ls.mjs [prefix] [maxKeys]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the S3 client from a workspace package that depends on it, so this
// script runs from the repo root without its own dependency manifest.
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../packages/shared/package.json'));
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const prefix = process.argv[2] || '';
const maxKeys = Number(process.argv[3] || 200);

const client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const out = [];
let token;
do {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    }),
  );
  for (const o of res.Contents || []) {
    out.push({ key: o.Key, size: o.Size, modified: o.LastModified?.toISOString() });
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token && out.length < maxKeys);

out.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
console.log(JSON.stringify({ prefix, count: out.length, objects: out.slice(0, maxKeys) }, null, 2));

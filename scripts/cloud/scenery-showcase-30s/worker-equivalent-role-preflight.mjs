#!/usr/bin/env node
/**
 * Zero-cost worker-equivalent scenery role preflight.
 * Lists private R2 objects and runs the exact unique-key + maxBytes selector.
 * Never creates a RunPod resource.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const {
  REQUIRED_ROLES,
  NATURE_LIBRARY_ALIAS_KEY,
  NATURE_LIBRARY_ALIAS_SOURCE_KEY,
  independentRoleSnapshot,
  trySelectAssets,
} = require('../../../workers/runpod-blender/src/scenery-showcase-roles.js');

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-showcase-30s');
const OUT_FILE = path.join(OUT_DIR, 'worker-equivalent-role-preflight.json');

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names[0]}`);
}

function clientAndBucket() {
  const endpoint = env('R2_ENDPOINT', 'OBJECT_STORAGE_ENDPOINT');
  const bucket = env('R2_BUCKET', 'OBJECT_STORAGE_BUCKET');
  const accessKeyId = env('R2_ACCESS_KEY_ID', 'OBJECT_STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_ACCESS_KEY');
  const region = String(process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto').trim() || 'auto';
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function listItems(client, bucket) {
  const items = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'tivvlejoy-assets',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const item of page.Contents || []) {
      const key = String(item.Key || '');
      const size = Number(item.Size || 0);
      if (key && size > 0) items.push({ key, size });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items;
}

async function head(client, bucket, key) {
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: Number(result.ContentLength || 0) };
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
      return { exists: false, size: 0 };
    }
    throw error;
  }
}

function encodedCopySource(bucket, key) {
  return `${bucket}/${key.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

async function ensureNatureAlias(client, bucket, items, writeAlias) {
  const source = items.find((item) => item.key === NATURE_LIBRARY_ALIAS_SOURCE_KEY);
  if (!source) throw new Error('NATURE_ALIAS_SOURCE_MISSING');
  const current = await head(client, bucket, NATURE_LIBRARY_ALIAS_KEY);
  if (current.exists && current.size === source.size) {
    return { created: false, sourceSize: source.size, aliasSize: current.size };
  }
  if (!writeAlias) {
    return { created: false, needed: true, sourceSize: source.size, aliasSize: current.size || 0 };
  }
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: NATURE_LIBRARY_ALIAS_KEY,
    CopySource: encodedCopySource(bucket, source.key),
  }));
  const after = await head(client, bucket, NATURE_LIBRARY_ALIAS_KEY);
  if (!after.exists || after.size !== source.size) throw new Error('NATURE_ALIAS_COPY_VERIFY_FAILED');
  return { created: true, sourceSize: source.size, aliasSize: after.size };
}

function sanitizeSelection(result) {
  return {
    ok: result.ok,
    missingRole: result.missingRole,
    code: result.code || null,
    selected: (result.selected || []).map((item) => ({
      role: item.role,
      key: item.key,
      mib: Math.round((item.size / (1024 * 1024)) * 10) / 10,
    })),
    totalMib: Math.round(((result.totalBytes || 0) / (1024 * 1024)) * 10) / 10,
    rejectedNature: result.inspection?.rejected?.map((item) => ({
      key: item.key,
      mib: Math.round((item.size / (1024 * 1024)) * 10) / 10,
      reasons: item.reasons,
    })) || [],
  };
}

const writeAlias = process.argv.includes('--write-alias');
const { client, bucket } = clientAndBucket();
const beforeItems = await listItems(client, bucket);
const independent = independentRoleSnapshot(beforeItems);
const beforeWorker = trySelectAssets(beforeItems);
const alias = await ensureNatureAlias(client, bucket, beforeItems, writeAlias);
const afterItems = writeAlias ? await listItems(client, bucket) : beforeItems;
const afterWorker = trySelectAssets(afterItems);
const payload = {
  schema: 'TIVVLEJOY_SCENERY_WORKER_EQUIVALENT_ROLE_PREFLIGHT_V1',
  paidMutationPerformed: false,
  runpodContacted: false,
  requiredRoles: REQUIRED_ROLES,
  listedObjectCount: afterItems.length,
  independentPreflight: {
    ok: independent.ok,
    satisfiedRoleCount: independent.satisfiedRoleCount,
    missingRoles: independent.missingRoles,
  },
  workerBeforeAlias: sanitizeSelection(beforeWorker),
  natureAlias: {
    key: NATURE_LIBRARY_ALIAS_KEY,
    sourceKey: NATURE_LIBRARY_ALIAS_SOURCE_KEY,
    ...alias,
    sourceBytesModified: false,
    fabricated: false,
  },
  workerAfter: sanitizeSelection(afterWorker),
  readyForNextPaidAuthorization: afterWorker.ok === true,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({
  readyForNextPaidAuthorization: payload.readyForNextPaidAuthorization,
  independentSatisfied: independent.satisfiedRoleCount,
  workerBeforeMissing: beforeWorker.missingRole,
  aliasCreated: alias.created,
  workerAfterOk: afterWorker.ok,
  workerAfterMissing: afterWorker.missingRole,
  paidMutationPerformed: false,
}, null, 2));
if (!afterWorker.ok) process.exitCode = 2;

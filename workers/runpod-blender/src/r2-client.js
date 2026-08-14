/**
 * Minimal R2/S3 client for the Runpod worker.
 * Credentials come from env only — never logged.
 */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { createHash } = require('node:crypto');
const { createWriteStream, promises: fs } = require('node:fs');
const { pipeline } = require('node:stream/promises');

function strip(v) {
  return String(v || '')
    .replace(/[\r\n]+/g, '')
    .trim();
}

function createR2Client(env = process.env) {
  const bucket = strip(env.R2_BUCKET || env.OBJECT_STORAGE_BUCKET);
  const endpoint = strip(env.R2_ENDPOINT || env.OBJECT_STORAGE_ENDPOINT);
  const accessKeyId = strip(env.R2_ACCESS_KEY_ID || env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = strip(env.R2_SECRET_ACCESS_KEY || env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 configuration incomplete');
  }
  // Bounded network timeouts so no R2 op can hang a paid pod indefinitely.
  const connectionTimeout = Number(env.R2_CONNECT_TIMEOUT_MS || 10_000);
  const requestTimeout = Number(env.R2_REQUEST_TIMEOUT_MS || 60_000);
  const maxAttempts = Number(env.R2_MAX_ATTEMPTS || 3);
  const client = new S3Client({
    region: strip(env.R2_REGION || env.OBJECT_STORAGE_REGION || 'auto') || 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 3,
    requestHandler: {
      connectionTimeout: Number.isFinite(connectionTimeout) ? connectionTimeout : 10_000,
      requestTimeout: Number.isFinite(requestTimeout) ? requestTimeout : 60_000,
    },
  });
  return { client, bucket, timeouts: { connectionTimeout, requestTimeout, maxAttempts } };
}

/**
 * Wrap any promise with a bounded timeout that rejects with a tagged error.
 * Used to fence external ops (registry/Runpod/pod-status) that lack native
 * timeouts so nothing hangs indefinitely.
 */
function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'NETWORK_TIMEOUT';
      reject(err);
    }, ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function uploadBuffer({ client, bucket }, key, body, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `s3://${bucket}/${key}`;
}

async function downloadToFile({ client, bucket }, key, destPath, expectedChecksum) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(res.Body, createWriteStream(destPath));
  if (expectedChecksum) {
    const buf = await fs.readFile(destPath);
    const hash = sha256(buf);
    if (hash !== expectedChecksum) {
      throw new Error(`Checksum mismatch for ${key}`);
    }
  }
  return destPath;
}

async function exists({ client, bucket }, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function deleteKey({ client, bucket }, key) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = {
  createR2Client,
  uploadBuffer,
  downloadToFile,
  exists,
  deleteKey,
  sha256,
  strip,
  withTimeout,
};

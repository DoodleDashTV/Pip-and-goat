'use strict';

/** Content-addressed R2 PNG checkpoint/resume. Filename-only resume is forbidden. */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const SCHEMA = 'TIVVLEJOY_V7_FRAME_CHECKPOINT_MANIFEST_V1';
const START = 1;
const END = 900;

function strip(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function frameFileName(n) {
  return `frame_${String(n).padStart(4, '0')}.png`;
}

function frameKey(prefix, n) {
  return `${String(prefix).replace(/\/+$/, '')}/frames/${frameFileName(n)}`;
}

function manifestKey(prefix) {
  return `${String(prefix).replace(/\/+$/, '')}/frame-checkpoint-manifest.json`;
}

function buildRenderIdentity(settings = {}) {
  const row = {
    sceneScript: strip(settings.sceneScript || 'cinematic_valley_world_v1.py'),
    profile: strip(settings.profile || 'FINAL'),
    engine: strip(settings.engine || 'CYCLES'),
    resolution: strip(settings.resolution || '1080x1920'),
    samples: Number(settings.samples || 256),
    fps: Number(settings.fps || 30),
    startFrame: Number(settings.startFrame || START),
    endFrame: Number(settings.endFrame || END),
    waterVariant: strip(settings.waterVariant || 'D'),
    heroRebuild: strip(settings.heroRebuild || 'v3'),
    denoise: settings.denoise !== false,
    cyclesDevice: strip(settings.cyclesDevice || 'GPU'),
    masterBitDepth: strip(settings.masterBitDepth || '16'),
    contentIdentity: strip(settings.contentIdentity || settings.contentSha || ''),
  };
  if (/eevee/i.test(row.engine)) {
    throw Object.assign(new Error('EEVEE cannot enter FINAL identity'), { code: 'EEVEE_SELECTED' });
  }
  if (row.waterVariant !== 'D') {
    throw Object.assign(new Error('Water variant must be D'), { code: 'WATER_VARIANT_NOT_D' });
  }
  if (row.profile !== 'FINAL' || row.samples !== 256 || row.resolution !== '1080x1920' || row.startFrame !== START || row.endFrame !== END) {
    throw Object.assign(new Error('FINAL identity range/samples/resolution mismatch'), { code: 'FINAL_IDENTITY_INVALID' });
  }
  return { ...row, identitySha256: sha256Buffer(Buffer.from(JSON.stringify(row))) };
}

function emptyManifest(identity) {
  return {
    schema: SCHEMA,
    startFrame: START,
    endFrame: END,
    identity,
    frames: {},
    verifiedCount: 0,
    complete: false,
  };
}

function identitiesMatch(left, right) {
  return Boolean(left && right && left.identitySha256 && left.identitySha256 === right.identitySha256);
}

function canResumeFrame(entry, identity, local) {
  if (!entry || entry.verified !== true) return false;
  const entryIdentity = entry.identity && entry.identity.identitySha256 ? entry.identity : identity;
  if (!identitiesMatch(entryIdentity, identity)) return false;
  if (!entry.sha256 || !/^[0-9a-f]{64}$/.test(entry.sha256)) return false;
  if (Number(entry.byteSize) <= 0) return false;
  if (local) {
    if (local.sha256 !== entry.sha256) return false;
    if (Number(local.byteSize) !== Number(entry.byteSize)) return false;
  }
  return true;
}

function assertNotFilenameOnlyResume({ exists, expectedSha256 }) {
  if (exists && !expectedSha256) {
    throw Object.assign(new Error('cannot resume from filename alone'), { code: 'FILENAME_ONLY_RESUME_FORBIDDEN' });
  }
}

async function persistManifest({ transport, ctx, prefix, manifest }) {
  const key = manifestKey(prefix);
  await transport.uploadBuffer(ctx, key, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), 'application/json');
  return key;
}

async function loadManifest({ transport, ctx, prefix, identity, destPath }) {
  const key = manifestKey(prefix);
  try {
    await transport.downloadToFile(ctx, key, destPath);
    const parsed = JSON.parse(await fsp.readFile(destPath, 'utf8'));
    if (parsed.schema !== SCHEMA || !identitiesMatch(parsed.identity, identity)) {
      return emptyManifest(identity);
    }
    return parsed;
  } catch {
    return emptyManifest(identity);
  }
}

async function uploadAndReadbackFrame({ transport, ctx, key, filePath, expectedSha256 }) {
  await transport.uploadFile(ctx, key, filePath, 'image/png');
  const tmp = `${filePath}.readback`;
  await transport.downloadToFile(ctx, key, tmp, expectedSha256);
  const back = sha256File(tmp);
  await fsp.unlink(tmp).catch(() => {});
  if (back !== expectedSha256) {
    throw Object.assign(new Error('frame readback SHA mismatch'), { code: 'FRAME_READBACK_HASH_MISMATCH' });
  }
  return true;
}

async function checkpointFrame({ transport, ctx, prefix, outputDir, frame, identity, manifest }) {
  const name = frameFileName(frame);
  const filePath = path.join(outputDir, name);
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error(`frame missing: ${name}`), { code: 'FRAME_MISSING' });
  }
  const byteSize = fs.statSync(filePath).size;
  if (byteSize <= 0) {
    throw Object.assign(new Error(`empty frame: ${name}`), { code: 'EMPTY_FRAME' });
  }
  const digest = sha256File(filePath);
  const existing = manifest.frames[String(frame)];
  if (canResumeFrame(existing, identity, { sha256: digest, byteSize })) {
    return { frame, sha256: digest, byteSize, skippedUpload: true };
  }
  await uploadAndReadbackFrame({
    transport,
    ctx,
    key: frameKey(prefix, frame),
    filePath,
    expectedSha256: digest,
  });
  manifest.frames[String(frame)] = {
    frame,
    name,
    sha256: digest,
    byteSize,
    verified: true,
    identity: {
      identitySha256: identity.identitySha256,
      profile: identity.profile,
      waterVariant: identity.waterVariant,
      samples: identity.samples,
      resolution: identity.resolution,
    },
    at: new Date().toISOString(),
  };
  manifest.verifiedCount = Object.values(manifest.frames).filter((row) => row.verified).length;
  manifest.complete = manifest.verifiedCount === END;
  return { frame, sha256: digest, byteSize, skippedUpload: false };
}

function listLocalFrameNumbers(outputDir) {
  try {
    return fs.readdirSync(outputDir)
      .map((name) => {
        const match = /^frame_(\d+)\.png$/i.exec(name);
        return match ? Number(match[1]) : null;
      })
      .filter((n) => Number.isInteger(n) && n >= START && n <= END)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function checkpointNewFrames({ transport, ctx, prefix, outputDir, identity, manifest }) {
  const done = [];
  for (const frame of listLocalFrameNumbers(outputDir)) {
    const result = await checkpointFrame({ transport, ctx, prefix, outputDir, frame, identity, manifest });
    done.push(result);
  }
  await persistManifest({ transport, ctx, prefix, manifest });
  return done;
}

async function materializeVerifiedFrames({ transport, ctx, prefix, outputDir, identity, manifest }) {
  const resumed = [];
  for (let n = START; n <= END; n += 1) {
    const entry = manifest.frames[String(n)];
    if (!canResumeFrame(entry, identity, null)) continue;
    const dest = path.join(outputDir, frameFileName(n));
    if (fs.existsSync(dest)) {
      const localSha = sha256File(dest);
      const localSize = fs.statSync(dest).size;
      if (canResumeFrame(entry, identity, { sha256: localSha, byteSize: localSize })) {
        resumed.push(n);
        continue;
      }
    }
    try {
      await transport.downloadToFile(ctx, frameKey(prefix, n), dest, entry.sha256);
      if (sha256File(dest) === entry.sha256 && fs.statSync(dest).size === Number(entry.byteSize)) {
        resumed.push(n);
      }
    } catch {
      // Leave the frame for a fresh render. Never skip on filename.
    }
  }
  return resumed;
}

function writeVerifiedFramesJson(filePath, frames) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ schema: 'TIVVLEJOY_V7_VERIFIED_FRAMES_V1', frames }, null, 2)}\n`);
  return filePath;
}

function assertEncodeAllowed(manifest, identity) {
  if (!identitiesMatch(manifest.identity, identity)) {
    throw Object.assign(new Error('manifest identity mismatch'), { code: 'CHECKPOINT_IDENTITY_MISMATCH' });
  }
  const missing = [];
  for (let n = START; n <= END; n += 1) {
    if (!canResumeFrame(manifest.frames[String(n)], identity, null)) missing.push(n);
  }
  if (missing.length) {
    throw Object.assign(new Error(`cannot encode; unverified frames: ${missing.length}`), {
      code: 'FRAMES_NOT_VERIFIED',
      missingCount: missing.length,
      missing: missing.slice(0, 12),
    });
  }
  return { ok: true, verifiedCount: END };
}

async function uploadMp4AndReadback({ transport, ctx, key, filePath }) {
  const digest = sha256File(filePath);
  await transport.uploadFile(ctx, key, filePath, 'video/mp4');
  const tmp = `${filePath}.readback`;
  await transport.downloadToFile(ctx, key, tmp, digest);
  const back = sha256File(tmp);
  await fsp.unlink(tmp).catch(() => {});
  if (back !== digest) {
    throw Object.assign(new Error('MP4 readback SHA mismatch'), { code: 'R2_READBACK_HASH_MISMATCH' });
  }
  return { sha256: digest, byteSize: fs.statSync(filePath).size };
}

module.exports = {
  SCHEMA,
  START,
  END,
  sha256File,
  frameFileName,
  frameKey,
  manifestKey,
  buildRenderIdentity,
  emptyManifest,
  identitiesMatch,
  canResumeFrame,
  assertNotFilenameOnlyResume,
  persistManifest,
  loadManifest,
  checkpointFrame,
  checkpointNewFrames,
  materializeVerifiedFrames,
  writeVerifiedFramesJson,
  assertEncodeAllowed,
  uploadMp4AndReadback,
  listLocalFrameNumbers,
};

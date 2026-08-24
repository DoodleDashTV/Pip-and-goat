'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { dispatchCharacterMasterFromWorker } = require('./character-worker-entry');
const { compileCharacterCapability } = require('./character-capability');
const {
  CHARACTER_MASTER_BUILD,
  GOAT_CHARACTER_ID,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
} = require('./character-job-kinds');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function u16(value) {
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff]);
}
function u32(value) {
  return Buffer.from([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function storeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, central, eocd]);
}

function die(message) {
  throw new Error(message);
}

async function main() {
  const root = process.env.CHARACTER_WORKER_ROOT || (fs.existsSync('/opt/ddp-worker/src/character-master.js') ? '/opt/ddp-worker' : path.resolve(__dirname, '../../..'));
  const zip = storeZip([
    { name: 'Goat_FINN.blend', data: 'synthetic-blend' },
    { name: 'Goat_FINN.fbx', data: 'synthetic-fbx' },
  ]);
  if (zip.length === LOCKED_SOURCE_SIZE || sha256(zip) === LOCKED_SOURCE_SHA256) {
    die('synthetic fixture must not match the locked Goat archive');
  }
  const digest = `sha256:${'ab'.repeat(32)}`;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tivvlejoy-auth-entry-'));
  let gets = 0;
  const unauthorized = await dispatchCharacterMasterFromWorker({
    env: {
      CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD,
      CHARACTER_EXECUTION_MODE: 'dry-run',
      CHARACTER_WORKER_ROOT: root,
      ALLOW_PAID_GPU_LAUNCH: 'false',
    },
    root,
    sourceTransport: async () => {
      gets += 1;
      return { Body: Readable.from(zip) };
    },
  });
  if (unauthorized.authorizedDownloadInvoked) die('unauthorized path invoked authorized download');
  if (gets !== 0) die('unauthorized path performed a network download');

  const live = await dispatchCharacterMasterFromWorker({
    env: {
      CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD,
      CHARACTER_EXECUTION_MODE: 'live',
      CHARACTER_WORKER_ROOT: root,
      GOAT_ALLOW_REAL_DOWNLOAD: 'true',
      PAID_EXECUTION_AUTHORIZED: 'true',
      AUTHORIZED_IMAGE_DIGEST: digest,
      AUTHORIZED_IMAGE_REF: `ghcr.io/example/ddp-runpod-blender@${digest}`,
      CHARACTER_EXECUTION_ID: 'exec-auth-entry-0001',
      ALLOW_PAID_GPU_LAUNCH: 'false',
    },
    root,
    authorizationReceipt: {
      authorizationName: REQUIRED_LIVE_AUTHORIZATION_NAME,
      authorizationId: 'auth-entry-0001',
      characterId: GOAT_CHARACTER_ID,
      permitsRealSourceDownload: true,
      consumed: false,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      executionId: 'exec-auth-entry-0001',
      authorizedImageDigest: digest,
      sourceKey: LOCKED_SOURCE_KEY,
      expectedSizeBytes: LOCKED_SOURCE_SIZE,
      expectedSha256: LOCKED_SOURCE_SHA256,
    },
    authorizedImageDigest: digest,
    imageRef: `ghcr.io/example/ddp-runpod-blender@${digest}`,
    executionId: 'exec-auth-entry-0001',
    objectKey: LOCKED_SOURCE_KEY,
    workspaceDir: workspace,
    artifactDir: path.join(workspace, 'artifacts'),
    pythonBin: process.env.PYTHON_BIN || 'python3',
    authorizedTestTransport: true,
    testExpectedSize: zip.length,
    testExpectedSha256: sha256(zip),
    sourceTransport: async () => {
      gets += 1;
      return { Body: Readable.from(zip) };
    },
    runBlenderProbe: false,
    createWorkingCopy: false,
  });
  if (live.authorizedDownloadInvoked !== 1) die(`expected one authorized download, got ${live.authorizedDownloadInvoked}`);
  if (gets !== 1) die(`expected one transport get, got ${gets}`);
  if (!live.department || live.department.dryRunFlagPresent || !live.department.executeFlagPresent) {
    die(`live argv invalid: ${JSON.stringify(live.department && live.department.sanitizedArgv)}`);
  }
  if (live.goatProductionReady !== false) die('goatProductionReady must remain false');
  const capability = compileCharacterCapability({ root });
  if (capability.authorizedRealSourceDownloadCapable !== true) die('authorized download not capable');
  if (capability.liveCharacterDepartmentCapable !== true) die('live department not capable');
  const receipt = {
    schema: 'TIVVLEJOY_AUTHORIZED_DOWNLOAD_ENTRYPOINT_PROOF_V1',
    authorizedDownloadInvoked: live.authorizedDownloadInvoked,
    transportGets: gets,
    executeFlagPresent: live.department.executeFlagPresent,
    dryRunFlagPresent: live.department.dryRunFlagPresent,
    observedSize: live.materialize && live.materialize.observedSize,
    observedSha256: live.materialize && live.materialize.observedSha256,
    goatProductionReady: false,
    realGoatDownloaded: false,
    runpodLaunchCount: 0,
  };
  const out = process.env.AUTHORIZED_DOWNLOAD_ENTRYPOINT_RECEIPT || path.join(workspace, 'authorized-download-entrypoint.receipt.json');
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, receipt: out, authorizedDownloadInvoked: 1 })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };

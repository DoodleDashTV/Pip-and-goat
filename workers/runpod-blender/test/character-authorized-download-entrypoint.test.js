'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');

const { dispatchCharacterMasterFromWorker } = require('../src/character-worker-entry');
const { compileCharacterCapability } = require('../src/character-capability');
const {
  CHARACTER_MASTER_BUILD,
  GOAT_CHARACTER_ID,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
} = require('../src/character-job-kinds');
const { validGoatLikeZip, traversalZip } = require('./character-zip-fixtures');

const repoRoot = path.resolve(__dirname, '../../..');
const workerRoot = path.resolve(__dirname, '..');
const DIGEST = `sha256:${'ab'.repeat(32)}`;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function receipt(overrides = {}) {
  return {
    authorizationName: REQUIRED_LIVE_AUTHORIZATION_NAME,
    authorizationId: 'auth-entrypoint-0001',
    characterId: GOAT_CHARACTER_ID,
    permitsRealSourceDownload: true,
    consumed: false,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    executionId: 'exec-entrypoint-0001',
    authorizedImageDigest: DIGEST,
    sourceKey: LOCKED_SOURCE_KEY,
    expectedSizeBytes: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
    ...overrides,
  };
}

function authorizedEnv(overrides = {}) {
  return {
    CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD,
    CHARACTER_EXECUTION_MODE: 'live',
    CHARACTER_WORKER_ROOT: repoRoot,
    GOAT_ALLOW_REAL_DOWNLOAD: 'true',
    PAID_EXECUTION_AUTHORIZED: 'true',
    AUTHORIZED_IMAGE_DIGEST: DIGEST,
    AUTHORIZED_IMAGE_REF: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`,
    CHARACTER_EXECUTION_ID: 'exec-entrypoint-0001',
    ALLOW_PAID_GPU_LAUNCH: 'false',
    CLOUD_RENDER_ENABLED: 'false',
    ...overrides,
  };
}

function trackingTransport(body, extras = {}) {
  const counts = { getObject: 0, putObject: 0, deleteObject: 0 };
  return {
    counts,
    sourceTransport: async ({ method }) => {
      if (method === 'GetObject') {
        counts.getObject += 1;
        return { Body: Readable.from(Buffer.isBuffer(body) ? body : Buffer.from(body)) };
      }
      if (method === 'PutObject') {
        counts.putObject += 1;
        throw new Error('write not allowed');
      }
      if (method === 'DeleteObject') {
        counts.deleteObject += 1;
        throw new Error('write not allowed');
      }
      throw new Error(`unexpected method ${method}`);
    },
    ...extras,
  };
}

function serveZip(buf, { truncate = false } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const payload = truncate ? buf.subarray(0, Math.max(1, Math.floor(buf.length / 2))) : buf;
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(payload.length) });
      res.end(payload);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/Goat_FINN.zip`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

async function authorizedDispatch(input = {}) {
  const zip = input.zip || validGoatLikeZip();
  const workspace = input.workspaceDir || fs.mkdtempSync(path.join(os.tmpdir(), 'goat-entry-'));
  const transport = input.sourceTransport
    ? { sourceTransport: input.sourceTransport, counts: input.counts }
    : trackingTransport(zip);
  const result = await dispatchCharacterMasterFromWorker({
    env: authorizedEnv(input.env),
    root: repoRoot,
    authorizationReceipt: input.authorizationReceipt || receipt(),
    authorizedImageDigest: DIGEST,
    imageRef: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`,
    executionId: 'exec-entrypoint-0001',
    objectKey: input.objectKey || LOCKED_SOURCE_KEY,
    workspaceDir: workspace,
    artifactDir: path.join(workspace, 'artifacts'),
    pythonBin: process.env.PYTHON_BIN || 'python3',
    authorizedTestTransport: true,
    testExpectedSize: input.testExpectedSize ?? zip.length,
    testExpectedSha256: input.testExpectedSha256 ?? sha256(zip),
    sourceTransport: transport.sourceTransport,
    runBlenderProbe: false,
    createWorkingCopy: false,
  });
  return { result, workspace, counts: transport.counts, zip };
}

test('unauthorized execution performs zero network downloads and zero live builds', async () => {
  const zip = validGoatLikeZip();
  const transport = trackingTransport(zip);
  let blenderCalls = 0;
  const result = await dispatchCharacterMasterFromWorker({
    env: {
      CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD,
      CHARACTER_EXECUTION_MODE: 'dry-run',
      CHARACTER_WORKER_ROOT: repoRoot,
      ALLOW_PAID_GPU_LAUNCH: 'false',
    },
    root: repoRoot,
    sourceTransport: async () => {
      blenderCalls += 1;
      return transport.sourceTransport({ method: 'GetObject', key: LOCKED_SOURCE_KEY });
    },
    pythonBin: process.env.PYTHON_BIN || 'python3',
  });
  assert.equal(result.authorizedDownloadInvoked || 0, 0);
  assert.equal(result.networkDownloadInvoked === true, false);
  assert.equal(transport.counts.getObject, 0);
  assert.equal(blenderCalls, 0);
  assert.equal(result.goatProductionReady, false);
});

test('production worker entrypoint calls downloadAuthorizedGoatSource exactly once', async () => {
  const { result, counts, workspace, zip } = await authorizedDispatch();
  assert.equal(result.jobKind, CHARACTER_MASTER_BUILD);
  assert.equal(result.authorizedDownloadInvoked, 1);
  assert.equal(counts.getObject, 1);
  assert.equal(counts.putObject, 0);
  assert.equal(counts.deleteObject, 0);
  assert.equal(result.materialize.observedSize, zip.length);
  assert.equal(result.materialize.observedSha256, sha256(zip));
  assert.equal(result.materialize.zip.code, 'ZIP_SAFE');
  assert.equal(result.materialize.bufferedEntireArchive, false);
  assert.equal(result.department.executeFlagPresent, true);
  assert.equal(result.department.dryRunFlagPresent, false);
  assert.match(result.department.sanitizedArgv.join(' '), /--source-zip/);
  assert.equal(result.goatProductionReady, false);
  assert.notEqual(result.characterMasterGate, 'PASS');
  assert.match(String(result.characterMasterGate), /BLOCKED|FAILED/);
  assert.equal(fs.existsSync(path.join(workspace, 'ephemeral', 'Goat_FINN.zip')), true);
});

test('loopback HTTP test transport is streamed, hashed, and ZIP-validated', async () => {
  const zip = validGoatLikeZip();
  const server = await serveZip(zip);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-http-'));
  try {
    const result = await dispatchCharacterMasterFromWorker({
      env: authorizedEnv({
        GOAT_SOURCE_TEST_TRANSPORT: 'true',
        GOAT_SOURCE_TEST_URL: server.url,
        GOAT_SOURCE_TEST_EXPECTED_SIZE: String(zip.length),
        GOAT_SOURCE_TEST_EXPECTED_SHA256: sha256(zip),
      }),
      root: repoRoot,
      authorizationReceipt: receipt(),
      authorizedImageDigest: DIGEST,
      imageRef: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`,
      executionId: 'exec-entrypoint-0001',
      objectKey: LOCKED_SOURCE_KEY,
      workspaceDir: workspace,
      artifactDir: path.join(workspace, 'artifacts'),
      pythonBin: process.env.PYTHON_BIN || 'python3',
      authorizedTestTransport: true,
      testExpectedSize: zip.length,
      testExpectedSha256: sha256(zip),
      runBlenderProbe: false,
      createWorkingCopy: false,
    });
    assert.equal(result.authorizedDownloadInvoked, 1);
    assert.equal(result.materialize.observedSha256, sha256(zip));
    assert.equal(result.department.dryRunFlagPresent, false);
    assert.equal(result.department.executeFlagPresent, true);
  } finally {
    await server.close();
  }
});

test('wrong key, character, digest, capability, size, hash, missing auth, truncated body, and corrupt ZIP fail before Blender', async () => {
  const zip = validGoatLikeZip();
  const cases = [
    ['wrong key', { objectKey: 'other/key.zip', authorizationReceipt: receipt({ sourceKey: 'other/key.zip' }) }],
    ['wrong character', { authorizationReceipt: receipt({ characterId: 'CHAR_PIP_001' }) }],
    [
      'wrong digest',
      {
        env: { AUTHORIZED_IMAGE_DIGEST: `sha256:${'cd'.repeat(32)}` },
        authorizationReceipt: receipt({ authorizedImageDigest: `sha256:${'cd'.repeat(32)}` }),
      },
    ],
    ['missing authorization', { authorizationReceipt: null, env: { PAID_EXECUTION_AUTHORIZED: 'false' } }],
    ['wrong size on stream', { testExpectedSize: zip.length + 1 }],
    ['wrong hash on stream', { testExpectedSha256: 'aa'.repeat(32) }],
  ];
  for (const [label, input] of cases) {
    const { result, counts } = await authorizedDispatch(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.department == null || result.department.executeFlagPresent !== true || result.code !== 'LIVE_DEPARTMENT_EXECUTED', true, label);
    if (label.startsWith('wrong size') || label.startsWith('wrong hash')) {
      assert.equal(counts.getObject, 1, label);
    } else {
      assert.equal(counts.getObject, 0, label);
    }
    assert.equal(result.goatProductionReady, false, label);
  }

  const truncated = await authorizedDispatch({
    sourceTransport: async () => ({ Body: Readable.from(zip.subarray(0, 8)) }),
    counts: { getObject: 1, putObject: 0, deleteObject: 0 },
    testExpectedSize: zip.length,
    testExpectedSha256: sha256(zip),
  });
  assert.equal(truncated.result.ok, false);
  assert.ok(['SIZE_MISMATCH', 'STREAM_FAILED', 'SIZE_EXCEEDED'].includes(truncated.result.code));

  const corrupt = traversalZip();
  const corruptRun = await authorizedDispatch({
    zip: corrupt,
    testExpectedSize: corrupt.length,
    testExpectedSha256: sha256(corrupt),
  });
  assert.equal(corruptRun.result.ok, false);
  assert.equal(corruptRun.result.code, 'ZIP_TRAVERSAL');
});

test('partial temporary files are removed after stream or ZIP failure', async () => {
  const zip = validGoatLikeZip();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-partial-'));
  const dest = path.join(workspace, 'ephemeral', 'Goat_FINN.zip');
  const { result } = await authorizedDispatch({
    workspaceDir: workspace,
    testExpectedSha256: 'bb'.repeat(32),
    testExpectedSize: zip.length,
  });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(dest), false);
});

test('source-storage write methods cannot be invoked by the authorized download path', async () => {
  const joined = [
    'src/character-source-materialize.js',
    'src/character-master.js',
    'src/character-worker-entry.js',
    'src/worker.js',
  ]
    .map((rel) => fs.readFileSync(path.join(workerRoot, rel), 'utf8'))
    .join('\n');
  assert.equal(/PutObjectCommand/.test(joined.split('async function downloadAuthorizedGoatSource')[1] || ''), false);
  const capability = compileCharacterCapability({ root: repoRoot });
  assert.equal(capability.authorizedRealSourceDownloadCapable, true);
  assert.equal(capability.sourceWritesForbidden, true);
  assert.equal(capability.entrypointVersion, 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V6');
  assert.equal(capability.durableArtifactPersistenceCapable, true);
  assert.equal(capability.liveDepartmentUsesBlenderRuntime, true);
  assert.equal(capability.requiredLiveAuthorizationName, 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V6');
  assert.equal(process.env.ALLOW_PAID_GPU_LAUNCH === 'true', false);
});

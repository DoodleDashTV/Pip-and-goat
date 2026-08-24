'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { evaluateRealDownloadAuthorization } = require('../src/character-download-gate');
const {
  GOAT_CHARACTER_ID,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
} = require('../src/character-job-kinds');

const DIGEST = `sha256:${'ab'.repeat(32)}`;

function receipt(overrides = {}) {
  return {
    authorizationName: REQUIRED_LIVE_AUTHORIZATION_NAME,
    authorizationId: 'auth-test-0001',
    characterId: GOAT_CHARACTER_ID,
    permitsRealSourceDownload: true,
    consumed: false,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    executionId: 'exec-test-0001',
    authorizedImageDigest: DIGEST,
    sourceKey: LOCKED_SOURCE_KEY,
    expectedSizeBytes: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
    ...overrides,
  };
}

function completeInput(overrides = {}) {
  return {
    executionMode: 'live',
    authorizationReceipt: receipt(),
    objectKey: LOCKED_SOURCE_KEY,
    expectedSize: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
    authorizedImageDigest: DIGEST,
    imageRef: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`,
    executionId: 'exec-test-0001',
    outputDestination: '/tmp/tivvlejoy-character-out',
    ...overrides,
  };
}

function completeEnv(overrides = {}) {
  return {
    GOAT_ALLOW_REAL_DOWNLOAD: 'true',
    PAID_EXECUTION_AUTHORIZED: 'true',
    AUTHORIZED_IMAGE_DIGEST: DIGEST,
    AUTHORIZED_IMAGE_REF: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`,
    CHARACTER_EXECUTION_ID: 'exec-test-0001',
    ...overrides,
  };
}

function assertForbidden(input, env) {
  const result = evaluateRealDownloadAuthorization(input, env);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REAL_GOAT_DOWNLOAD_FORBIDDEN');
  assert.equal(result.realGoatDownloaded, false);
  assert.equal(result.paidFlagsSetByWorker, false);
  return result;
}

test('no authorization receipt is forbidden', () => {
  assertForbidden({ executionMode: 'live', outputDestination: '/tmp/x' }, completeEnv());
});

test('each missing authorization condition is independently forbidden', () => {
  const cases = [
    ['execution mode dry-run', completeInput({ executionMode: 'dry-run' }), completeEnv()],
    ['missing allow flag', completeInput(), completeEnv({ GOAT_ALLOW_REAL_DOWNLOAD: 'false' })],
    ['missing paid flag', completeInput(), completeEnv({ PAID_EXECUTION_AUTHORIZED: 'false' })],
    ['wrong character', completeInput({ authorizationReceipt: receipt({ characterId: 'CHAR_PIP_001' }) }), completeEnv()],
    ['wrong key', completeInput({ objectKey: 'other.zip', authorizationReceipt: receipt({ sourceKey: 'other.zip' }) }), completeEnv()],
    ['wrong size', completeInput({ expectedSize: 12, authorizationReceipt: receipt({ expectedSizeBytes: 12 }) }), completeEnv()],
    ['wrong hash', completeInput({ expectedSha256: 'aa'.repeat(32), authorizationReceipt: receipt({ expectedSha256: 'aa'.repeat(32) }) }), completeEnv()],
    ['mutable image', completeInput({ authorizedImageDigest: 'latest', imageRef: 'ghcr.io/example/ddp-runpod-blender:latest' }), completeEnv({ AUTHORIZED_IMAGE_DIGEST: 'latest' })],
    ['wrong digest', completeInput({ authorizedImageDigest: `sha256:${'cd'.repeat(32)}` }), completeEnv()],
    ['expired', completeInput({ authorizationReceipt: receipt({ expiresAt: '2020-01-01T00:00:00.000Z' }) }), completeEnv()],
    ['consumed', completeInput({ authorizationReceipt: receipt({ consumed: true }) }), completeEnv()],
    ['invalid V1', completeInput({ authorizationReceipt: receipt({ authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1' }) }), completeEnv()],
    ['invalid V2', completeInput({ authorizationReceipt: receipt({ authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V2' }) }), completeEnv()],
    ['locked destination', completeInput({ outputDestination: 'tivvlejoy-assets/characters/CHAR_GOAT_001/source' }), completeEnv()],
    ['malformed receipt', { executionMode: 'live', authorizationReceiptJson: '{not-json', outputDestination: '/tmp/tivvlejoy-character-out', authorizedImageDigest: DIGEST, imageRef: `ghcr.io/example/ddp-runpod-blender@${DIGEST}`, executionId: 'exec-test-0001' }, completeEnv()],
  ];
  for (const [label, input, env] of cases) {
    const result = assertForbidden(input, env);
    assert.ok(result.failedConditions.length > 0, label);
  }
});

test('complete unconsumed paid receipt opens the gate without downloading', () => {
  const result = evaluateRealDownloadAuthorization(completeInput(), completeEnv());
  assert.equal(result.ok, true);
  assert.equal(result.code, 'REAL_GOAT_DOWNLOAD_AUTHORIZED');
  assert.equal(result.realGoatDownloaded, false);
  assert.equal(result.paidFlagsSetByWorker, false);
  assert.equal(result.objectKey, LOCKED_SOURCE_KEY);
});

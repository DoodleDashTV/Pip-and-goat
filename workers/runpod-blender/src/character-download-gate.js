'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  GOAT_CHARACTER_ID,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_PREFIX,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  INVALID_PAID_AUTHORIZATION_NAMES,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
} = require('./character-job-kinds');

const REAL_GOAT_DOWNLOAD_FORBIDDEN = 'REAL_GOAT_DOWNLOAD_FORBIDDEN';
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const EXECUTION_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const SECRET_KEY_RE =
  /secret|token|password|authorizationkey|signedurl|accesskey|apikey|credential|session/i;

function strip(value) {
  return String(value == null ? '' : value).trim();
}

function envTrue(env, key) {
  return strip(env[key]) === 'true';
}

function isImmutableDigest(value) {
  return DIGEST_RE.test(strip(value));
}

function parseIso(value) {
  const raw = strip(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function loadAuthorizationReceipt(input = {}, env = {}) {
  if (input.authorizationReceipt && typeof input.authorizationReceipt === 'object') {
    return { ok: true, receipt: input.authorizationReceipt, source: 'object' };
  }
  const rawJson = strip(input.authorizationReceiptJson || env.PAID_AUTHORIZATION_JSON);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: 'authorization receipt JSON is not an object' };
      }
      return { ok: true, receipt: parsed, source: 'json' };
    } catch {
      return { ok: false, reason: 'authorization receipt JSON is malformed' };
    }
  }
  const receiptPath = strip(input.authorizationReceiptPath || env.PAID_AUTHORIZATION_RECEIPT_PATH);
  if (receiptPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, reason: 'authorization receipt file is not an object' };
      }
      return { ok: true, receipt: parsed, source: 'file' };
    } catch (error) {
      return { ok: false, reason: `authorization receipt file is unreadable or malformed: ${error.code || 'READ_FAILED'}` };
    }
  }
  return { ok: false, reason: 'authorization receipt is missing' };
}

function sanitizeAuthorizationReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string' && /https?:\/\/\S*(X-Amz-|token=|Signature=)/i.test(value)) {
      out[key] = '[redacted-url]';
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeAuthorizationReceipt(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function destinationOutsideLockedSource(destination) {
  const raw = strip(destination);
  if (!raw) return false;
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized === LOCKED_SOURCE_PREFIX || normalized.startsWith(`${LOCKED_SOURCE_PREFIX}/`)) {
    return false;
  }
  const resolved = path.resolve(raw).replace(/\\/g, '/');
  if (resolved.includes(`/${LOCKED_SOURCE_PREFIX}/`) || resolved.endsWith(`/${LOCKED_SOURCE_PREFIX}`)) {
    return false;
  }
  return true;
}

function collectFailedConditions(input = {}, env = {}, nowMs = Date.now()) {
  const failed = [];
  const executionMode = strip(input.executionMode);
  if (executionMode !== 'live') {
    failed.push({ condition: 'executionMode', reason: 'execution mode must be live' });
  }

  const loaded = loadAuthorizationReceipt(input, env);
  const receipt = loaded.ok ? loaded.receipt : null;
  if (!loaded.ok) {
    failed.push({ condition: 'authorizationReceipt', reason: loaded.reason });
  }

  const authorizationName = strip(receipt && (receipt.authorizationName || receipt.authorization || receipt.schema));
  if (!receipt) {
    failed.push({ condition: 'authorizationName', reason: 'authorization name is missing' });
  } else if (INVALID_PAID_AUTHORIZATION_NAMES.includes(authorizationName)) {
    failed.push({
      condition: 'authorizationName',
      reason: 'authorization is invalid, superseded, and must not be reused',
    });
  } else if (authorizationName !== REQUIRED_LIVE_AUTHORIZATION_NAME) {
    failed.push({
      condition: 'authorizationName',
      reason: 'authorization is not the required unconsumed live receipt',
    });
  }

  if (!receipt) {
    failed.push({ condition: 'consumed', reason: 'authorization consumed state cannot be evaluated' });
    failed.push({ condition: 'expiresAt', reason: 'authorization expiry cannot be evaluated' });
    failed.push({ condition: 'characterId', reason: 'authorization character binding is missing' });
    failed.push({
      condition: 'permitsRealSourceDownload',
      reason: 'authorization does not permit real source download',
    });
    failed.push({ condition: 'sourceKey', reason: 'authorization source key is missing' });
    failed.push({ condition: 'expectedSize', reason: 'authorization expected size is missing' });
    failed.push({ condition: 'expectedSha256', reason: 'authorization expected SHA-256 is missing' });
    failed.push({ condition: 'authorizedImageDigest', reason: 'authorization image digest is missing' });
    failed.push({ condition: 'executionId', reason: 'authorization execution id is missing' });
  } else {
    if (receipt.consumed === true || strip(receipt.consumed) === 'true') {
      failed.push({ condition: 'consumed', reason: 'authorization is consumed' });
    }
    const expiresAt = parseIso(receipt.expiresAt);
    if (expiresAt == null) {
      failed.push({ condition: 'expiresAt', reason: 'authorization expiry is missing or malformed' });
    } else if (expiresAt <= nowMs) {
      failed.push({ condition: 'expiresAt', reason: 'authorization is expired' });
    }
    if (strip(receipt.characterId) !== GOAT_CHARACTER_ID) {
      failed.push({ condition: 'characterId', reason: 'authorization is not bound to CHAR_GOAT_001' });
    }
    if (receipt.permitsRealSourceDownload !== true) {
      failed.push({
        condition: 'permitsRealSourceDownload',
        reason: 'authorization does not permit real source download',
      });
    }
    const receiptKey = strip(receipt.sourceKey || receipt.objectKey);
    const requestKey = strip(input.objectKey || receiptKey);
    if (receiptKey !== LOCKED_SOURCE_KEY || requestKey !== LOCKED_SOURCE_KEY) {
      failed.push({ condition: 'sourceKey', reason: 'source key is not the locked CHAR_GOAT_001 archive' });
    }
    const receiptSize = Number(receipt.expectedSizeBytes ?? receipt.expectedSize);
    const requestSize = Number(input.expectedSize ?? receiptSize);
    if (receiptSize !== LOCKED_SOURCE_SIZE || requestSize !== LOCKED_SOURCE_SIZE) {
      failed.push({ condition: 'expectedSize', reason: 'expected size is not the locked archive size' });
    }
    const receiptSha = strip(receipt.expectedSha256).toLowerCase();
    const requestSha = strip(input.expectedSha256 || receiptSha).toLowerCase();
    if (receiptSha !== LOCKED_SOURCE_SHA256 || requestSha !== LOCKED_SOURCE_SHA256) {
      failed.push({ condition: 'expectedSha256', reason: 'expected SHA-256 is not the locked archive hash' });
    }
    const receiptDigest = strip(receipt.authorizedImageDigest || receipt.imageDigest);
    const launcherDigest = strip(input.authorizedImageDigest || env.AUTHORIZED_IMAGE_DIGEST);
    if (!isImmutableDigest(receiptDigest) || !isImmutableDigest(launcherDigest) || receiptDigest !== launcherDigest) {
      failed.push({
        condition: 'authorizedImageDigest',
        reason: 'authorized immutable image digest is missing, mutable, or mismatched',
      });
    }
    const receiptExecutionId = strip(receipt.executionId);
    const requestExecutionId = strip(input.executionId || env.CHARACTER_EXECUTION_ID);
    if (
      !EXECUTION_ID_RE.test(receiptExecutionId) ||
      !EXECUTION_ID_RE.test(requestExecutionId) ||
      receiptExecutionId !== requestExecutionId
    ) {
      failed.push({ condition: 'executionId', reason: 'execution id is missing, malformed, or mismatched' });
    }
  }

  if (!envTrue(env, 'GOAT_ALLOW_REAL_DOWNLOAD')) {
    failed.push({
      condition: 'GOAT_ALLOW_REAL_DOWNLOAD',
      reason: 'GOAT_ALLOW_REAL_DOWNLOAD is not true; the worker never sets this flag',
    });
  }
  if (!envTrue(env, 'PAID_EXECUTION_AUTHORIZED')) {
    failed.push({
      condition: 'PAID_EXECUTION_AUTHORIZED',
      reason: 'PAID_EXECUTION_AUTHORIZED is not true; the worker never sets this flag',
    });
  }

  const imageRef = strip(input.imageRef || env.AUTHORIZED_IMAGE_REF || env.RUNPOD_WORKER_IMAGE);
  const launcherDigest = strip(input.authorizedImageDigest || env.AUTHORIZED_IMAGE_DIGEST);
  if (!isImmutableDigest(launcherDigest) || (imageRef && !imageRef.includes(`@${launcherDigest}`))) {
    if (!failed.some((item) => item.condition === 'authorizedImageDigest')) {
      failed.push({
        condition: 'imageIdentity',
        reason: 'launcher image identity is missing, mutable, or not digest-pinned',
      });
    }
  }

  const destination = input.outputDestination || input.workspaceDir || env.CHARACTER_OUTPUT_DIR;
  if (!destinationOutsideLockedSource(destination)) {
    failed.push({
      condition: 'outputDestination',
      reason: 'output destination is missing or inside the locked source prefix',
    });
  }

  return { failed, receipt: receipt ? sanitizeAuthorizationReceipt(receipt) : null };
}

function evaluateRealDownloadAuthorization(input = {}, env = process.env, nowMs = Date.now()) {
  const { failed, receipt } = collectFailedConditions(input, env, nowMs);
  if (failed.length > 0) {
    return {
      ok: false,
      code: REAL_GOAT_DOWNLOAD_FORBIDDEN,
      reason: 'Real Goat download remains forbidden until every paid-authorization condition is satisfied.',
      failedConditions: failed,
      authorizationReceipt: receipt,
      realGoatDownloaded: false,
      paidFlagsSetByWorker: false,
    };
  }
  return {
    ok: true,
    code: 'REAL_GOAT_DOWNLOAD_AUTHORIZED',
    reason: 'Complete paid-authorization gate passed. Network download still requires an explicit launcher request.',
    failedConditions: [],
    authorizationReceipt: receipt,
    realGoatDownloaded: false,
    paidFlagsSetByWorker: false,
    characterId: GOAT_CHARACTER_ID,
    objectKey: LOCKED_SOURCE_KEY,
    expectedSize: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
  };
}

module.exports = {
  REAL_GOAT_DOWNLOAD_FORBIDDEN,
  evaluateRealDownloadAuthorization,
  loadAuthorizationReceipt,
  sanitizeAuthorizationReceipt,
  destinationOutsideLockedSource,
  collectFailedConditions,
};

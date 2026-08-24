'use strict';

const CHARACTER_MASTER_BUILD = 'CHARACTER_MASTER_BUILD';
const CHARACTER_SOURCE_MATERIALIZE = 'CHARACTER_SOURCE_MATERIALIZE';
const CHARACTER_BUILD = 'CHARACTER_BUILD';
const FINAL_1080P_RENDER = 'FINAL_1080P_RENDER';

const CHARACTER_JOB_KINDS = Object.freeze([
  CHARACTER_MASTER_BUILD,
  CHARACTER_SOURCE_MATERIALIZE,
  CHARACTER_BUILD,
]);

const RENDER_JOB_KINDS = Object.freeze([FINAL_1080P_RENDER, 'DRAFT_HD']);

const FORBIDDEN_WORKER_DIGESTS = Object.freeze([
  'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830',
  'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed',
]);

const REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS = Object.freeze([
  ...FORBIDDEN_WORKER_DIGESTS,
  'sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e',
]);

const ENTRYPOINT_VERSION = 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V3';
const CAPABILITY_SCHEMA_V1 = 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V1';
const CAPABILITY_SCHEMA = 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2';
const GOAT_CHARACTER_ID = 'CHAR_GOAT_001';
const DEPARTMENT_STAGE_COUNT = 26;
const STUDIO_BLENDER = '4.2.2';
const LOCKED_SOURCE_KEY = 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip';
const LOCKED_SOURCE_PREFIX = 'tivvlejoy-assets/characters/CHAR_GOAT_001/source';
const LOCKED_SOURCE_SHA256 = 'f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5';
const LOCKED_SOURCE_SIZE = 269512136;
const INVALID_PAID_AUTHORIZATION_NAMES = Object.freeze([
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1',
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V2',
]);
const REQUIRED_LIVE_AUTHORIZATION_NAME = 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V3';
const EXECUTION_MODE_DRY_RUN = 'dry-run';
const EXECUTION_MODE_LIVE = 'live';

function strip(value) {
  return String(value || '').trim();
}

function resolveDeclaredJobKind(env = {}) {
  return strip(env.CHARACTER_JOB_KIND || env.JOB_KIND || env.DDP_JOB_KIND);
}

function isCharacterJobKind(kind) {
  return CHARACTER_JOB_KINDS.includes(strip(kind));
}

function isFinal1080p(kind) {
  return strip(kind) === FINAL_1080P_RENDER;
}

function isForbiddenDigest(digest) {
  return FORBIDDEN_WORKER_DIGESTS.includes(strip(digest));
}

function isRejectedLiveExecutionDigest(digest) {
  return REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS.includes(strip(digest));
}

function resolveExecutionMode(input = {}, env = {}) {
  const raw = strip(input.executionMode || env.CHARACTER_EXECUTION_MODE || env.EXECUTION_MODE);
  if (!raw) {
    return {
      ok: true,
      mode: EXECUTION_MODE_DRY_RUN,
      explicit: false,
      defaulted: true,
      blenderFlag: '--dry-run',
    };
  }
  if (raw === EXECUTION_MODE_DRY_RUN) {
    return {
      ok: true,
      mode: EXECUTION_MODE_DRY_RUN,
      explicit: true,
      defaulted: false,
      blenderFlag: '--dry-run',
    };
  }
  if (raw === EXECUTION_MODE_LIVE) {
    return {
      ok: true,
      mode: EXECUTION_MODE_LIVE,
      explicit: true,
      defaulted: false,
      blenderFlag: '--execute',
    };
  }
  return {
    ok: false,
    mode: null,
    explicit: false,
    defaulted: false,
    code: 'UNKNOWN_EXECUTION_MODE',
    reason: 'Execution mode must be dry-run or live.',
  };
}

module.exports = {
  CHARACTER_MASTER_BUILD,
  CHARACTER_SOURCE_MATERIALIZE,
  CHARACTER_BUILD,
  FINAL_1080P_RENDER,
  CHARACTER_JOB_KINDS,
  RENDER_JOB_KINDS,
  FORBIDDEN_WORKER_DIGESTS,
  REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS,
  ENTRYPOINT_VERSION,
  CAPABILITY_SCHEMA,
  CAPABILITY_SCHEMA_V1,
  GOAT_CHARACTER_ID,
  DEPARTMENT_STAGE_COUNT,
  STUDIO_BLENDER,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_PREFIX,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  INVALID_PAID_AUTHORIZATION_NAMES,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
  EXECUTION_MODE_DRY_RUN,
  EXECUTION_MODE_LIVE,
  strip,
  resolveDeclaredJobKind,
  resolveExecutionMode,
  isCharacterJobKind,
  isFinal1080p,
  isForbiddenDigest,
  isRejectedLiveExecutionDigest,
};

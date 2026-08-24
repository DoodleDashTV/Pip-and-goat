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

const ENTRYPOINT_VERSION = 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V1';
const CAPABILITY_SCHEMA = 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V1';
const GOAT_CHARACTER_ID = 'CHAR_GOAT_001';
const DEPARTMENT_STAGE_COUNT = 26;
const STUDIO_BLENDER = '4.2.2';

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

module.exports = {
  CHARACTER_MASTER_BUILD,
  CHARACTER_SOURCE_MATERIALIZE,
  CHARACTER_BUILD,
  FINAL_1080P_RENDER,
  CHARACTER_JOB_KINDS,
  RENDER_JOB_KINDS,
  FORBIDDEN_WORKER_DIGESTS,
  ENTRYPOINT_VERSION,
  CAPABILITY_SCHEMA,
  GOAT_CHARACTER_ID,
  DEPARTMENT_STAGE_COUNT,
  STUDIO_BLENDER,
  strip,
  resolveDeclaredJobKind,
  isCharacterJobKind,
  isFinal1080p,
  isForbiddenDigest,
};

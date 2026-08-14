'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { EXIT_CLASS, EXIT_CODE, classifyCode, exitCodeFor } = require('../src/exit-codes');

test('every classification has a distinct numeric exit code', () => {
  const codes = Object.values(EXIT_CLASS).map((c) => exitCodeFor(c));
  assert.equal(new Set(codes).size, codes.length, 'exit codes must be unique per class');
});

test('classifyCode maps internal codes to stable classifications', () => {
  assert.equal(classifyCode('NO_JOB_ID'), EXIT_CLASS.ENV_CONFIGURATION_FAILURE);
  assert.equal(classifyCode('R2_CONFIG_INCOMPLETE'), EXIT_CLASS.ENV_CONFIGURATION_FAILURE);
  assert.equal(classifyCode('MANIFEST_MISSING'), EXIT_CLASS.MANIFEST_FAILURE);
  assert.equal(classifyCode('MANIFEST_INVALID'), EXIT_CLASS.MANIFEST_FAILURE);
  assert.equal(classifyCode('ASSET_MISSING_OR_HASH_MISMATCH'), EXIT_CLASS.ASSET_FAILURE);
  assert.equal(classifyCode('BLENDER_NOT_FOUND'), EXIT_CLASS.BLENDER_BINARY_FAILURE);
  assert.equal(classifyCode('BLENDER_FAILED'), EXIT_CLASS.BLENDER_INITIALIZATION_FAILURE);
  assert.equal(classifyCode('EEVEE_CONTEXT_FAILED'), EXIT_CLASS.EEVEE_CONTEXT_FAILURE);
  assert.equal(classifyCode('FFMPEG_FAILED'), EXIT_CLASS.FFMPEG_FAILURE);
  assert.equal(classifyCode('R2_UPLOAD_FAILED'), EXIT_CLASS.UPLOAD_FAILURE);
  assert.equal(classifyCode('TIMEOUT'), EXIT_CLASS.TIMEOUT);
  assert.equal(classifyCode('NETWORK_TIMEOUT'), EXIT_CLASS.TIMEOUT);
});

test('unknown codes classify as UNKNOWN_FATAL (never OK)', () => {
  assert.equal(classifyCode('SOMETHING_NEW'), EXIT_CLASS.UNKNOWN_FATAL);
  assert.equal(classifyCode(undefined), EXIT_CLASS.UNKNOWN_FATAL);
  assert.notEqual(classifyCode('SOMETHING_NEW'), EXIT_CLASS.OK);
});

test('OK maps to exit 0; failures map to non-zero', () => {
  assert.equal(exitCodeFor(EXIT_CLASS.OK), 0);
  for (const c of Object.values(EXIT_CLASS)) {
    if (c === EXIT_CLASS.OK) continue;
    assert.ok(exitCodeFor(c) > 0, `${c} must be non-zero`);
  }
  assert.equal(EXIT_CODE.EEVEE_CONTEXT_FAILURE, 17);
});

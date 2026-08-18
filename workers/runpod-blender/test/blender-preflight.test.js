'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runBlenderPreflight, looksLikeGlContextFailure, PREFLIGHT_SENTINEL, PREFLIGHT_PY } = require('../src/blender-preflight');

test('preflight scene includes a camera (root-cause fix)', () => {
  // The OLD gpu-health benchmark had no camera -> "Cannot render, no camera".
  assert.match(PREFLIGHT_PY, /camera_add|cameras\.new/);
  assert.match(PREFLIGHT_PY, /light_add/);
  assert.match(PREFLIGHT_PY, /scene\.camera\s*=/);
});

test('preflight passes when the injected blender reports the sentinel', () => {
  const runCommand = (bin, args) => {
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    return { status: 0, stdout: `DDP_PREFLIGHT_ENGINE_USED=BLENDER_EEVEE_NEXT\n${PREFLIGHT_SENTINEL} bytes=2711` };
  };
  const res = runBlenderPreflight({ runCommand, env: {} });
  assert.equal(res.ok, true);
  assert.equal(res.code, null);
});

test('preflight classifies a missing Blender binary', () => {
  const runCommand = (bin, args) => (args.includes('--version') ? { status: 1 } : { status: 0 });
  const res = runBlenderPreflight({ runCommand, env: {} });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BLENDER_NOT_FOUND');
});

test('preflight classifies a GL/EGL context failure as EEVEE_CONTEXT_FAILED', () => {
  const runCommand = (bin, args) => {
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    return { status: 1, stderr: 'EGL_BAD_MATCH: failed to create context' };
  };
  const res = runBlenderPreflight({ runCommand, env: {} });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'EEVEE_CONTEXT_FAILED');
});

test('preflight classifies a generic render failure', () => {
  const runCommand = (bin, args) => {
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    return { status: 1, stderr: 'some unrelated python error' };
  };
  const res = runBlenderPreflight({ runCommand, env: {} });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BLENDER_PREFLIGHT_FAILED');
});

test('preflight injectable env is sanitized and keeps GL overlay', () => {
  let seen;
  const runCommand = (bin, args, opts = {}) => {
    seen = opts.env;
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    return { status: 0, stdout: `DDP_PREFLIGHT_ENGINE_USED=BLENDER_EEVEE_NEXT\n${PREFLIGHT_SENTINEL} bytes=2711` };
  };
  const res = runBlenderPreflight({
    runCommand,
    env: {
      PATH: '/usr/bin',
      RUNPOD_API_KEY: 'FAKE_PLATFORM_POD_KEY',
      R2_SECRET_ACCESS_KEY: 'FAKE_R2_SECRET',
      EGL_PLATFORM: 'surfaceless',
    },
    forceSoftware: true,
  });
  assert.equal(res.ok, true);
  assert.equal('RUNPOD_API_KEY' in seen, false);
  assert.equal('R2_SECRET_ACCESS_KEY' in seen, false);
  assert.equal(seen.PATH, '/usr/bin');
  assert.equal(seen.LIBGL_ALWAYS_SOFTWARE, '1');
  assert.equal(seen.GALLIUM_DRIVER, 'llvmpipe');
});

test('looksLikeGlContextFailure detects common GL/EGL errors', () => {
  assert.ok(looksLikeGlContextFailure('EGL Error (0x3009): EGL_BAD_MATCH'));
  assert.ok(looksLikeGlContextFailure('Unable to open a display'));
  assert.ok(!looksLikeGlContextFailure('Cannot render, no camera'));
});

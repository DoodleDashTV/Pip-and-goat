'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRenderSubprocessEnvironment,
  childEnvContainsDeniedSecret,
  CHILD_ENV_DENY,
} = require('../src/child-env');

const FAKE = {
  RUNPOD_API_KEY: 'FAKE_PLATFORM_POD_KEY',
  R2_SECRET_ACCESS_KEY: 'FAKE_R2_SECRET',
  GITHUB_TOKEN: 'FAKE_GITHUB_TOKEN',
};

test('buildRenderSubprocessEnvironment copies only classified keys and never mutates the source', () => {
  const source = {
    PATH: '/usr/bin',
    HOME: '/home/worker',
    EGL_PLATFORM: 'surfaceless',
    RUNPOD_API_KEY: FAKE.RUNPOD_API_KEY,
    R2_SECRET_ACCESS_KEY: FAKE.R2_SECRET_ACCESS_KEY,
    GITHUB_TOKEN: FAKE.GITHUB_TOKEN,
    EXTRA_PWN: '1',
  };
  const child = buildRenderSubprocessEnvironment(source);
  assert.equal(child.PATH, '/usr/bin');
  assert.equal(child.HOME, '/home/worker');
  assert.equal(child.EGL_PLATFORM, 'surfaceless');
  assert.equal('RUNPOD_API_KEY' in child, false);
  assert.equal('R2_SECRET_ACCESS_KEY' in child, false);
  assert.equal('GITHUB_TOKEN' in child, false);
  assert.equal('EXTRA_PWN' in child, false);
  assert.equal(source.RUNPOD_API_KEY, FAKE.RUNPOD_API_KEY);
  assert.equal(childEnvContainsDeniedSecret(child), false);
  assert.ok(CHILD_ENV_DENY.includes('RUNPOD_API_KEY'));
});

test('buildRenderSubprocessEnvironment refuses unsafe extras and missing PATH', () => {
  assert.throws(() => buildRenderSubprocessEnvironment({}), /PATH/);
  assert.throws(
    () => buildRenderSubprocessEnvironment({ PATH: '/usr/bin' }, { RUNPOD_API_KEY: FAKE.RUNPOD_API_KEY }),
    (e) => e.code === 'CHILD_ENV_UNSAFE',
  );
});

test('required GL/runtime variables remain after sanitization', () => {
  const child = buildRenderSubprocessEnvironment({
    PATH: '/usr/bin:/usr/local/bin',
    HOME: '/home/worker',
    TMPDIR: '/tmp',
    EGL_PLATFORM: 'surfaceless',
    NVIDIA_VISIBLE_DEVICES: 'all',
    NVIDIA_DRIVER_CAPABILITIES: 'compute,utility,graphics',
    LIBGL_ALWAYS_SOFTWARE: '1',
    GALLIUM_DRIVER: 'llvmpipe',
    RENDER_WORKSPACE_DIR: '/tmp/ws',
    RUNPOD_API_KEY: FAKE.RUNPOD_API_KEY,
  });
  assert.equal(child.PATH, '/usr/bin:/usr/local/bin');
  assert.equal(child.HOME, '/home/worker');
  assert.equal(child.TMPDIR, '/tmp');
  assert.equal(child.EGL_PLATFORM, 'surfaceless');
  assert.equal(child.NVIDIA_VISIBLE_DEVICES, 'all');
  assert.equal(child.LIBGL_ALWAYS_SOFTWARE, '1');
  assert.equal(child.RENDER_WORKSPACE_DIR, '/tmp/ws');
  assert.equal('RUNPOD_API_KEY' in child, false);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveHeadlessGlConfig, applyHeadlessGlEnv } = require('../src/headless-gl');

test('selects NVIDIA EGL when a GPU is detected', () => {
  const cfg = resolveHeadlessGlConfig({ env: {}, detectGpu: () => true });
  assert.equal(cfg.mode, 'NVIDIA_EGL');
  assert.equal(cfg.gpuPresent, true);
  assert.equal(cfg.overlay.__GLX_VENDOR_LIBRARY_NAME, 'nvidia');
  assert.ok(cfg.overlay.EGL_PLATFORM);
});

test('falls back to Mesa llvmpipe software rasteriser when no GPU', () => {
  const cfg = resolveHeadlessGlConfig({ env: {}, detectGpu: () => false });
  assert.equal(cfg.mode, 'SOFTWARE_LLVMPIPE');
  assert.equal(cfg.overlay.LIBGL_ALWAYS_SOFTWARE, '1');
  assert.equal(cfg.overlay.GALLIUM_DRIVER, 'llvmpipe');
  assert.equal(cfg.overlay.EGL_PLATFORM, 'surfaceless');
});

test('forceSoftware overrides GPU detection (diagnostic path)', () => {
  const cfg = resolveHeadlessGlConfig({ env: {}, detectGpu: () => true, forceSoftware: true });
  assert.equal(cfg.mode, 'SOFTWARE_LLVMPIPE');
  assert.equal(cfg.gpuPresent, false);
});

test('applyHeadlessGlEnv never clobbers an operator-set value', () => {
  const cfg = resolveHeadlessGlConfig({ env: {}, detectGpu: () => false });
  const merged = applyHeadlessGlEnv({ GALLIUM_DRIVER: 'zink' }, cfg);
  assert.equal(merged.GALLIUM_DRIVER, 'zink'); // preserved
  assert.equal(merged.LIBGL_ALWAYS_SOFTWARE, '1'); // added
});

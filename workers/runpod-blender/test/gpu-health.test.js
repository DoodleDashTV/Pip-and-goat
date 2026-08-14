'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluateHealth } = require('../src/gpu-health');

function fakePreflight(result) {
  return () => ({ ok: result.ok, code: result.code || null, glMode: result.glMode || 'SOFTWARE_LLVMPIPE', engineUsed: result.engineUsed || 'BLENDER_EEVEE_NEXT', durationMs: 5, reason: result.reason || '', diagnostic: {} });
}

test('healthy GPU + passing benchmark => ok', () => {
  const health = evaluateHealth({
    parseNvidiaSmi: () => ({ gpuModel: 'NVIDIA GeForce RTX 4090', vramGb: 24 }),
    blenderVersion: () => '4.2.3',
    preflight: fakePreflight({ ok: true }),
  });
  assert.equal(health.ok, true);
  assert.equal(health.report.hardwareAcceleration, true);
  assert.equal(health.report.benchmarkOk, true);
});

test('benchmark that fails with no-camera-style error keeps ok=false (regression of prior crash-loop)', () => {
  // Previously benchmarkOk was ALWAYS false because the scene had no camera.
  const health = evaluateHealth({
    parseNvidiaSmi: () => ({ gpuModel: 'NVIDIA GeForce RTX 4090', vramGb: 24 }),
    blenderVersion: () => '4.2.3',
    preflight: fakePreflight({ ok: false, code: 'BLENDER_PREFLIGHT_FAILED' }),
  });
  assert.equal(health.ok, false);
  assert.match(health.reason, /benchmark failed/i);
});

test('EEVEE GL/EGL context failure is classified explicitly', () => {
  const health = evaluateHealth({
    parseNvidiaSmi: () => ({ gpuModel: 'NVIDIA GeForce RTX 4090', vramGb: 24 }),
    blenderVersion: () => '4.2.3',
    preflight: fakePreflight({ ok: false, code: 'EEVEE_CONTEXT_FAILED' }),
  });
  assert.equal(health.ok, false);
  assert.equal(health.eeveeContextFailed, true);
  assert.equal(health.code, 'EEVEE_CONTEXT_FAILED');
  assert.match(health.reason, /GL\/EGL context/i);
});

test('no GPU without fallback => refuses paid broken worker', () => {
  const health = evaluateHealth({
    parseNvidiaSmi: () => ({ gpuModel: null, vramGb: null }),
    blenderVersion: () => '4.2.3',
    preflight: fakePreflight({ ok: true }),
  });
  assert.equal(health.ok, false);
  assert.match(health.reason, /No GPU/i);
});

test('CPU diagnostic fallback passes without hardware acceleration but never fakes GPU', () => {
  const health = evaluateHealth({
    allowCpuFallback: true,
    parseNvidiaSmi: () => ({ gpuModel: null, vramGb: null }),
    blenderVersion: () => '4.2.3',
    preflight: fakePreflight({ ok: true, glMode: 'SOFTWARE_LLVMPIPE' }),
  });
  assert.equal(health.ok, true);
  assert.equal(health.report.hardwareAcceleration, false);
  assert.match(health.reason, /CPU fallback/i);
});

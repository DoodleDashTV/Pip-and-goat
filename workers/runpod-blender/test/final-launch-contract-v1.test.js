'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildBlenderArgs,
  assertFinalBlenderArgs,
  assertWorkerCmd,
  resolveFinalWorkerEnv,
  assertHostResources,
  assertBotaniqExcluded,
  assertRtx4090,
  assertZeroLivePods,
  assertNoAutomaticRetry,
  inspectFinalDockerfile,
  FINAL_ENTRY,
} = require('../src/final-launch-contract-v1');

test('FINAL blender argv is locked', () => {
  const args = buildBlenderArgs();
  assert.deepEqual(assertFinalBlenderArgs(args), { ok: true, args });
  assert.equal(args.includes('256'), true);
  assert.equal(args.includes('D'), true);
});

test('forbids EEVEE, Water C, upscale, and v2/v7 cmds', () => {
  assert.throws(() => assertFinalBlenderArgs(['--python', 'showcase_30s.py']), (e) => e.code === 'FINAL_LAUNCH_CONTRACT_FAILED');
  assert.throws(() => assertWorkerCmd('node ./src/scenery-showcase-entry-v2.js'), (e) => e.code === 'WRONG_WORKER_CMD');
  assert.throws(() => assertWorkerCmd('node ./src/v7-proof-a-boot.js'), (e) => e.code === 'WRONG_WORKER_CMD');
  assert.equal(assertWorkerCmd(FINAL_ENTRY).ok, true);
});

test('EEVEE sample override cannot drop FINAL 256', () => {
  assert.throws(
    () => resolveFinalWorkerEnv({ SCENERY_SHOWCASE_EEVEE_SAMPLES: '48' }),
    (e) => e.code === 'FINAL_SAMPLE_OVERRIDE_FORBIDDEN',
  );
  const ok = resolveFinalWorkerEnv({});
  assert.equal(ok.samples, 256);
  assert.equal(ok.blenderMinutes, 1440);
  assert.ok(ok.encode.includes('17') || ok.encode.includes('-crf'));
});

test('host and Botaniq contracts fail closed', () => {
  assert.throws(() => assertHostResources({ memTotal: 16e9, vramMiB: 24 * 1024, diskFree: 80e9 }), (e) => e.code === 'FINAL_HOST_CONTRACT_FAILED');
  assert.equal(assertHostResources({ memTotal: 32e9, vramMiB: 24 * 1024, diskFree: 80e9 }).ok, true);
  assert.throws(() => assertBotaniqExcluded(['tivvlejoy-assets/source/botaniq_full-7.2.0.paq.zip']), (e) => e.code === 'BOTANIQ_FULL_EXCLUDED');
  assert.throws(() => assertRtx4090({ gpuModel: 'RTX 3090', vramMiB: 24 * 1024 }), (e) => e.code === 'GPU_NOT_RTX_4090');
  assert.equal(assertRtx4090({ gpuModel: 'NVIDIA GeForce RTX 4090', vramMiB: 24 * 1024 }).ok, true);
  assert.throws(() => assertZeroLivePods([{ id: 'x' }]), (e) => e.code === 'LIVE_PODS_NOT_EMPTY');
  assert.equal(assertZeroLivePods([]).ok, true);
  assert.throws(() => assertNoAutomaticRetry({ createCount: 2 }), (e) => e.code === 'AUTOMATIC_RETRY_CREATE_FORBIDDEN');
  assert.throws(() => resolveFinalWorkerEnv({ SCENERY_SHOWCASE_BLENDER_TIMEOUT_MINUTES: '55' }), (e) => e.code === 'TIMEOUT_BELOW_1440');
});

test('FINAL dockerfile launches original14 entry only', () => {
  const text = fs.readFileSync(path.join(__dirname, '../Dockerfile.scenery-showcase-final'), 'utf8');
  assert.equal(inspectFinalDockerfile(text).ok, true);
  assert.throws(() => inspectFinalDockerfile('CMD ["node", "./src/v7-proof-a-boot.js"]'), (e) => e.code === 'FINAL_DOCKERFILE_CONTRACT_FAILED');
});

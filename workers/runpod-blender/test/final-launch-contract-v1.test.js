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
  parseNvidiaSmiTelemetry,
  convertMib,
  REQUIRED_VRAM_MIB,
  DOCUMENTED_RTX4090_NVIDIA_SMI_TOTAL_MIB,
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

test('RTX 4090 VRAM gate uses documented nvidia-smi class floor', () => {
  assert.equal(REQUIRED_VRAM_MIB, 24500);
  assert.equal(DOCUMENTED_RTX4090_NVIDIA_SMI_TOTAL_MIB, 24564);
  assert.equal(assertRtx4090({ gpuModel: 'NVIDIA GeForce RTX 4090', vramTotalMiB: 24576 }).ok, true);
  assert.equal(assertRtx4090({ gpuModel: 'NVIDIA GeForce RTX 4090', vramTotalMiB: 24564 }).ok, true);
  assert.throws(
    () => assertRtx4090({ gpuModel: 'NVIDIA GeForce RTX 4090', vramTotalMiB: 24499 }),
    (e) => e.code === 'VRAM_BELOW_24GIB',
  );
  assert.throws(
    () => assertHostResources({ memTotal: 32e9, vramTotalMiB: 20 * 1024, diskFree: 80e9 }),
    (e) => e.code === 'FINAL_HOST_CONTRACT_FAILED' && e.blockers.includes('VRAM_BELOW_24GIB'),
  );
  assert.throws(
    () => assertHostResources({ memTotal: 32e9, vramTotalMiB: 16 * 1024, diskFree: 80e9 }),
    (e) => e.code === 'FINAL_HOST_CONTRACT_FAILED' && e.blockers.includes('VRAM_BELOW_24GIB'),
  );
  assert.throws(
    () => assertRtx4090({ gpuModel: 'NVIDIA GeForce RTX 3090', vramTotalMiB: 24576 }),
    (e) => e.code === 'GPU_NOT_RTX_4090',
  );
});

test('nvidia-smi telemetry parse stays fail-closed and uses MiB integers', () => {
  const ok = parseNvidiaSmiTelemetry('NVIDIA GeForce RTX 4090, 24564, 23980', { status: 0 });
  assert.equal(ok.ok, true);
  assert.equal(ok.vramTotalMiB, 24564);
  assert.equal(ok.vramFreeMiB, 23980);
  assert.equal(ok.vramMiB, 24564);
  assert.notEqual(ok.vramTotalMiB, ok.vramFreeMiB);
  assert.equal(parseNvidiaSmiTelemetry('', { status: 1 }).code, 'GPU_TELEMETRY_MISSING');
  assert.equal(parseNvidiaSmiTelemetry('NVIDIA GeForce RTX 4090, 24564', { status: 0 }).code, 'GPU_TELEMETRY_MALFORMED');
  assert.equal(parseNvidiaSmiTelemetry('NVIDIA GeForce RTX 4090, not-a-number, 1', { status: 0 }).code, 'GPU_TELEMETRY_MALFORMED');
  const conv = convertMib(24564);
  assert.equal(conv.mib, 24564);
  assert.equal(conv.gib, 24564 / 1024);
  assert.equal(conv.decimalGb, (24564 * 1024 * 1024) / 1e9);
  assert.ok(conv.gib < 24);
  assert.ok(convertMib(24576).gib === 24);
  assert.notEqual(Math.round(conv.decimalGb), 24);
});

test('camera contract and Water D do not regress with the VRAM repair', () => {
  const shots = fs.readFileSync(path.join(__dirname, '../../../scripts/blender/scenery/cinematic_shots.py'), 'utf8');
  const valley = fs.readFileSync(path.join(__dirname, '../../../scripts/blender/scenery/cinematic_valley_world_v1.py'), 'utf8');
  const water = fs.readFileSync(path.join(__dirname, '../../../scripts/blender/scenery/cinematic_water_lock_v1.py'), 'utf8');
  const proof = fs.readFileSync(path.join(__dirname, '../src/visual-proof-contract-v1.js'), 'utf8');
  assert.match(shots, /2\.2, -21\.4, 3\.40/);
  assert.match(shots, /-3\.4, -10\.2, 1\.75/);
  assert.match(shots, /TJ_SHOT_02_CAM/);
  assert.match(valley, /resolve_production_camera/);
  assert.match(water, /"ior": 1\.33/);
  assert.match(water, /"transmission": 0\.80/);
  assert.match(proof, /TJ_SHOT_02_CAM/);
  assert.match(proof, /water-variant D/);
});

test('FINAL dockerfile launches original14 entry only', () => {
  const text = fs.readFileSync(path.join(__dirname, '../Dockerfile.scenery-showcase-final'), 'utf8');
  assert.equal(inspectFinalDockerfile(text).ok, true);
  assert.throws(() => inspectFinalDockerfile('CMD ["node", "./src/v7-proof-a-boot.js"]'), (e) => e.code === 'FINAL_DOCKERFILE_CONTRACT_FAILED');
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const core = require('../src/render-core');
const { buildManifest } = require('../src/manifest');

function validManifestInput(overrides = {}) {
  return {
    jobId: 'job-1',
    episodeId: 'ep-1',
    renderMode: 'DRAFT_HD',
    resolution: '720x1280',
    fps: 30,
    frameStart: 1,
    frameEnd: 3,
    samples: 32,
    expectedAssets: [
      { role: 'pip', r2Key: 'characters/pip/v1/pip.blend', sha256: 'a'.repeat(64) },
      { role: 'goat', r2Key: 'characters/goat/v1/goat.blend', sha256: 'b'.repeat(64) },
    ],
    outputKey: 'renders/job-1/draft.mp4',
    maxRuntimeMinutes: 30,
    maxCostUsd: 0.25,
    ...overrides,
  };
}

async function tmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-core-'));
}

test('valid manifest passes validation', () => {
  const m = buildManifest(validManifestInput());
  assert.equal(m.schemaVersion, core.MANIFEST_SCHEMA);
  assert.equal(core.validateManifest(m), m);
});

test('invalid manifest rejected (missing outputKey)', () => {
  assert.throws(() => buildManifest(validManifestInput({ outputKey: undefined })), /outputKey/);
});

test('invalid manifest rejected (bad resolution)', () => {
  const m = buildManifest(validManifestInput());
  m.resolution = '720';
  assert.throws(() => core.validateManifest(m), /resolution/i);
});

test('invalid manifest rejected (asset sha not 64-hex)', () => {
  assert.throws(
    () => buildManifest(validManifestInput({ expectedAssets: [{ role: 'pip', r2Key: 'k', sha256: 'zzz' }] })),
    /sha256/,
  );
});

test('manifest rejected if a secret is embedded', () => {
  const m = buildManifest(validManifestInput());
  m.leak = 'rpa_ABC123';
  assert.throws(() => core.validateManifest(m), /Runpod API key/);
});

test('buildBlenderArgv includes resolution, frames, samples, engine', () => {
  const m = buildManifest(validManifestInput());
  const argv = core.buildBlenderArgv({ manifest: m, assets: [], outputDir: '/out', assembleScript: '/s.py' });
  assert.ok(argv.includes('--resolution') && argv.includes('720x1280'));
  assert.ok(argv.includes('--samples') && argv.includes('32'));
  assert.ok(argv.includes('--engine') && argv.includes('EEVEE'));
  assert.ok(argv.includes('--start-frame') && argv.includes('1') && argv.includes('--end-frame') && argv.includes('3'));
});

test('renderWithBlender fails closed when Blender missing', async () => {
  const dir = await tmpDir();
  const runCommand = (bin, args) => (args[0] === '--version' ? { status: 1, stdout: '' } : { status: 0 });
  await assert.rejects(
    () => core.renderWithBlender({ argv: [], outputDir: dir, runCommand }),
    (e) => e.code === 'BLENDER_NOT_FOUND',
  );
});

test('renderWithBlender fails closed when Blender exits non-zero', async () => {
  const dir = await tmpDir();
  const runCommand = (bin, args) => (args[0] === '--version' ? { status: 0, stdout: 'Blender 4.2.3' } : { status: 1 });
  await assert.rejects(
    () => core.renderWithBlender({ argv: ['x'], outputDir: dir, runCommand }),
    (e) => e.code === 'BLENDER_FAILED',
  );
});

test('renderWithBlender fails closed when no frames produced', async () => {
  const dir = await tmpDir();
  const runCommand = (bin, args) => ({ status: 0, stdout: 'Blender 4.2.3' });
  await assert.rejects(
    () => core.renderWithBlender({ argv: ['x'], outputDir: dir, runCommand }),
    (e) => e.code === 'NO_FRAMES',
  );
});

test('renderWithBlender succeeds when frames exist', async () => {
  const dir = await tmpDir();
  const runCommand = (bin, args) => {
    if (args[0] === '--version') return { status: 0, stdout: 'Blender 4.2.3' };
    // Simulate Blender writing 3 frames.
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(dir, `frame_000${n}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return { status: 0 };
  };
  const frames = await core.renderWithBlender({ argv: ['x'], outputDir: dir, runCommand });
  assert.equal(frames.length, 3);
});

test('encodeVideo fails closed when ffmpeg fails', async () => {
  const dir = await tmpDir();
  fs.writeFileSync(path.join(dir, 'frame_0001.png'), Buffer.from([1, 2, 3]));
  const runCommand = () => ({ status: 1, stderr: 'boom' });
  await assert.rejects(
    () => core.encodeVideo({ outputDir: dir, fps: 30, mp4Path: path.join(dir, 'shot.mp4'), runCommand }),
    (e) => e.code === 'FFMPEG_FAILED',
  );
});

test('encodeVideo succeeds and writes mp4', async () => {
  const dir = await tmpDir();
  fs.writeFileSync(path.join(dir, 'frame_0001.png'), Buffer.from([1, 2, 3]));
  const mp4 = path.join(dir, 'shot.mp4');
  const runCommand = (bin, args) => {
    fs.writeFileSync(mp4, Buffer.from('fake-mp4-bytes'));
    return { status: 0 };
  };
  const out = await core.encodeVideo({ outputDir: dir, fps: 30, mp4Path: mp4, runCommand });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0);
});

test('validateOutput rejects resolution mismatch', async () => {
  const dir = await tmpDir();
  const mp4 = path.join(dir, 'shot.mp4');
  fs.writeFileSync(mp4, Buffer.from('x'));
  const m = buildManifest(validManifestInput());
  const runCommand = () => ({ status: 0, stdout: JSON.stringify({ streams: [{ width: 540, height: 960, nb_read_frames: 3 }] }) });
  await assert.rejects(
    () => core.validateOutput({ manifest: m, mp4Path: mp4, runCommand }),
    (e) => e.code === 'OUTPUT_RESOLUTION_MISMATCH',
  );
});

test('validateOutput passes on matching resolution + frames', async () => {
  const dir = await tmpDir();
  const mp4 = path.join(dir, 'shot.mp4');
  fs.writeFileSync(mp4, Buffer.from('x'));
  const m = buildManifest(validManifestInput());
  const runCommand = () => ({ status: 0, stdout: JSON.stringify({ streams: [{ width: 720, height: 1280, nb_read_frames: 3 }] }) });
  const info = await core.validateOutput({ manifest: m, mp4Path: mp4, runCommand });
  assert.equal(info.width, 720);
  assert.equal(info.frames, 3);
});

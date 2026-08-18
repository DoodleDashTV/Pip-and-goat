'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const core = require('../src/render-core');
const { buildManifest } = require('../src/manifest');
const { buildRenderSubprocessEnvironment } = require('../src/child-env');

const FAKE_PLATFORM_KEY = 'FAKE_PLATFORM_POD_KEY';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET';
const FAKE_GITHUB = 'FAKE_GITHUB_TOKEN';

function parentEnv() {
  return {
    PATH: '/usr/bin',
    HOME: '/home/worker',
    EGL_PLATFORM: 'surfaceless',
    RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
    R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET,
    GITHUB_TOKEN: FAKE_GITHUB,
  };
}

function assertIsolated(env, label) {
  assert.ok(env, `${label} missing env`);
  assert.equal('RUNPOD_API_KEY' in env, false, `${label} received RUNPOD_API_KEY`);
  assert.equal('R2_SECRET_ACCESS_KEY' in env, false, `${label} received R2 secret`);
  assert.equal('GITHUB_TOKEN' in env, false, `${label} received GitHub token`);
  assert.equal(JSON.stringify(env).includes(FAKE_PLATFORM_KEY), false, `${label} leaked platform key value`);
  assert.equal(JSON.stringify(env).includes(FAKE_R2_SECRET), false, `${label} leaked R2 secret value`);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.EGL_PLATFORM, 'surfaceless');
}

test('Blender version and render subprocesses receive only the sanitized env', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-render-env-'));
  const seen = [];
  const child = buildRenderSubprocessEnvironment(parentEnv());
  const runCommand = (bin, args, opts = {}) => {
    seen.push({ bin, args, env: opts.env || null });
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    fs.writeFileSync(path.join(dir, 'frame_0001.png'), Buffer.from([1]));
    return { status: 0, stdout: '' };
  };
  await core.renderWithBlender({
    blenderBin: 'blender',
    argv: ['--background'],
    outputDir: dir,
    runCommand,
    env: child,
  });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0].args, ['--version']);
  for (const call of seen) assertIsolated(call.env, `blender ${call.args[0]}`);
});

test('FFmpeg encode receives only the sanitized env', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-ffmpeg-env-'));
  fs.writeFileSync(path.join(dir, 'frame_0001.png'), Buffer.from([1]));
  const seen = [];
  const child = buildRenderSubprocessEnvironment(parentEnv());
  const runCommand = (bin, args, opts = {}) => {
    seen.push({ bin, env: opts.env || null });
    fs.writeFileSync(args[args.length - 1], Buffer.from('mp4'));
    return { status: 0, stdout: '' };
  };
  await core.encodeVideo({
    outputDir: dir,
    fps: 30,
    mp4Path: path.join(dir, 'shot.mp4'),
    runCommand,
    env: child,
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].bin, 'ffmpeg');
  assertIsolated(seen[0].env, 'ffmpeg');
});

test('ffprobe validation receives only the sanitized env', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-ffprobe-env-'));
  const mp4Path = path.join(dir, 'shot.mp4');
  fs.writeFileSync(mp4Path, Buffer.from('mp4'));
  const seen = [];
  const child = buildRenderSubprocessEnvironment(parentEnv());
  const runCommand = (bin, args, opts = {}) => {
    seen.push({ bin, env: opts.env || null });
    return { status: 0, stdout: JSON.stringify({ streams: [{ width: 720, height: 1280, nb_read_frames: 3 }] }) };
  };
  const manifest = buildManifest({
    jobId: 'job-1',
    episodeId: 'ep-1',
    renderMode: 'DRAFT_HD',
    resolution: '720x1280',
    fps: 30,
    frameStart: 1,
    frameEnd: 3,
    samples: 8,
    expectedAssets: [{ role: 'pip', r2Key: 'characters/pip/v1/pip.blend', sha256: 'a'.repeat(64) }],
    outputKey: 'renders/job-1/draft.mp4',
    maxRuntimeMinutes: 20,
    maxCostUsd: 0.25,
  });
  await core.validateOutput({ manifest, mp4Path, runCommand, env: child });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].bin, 'ffprobe');
  assertIsolated(seen[0].env, 'ffprobe');
});

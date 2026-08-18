'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { runSingleShot } = require('../src/single-shot');
const { buildManifest } = require('../src/manifest');
const { canWorkerSelfTerminate, terminateSelf } = require('../src/worker');

const FAKE_PLATFORM_KEY = 'FAKE_PLATFORM_POD_KEY';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET';
const FAKE_GITHUB = 'FAKE_GITHUB_TOKEN';

function baseManifest() {
  return buildManifest({
    jobId: 'job-1',
    episodeId: 'ep-1',
    renderMode: 'DRAFT_HD',
    resolution: '720x1280',
    fps: 30,
    frameStart: 1,
    frameEnd: 3,
    samples: 32,
    expectedAssets: [{ role: 'pip', r2Key: 'characters/pip/v1/pip.blend', sha256: 'a'.repeat(64) }],
    outputKey: 'renders/job-1/draft.mp4',
    maxRuntimeMinutes: 30,
    maxCostUsd: 0.25,
  });
}

function makeFakeR2() {
  const store = new Map();
  const manifest = baseManifest();
  return {
    store,
    api: {
      createR2Client: () => ({ client: {}, bucket: '[REDACTED]' }),
      downloadToFile: async (ctx, key, destPath) => {
        if (key === 'jobs/job-1/manifest.json') {
          await fsp.writeFile(destPath, JSON.stringify(manifest));
          return destPath;
        }
        if (key === manifest.outputKey) {
          await fsp.writeFile(destPath, store.get(key) || Buffer.from('missing'));
          return destPath;
        }
        await fsp.writeFile(destPath, Buffer.from(`asset:${key}`));
        return destPath;
      },
      uploadBuffer: async (ctx, key, body) => {
        store.set(key, Buffer.from(body));
        return `s3://[REDACTED]/${key}`;
      },
    },
  };
}

test('single-shot child env strips platform Pod key, R2 secrets, and GitHub token', async () => {
  const seen = [];
  let preflightEnv = null;
  const fake = makeFakeR2();
  const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-child-env-'));
  const runCommand = (bin, args, opts = {}) => {
    seen.push({ bin, args, env: opts.env || null });
    if (bin === 'ffmpeg') {
      fs.writeFileSync(args[args.length - 1], Buffer.from('mp4'));
      return { status: 0, stdout: '' };
    }
    if (bin === 'ffprobe') {
      return { status: 0, stdout: JSON.stringify({ streams: [{ width: 720, height: 1280, nb_read_frames: 3 }] }) };
    }
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    const od = args[args.indexOf('--output-dir') + 1];
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(od, `frame_000${n}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return { status: 0, stdout: '' };
  };
  const logs = [];
  const res = await runSingleShot({
    env: {
      PATH: process.env.PATH || '/usr/bin',
      HOME: '/home/worker',
      EGL_PLATFORM: 'surfaceless',
      R2_BUCKET: 'bucket',
      R2_ENDPOINT: 'https://example.invalid',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET,
      RENDER_JOB_ID: 'job-1',
      RENDER_WORKSPACE_DIR: ws,
      BLENDER_ASSEMBLE_SCRIPT: '/tmp/assemble.py',
      ALLOW_WORKER_SELF_TERMINATE: 'false',
      RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
      GITHUB_TOKEN: FAKE_GITHUB,
    },
    log: (event, detail) => logs.push(JSON.stringify({ event, detail })),
    r2: fake.api,
    runCommand,
    forcePreflight: true,
    runBlenderPreflight: (opts) => {
      preflightEnv = opts.env;
      return { ok: true, glMode: 'SOFTWARE_LLVMPIPE', engineUsed: 'BLENDER_EEVEE_NEXT', durationMs: 1 };
    },
  });
  assert.equal(res.ok, true);
  assert.ok(preflightEnv);
  assert.equal('RUNPOD_API_KEY' in preflightEnv, false);
  assert.equal('R2_SECRET_ACCESS_KEY' in preflightEnv, false);
  assert.equal('GITHUB_TOKEN' in preflightEnv, false);
  assert.ok(preflightEnv.PATH);
  assert.equal(preflightEnv.EGL_PLATFORM, 'surfaceless');
  const bins = seen.filter((call) => call.env);
  assert.ok(bins.length >= 3);
  for (const call of bins) {
    assert.equal('RUNPOD_API_KEY' in call.env, false, `${call.bin} received RUNPOD_API_KEY`);
    assert.equal('R2_SECRET_ACCESS_KEY' in call.env, false, `${call.bin} received R2 secret`);
    assert.equal('GITHUB_TOKEN' in call.env, false, `${call.bin} received GitHub token`);
    assert.ok(call.env.PATH);
    assert.ok(call.env.EGL_PLATFORM || call.env.LIBGL_ALWAYS_SOFTWARE);
    assert.equal(JSON.stringify(call.args || []).includes(FAKE_PLATFORM_KEY), false);
  }
  const blenderCalls = bins.filter((call) => call.bin !== 'ffmpeg' && call.bin !== 'ffprobe');
  const ffmpegCalls = bins.filter((call) => call.bin === 'ffmpeg');
  const probeCalls = bins.filter((call) => call.bin === 'ffprobe');
  assert.ok(blenderCalls.some((call) => call.args.includes('--version')));
  assert.ok(blenderCalls.some((call) => call.args.includes('--background')));
  assert.ok(ffmpegCalls.length >= 1);
  assert.ok(probeCalls.length >= 1);
  const dumped = `${logs.join('\n')}\n${[...fake.store.values()].map((b) => b.toString()).join('\n')}\n${JSON.stringify(res)}`;
  assert.equal(dumped.includes(FAKE_PLATFORM_KEY), false);
  assert.equal(dumped.includes(FAKE_R2_SECRET), false);
  assert.equal(dumped.includes(FAKE_GITHUB), false);
  for (const key of ['jobs/job-1/status.json', 'jobs/job-1/startup-status.json', 'jobs/job-1/metadata.json']) {
    const body = fake.store.get(key).toString();
    assert.equal(body.includes(FAKE_PLATFORM_KEY), false, `${key} leaked platform key`);
    assert.equal(body.includes(FAKE_R2_SECRET), false, `${key} leaked R2 secret`);
  }
});

test('TivvleJoy self-termination stays disabled even when a platform Pod key is present', async () => {
  assert.equal(canWorkerSelfTerminate({ ALLOW_WORKER_SELF_TERMINATE: 'false', RUNPOD_API_KEY: FAKE_PLATFORM_KEY }), false);
  assert.equal(canWorkerSelfTerminate({ ALLOW_WORKER_SELF_TERMINATE: 'true', RUNPOD_API_KEY: FAKE_PLATFORM_KEY }), true);
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { status: 200 };
  };
  try {
    await terminateSelf('single_shot_complete', {
      ALLOW_WORKER_SELF_TERMINATE: 'false',
      RUNPOD_API_KEY: FAKE_PLATFORM_KEY,
      RUNPOD_POD_ID: 'pod-test-1',
    });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

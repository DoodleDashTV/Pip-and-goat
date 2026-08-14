'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { runSingleShot } = require('../src/single-shot');
const { buildManifest } = require('../src/manifest');
const { EXIT_CLASS } = require('../src/exit-codes');

function baseManifest(overrides = {}) {
  return buildManifest({
    jobId: 'job-1',
    episodeId: 'ep-meadow',
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
    ...overrides,
  });
}

function makeFakeR2(opts = {}) {
  const store = new Map();
  const manifest = opts.manifest || baseManifest();
  const manifestKey = 'jobs/job-1/manifest.json';
  return {
    store,
    manifest,
    api: {
      createR2Client: () => ({ client: {}, bucket: 'b', timeouts: { requestTimeout: 60000 } }),
      downloadToFile: async (ctx, key, destPath) => {
        if (key === manifestKey) { await fsp.writeFile(destPath, JSON.stringify(manifest)); return destPath; }
        if (key === manifest.outputKey) { await fsp.writeFile(destPath, store.get(key) || Buffer.from('x')); return destPath; }
        await fsp.writeFile(destPath, Buffer.from(`asset:${key}`));
        return destPath;
      },
      uploadBuffer: async (ctx, key, body) => { store.set(key, Buffer.from(body)); return `s3://b/${key}`; },
    },
  };
}

function fakeRunCommand() {
  return (bin, args) => {
    if (bin === 'ffmpeg') { fs.writeFileSync(args[args.length - 1], Buffer.from('mp4')); return { status: 0, stdout: '' }; }
    if (bin === 'ffprobe') return { status: 0, stdout: JSON.stringify({ streams: [{ width: 720, height: 1280, nb_read_frames: 3 }] }) };
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    const od = args[args.indexOf('--output-dir') + 1];
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(od, `frame_000${n}.png`), Buffer.from([0x89]));
    return { status: 0, stdout: '' };
  };
}

async function tmpEnv(extra = {}) {
  const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-ssd-'));
  return {
    R2_BUCKET: 'b', R2_ENDPOINT: 'https://x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x',
    RENDER_JOB_ID: 'job-1', RENDER_WORKSPACE_DIR: ws, BLENDER_ASSEMBLE_SCRIPT: '/tmp/assemble.py',
    ...extra,
  };
}

const quiet = () => {};

test('EARLY startup-status.json is written to R2 and updated as boot progresses', async () => {
  const fake = makeFakeR2();
  const res = await runSingleShot({ env: await tmpEnv(), log: quiet, r2: fake.api, runCommand: fakeRunCommand() });
  assert.equal(res.ok, true);
  const startup = JSON.parse(fake.store.get('jobs/job-1/startup-status.json').toString());
  assert.ok(startup.systemInfo);
  assert.ok(startup.systemInfo.host);
  assert.equal(startup.result, 'COMPLETE');
});

test('startup-status persists FAILED + classification when boot dies after R2-init', async () => {
  const fake = makeFakeR2({ manifest: baseManifest({ jobId: 'someone-else' }) });
  const res = await runSingleShot({ env: await tmpEnv(), log: quiet, r2: fake.api, runCommand: fakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'JOB_ID_MISMATCH');
  assert.equal(res.classification, EXIT_CLASS.MANIFEST_FAILURE);
  const startup = JSON.parse(fake.store.get('jobs/job-1/startup-status.json').toString());
  assert.equal(startup.result, 'FAILED');
  assert.equal(startup.classification, EXIT_CLASS.MANIFEST_FAILURE);
});

test('missing env (NO_JOB_ID) classifies as ENV_CONFIGURATION_FAILURE', async () => {
  const fake = makeFakeR2();
  const env = await tmpEnv();
  delete env.RENDER_JOB_ID;
  const res = await runSingleShot({ env, log: quiet, r2: fake.api, runCommand: fakeRunCommand() });
  assert.equal(res.code, 'NO_JOB_ID');
  assert.equal(res.classification, EXIT_CLASS.ENV_CONFIGURATION_FAILURE);
});

test('bad R2 config classifies as ENV_CONFIGURATION_FAILURE', async () => {
  const fake = {
    api: {
      createR2Client: () => { throw new Error('R2 configuration incomplete'); },
      downloadToFile: async () => {},
      uploadBuffer: async () => {},
    },
  };
  const res = await runSingleShot({ env: await tmpEnv(), log: quiet, r2: fake.api, runCommand: fakeRunCommand() });
  assert.equal(res.code, 'R2_CONFIG_INCOMPLETE');
  assert.equal(res.classification, EXIT_CLASS.ENV_CONFIGURATION_FAILURE);
});

test('Blender headless preflight failure fails closed via EEVEE_CONTEXT_FAILURE (no real blender)', async () => {
  const fake = makeFakeR2();
  // No runCommand -> preflight runs; inject a failing preflight so no real
  // Blender/ffmpeg is ever invoked and the render is never reached.
  const res = await runSingleShot({
    env: await tmpEnv(),
    log: quiet,
    r2: fake.api,
    runBlenderPreflight: () => ({ ok: false, code: 'EEVEE_CONTEXT_FAILED', glMode: 'SOFTWARE_LLVMPIPE', engineUsed: null, durationMs: 5, reason: 'GL/EGL context creation failed' }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'EEVEE_CONTEXT_FAILED');
  assert.equal(res.classification, EXIT_CLASS.EEVEE_CONTEXT_FAILURE);
  const startup = JSON.parse(fake.store.get('jobs/job-1/startup-status.json').toString());
  assert.equal(startup.result, 'FAILED');
});

test('successful boot runs the Blender preflight before render', async () => {
  const fake = makeFakeR2();
  let preflightCalls = 0;
  const res = await runSingleShot({
    env: await tmpEnv(),
    log: quiet,
    r2: fake.api,
    // Provide BOTH: a passing preflight and a runCommand for the real render.
    // (runCommand normally skips preflight, so force it on via option.)
    runBlenderPreflight: () => { preflightCalls++; return { ok: true, code: null, glMode: 'NVIDIA_EGL', engineUsed: 'BLENDER_EEVEE_NEXT', durationMs: 5, reason: 'ok' }; },
    forcePreflight: true,
    runCommand: fakeRunCommand(),
  });
  assert.equal(res.ok, true);
  assert.equal(preflightCalls, 1);
});

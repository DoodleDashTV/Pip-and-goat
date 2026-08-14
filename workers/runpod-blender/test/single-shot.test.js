'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { runSingleShot } = require('../src/single-shot');
const { buildManifest } = require('../src/manifest');

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
    expectedAssets: [
      { role: 'pip', r2Key: 'characters/pip/v1/pip.blend', sha256: 'a'.repeat(64) },
      { role: 'goat', r2Key: 'characters/goat/v1/goat.blend', sha256: 'b'.repeat(64) },
      { role: 'meadow', r2Key: 'environments/meadow/v1/meadow.blend', sha256: 'c'.repeat(64) },
    ],
    outputKey: 'renders/job-1/draft.mp4',
    maxRuntimeMinutes: 30,
    maxCostUsd: 0.25,
    ...overrides,
  });
}

// Fake R2 module with programmable behavior.
function makeFakeR2(opts = {}) {
  const store = new Map(); // key -> Buffer
  const manifest = opts.manifest || baseManifest();
  const manifestKey = 'jobs/job-1/manifest.json';
  return {
    store,
    manifest,
    api: {
      createR2Client: () => ({ client: {}, bucket: 'doodledashtv' }),
      downloadToFile: async (ctx, key, destPath, expectedChecksum) => {
        if (key === manifestKey) {
          const body = opts.manifestJson !== undefined ? opts.manifestJson : JSON.stringify(manifest);
          await fsp.writeFile(destPath, body);
          return destPath;
        }
        if (opts.assetError && manifest.expectedAssets.some((a) => a.r2Key === key)) {
          throw new Error(opts.assetError);
        }
        if (key === manifest.outputKey) {
          // readback
          const bytes = opts.readbackBytes || store.get(key) || Buffer.from('missing');
          await fsp.writeFile(destPath, bytes);
          return destPath;
        }
        // asset: write placeholder bytes
        await fsp.writeFile(destPath, Buffer.from(`asset:${key}`));
        return destPath;
      },
      uploadBuffer: async (ctx, key, body) => {
        if (opts.uploadError && key === manifest.outputKey) throw new Error(opts.uploadError);
        store.set(key, Buffer.from(body));
        return `s3://doodledashtv/${key}`;
      },
    },
  };
}

function makeFakeRunCommand() {
  return (bin, args) => {
    if (bin === 'ffmpeg') {
      const mp4 = args[args.length - 1];
      fs.writeFileSync(mp4, Buffer.from(`mp4-${Date.now()}-${Math.random()}`));
      return { status: 0, stdout: '' };
    }
    if (bin === 'ffprobe') {
      return { status: 0, stdout: JSON.stringify({ streams: [{ width: 720, height: 1280, nb_read_frames: 3 }] }) };
    }
    // blender
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    const od = args[args.indexOf('--output-dir') + 1];
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(od, `frame_000${n}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return { status: 0, stdout: '' };
  };
}

async function tmpEnv(extra = {}) {
  const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'ddp-ss-'));
  return {
    R2_BUCKET: 'doodledashtv',
    R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'x',
    R2_SECRET_ACCESS_KEY: 'x',
    RENDER_JOB_ID: 'job-1',
    RENDER_WORKSPACE_DIR: ws,
    BLENDER_ASSEMBLE_SCRIPT: '/tmp/assemble.py',
    ...extra,
  };
}

const quietLog = () => {};

test('successful single-shot job completes with verified artifact', async () => {
  const fake = makeFakeR2();
  const res = await runSingleShot({
    env: await tmpEnv(),
    log: quietLog,
    r2: fake.api,
    runCommand: makeFakeRunCommand(),
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifactKey, 'renders/job-1/draft.mp4');
  assert.match(res.artifactSha256, /^[0-9a-f]{64}$/);
  // Status persisted as COMPLETE.
  const status = JSON.parse(fake.store.get('jobs/job-1/status.json').toString());
  assert.equal(status.status, 'COMPLETE');
  // Artifact + metadata persisted.
  assert.ok(fake.store.get('renders/job-1/draft.mp4'));
  assert.ok(fake.store.get('jobs/job-1/metadata.json'));
});

test('missing/mismatched asset fails closed (no COMPLETE)', async () => {
  const fake = makeFakeR2({ assetError: 'Checksum mismatch for characters/pip/v1/pip.blend' });
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'ASSET_MISSING_OR_HASH_MISMATCH');
  const status = JSON.parse(fake.store.get('jobs/job-1/status.json').toString());
  assert.equal(status.status, 'FAILED');
});

test('invalid manifest fails closed', async () => {
  const fake = makeFakeR2({ manifestJson: JSON.stringify({ schemaVersion: 'ddp-cloud-job-manifest-v1', jobId: 'job-1' }) });
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'MANIFEST_INVALID');
});

test('jobId mismatch is rejected (authorized single-shot selection)', async () => {
  const fake = makeFakeR2({ manifest: baseManifest({ jobId: 'someone-else' }) });
  // manifest.jobId = someone-else but env RENDER_JOB_ID=job-1 -> mismatch
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'JOB_ID_MISMATCH');
});

test('blender failure fails closed', async () => {
  const fake = makeFakeR2();
  const runCommand = (bin, args) => {
    if (bin === 'ffprobe') return { status: 0, stdout: '{}' };
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    return { status: 1 }; // blender render fails
  };
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'BLENDER_FAILED');
});

test('ffmpeg failure fails closed', async () => {
  const fake = makeFakeR2();
  const runCommand = (bin, args) => {
    if (bin === 'ffmpeg') return { status: 1 };
    if (args.includes('--version')) return { status: 0, stdout: 'Blender 4.2.3' };
    const od = args[args.indexOf('--output-dir') + 1];
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(od, `frame_000${n}.png`), Buffer.from([1]));
    return { status: 0 };
  };
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'FFMPEG_FAILED');
});

test('upload failure fails closed (no COMPLETE)', async () => {
  const fake = makeFakeR2({ uploadError: 'network down' });
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'R2_UPLOAD_FAILED');
});

test('cannot report COMPLETE without verified artifact (readback hash mismatch)', async () => {
  const fake = makeFakeR2({ readbackBytes: Buffer.from('tampered-different-bytes') });
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'R2_READBACK_HASH_MISMATCH');
  const status = JSON.parse(fake.store.get('jobs/job-1/status.json').toString());
  assert.equal(status.status, 'FAILED');
});

test('runtime limit (timeout) fails closed', async () => {
  const fake = makeFakeR2();
  let calls = 0;
  const t0 = 1_000_000;
  const now = () => {
    calls += 1;
    return calls <= 1 ? t0 : t0 + 60 * 60 * 1000; // jump 1h after start -> exceeds 30m budget
  };
  const res = await runSingleShot({ env: await tmpEnv(), log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand(), now });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'TIMEOUT');
});

test('missing RENDER_JOB_ID returns NO_JOB_ID', async () => {
  const fake = makeFakeR2();
  const env = await tmpEnv();
  delete env.RENDER_JOB_ID;
  const res = await runSingleShot({ env, log: quietLog, r2: fake.api, runCommand: makeFakeRunCommand() });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NO_JOB_ID');
});

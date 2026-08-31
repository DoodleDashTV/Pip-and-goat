'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const checkpoint = require('../src/frame-checkpoint-v1');

function memoryTransport() {
  const store = new Map();
  return {
    store,
    async uploadFile(_ctx, key, filePath) {
      store.set(key, fs.readFileSync(filePath));
    },
    async uploadBuffer(_ctx, key, body) {
      store.set(key, Buffer.from(body));
    },
    async downloadToFile(_ctx, key, dest, expected) {
      const buf = store.get(key);
      if (!buf) throw new Error(`missing ${key}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      if (expected) {
        const hash = createHash('sha256').update(buf).digest('hex');
        if (hash !== expected) throw new Error('checksum');
      }
    },
  };
}

function writePng(dir, n, payload) {
  const dest = path.join(dir, checkpoint.frameFileName(n));
  fs.writeFileSync(dest, Buffer.from(payload));
  return dest;
}

test('identity rejects EEVEE, Water C, and reduced range', () => {
  assert.throws(() => checkpoint.buildRenderIdentity({ engine: 'BLENDER_EEVEE_NEXT' }), (e) => e.code === 'EEVEE_SELECTED');
  assert.throws(() => checkpoint.buildRenderIdentity({ waterVariant: 'C' }), (e) => e.code === 'WATER_VARIANT_NOT_D');
  assert.throws(() => checkpoint.buildRenderIdentity({ endFrame: 450 }), (e) => e.code === 'FINAL_IDENTITY_INVALID');
});

test('upload + readback records a verified frame and resumes only on hash+identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-ckpt-'));
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(outputDir);
  const identity = checkpoint.buildRenderIdentity({ contentIdentity: 'scene-a' });
  const other = checkpoint.buildRenderIdentity({ contentIdentity: 'scene-b' });
  const manifest = checkpoint.emptyManifest(identity);
  const transport = memoryTransport();
  writePng(outputDir, 7, 'frame-seven');
  const uploaded = await checkpoint.checkpointFrame({
    transport, ctx: {}, prefix: 'job/a', outputDir, frame: 7, identity, manifest,
  });
  assert.equal(uploaded.skippedUpload, false);
  assert.equal(manifest.frames['7'].verified, true);
  assert.equal(checkpoint.canResumeFrame(manifest.frames['7'], identity, {
    sha256: uploaded.sha256,
    byteSize: uploaded.byteSize,
  }), true);
  assert.equal(checkpoint.canResumeFrame(manifest.frames['7'], other, {
    sha256: uploaded.sha256,
    byteSize: uploaded.byteSize,
  }), false);
  const again = await checkpoint.checkpointFrame({
    transport, ctx: {}, prefix: 'job/a', outputDir, frame: 7, identity, manifest,
  });
  assert.equal(again.skippedUpload, true);
});

test('refuses filename-only resume', () => {
  assert.throws(
    () => checkpoint.assertNotFilenameOnlyResume({ exists: true, expectedSha256: '' }),
    (e) => e.code === 'FILENAME_ONLY_RESUME_FORBIDDEN',
  );
  const identity = checkpoint.buildRenderIdentity();
  const entry = { verified: true, sha256: '', byteSize: 12, identity };
  assert.equal(checkpoint.canResumeFrame(entry, identity, { sha256: 'aa', byteSize: 12 }), false);
});

test('materialize restores verified frames and encode waits for 900', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-ckpt-'));
  const outputDir = path.join(root, 'out');
  fs.mkdirSync(outputDir);
  const identity = checkpoint.buildRenderIdentity({ contentIdentity: 'resume' });
  const manifest = checkpoint.emptyManifest(identity);
  const transport = memoryTransport();
  writePng(outputDir, 1, 'one');
  await checkpoint.checkpointFrame({
    transport, ctx: {}, prefix: 'job/b', outputDir, frame: 1, identity, manifest,
  });
  fs.rmSync(path.join(outputDir, checkpoint.frameFileName(1)));
  const resumed = await checkpoint.materializeVerifiedFrames({
    transport, ctx: {}, prefix: 'job/b', outputDir, identity, manifest,
  });
  assert.deepEqual(resumed, [1]);
  assert.equal(fs.existsSync(path.join(outputDir, checkpoint.frameFileName(1))), true);
  assert.throws(() => checkpoint.assertEncodeAllowed(manifest, identity), (e) => e.code === 'FRAMES_NOT_VERIFIED');

  for (let n = 1; n <= 900; n += 1) {
    manifest.frames[String(n)] = {
      frame: n,
      name: checkpoint.frameFileName(n),
      sha256: 'ab'.repeat(32),
      byteSize: 8,
      verified: true,
      identity: { identitySha256: identity.identitySha256 },
    };
  }
  manifest.verifiedCount = 900;
  manifest.complete = true;
  assert.deepEqual(checkpoint.assertEncodeAllowed(manifest, identity), { ok: true, verifiedCount: 900 });
});

test('MP4 upload is read back by SHA-256', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-ckpt-'));
  const mp4 = path.join(root, 'out.mp4');
  fs.writeFileSync(mp4, Buffer.from('fake-mp4'));
  const transport = memoryTransport();
  const result = await checkpoint.uploadMp4AndReadback({
    transport, ctx: {}, key: 'job/c/out.mp4', filePath: mp4,
  });
  assert.equal(result.sha256.length, 64);
  assert.equal(result.byteSize, 8);
});

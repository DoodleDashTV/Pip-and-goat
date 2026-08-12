const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const provenance = require('../src/provenance');
const { collectSystemInfo } = require('../src/boot-diagnostics');

function tmpRoots() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-prov-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'blender'));
  fs.writeFileSync(path.join(dir, 'src', 'worker.js'), 'console.log(1)\n');
  fs.writeFileSync(path.join(dir, 'blender', 'assemble_scene.py'), 'print("three lights")\n');
  return {
    dir,
    roots: [
      { prefix: 'src', dir: path.join(dir, 'src') },
      { prefix: 'blender', dir: path.join(dir, 'blender') },
    ],
  };
}

test('fingerprint is deterministic for identical trees', () => {
  const a = tmpRoots();
  const b = tmpRoots();
  assert.equal(
    provenance.computeRenderCodeFingerprint(a.roots).fingerprint,
    provenance.computeRenderCodeFingerprint(b.roots).fingerprint,
  );
});

test('fingerprint changes when scene assembly code changes', () => {
  const { dir, roots } = tmpRoots();
  const before = provenance.computeRenderCodeFingerprint(roots).fingerprint;
  fs.writeFileSync(path.join(dir, 'blender', 'assemble_scene.py'), 'print("eight lights")\n');
  const after = provenance.computeRenderCodeFingerprint(roots).fingerprint;
  assert.notEqual(before, after);
});

test('fingerprint ignores __pycache__ and .pyc artifacts', () => {
  const { dir, roots } = tmpRoots();
  const before = provenance.computeRenderCodeFingerprint(roots).fingerprint;
  fs.mkdirSync(path.join(dir, 'blender', '__pycache__'));
  fs.writeFileSync(path.join(dir, 'blender', '__pycache__', 'x.cpython-311.pyc'), 'junk');
  fs.writeFileSync(path.join(dir, 'blender', 'stale.pyc'), 'junk');
  assert.equal(provenance.computeRenderCodeFingerprint(roots).fingerprint, before);
});

test('fingerprint covers the real baked render code in this repo', () => {
  const { fingerprint, files } = provenance.computeRenderCodeFingerprint();
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(files.some((f) => f.path === 'blender/assemble_scene.py'));
  assert.ok(files.some((f) => f.path === 'src/single-shot.js'));
});

test('collectProvenance reports commit, build time, digest and code hash', () => {
  const info = provenance.collectProvenance({
    DDP_SOURCE_COMMIT: 'abc123',
    DDP_WORKER_BUILD_TIME: '2026-08-12T22:00:00Z',
    DDP_IMAGE_DIGEST: `ghcr.io/o/r@sha256:${'a'.repeat(64)}`,
  });
  assert.equal(info.sourceCommit, 'abc123');
  assert.equal(info.workerBuildTime, '2026-08-12T22:00:00Z');
  assert.equal(info.imageDigest, `sha256:${'a'.repeat(64)}`);
  assert.match(info.renderCodeSha256, /^[0-9a-f]{64}$/);
  assert.match(info.assembleScriptSha256, /^[0-9a-f]{64}$/);
  assert.equal(info.renderCodeMatch, null, 'no declared hash => unknown, not a silent pass');
});

test('collectProvenance flags a declared hash that disagrees with the baked code', () => {
  const info = provenance.collectProvenance({ DDP_RENDER_CODE_SHA256: 'f'.repeat(64) });
  assert.equal(info.renderCodeMatch, false);
});

test('collectProvenance confirms a matching declared hash', () => {
  const actual = provenance.computeRenderCodeFingerprint().fingerprint;
  const info = provenance.collectProvenance({ DDP_RENDER_CODE_SHA256: actual });
  assert.equal(info.renderCodeMatch, true);
});

// The image build runs `provenance.js --expect <sha>`; a mismatch must fail the
// build so a published label can never lie about the code inside the image.
test('CLI exits non-zero when the declared fingerprint does not match', () => {
  const code = provenance.main(['--expect', 'a'.repeat(64)], {});
  assert.equal(code, 1);
});

test('CLI exits zero and writes provenance.json when the fingerprint matches', () => {
  const actual = provenance.computeRenderCodeFingerprint().fingerprint;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-prov-cli-')), 'provenance.json');
  const code = provenance.main(['--write', out, '--expect', actual], {});
  assert.equal(code, 0);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.renderCodeSha256, actual);
});

test('CLI tolerates the unstamped default so a local build still succeeds', () => {
  assert.equal(provenance.main(['--expect', 'unknown'], {}), 0);
});

test('startup diagnostics record sourceCommit, imageDigest and workerBuildTime', () => {
  const info = collectSystemInfo({
    DDP_SOURCE_COMMIT: 'deadbeef',
    DDP_WORKER_BUILD_TIME: '2026-08-12T22:00:00Z',
    DDP_IMAGE_DIGEST: `ghcr.io/o/r@sha256:${'b'.repeat(64)}`,
  });
  assert.equal(info.sourceCommit, 'deadbeef');
  assert.equal(info.workerBuildTime, '2026-08-12T22:00:00Z');
  assert.equal(info.imageDigest, `sha256:${'b'.repeat(64)}`);
  assert.match(info.renderCodeSha256, /^[0-9a-f]{64}$/);
  assert.match(info.assembleScriptSha256, /^[0-9a-f]{64}$/);
});

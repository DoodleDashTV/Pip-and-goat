const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const boot = path.resolve(__dirname, '../src/v7-proof-a-boot.js');
const bootstrap = path.resolve(__dirname, '../src/v7-pid1-bootstrap.sh');

const syntax = spawnSync('node', ['--check', boot], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr);

const exported = require(boot);
assert.equal(typeof exported.mark, 'function');
assert.equal(typeof exported.redact, 'function');
assert.match(exported.redact('R2_SECRET_ACCESS_KEY=abc'), /REDACTED/);
assert.equal(exported.containsSecret('{"ok":true}'), false);
assert.equal(exported.containsSecret('R2_SECRET_ACCESS_KEY=abc'), true);

const markDir = mkdtempSync(path.join(os.tmpdir(), 'v7-mark-'));
const pid1 = spawnSync('sh', [bootstrap, 'node', '-e', "console.log('CHILD')"], {
  encoding: 'utf8',
  timeout: 10000,
  env: { ...process.env, V7_MARK_DIR: markDir },
});
assert.equal(pid1.status, 0, pid1.stderr);
assert.match(pid1.stdout, /BOOTSTRAP_ENTERED/);
assert.match(pid1.stdout, /NODE_AVAILABLE/);
assert.match(pid1.stdout, /CHILD/);
assert.match(readFileSync(path.join(markDir, 'BOOTSTRAP_ENTERED.json'), 'utf8'), /BOOTSTRAP_ENTERED/);
assert.match(readFileSync(path.join(markDir, 'NODE_AVAILABLE.json'), 'utf8'), /NODE_AVAILABLE/);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function waitReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await getJson(url);
      if (last.status === 200 && last.body.ok === true) return last;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`ready timeout: ${JSON.stringify(last)}`);
}

async function runShortPersist() {
  const port = 18190;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'v7-persist-'));
  const child = spawn('sh', [bootstrap, 'node', boot], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      V7_HEALTH_PORT: String(port),
      V7_HEALTH_BIND: '127.0.0.1',
      V7_MARK_DIR: dir,
      V7_HEARTBEAT_MS: '400',
      V7_BOOT_ID: 'boot-short-1',
      V7_IMAGE_DIGEST: 'sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142',
      V7_SOURCE_SHA: 'local-test',
      PAID_EXECUTION_AUTHORIZED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    out += chunk;
  });
  const ready = await waitReady(`http://127.0.0.1:${port}/ready`, 8000);
  assert.equal(ready.body.event, 'WORKER_READY');
  assert.equal(ready.body.pid, child.pid);
  assert.equal(ready.body.bootId, 'boot-short-1');
  const names = ready.body.markers.map((row) => row.stage);
  for (const name of exported.REQUIRED_MARKERS) {
    assert.ok(names.includes(name), `missing ${name}`);
    assert.ok(ready.body.markers.find((row) => row.stage === name && row.at), `${name} unobserved`);
  }
  await new Promise((resolve) => setTimeout(resolve, 900));
  const proof = await getJson(`http://127.0.0.1:${port}/startup-proof`);
  assert.equal(proof.status, 200);
  assert.ok(proof.body.heartbeatCount >= 1);
  assert.ok(proof.body.uptimeMs > 0);
  assert.equal(proof.body.pid, ready.body.pid);
  assert.equal(proof.body.bootId, ready.body.bootId);
  assert.equal(proof.body.imageDigest, 'sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142');
  const leaked = JSON.stringify(proof.body);
  assert.equal(exported.containsSecret(leaked), false);
  assert.doesNotMatch(leaked, /R2_SECRET|RUNPOD_API_KEY|Bearer /);
  child.kill('SIGTERM');
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 0);
  await new Promise((resolve) => setTimeout(resolve, 150));
  let down = false;
  try {
    await getJson(`http://127.0.0.1:${port}/ready`);
  } catch {
    down = true;
  }
  assert.equal(down, true);
  assert.match(out, /BOOTSTRAP_ENTERED/);
  assert.match(out, /WORKER_READY/);
  assert.doesNotMatch(out, /R2_CLIENT_STARTED/);
}

async function runKillFailsReady() {
  const port = 18191;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'v7-kill-'));
  const child = spawn('node', [boot], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      V7_HEALTH_PORT: String(port),
      V7_MARK_DIR: dir,
      V7_HEARTBEAT_MS: '1000',
      PAID_EXECUTION_AUTHORIZED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitReady(`http://127.0.0.1:${port}/ready`, 8000);
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));
  await new Promise((resolve) => setTimeout(resolve, 150));
  let down = false;
  try {
    await getJson(`http://127.0.0.1:${port}/ready`);
  } catch {
    down = true;
  }
  assert.equal(down, true, 'killed worker must not stay ready');
}

(async () => {
  await runShortPersist();
  await runKillFailsReady();
  const src = readFileSync(boot, 'utf8');
  assert.doesNotMatch(src, /V7_STARTUP_PROOF_SECONDS/);
  assert.doesNotMatch(src, /PROOF_SECONDS/);
  assert.match(src, /new Promise\(\(\) => \{/);
  console.log('v7-proof-a-startup-proof.test PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const boot = path.resolve(__dirname, '../src/v7-proof-a-boot.js');
const bootstrap = path.resolve(__dirname, '../src/v7-pid1-bootstrap.sh');
const HOLD_MS = Number(process.env.V7_PERSIST_HOLD_MS || 12 * 60 * 1000);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
  });
}

async function waitReady(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const row = await getJson(url);
      if (row.status === 200 && row.body.ok === true) return row;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('ready timeout');
}

(async () => {
  const port = 18192;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'v7-12m-'));
  const child = spawn('sh', [bootstrap, 'node', boot], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      V7_HEALTH_PORT: String(port),
      V7_HEALTH_BIND: '127.0.0.1',
      V7_MARK_DIR: dir,
      V7_BOOT_ID: 'boot-12m',
      PAID_EXECUTION_AUTHORIZED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const first = await waitReady(`http://127.0.0.1:${port}/ready`);
  const firstPid = first.body.pid;
  const firstBoot = first.body.bootId;
  const firstUptime = first.body.uptimeMs;
  let lastBeats = first.body.heartbeatCount;
  const started = Date.now();
  while (Date.now() - started < HOLD_MS) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const row = await getJson(`http://127.0.0.1:${port}/startup-proof`);
    assert.equal(row.status, 200);
    assert.equal(row.body.ok, true);
    assert.equal(row.body.pid, firstPid);
    assert.equal(row.body.bootId, firstBoot);
    assert.ok(row.body.uptimeMs >= firstUptime);
    assert.ok(row.body.heartbeatCount >= lastBeats);
    lastBeats = row.body.heartbeatCount;
  }
  const finalRow = await getJson(`http://127.0.0.1:${port}/ready`);
  assert.equal(finalRow.body.pid, firstPid);
  assert.equal(finalRow.body.bootId, firstBoot);
  assert.ok(finalRow.body.heartbeatCount >= 2);
  assert.ok(finalRow.body.uptimeMs >= HOLD_MS);
  child.kill('SIGTERM');
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 0);
  console.log(
    JSON.stringify({
      event: 'PERSIST_12M_PASS',
      holdMs: HOLD_MS,
      pid: firstPid,
      bootId: firstBoot,
      heartbeats: finalRow.body.heartbeatCount,
      uptimeMs: finalRow.body.uptimeMs,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

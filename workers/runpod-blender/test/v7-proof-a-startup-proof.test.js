const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const boot = path.resolve(__dirname, '../src/v7-proof-a-boot.js');
const bootstrap = path.resolve(__dirname, '../src/v7-pid1-bootstrap.sh');

const syntax = spawnSync('node', ['--check', boot], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr);

const exported = require(boot);
assert.equal(typeof exported.mark, 'function');
assert.equal(typeof exported.redact, 'function');
assert.match(exported.redact('R2_SECRET_ACCESS_KEY=abc'), /REDACTED/);

const pid1 = spawnSync('sh', [bootstrap, 'node', '-e', "console.log('CHILD')"], { encoding: 'utf8', timeout: 10000 });
assert.equal(pid1.status, 0, pid1.stderr);
assert.match(pid1.stdout, /BOOTSTRAP_ENTERED/);
assert.match(pid1.stdout, /NODE_AVAILABLE/);
assert.match(pid1.stdout, /CHILD/);

const proof = spawnSync(
  'node',
  [boot],
  {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, V7_STARTUP_PROOF: '1', V7_STARTUP_PROOF_SECONDS: '2', V7_HEALTH_PORT: '18081' },
    cwd: path.resolve(__dirname, '..'),
  },
);
assert.equal(proof.status, 0, proof.stderr || proof.stdout);
const order = ['IMAGE_PROCESS_STARTED', 'NODE_ENTRY_STARTED', 'WORKER_MODULE_LOADED', 'WORKER_LISTENING', 'WORKER_READY'];
let last = -1;
for (const name of order) {
  const idx = proof.stdout.indexOf(name);
  assert.ok(idx >= 0, `missing ${name}`);
  assert.ok(idx > last, `order ${name}`);
  last = idx;
}
assert.doesNotMatch(proof.stdout, /R2_CLIENT_STARTED/);
assert.doesNotMatch(proof.stdout, /BLENDER_EXEC_STARTED/);

console.log('v7-proof-a-startup-proof.test PASS');

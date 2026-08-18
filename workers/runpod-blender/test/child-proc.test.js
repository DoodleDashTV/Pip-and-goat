'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runInstrumented, redactArgs, tail } = require('../src/child-proc');

test('runInstrumented captures a full diagnostic for a real process', () => {
  const res = runInstrumented('node', ['-e', 'process.stdout.write("hello"); process.exit(0)']);
  assert.equal(res.status, 0);
  assert.equal(res.diagnostic.command, 'node');
  assert.ok(res.diagnostic.pid > 0);
  assert.equal(res.diagnostic.exitCode, 0);
  assert.ok(res.diagnostic.runtimeMs >= 0);
  assert.match(res.diagnostic.stdoutTail, /hello/);
  assert.equal(res.diagnostic.timedOut, false);
});

test('runInstrumented records a non-zero exit code', () => {
  const res = runInstrumented('node', ['-e', 'process.exit(7)']);
  assert.equal(res.status, 7);
  assert.equal(res.diagnostic.exitCode, 7);
});

test('runInstrumented flags a timeout without hanging', () => {
  const res = runInstrumented('node', ['-e', 'setTimeout(()=>{}, 60000)'], { timeout: 200 });
  assert.equal(res.diagnostic.timedOut, true);
});

test('redactArgs strips runpod keys and secret assignments', () => {
  const out = redactArgs(['--key', 'rpa_ABCdef123', 'SecretAccessKey=supersecret', 'RUNPOD_API_KEY=FAKE_PLATFORM_POD_KEY']);
  assert.ok(!out.join(' ').includes('rpa_ABCdef123'));
  assert.ok(!out.join(' ').toLowerCase().includes('supersecret'));
  assert.ok(!out.join(' ').includes('FAKE_PLATFORM_POD_KEY'));
});

test('tail bounds captured output growth', () => {
  const big = 'x'.repeat(50_000);
  const out = tail(big, 1000);
  assert.ok(out.length < 2000);
  assert.match(out, /truncated/);
});

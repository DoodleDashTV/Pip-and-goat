'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { collectSystemInfo, installGlobalHandlers, redactMessage, BOOT_STAGE } = require('../src/boot-diagnostics');
const { EXIT_CLASS, exitCodeFor } = require('../src/exit-codes');

test('collectSystemInfo returns non-secret host facts and image digest', () => {
  const info = collectSystemInfo({
    RUNPOD_WORKER_IMAGE: 'ghcr.io/x/ddp-runpod-blender@sha256:' + 'a'.repeat(64),
    RENDER_WORKSPACE_DIR: '/tmp',
  });
  assert.ok(info.host);
  assert.equal(info.arch, process.arch);
  assert.equal(info.node, process.version);
  assert.ok(info.totalMemMb > 0);
  assert.equal(info.imageDigest, 'sha256:' + 'a'.repeat(64));
  const asText = JSON.stringify(info);
  assert.ok(!/secret/i.test(asText));
});

test('boot stage enum covers the required milestones', () => {
  for (const s of ['PROCESS_STARTED', 'ENV_VALIDATION_START', 'R2_CLIENT_CREATED', 'MANIFEST_FETCH_START', 'ASSET_DOWNLOAD_START', 'ASSETS_READY', 'BLENDER_PREFLIGHT_START', 'RENDER_STARTED']) {
    assert.ok(BOOT_STAGE[s], `missing boot stage ${s}`);
  }
});

test('redactMessage removes runpod keys and bearer tokens', () => {
  const out = redactMessage('key rpa_ABC123 Authorization: Bearer sk_live_xyz');
  assert.ok(!out.includes('rpa_ABC123'));
  assert.ok(!out.includes('sk_live_xyz'));
});

test('global uncaughtException handler persists a diagnostic and exits non-zero', async () => {
  const persisted = [];
  let exitedWith = null;
  const uninstall = installGlobalHandlers({
    log: () => {},
    persist: async (classification, detail) => { persisted.push({ classification, detail }); },
    exit: (code) => { exitedWith = code; },
  });
  uninstall.handlers.onUncaught(new Error('boom rpa_SECRET123'));
  await new Promise((r) => setTimeout(r, 50));
  uninstall();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].classification, EXIT_CLASS.UNKNOWN_FATAL);
  assert.ok(!JSON.stringify(persisted[0].detail).includes('rpa_SECRET123'));
  assert.equal(exitedWith, exitCodeFor(EXIT_CLASS.UNKNOWN_FATAL));
});

test('global unhandledRejection handler persists a diagnostic', async () => {
  const persisted = [];
  const uninstall = installGlobalHandlers({
    log: () => {},
    persist: async (classification) => { persisted.push(classification); },
    exit: () => {},
  });
  uninstall.handlers.onRejection(new Error('async boom'));
  await new Promise((r) => setTimeout(r, 50));
  uninstall();
  assert.equal(persisted[0], EXIT_CLASS.UNKNOWN_FATAL);
});

test('SIGTERM is captured and classified as TIMEOUT (paid-pod teardown)', async () => {
  const persisted = [];
  const uninstall = installGlobalHandlers({
    log: () => {},
    persist: async (classification, detail) => { persisted.push({ classification, detail }); },
    exit: () => {},
  });
  uninstall.handlers.onSigterm();
  await new Promise((r) => setTimeout(r, 50));
  uninstall();
  assert.equal(persisted[0].classification, EXIT_CLASS.TIMEOUT);
  assert.equal(persisted[0].detail.kind, 'SIGTERM');
});

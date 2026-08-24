'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  CHARACTER_EVIDENCE_ROOT,
  assertEvidenceKey,
  listArtifactFiles,
  persistCharacterRun,
} = require('../src/character-artifacts');

function fakeTransport() {
  const objects = new Map();
  return {
    objects,
    createR2Client() {
      return { bucket: 'test' };
    },
    async uploadFile(_context, key, file) {
      const bytes = fs.readFileSync(file);
      objects.set(key, bytes);
      return { uri: `s3://test/${key}`, byteSize: bytes.length };
    },
    async headObject(_context, key) {
      return { byteSize: objects.get(key)?.length ?? -1, contentType: null };
    },
    async uploadBuffer(_context, key, bytes) {
      objects.set(key, Buffer.from(bytes));
      return `s3://test/${key}`;
    },
  };
}

test('live character artifacts persist outside SOURCE and PRODUCTION with verified sizes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-artifacts-'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'render_qa.png'), Buffer.from('png'));
  fs.writeFileSync(path.join(root, 'nested', 'CHAR_GOAT_001_working_executed.blend'), Buffer.from('blend'));
  const transport = fakeTransport();
  const persisted = await persistCharacterRun({
    env: { CHARACTER_PERSIST_ARTIFACTS: 'true' },
    executionId: 'goat-v4-test-0001',
    jobId: 'goat-v4-job-0001',
    artifactDir: root,
    transport,
    result: {
      ok: true,
      code: 'LIVE_DEPARTMENT_EXECUTED',
      jobKind: 'CHARACTER_MASTER_BUILD',
      executionMode: 'live',
      authorizedDownloadInvoked: 1,
      networkDownloadInvoked: true,
      department: {
        ok: true,
        stageCount: 26,
        executeFlagPresent: true,
        dryRunFlagPresent: false,
        gate: { status: 'BLOCKED', goatProductionReady: false },
      },
    },
  });
  assert.equal(persisted.ok, true);
  assert.equal(persisted.complete, true);
  assert.equal(persisted.files.length, 2);
  assert.ok(persisted.files.every((file) => file.key.startsWith(`${CHARACTER_EVIDENCE_ROOT}/goat-v4-test-0001/`)));
  assert.ok(persisted.files.every((file) => !file.key.toLowerCase().includes('/source/')));
  assert.ok(persisted.files.every((file) => !file.key.toLowerCase().includes('/production/')));
  const status = JSON.parse(transport.objects.get('jobs/goat-v4-job-0001/status.json').toString('utf8'));
  assert.equal(status.status, 'COMPLETE');
  assert.equal(status.goatProductionReady, false);
  assert.equal(status.humanVisualApprovalRequired, true);
});

test('artifact persistence is mandatory and locked source files cannot enter evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-artifacts-refuse-'));
  fs.writeFileSync(path.join(root, 'Goat_FINN.zip'), Buffer.from('forbidden'));
  assert.throws(() => listArtifactFiles(root), /locked Goat source archive/);
  await assert.rejects(
    persistCharacterRun({
      env: {},
      executionId: 'goat-v4-test-0002',
      jobId: 'goat-v4-job-0002',
      artifactDir: root,
      transport: fakeTransport(),
      result: {},
    }),
    /durable artifact persistence/,
  );
  assert.throws(
    () => assertEvidenceKey('tivvlejoy-assets/characters/CHAR_GOAT_001/source/bad.blend'),
    /execution-evidence prefix|SOURCE and PRODUCTION/,
  );
  assert.throws(
    () => assertEvidenceKey(`${CHARACTER_EVIDENCE_ROOT}/run-0001/PRODUCTION/master.blend`),
    /SOURCE and PRODUCTION/,
  );
});

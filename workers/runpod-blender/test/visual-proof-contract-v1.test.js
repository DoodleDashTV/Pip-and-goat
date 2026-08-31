'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const proof = require('../src/visual-proof-contract-v1');

test('preview and hero args stay Cycles / Water D / stills-only', () => {
  const preview = proof.buildPreviewArgs({ frame: 210 });
  assert.deepEqual(proof.assertVisualProofArgs(preview, { kind: 'preview' }), { ok: true, args: preview });
  const hero = proof.buildHeroArgs();
  assert.deepEqual(proof.assertVisualProofArgs(hero, { kind: 'hero' }), { ok: true, args: hero });
  assert.equal(hero.includes('256'), true);
  assert.equal(hero.includes('1080x1920'), true);
});

test('forbids EEVEE, Water C, 900-frame video, and v2/v7 cmds', () => {
  assert.throws(
    () => proof.assertVisualProofArgs(['--engine', 'BLENDER_EEVEE_NEXT', '--stills-only'], { kind: 'preview' }),
    (e) => e.code === 'VISUAL_PROOF_CONTRACT_FAILED',
  );
  assert.throws(
    () => proof.assertVisualProofArgs(['--python', '/opt/ddp-worker/blender/scenery/cinematic_valley_world_v1.py', '--end-frame', '900', '--engine', 'CYCLES', '--water-variant', 'D'], { kind: 'preview' }),
    (e) => e.code === 'VISUAL_PROOF_CONTRACT_FAILED',
  );
  assert.equal(proof.assertWorkerCmd(proof.FINAL_ENTRY).ok, true);
  assert.throws(() => proof.assertWorkerCmd('node ./src/v7-proof-a-boot.js'), (e) => e.code === 'WRONG_WORKER_CMD');
});

test('seven isolated processes and $0.50 / 40 min ceiling', () => {
  const plan = proof.isolatedProcessPlan();
  assert.equal(proof.assertVisualProofPlan(plan).ok, true);
  const shot02 = plan.preview.find((row) => row.shot === 'SHOT_02');
  assert.equal(shot02.frame >= 151 && shot02.frame <= 300, true);
  const spend = proof.spendCeiling();
  assert.equal(spend.hardSpendUsd, 0.5);
  assert.equal(spend.hardRuntimeMinutes, 40);
  assert.equal(spend.expectedUsdAtCeiling <= 0.5, true);
  assert.equal(spend.retry, false);
});

test('image inspection fail-closed', () => {
  assert.equal(proof.assertImageInspection({
    Cmd: ['node', './src/scenery-showcase-original14-entry.js'],
    WorkingDir: '/opt/ddp-worker',
    digest: `sha256:${'ab'.repeat(32)}`,
  }).ok, true);
  assert.throws(
    () => proof.assertImageInspection({ Cmd: ['node', './src/scenery-showcase-entry-v2.js'] }),
    (e) => e.code === 'FINAL_IMAGE_INSPECT_FAILED',
  );
});

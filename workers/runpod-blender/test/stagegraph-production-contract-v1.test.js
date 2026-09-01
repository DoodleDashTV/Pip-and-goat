'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../src/stagegraph-production-contract-v1');

const digest = 'ab'.repeat(32);
const approval = 'cd'.repeat(32);

function technical(stage) {
  return { stage, result: 'PASS', artifactSha256: digest };
}

function human(stage) {
  return { ...technical(stage), actorClass: 'HUMAN', decision: 'APPROVED', approvalSha256: approval };
}

test('starts with scenery certification and keeps characters waiting for the artist rigs', () => {
  const graph = contract.evaluateStageGraph({ selectedSourceId: 'SRC_FOREST_MODEL_PACKAGE', receipts: {} });
  assert.equal(graph.nextStage, 'SOURCE_PACK_LOCKED');
  assert.equal(graph.characterState, 'WAITING_FOR_ARTIST_RIGS');
  assert.equal(graph.productionReady, false);
  assert.equal(graph.finalRenderAuthorized, false);
});

test('technical completion labels cannot impersonate visual approval', () => {
  const verdict = contract.receiptVerdict('TIVVLEJOY_BEAUTY_FRAME_APPROVED', {
    ...human('TIVVLEJOY_BEAUTY_FRAME_APPROVED'),
    claimedApprovalLabel: 'VISUAL_PROOF_COMPLETE',
  });
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('TECHNICAL_LABEL_IS_NOT_VISUAL_APPROVAL'), true);
});

test('system and synthetic actors cannot approve a beauty frame', () => {
  for (const actorClass of ['SYSTEM', 'SYNTHETIC']) {
    const verdict = contract.receiptVerdict('TIVVLEJOY_BEAUTY_FRAME_APPROVED', {
      ...human('TIVVLEJOY_BEAUTY_FRAME_APPROVED'),
      actorClass,
    });
    assert.equal(verdict.valid, false);
    assert.equal(verdict.blockers.includes('HUMAN_APPROVAL_REQUIRED'), true);
  }
});

test('one-frame paid proof requires source lock, dependency audit, exact scope, and no retry', () => {
  const receipts = {
    SOURCE_PACK_LOCKED: technical('SOURCE_PACK_LOCKED'),
    DEPENDENCY_AUDIT_PASS: technical('DEPENDENCY_AUDIT_PASS'),
  };
  const authorized = contract.assertBeautyFrameAuthorization({
    receipts,
    authorization: {
      actorClass: 'HUMAN',
      scope: 'EXACTLY_ONE_VENDOR_REFERENCE_FRAME',
      createCount: 1,
      retryCount: 0,
      maxSpendUsd: 10,
      authorizationSha256: digest,
    },
  });
  assert.deepEqual(authorized, { authorized: true, frames: 1, retryCount: 0, encodeVideo: false, maxSpendUsd: 10 });
  assert.throws(
    () => contract.assertBeautyFrameAuthorization({ receipts, authorization: { actorClass: 'HUMAN', scope: 'EXACTLY_ONE_VENDOR_REFERENCE_FRAME', createCount: 1, retryCount: 1, maxSpendUsd: 10, authorizationSha256: digest } }),
    (error) => error.code === 'BEAUTY_FRAME_NOT_AUTHORIZED' && error.blockers.includes('RETRY_MUST_BE_ZERO'),
  );
});

test('final render is blocked until every preceding production and human gate passes', () => {
  const receipts = {
    SOURCE_PACK_LOCKED: technical('SOURCE_PACK_LOCKED'),
    DEPENDENCY_AUDIT_PASS: technical('DEPENDENCY_AUDIT_PASS'),
    VENDOR_REFERENCE_REPRODUCED: human('VENDOR_REFERENCE_REPRODUCED'),
    TIVVLEJOY_BEAUTY_FRAME_APPROVED: human('TIVVLEJOY_BEAUTY_FRAME_APPROVED'),
  };
  assert.throws(
    () => contract.assertFinalRenderAuthorization({ receipts }),
    (error) => error.code === 'FINAL_RENDER_NOT_AUTHORIZED' && error.blockers.some((item) => item.startsWith('STAGE_MASTER_APPROVED:')),
  );
});

test('production-ready is earned only after the batch-of-ten gate', () => {
  const receipts = {};
  for (const stage of contract.STAGES) receipts[stage] = contract.HUMAN_APPROVAL_STAGES.has(stage) ? human(stage) : technical(stage);
  const complete = contract.evaluateStageGraph({ selectedSourceId: 'SRC_FOREST_MODEL_PACKAGE', receipts });
  assert.equal(complete.productionReady, true);
  assert.equal(complete.nextStage, null);
  delete receipts.BATCH_10_QC_PASS;
  assert.equal(contract.evaluateStageGraph({ selectedSourceId: 'SRC_FOREST_MODEL_PACKAGE', receipts }).productionReady, false);
});

test('five seconds per frame yields the conservative 60-second budget', () => {
  const budget = contract.renderBudget({ secondsPerFrame: 5 });
  assert.equal(budget.frames, 1800);
  assert.equal(budget.gpuHours, 2.5);
  assert.equal(budget.renderUsdPerEpisode, 1.85);
  assert.equal(budget.monthlyRenderUsd, 222);
  assert.equal(budget.speedGatePass, true);
  assert.equal(contract.renderBudget({ secondsPerFrame: 5.01 }).speedGatePass, false);
});

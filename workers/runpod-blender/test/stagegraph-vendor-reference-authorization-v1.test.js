'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const contract = require('../src/stagegraph-production-contract-v1');

const repoRoot = path.resolve(__dirname, '../../..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'artifacts/tivvlejoy-stagegraph-v1', name), 'utf8'));

test('locked vendor-reference authorization hashes and authorizes exactly one frame', () => {
  const auth = load('VENDOR_REFERENCE_AUTHORIZATION.json');
  const core = {
    schema: auth.schema,
    actorClass: auth.actorClass,
    scope: auth.scope,
    createCount: auth.createCount,
    retryCount: auth.retryCount,
    maxSpendUsd: auth.maxSpendUsd,
    encodeVideo: auth.encodeVideo,
    sceneName: auth.sceneName,
    sourceId: auth.sourceId,
    sourceSha256: auth.sourceSha256,
    dependencyAuditSha256: auth.dependencyAuditSha256,
    vendorReferencePreflightSha256: auth.vendorReferencePreflightSha256,
    ownedHdriSha256: auth.ownedHdriSha256,
    requiredBranch: auth.requiredBranch,
    requiredBaseSha: auth.requiredBaseSha,
  };
  assert.equal(contract.sha256Canonical(core), auth.authorizationSha256);
  assert.equal(auth.authorizationSha256, '23d6bc4471cd36eb124baab87b673648176333aff57d4a9c0d3e7157ec034c5d');
  const authorized = contract.assertBeautyFrameAuthorization({
    receipts: {
      SOURCE_PACK_LOCKED: load('SOURCE_PACK_LOCKED.json'),
      DEPENDENCY_AUDIT_PASS: load('DEPENDENCY_AUDIT_PASS.json'),
    },
    authorization: auth,
  });
  assert.deepEqual(authorized, { authorized: true, frames: 1, retryCount: 0, encodeVideo: false, maxSpendUsd: 1 });
});

test('blender success still cannot satisfy vendor-reference human approval', () => {
  const verdict = contract.receiptVerdict('VENDOR_REFERENCE_REPRODUCED', {
    stage: 'VENDOR_REFERENCE_REPRODUCED',
    result: 'PASS',
    artifactSha256: 'ab'.repeat(32),
    actorClass: 'SYSTEM',
    claimedApprovalLabel: 'BLENDER_RENDERED',
    decision: 'NOT_APPROVED',
  });
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('HUMAN_APPROVAL_REQUIRED'), true);
});

test('human visual REJECT receipt cannot clear VENDOR_REFERENCE_REPRODUCED', () => {
  const decision = load('VENDOR_REFERENCE_VISUAL_REVIEW_DECISION.json');
  assert.equal(decision.actorClass, 'HUMAN');
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.visualApproval, false);
  assert.equal(decision.imageSha256, 'a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400');
  const verdict = contract.receiptVerdict('VENDOR_REFERENCE_REPRODUCED', decision);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('RECEIPT_NOT_PASS'), true);
  assert.equal(verdict.blockers.includes('HUMAN_DECISION_NOT_APPROVED'), true);
});

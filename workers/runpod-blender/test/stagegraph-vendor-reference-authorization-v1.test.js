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
  assert.equal(auth.authorizationSha256, '12618427bd4c083d50c5affb7f13fafa032061a465dec3f42e3793eb4abbd031');
  assert.equal(auth.consumed, true);
  assert.equal(auth.encodeVideo, false);
  assert.equal(auth.retryCount, 0);
  assert.equal(auth.beautyFrame, false);
  assert.equal(auth.finalRender, false);
  assert.equal(auth.rejectedImageIneligible, true);
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

test('fresh authorization request is not a live CREATE grant and does not approve the rejected image', () => {
  const request = load('VENDOR_REFERENCE_AUTHORIZATION_REQUEST.json');
  const consumed = load('VENDOR_REFERENCE_AUTHORIZATION_CONSUMED_V1.json');
  const consumedV2 = load('VENDOR_REFERENCE_AUTHORIZATION_CONSUMED_V2.json');
  const live = load('VENDOR_REFERENCE_AUTHORIZATION.json');
  const decision = load('VENDOR_REFERENCE_VISUAL_REVIEW_DECISION.json');
  const decisionV2 = load('VENDOR_REFERENCE_VISUAL_REVIEW_DECISION_V2.json');
  const status = load('STATUS.json');
  assert.equal(request.authorized, false);
  assert.equal(request.actorClass, 'SYSTEM');
  assert.equal(request.requestedActorClass, 'HUMAN');
  assert.equal(request.requestedScope, 'EXACTLY_ONE_VENDOR_REFERENCE_FRAME');
  assert.equal(request.createCount, 1);
  assert.equal(request.retryCount, 0);
  assert.equal(request.encodeVideo, false);
  assert.equal(request.beautyFrame, false);
  assert.equal(request.finalRender, false);
  assert.equal(request.approveRejectedImage, false);
  assert.equal(request.rejectedImageSha256, 'a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400');
  assert.equal(request.materialPath, 'REPAIRED_IN_MEMORY_ECOKIT_CYCLES_OUTPUT');
  assert.equal(request.requiredBaseSha, '0b1ab9e57432b811352a7013c971629afbbf8d1d');
  assert.equal(contract.sha256Canonical(request.proposedAuthorizationCore), request.proposedAuthorizationCoreSha256);
  assert.equal(request.proposedAuthorizationCoreSha256, '270865630a301bf39d7067b0545c56a489d37c77c0633dc605d2d95ff7934161');
  assert.notEqual(request.proposedAuthorizationCoreSha256, consumed.authorizationSha256);
  assert.equal(consumed.consumed, true);
  assert.equal(consumed.authorizationSha256, '23d6bc4471cd36eb124baab87b673648176333aff57d4a9c0d3e7157ec034c5d');
  assert.equal(consumedV2.consumed, true);
  assert.equal(consumedV2.authorizationSha256, '270865630a301bf39d7067b0545c56a489d37c77c0633dc605d2d95ff7934161');
  assert.equal(live.authorizationSha256, '12618427bd4c083d50c5affb7f13fafa032061a465dec3f42e3793eb4abbd031');
  assert.notEqual(live.authorizationSha256, request.proposedAuthorizationCoreSha256);
  assert.equal(live.consumed, true);
  assert.equal(live.previousAuthorizationSha256, consumedV2.authorizationSha256);
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decisionV2.decision, 'REJECTED');
  assert.equal(decisionV2.imageSha256, '6f31cb689488813d54608aff0b0c959835204fb54f62e1d2e321d3957827c3b2');
  assert.equal(status.vendorReferenceReproducedApproved, false);
  assert.equal(status.humanVisualDecision, null);
  assert.equal(status.freshVendorReferenceAuthorizationPresent, true);
  assert.equal(status.rejectedVendorReferenceIneligible, true);
  assert.equal(status.vendorReferenceImageSha256, 'e873e483e817962afde700dcf4072655736f5dde271b2723a1ebdfc9046f12ad');
  assert.equal(status.rejectedVendorReferenceImageSha256, '6f31cb689488813d54608aff0b0c959835204fb54f62e1d2e321d3957827c3b2');
  assert.equal(status.previousRejectedVendorReferenceImageSha256, 'a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400');
  const verdict = contract.receiptVerdict('VENDOR_REFERENCE_REPRODUCED', request);
  assert.equal(verdict.valid, false);
});

test('human visual REJECT receipt cannot clear VENDOR_REFERENCE_REPRODUCED', () => {
  const decision = load('VENDOR_REFERENCE_VISUAL_REVIEW_DECISION.json');
  const decisionV2 = load('VENDOR_REFERENCE_VISUAL_REVIEW_DECISION_V2.json');
  assert.equal(decision.actorClass, 'HUMAN');
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.visualApproval, false);
  assert.equal(decision.imageSha256, 'a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400');
  assert.equal(decisionV2.actorClass, 'HUMAN');
  assert.equal(decisionV2.decision, 'REJECTED');
  assert.equal(decisionV2.visualApproval, false);
  assert.equal(decisionV2.imageSha256, '6f31cb689488813d54608aff0b0c959835204fb54f62e1d2e321d3957827c3b2');
  const verdict = contract.receiptVerdict('VENDOR_REFERENCE_REPRODUCED', decision);
  const verdictV2 = contract.receiptVerdict('VENDOR_REFERENCE_REPRODUCED', decisionV2);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('RECEIPT_NOT_PASS'), true);
  assert.equal(verdict.blockers.includes('HUMAN_DECISION_NOT_APPROVED'), true);
  assert.equal(verdictV2.valid, false);
  assert.equal(verdictV2.blockers.includes('RECEIPT_NOT_PASS'), true);
  assert.equal(verdictV2.blockers.includes('HUMAN_DECISION_NOT_APPROVED'), true);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const contract = require('../src/stagegraph-recipe-contract-v1');

const repoRoot = path.resolve(__dirname, '../../..');
const recipePath = path.join(repoRoot, 'recipes/tivvlejoy-stagegraph/005_vendor_reference_alpha_repair_v1.json');
const activePath = path.join(repoRoot, 'artifacts/tivvlejoy-stagegraph-v1/ACTIVE_RECIPE.json');
const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf8'));
const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));

test('real alpha-repair recipe is valid and zero-paid', () => {
  const verdict = contract.validateRecipe(recipe);
  assert.equal(verdict.valid, true, verdict.blockers.join(','));
  assert.equal(recipe.budget.maxPaidCreateCount, 0);
  assert.equal(recipe.budget.maxSpendUsd, 0);
  assert.equal(recipe.forbiddenActions.includes('CREATE_PAID_POD'), true);
  assert.equal(recipe.forbiddenActions.includes('RENDER_PAID_FRAME'), true);
  assert.equal(recipe.inputs.rejectedArtifact.sha256, 'a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400');
});

test('active recipe receipt is bound to the exact machine-readable recipe and rejected frame', () => {
  const verdict = contract.validateRecipe(recipe);
  assert.equal(active.recipeId, recipe.recipeId);
  assert.equal(active.recipePath, 'recipes/tivvlejoy-stagegraph/005_vendor_reference_alpha_repair_v1.json');
  assert.equal(active.recipeCanonicalSha256, verdict.recipeSha256);
  assert.equal(active.rejectedImageSha256, recipe.inputs.rejectedArtifact.sha256);
  assert.deepEqual(active.budget, recipe.budget);
  assert.equal(active.formalStageGraphApproval, false);
  assert.equal(active.state, 'ZERO_PAID_REPAIR_COMPLETE');
  assert.equal(active.rootCause, 'ECOKIT_EEVEE_MATERIAL_OUTPUT_ACTIVE_IN_CYCLES');
  assert.equal(active.nextAction, 'AWAIT_HUMAN_VENDOR_REFERENCE_FRAME_AUTHORIZATION');
  assert.equal(active.authorizationRequestPath, 'artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION_REQUEST.json');
});

test('execution sequence can only use explicitly allowed actions', () => {
  const plan = contract.buildExecutionPlan(recipe);
  assert.equal(plan.failClosed, true);
  assert.deepEqual(plan.sequence, recipe.execution.sequence);
  assert.equal(plan.outputReceiptPath, 'artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_ALPHA_REPAIR_RESULT.json');
});

test('zero-paid recipe fails closed if a paid action is introduced', () => {
  const mutated = structuredClone(recipe);
  mutated.allowedActions.push('CREATE_PAID_POD');
  const verdict = contract.validateRecipe(mutated);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('ZERO_PAID_RECIPE_ALLOWS_PAID_ACTION:CREATE_PAID_POD'), true);
});

test('sequence fails closed if Cursor invents an undeclared action', () => {
  const mutated = structuredClone(recipe);
  mutated.execution.sequence.splice(-1, 0, 'DO_WHATEVER_SEEMS_BEST');
  const verdict = contract.validateRecipe(mutated);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.blockers.includes('SEQUENCE_ACTION_NOT_ALLOWED:DO_WHATEVER_SEEMS_BEST'), true);
});

test('committed alpha-repair result receipt is a valid zero-paid PASS', () => {
  const resultPath = path.join(repoRoot, 'artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_ALPHA_REPAIR_RESULT.json');
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const verdict = contract.validateResultReceipt(recipe, result);
  assert.equal(verdict.valid, true, verdict.blockers.join(','));
  assert.equal(result.result, 'PASS');
  assert.equal(result.rootCause, 'ECOKIT_EEVEE_MATERIAL_OUTPUT_ACTIVE_IN_CYCLES');
  assert.equal(result.paidCreateCount, 0);
  assert.equal(result.paidSpendUsd, 0);
  assert.equal(result.nextAction, 'REQUEST_FRESH_VENDOR_REFERENCE_FRAME_AUTHORIZATION');
  assert.equal(result.vendorReferenceReproducedApproved, false);
});

test('PASS result requires evidence and cannot exceed zero-paid budget', () => {
  const recipeSha256 = contract.validateRecipe(recipe).recipeSha256;
  const base = {
    schema: contract.RESULT_SCHEMA,
    recipeId: recipe.recipeId,
    recipeSha256,
    result: 'PASS',
    rootCause: 'ALPHA_PATH_TEST_ROOT_CAUSE',
    rootCauseEvidence: { test: 'evidence' },
    filesChanged: [],
    testsRun: ['UNIT_TEST'],
    testResults: { UNIT_TEST: 'PASS' },
    paidCreateCount: 0,
    paidSpendUsd: 0,
    nextAction: 'REQUEST_FRESH_VENDOR_REFERENCE_FRAME_AUTHORIZATION'
  };
  assert.equal(contract.validateResultReceipt(recipe, base).valid, true);

  const paid = { ...base, paidCreateCount: 1, paidSpendUsd: 0.01 };
  const paidVerdict = contract.validateResultReceipt(recipe, paid);
  assert.equal(paidVerdict.valid, false);
  assert.equal(paidVerdict.blockers.includes('RESULT_PAID_CREATE_BUDGET_EXCEEDED'), true);
  assert.equal(paidVerdict.blockers.includes('RESULT_SPEND_BUDGET_EXCEEDED'), true);

  const noEvidence = { ...base };
  delete noEvidence.rootCauseEvidence;
  const noEvidenceVerdict = contract.validateResultReceipt(recipe, noEvidence);
  assert.equal(noEvidenceVerdict.valid, false);
  assert.equal(noEvidenceVerdict.blockers.includes('PASS_ROOT_CAUSE_EVIDENCE_REQUIRED'), true);
});

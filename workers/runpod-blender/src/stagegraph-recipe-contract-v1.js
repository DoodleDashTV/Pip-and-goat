'use strict';

const { createHash } = require('node:crypto');

const RECIPE_SCHEMA = 'TIVVLEJOY_RECIPE_V1';
const RESULT_SCHEMA = 'TIVVLEJOY_RECIPE_RESULT_V1';

const PAID_ACTIONS = new Set([
  'CREATE_PAID_POD',
  'RENDER_PAID_FRAME',
  'RENDER_PAID_VIDEO',
  'ENCODE_VIDEO',
  'AUTO_RETRY',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sha256Canonical(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').replace(/^sha256:/, ''));
}

function validateRecipe(recipe = {}) {
  const blockers = [];

  if (recipe.schema !== RECIPE_SCHEMA) blockers.push('RECIPE_SCHEMA_INVALID');
  if (!/^[A-Z0-9_]+_V[0-9]+$/.test(String(recipe.recipeId || ''))) blockers.push('RECIPE_ID_INVALID');
  if (!Number.isInteger(recipe.version) || recipe.version < 1) blockers.push('RECIPE_VERSION_INVALID');

  const allowed = Array.isArray(recipe.allowedActions) ? recipe.allowedActions : [];
  const forbidden = Array.isArray(recipe.forbiddenActions) ? recipe.forbiddenActions : [];
  const sequence = Array.isArray(recipe.execution?.sequence) ? recipe.execution.sequence : [];

  if (!allowed.length) blockers.push('ALLOWED_ACTIONS_REQUIRED');
  if (!forbidden.length) blockers.push('FORBIDDEN_ACTIONS_REQUIRED');
  if (!sequence.length) blockers.push('EXECUTION_SEQUENCE_REQUIRED');
  if (recipe.execution?.failClosed !== true) blockers.push('FAIL_CLOSED_REQUIRED');

  const overlap = allowed.filter((action) => forbidden.includes(action));
  if (overlap.length) blockers.push(`ACTION_ALLOW_DENY_OVERLAP:${overlap.join('|')}`);

  for (const step of sequence) {
    if (!allowed.includes(step)) blockers.push(`SEQUENCE_ACTION_NOT_ALLOWED:${step}`);
    if (forbidden.includes(step)) blockers.push(`SEQUENCE_ACTION_FORBIDDEN:${step}`);
  }

  const budget = recipe.budget || {};
  const maxPaidCreateCount = Number(budget.maxPaidCreateCount);
  const maxSpendUsd = Number(budget.maxSpendUsd);
  if (!Number.isFinite(maxPaidCreateCount) || maxPaidCreateCount < 0) blockers.push('PAID_CREATE_BUDGET_INVALID');
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd < 0) blockers.push('SPEND_BUDGET_INVALID');

  if (maxPaidCreateCount === 0 || maxSpendUsd === 0) {
    for (const action of allowed) {
      if (PAID_ACTIONS.has(action)) blockers.push(`ZERO_PAID_RECIPE_ALLOWS_PAID_ACTION:${action}`);
    }
  }

  const rejected = recipe.inputs?.rejectedArtifact;
  if (rejected) {
    if (!rejected.path) blockers.push('REJECTED_ARTIFACT_PATH_REQUIRED');
    if (!isSha256(rejected.sha256)) blockers.push('REJECTED_ARTIFACT_SHA256_REQUIRED');
  }

  if (!recipe.outputs?.receiptPath) blockers.push('RESULT_RECEIPT_PATH_REQUIRED');
  if (!Array.isArray(recipe.outputs?.requiredFields) || !recipe.outputs.requiredFields.length) {
    blockers.push('RESULT_REQUIRED_FIELDS_REQUIRED');
  }

  return {
    valid: blockers.length === 0,
    blockers,
    recipeSha256: sha256Canonical(recipe),
  };
}

function assertRecipe(recipe = {}) {
  const verdict = validateRecipe(recipe);
  if (!verdict.valid) {
    throw Object.assign(new Error(verdict.blockers.join(',')), {
      code: 'TIVVLEJOY_RECIPE_INVALID',
      blockers: verdict.blockers,
    });
  }
  return verdict;
}

function buildExecutionPlan(recipe = {}) {
  const verdict = assertRecipe(recipe);
  return {
    schema: 'TIVVLEJOY_RECIPE_EXECUTION_PLAN_V1',
    recipeId: recipe.recipeId,
    recipeSha256: verdict.recipeSha256,
    failClosed: true,
    budget: {
      maxPaidCreateCount: Number(recipe.budget.maxPaidCreateCount),
      maxSpendUsd: Number(recipe.budget.maxSpendUsd),
    },
    sequence: [...recipe.execution.sequence],
    stopConditions: [...(recipe.stopConditions || [])],
    outputReceiptPath: recipe.outputs.receiptPath,
    planSha256: sha256Canonical({
      recipeId: recipe.recipeId,
      recipeSha256: verdict.recipeSha256,
      budget: recipe.budget,
      sequence: recipe.execution.sequence,
      stopConditions: recipe.stopConditions || [],
      outputReceiptPath: recipe.outputs.receiptPath,
    }),
  };
}

function validateResultReceipt(recipe = {}, receipt = {}) {
  const blockers = [];
  const recipeVerdict = validateRecipe(recipe);
  if (!recipeVerdict.valid) blockers.push(...recipeVerdict.blockers.map((item) => `RECIPE:${item}`));

  if (receipt.schema !== RESULT_SCHEMA) blockers.push('RESULT_SCHEMA_INVALID');
  if (receipt.recipeId !== recipe.recipeId) blockers.push('RESULT_RECIPE_ID_MISMATCH');
  if (receipt.recipeSha256 !== recipeVerdict.recipeSha256) blockers.push('RESULT_RECIPE_SHA256_MISMATCH');
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(receipt.result)) blockers.push('RESULT_STATUS_INVALID');

  for (const field of recipe.outputs?.requiredFields || []) {
    if (!(field in receipt)) blockers.push(`RESULT_FIELD_MISSING:${field}`);
  }

  const paidCreateCount = Number(receipt.paidCreateCount);
  const paidSpendUsd = Number(receipt.paidSpendUsd);
  if (!Number.isFinite(paidCreateCount) || paidCreateCount < 0) blockers.push('RESULT_PAID_CREATE_COUNT_INVALID');
  if (!Number.isFinite(paidSpendUsd) || paidSpendUsd < 0) blockers.push('RESULT_PAID_SPEND_INVALID');

  if (Number.isFinite(paidCreateCount) && paidCreateCount > Number(recipe.budget?.maxPaidCreateCount)) {
    blockers.push('RESULT_PAID_CREATE_BUDGET_EXCEEDED');
  }
  if (Number.isFinite(paidSpendUsd) && paidSpendUsd > Number(recipe.budget?.maxSpendUsd)) {
    blockers.push('RESULT_SPEND_BUDGET_EXCEEDED');
  }

  if (receipt.result === 'PASS') {
    if (!String(receipt.rootCause || '').trim()) blockers.push('PASS_ROOT_CAUSE_REQUIRED');
    if (recipe.execution?.requireEvidenceForRootCause === true && !receipt.rootCauseEvidence) {
      blockers.push('PASS_ROOT_CAUSE_EVIDENCE_REQUIRED');
    }
  }

  return { valid: blockers.length === 0, blockers };
}

module.exports = {
  RECIPE_SCHEMA,
  RESULT_SCHEMA,
  PAID_ACTIONS,
  sha256Canonical,
  sha256Text,
  validateRecipe,
  assertRecipe,
  buildExecutionPlan,
  validateResultReceipt,
};

'use strict';

const { createHash } = require('node:crypto');

const SCHEMA = 'TIVVLEJOY_STAGEGRAPH_V1';
const MAX_SECONDS_PER_FRAME = 5;
const GPU_USD_PER_HOUR = 0.74;
const MONTHLY_BUDGET_USD = 500;
const MONTHLY_EPISODE_TARGET = 120;

const STAGES = Object.freeze([
  'SOURCE_PACK_LOCKED',
  'DEPENDENCY_AUDIT_PASS',
  'VENDOR_REFERENCE_REPRODUCED',
  'TIVVLEJOY_BEAUTY_FRAME_APPROVED',
  'STAGE_MASTER_APPROVED',
  'PIP_RIG_APPROVED',
  'GOAT_RIG_APPROVED',
  'DIALOGUE_PERFORMANCE_APPROVED',
  'ANIMATIC_APPROVED',
  'SHOT_BEAUTY_STILLS_APPROVED',
  'RENDER_PREFLIGHT_PASS',
  'FINAL_RENDER_AUTHORIZED',
  'FINAL_RENDER_COMPLETE',
  'EPISODE_QC_PASS',
  'DELIVERY_APPROVED',
  'PILOT_30_APPROVED',
  'PILOT_60_APPROVED',
  'BATCH_10_QC_PASS',
]);

const HUMAN_APPROVAL_STAGES = new Set([
  'VENDOR_REFERENCE_REPRODUCED',
  'TIVVLEJOY_BEAUTY_FRAME_APPROVED',
  'STAGE_MASTER_APPROVED',
  'PIP_RIG_APPROVED',
  'GOAT_RIG_APPROVED',
  'DIALOGUE_PERFORMANCE_APPROVED',
  'ANIMATIC_APPROVED',
  'SHOT_BEAUTY_STILLS_APPROVED',
  'FINAL_RENDER_AUTHORIZED',
  'DELIVERY_APPROVED',
  'PILOT_30_APPROVED',
  'PILOT_60_APPROVED',
  'BATCH_10_QC_PASS',
]);

const TECHNICAL_ONLY_LABELS = new Set([
  'BLENDER_RENDERED',
  'GEOMETRY_PASS',
  'VISUAL_PROOF_COMPLETE',
  'WORKER_COMPLETE',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sha256Canonical(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').replace(/^sha256:/, ''));
}

function receiptVerdict(stage, receipt) {
  const blockers = [];
  if (!STAGES.includes(stage)) blockers.push('UNKNOWN_STAGE');
  if (!receipt || typeof receipt !== 'object') return { valid: false, blockers: ['RECEIPT_MISSING'] };
  if (receipt.stage !== stage) blockers.push('RECEIPT_STAGE_MISMATCH');
  if (receipt.result !== 'PASS') blockers.push('RECEIPT_NOT_PASS');
  if (!isSha256(receipt.artifactSha256)) blockers.push('ARTIFACT_SHA256_REQUIRED');
  if (TECHNICAL_ONLY_LABELS.has(receipt.claimedApprovalLabel)) blockers.push('TECHNICAL_LABEL_IS_NOT_VISUAL_APPROVAL');
  if (HUMAN_APPROVAL_STAGES.has(stage)) {
    if (receipt.actorClass !== 'HUMAN') blockers.push('HUMAN_APPROVAL_REQUIRED');
    if (receipt.decision !== 'APPROVED') blockers.push('HUMAN_DECISION_NOT_APPROVED');
    if (!isSha256(receipt.approvalSha256)) blockers.push('APPROVAL_SHA256_REQUIRED');
  }
  return { valid: blockers.length === 0, blockers };
}

function evaluateStageGraph(input = {}) {
  const receipts = input.receipts || {};
  const completed = [];
  const invalid = [];
  let nextStage = null;
  for (const stage of STAGES) {
    const verdict = receiptVerdict(stage, receipts[stage]);
    if (verdict.valid && nextStage === null) {
      completed.push(stage);
      continue;
    }
    if (nextStage === null) nextStage = stage;
    if (receipts[stage]) invalid.push({ stage, blockers: verdict.blockers });
  }
  const productionReady = completed.length === STAGES.length;
  const characterState =
    receiptVerdict('PIP_RIG_APPROVED', receipts.PIP_RIG_APPROVED).valid &&
    receiptVerdict('GOAT_RIG_APPROVED', receipts.GOAT_RIG_APPROVED).valid
      ? 'CHARACTERS_APPROVED'
      : 'WAITING_FOR_ARTIST_RIGS';
  return {
    schema: SCHEMA,
    selectedSourceId: input.selectedSourceId || null,
    completed,
    nextStage,
    invalid,
    characterState,
    productionReady,
    finalRenderAuthorized: receiptVerdict('FINAL_RENDER_AUTHORIZED', receipts.FINAL_RENDER_AUTHORIZED).valid,
    graphSha256: sha256Canonical({ selectedSourceId: input.selectedSourceId || null, completed, nextStage, invalid, characterState }),
  };
}

function assertBeautyFrameAuthorization(input = {}) {
  const receipts = input.receipts || {};
  const blockers = [];
  for (const stage of ['SOURCE_PACK_LOCKED', 'DEPENDENCY_AUDIT_PASS']) {
    const verdict = receiptVerdict(stage, receipts[stage]);
    if (!verdict.valid) blockers.push(`${stage}:${verdict.blockers.join('|')}`);
  }
  const auth = input.authorization || {};
  if (auth.actorClass !== 'HUMAN') blockers.push('PAID_AUTHORIZATION_HUMAN_REQUIRED');
  if (auth.scope !== 'EXACTLY_ONE_VENDOR_REFERENCE_FRAME') blockers.push('AUTHORIZATION_SCOPE_INVALID');
  if (Number(auth.createCount) !== 1) blockers.push('CREATE_COUNT_MUST_BE_ONE');
  if (Number(auth.retryCount) !== 0) blockers.push('RETRY_MUST_BE_ZERO');
  if (!(Number(auth.maxSpendUsd) > 0 && Number(auth.maxSpendUsd) <= 15)) blockers.push('BEAUTY_PROOF_SPEND_CEILING_INVALID');
  if (!isSha256(auth.authorizationSha256)) blockers.push('AUTHORIZATION_SHA256_REQUIRED');
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'BEAUTY_FRAME_NOT_AUTHORIZED', blockers });
  }
  return { authorized: true, frames: 1, retryCount: 0, encodeVideo: false, maxSpendUsd: Number(auth.maxSpendUsd) };
}

function assertFinalRenderAuthorization(input = {}) {
  const receipts = input.receipts || {};
  const required = STAGES.slice(0, STAGES.indexOf('FINAL_RENDER_AUTHORIZED') + 1);
  const blockers = [];
  for (const stage of required) {
    const verdict = receiptVerdict(stage, receipts[stage]);
    if (!verdict.valid) blockers.push(`${stage}:${verdict.blockers.join('|')}`);
  }
  if (blockers.length) {
    throw Object.assign(new Error(blockers.join(',')), { code: 'FINAL_RENDER_NOT_AUTHORIZED', blockers });
  }
  return { authorized: true };
}

function renderBudget({ durationSeconds = 60, fps = 30, secondsPerFrame, gpuUsdPerHour = GPU_USD_PER_HOUR, monthlyEpisodes = MONTHLY_EPISODE_TARGET }) {
  const frames = Number(durationSeconds) * Number(fps);
  const seconds = frames * Number(secondsPerFrame);
  const gpuHours = seconds / 3600;
  const renderUsdPerEpisode = gpuHours * Number(gpuUsdPerHour);
  const monthlyRenderUsd = renderUsdPerEpisode * Number(monthlyEpisodes);
  return {
    frames,
    gpuHours,
    renderUsdPerEpisode: Number(renderUsdPerEpisode.toFixed(4)),
    monthlyRenderUsd: Number(monthlyRenderUsd.toFixed(2)),
    secondsPerFrame: Number(secondsPerFrame),
    speedGatePass: Number(secondsPerFrame) <= MAX_SECONDS_PER_FRAME,
    totalEpisodeBudgetUsd: Number((MONTHLY_BUDGET_USD / Number(monthlyEpisodes)).toFixed(4)),
  };
}

module.exports = {
  SCHEMA,
  STAGES,
  HUMAN_APPROVAL_STAGES,
  TECHNICAL_ONLY_LABELS,
  MAX_SECONDS_PER_FRAME,
  GPU_USD_PER_HOUR,
  MONTHLY_BUDGET_USD,
  MONTHLY_EPISODE_TARGET,
  sha256Canonical,
  receiptVerdict,
  evaluateStageGraph,
  assertBeautyFrameAuthorization,
  assertFinalRenderAuthorization,
  renderBudget,
};

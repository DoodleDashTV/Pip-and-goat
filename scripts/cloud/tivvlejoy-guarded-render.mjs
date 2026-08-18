/**
 * TivvleJoy guarded RunPod render-plan / render-launch helper.
 *
 * validate and connectivity stay in the GitHub workflow (zero-cost / auth-only).
 * This module never prints secrets, authorization headers, or raw API bodies.
 *
 * Paid mutation (POST /v1/pods) is allowed only from the render-launch command
 * after every safety gate passes. render-plan must never create or modify a Pod.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

export const PINNED_GPU_TYPE_ID = 'NVIDIA GeForce RTX 4090';
export const PINNED_CLOUD_TYPE = 'SECURE';
export const PINNED_GPU_COUNT = 1;
export const MAX_HOURLY_USD = '0.75';
export const MAX_RUNTIME_MINUTES = 20;
export const MAX_COMPUTE_USD = '0.25';
export const REQUIRED_APPROVAL_PHRASE = 'LAUNCH_TIVVLEJOY_GPU';
export const POD_NAME_PREFIX = 'tivvlejoy-render-';
export const GRAPHQL_URL = 'https://api.runpod.io/graphql';
export const REST_PODS_URL = 'https://rest.runpod.io/v1/pods';
export const CLEANUP_ATTENTION = 'RUNPOD CLEANUP REQUIRES ATTENTION';
export const SCENE_EXECUTION_BOUNDARY =
  'Scene execution is the next TivvleJoy integration boundary. No remote render command is invoked.';

const AVAILABLE_STOCK = new Set(['High', 'Medium', 'Low']);
const POD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,80}$/;
const USD_PATTERN = /^\d+(\.\d+)?$/;

export function parseUsdToMicros(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return parseUsdToMicros(String(raw));
  }
  const text = String(raw).trim();
  if (!USD_PATTERN.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const first6 = `${frac}000000`.slice(0, 6);
  const extra = frac.slice(6);
  const micros = Number(whole) * 1_000_000 + Number(first6);
  if (!Number.isSafeInteger(micros) || micros < 0) return null;
  if (extra && /[1-9]/.test(extra)) return micros + 1;
  return micros;
}

export function ceilDiv(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    return null;
  }
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function projectedComputeMicros(hourlyMicros, runtimeMinutes) {
  if (!Number.isSafeInteger(hourlyMicros) || hourlyMicros < 0) return null;
  if (!Number.isSafeInteger(runtimeMinutes) || runtimeMinutes <= 0) return null;
  return ceilDiv(hourlyMicros * runtimeMinutes, 60);
}

export function formatUsdFromMicros(micros) {
  if (!Number.isSafeInteger(micros) || micros < 0) return null;
  const whole = Math.floor(micros / 1_000_000);
  const frac = String(micros % 1_000_000).padStart(6, '0');
  return `$${whole}.${frac}`;
}

export function isConfirmPaidGpu(value) {
  return value === true || value === 'true';
}

export function templateIdIsConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function classifyStock(stockStatus) {
  if (typeof stockStatus !== 'string' || stockStatus.trim() === '') {
    return { available: false, reason: 'RTX 4090 Secure stock could not be verified.' };
  }
  if (AVAILABLE_STOCK.has(stockStatus)) {
    return { available: true, reason: null };
  }
  return { available: false, reason: 'RTX 4090 Secure Cloud stock is unavailable.' };
}

export function evaluateApprovals({ mode, confirmPaidGpu, paidApprovalPhrase, templateId }) {
  if (mode !== 'render_launch') {
    return { ok: true, reason: null };
  }
  if (!isConfirmPaidGpu(confirmPaidGpu)) {
    return { ok: false, reason: 'render_launch refused: confirm_paid_gpu must be true.' };
  }
  if (paidApprovalPhrase !== REQUIRED_APPROVAL_PHRASE) {
    return { ok: false, reason: 'render_launch refused: paid_approval_phrase is not the required phrase.' };
  }
  if (!templateIdIsConfigured(templateId)) {
    return { ok: false, reason: 'render_launch refused: RUNPOD_RENDER_TEMPLATE_ID is not configured.' };
  }
  return { ok: true, reason: null };
}

export function evaluateGpuPlan({ hourlyUsdRaw, stockStatus, gpuCount }) {
  const stock = classifyStock(stockStatus);
  if (!stock.available) {
    return { ok: false, verdict: 'REFUSE', reason: stock.reason, hourlyMicros: null, projectedMicros: null };
  }
  if (gpuCount !== PINNED_GPU_COUNT) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: 'GPU count 1 is unavailable.',
      hourlyMicros: null,
      projectedMicros: null,
    };
  }
  const hourlyMicros = parseUsdToMicros(hourlyUsdRaw);
  if (hourlyMicros === null) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: 'Hourly price could not be verified.',
      hourlyMicros: null,
      projectedMicros: null,
    };
  }
  const maxHourlyMicros = parseUsdToMicros(MAX_HOURLY_USD);
  const maxComputeMicros = parseUsdToMicros(MAX_COMPUTE_USD);
  if (maxHourlyMicros === null || maxComputeMicros === null) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: 'Safety cap could not be parsed.',
      hourlyMicros: null,
      projectedMicros: null,
    };
  }
  if (hourlyMicros > maxHourlyMicros) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: `Hourly price ${formatUsdFromMicros(hourlyMicros)} exceeds the $${MAX_HOURLY_USD} cap.`,
      hourlyMicros,
      projectedMicros: null,
    };
  }
  const projectedMicros = projectedComputeMicros(hourlyMicros, MAX_RUNTIME_MINUTES);
  if (projectedMicros === null) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: 'Projected compute cost could not be parsed safely.',
      hourlyMicros,
      projectedMicros: null,
    };
  }
  if (projectedMicros > maxComputeMicros) {
    return {
      ok: false,
      verdict: 'REFUSE',
      reason: `Projected compute cost ${formatUsdFromMicros(projectedMicros)} exceeds the $${MAX_COMPUTE_USD} cap.`,
      hourlyMicros,
      projectedMicros,
    };
  }
  return { ok: true, verdict: 'PASS', reason: null, hourlyMicros, projectedMicros };
}

export function buildCreatePodPayload({ templateId, runId }) {
  if (!templateIdIsConfigured(templateId)) {
    throw new Error('RUNPOD_RENDER_TEMPLATE_ID is not configured.');
  }
  if (!runId || !/^[0-9]+$/.test(String(runId))) {
    throw new Error('GitHub run ID is missing or invalid.');
  }
  return {
    name: `${POD_NAME_PREFIX}${runId}`,
    cloudType: PINNED_CLOUD_TYPE,
    computeType: 'GPU',
    gpuTypeIds: [PINNED_GPU_TYPE_ID],
    gpuTypePriority: 'custom',
    gpuCount: PINNED_GPU_COUNT,
    interruptible: false,
    locked: false,
    templateId,
    ports: [],
  };
}

export function extractPodId(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const id = parsed.id;
  if (typeof id !== 'string' || !POD_ID_PATTERN.test(id)) return null;
  return id;
}

export function persistPodId(podId, env = process.env) {
  if (!extractPodId({ id: podId })) {
    throw new Error('Refusing to persist an invalid Pod ID.');
  }
  const file = env.TIVVLEJOY_POD_ID_FILE;
  if (file) {
    writeFileSync(file, podId, { encoding: 'utf8', mode: 0o600 });
  }
  if (env.GITHUB_ENV) {
    appendFileSync(env.GITHUB_ENV, `TIVVLEJOY_POD_ID=${podId}\n`);
  }
  return podId;
}

export function readPersistedPodId(env = process.env) {
  const fromEnv = typeof env.TIVVLEJOY_POD_ID === 'string' ? env.TIVVLEJOY_POD_ID.trim() : '';
  if (fromEnv && POD_ID_PATTERN.test(fromEnv)) return fromEnv;
  const file = env.TIVVLEJOY_POD_ID_FILE;
  if (file && existsSync(file)) {
    const fromFile = readFileSync(file, 'utf8').trim();
    if (POD_ID_PATTERN.test(fromFile)) return fromFile;
  }
  return null;
}

function jsonHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function readJsonSilently(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false, parsed: null };
  }
  try {
    return { ok: true, parsed: JSON.parse(text) };
  } catch {
    return { ok: false, parsed: null };
  }
}

export async function authenticateRunpod(apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey) {
    return { ok: false, reason: 'RUNPOD_API_KEY secret is missing.' };
  }
  const response = await fetchFn(GRAPHQL_URL, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({ query: '{ myself { id } }' }),
  });
  if (response.status < 200 || response.status > 299) {
    return { ok: false, reason: 'Authentication failed.' };
  }
  const { ok, parsed } = await readJsonSilently(response);
  if (!ok) {
    return { ok: false, reason: 'Authentication response could not be parsed.' };
  }
  if (!parsed?.data?.myself?.id) {
    return { ok: false, reason: 'Authentication response was ambiguous.' };
  }
  return { ok: true, reason: null };
}

export function parseSecurePricePayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'API response could not be parsed.' };
  }
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    return { ok: false, reason: 'Price lookup was refused by the API.' };
  }
  const gpuTypes = parsed.data?.gpuTypes;
  if (!Array.isArray(gpuTypes)) {
    return { ok: false, reason: 'API response could not be parsed.' };
  }
  if (gpuTypes.length === 0) {
    return { ok: false, reason: 'RTX 4090 Secure Cloud stock is unavailable.' };
  }
  const match = gpuTypes.find((gpu) => gpu && gpu.id === PINNED_GPU_TYPE_ID);
  if (!match) {
    return { ok: false, reason: 'Pinned RTX 4090 was not returned. Refusing GPU fallback.' };
  }
  const lowest = match.lowestPrice;
  if (lowest === null || lowest === undefined || typeof lowest !== 'object') {
    return { ok: false, reason: 'GPU count 1 is unavailable.' };
  }
  const hourlyRaw = lowest.uninterruptablePrice;
  if (hourlyRaw === null || hourlyRaw === undefined) {
    return { ok: false, reason: 'Hourly price could not be verified.' };
  }
  return {
    ok: true,
    hourlyUsdRaw: hourlyRaw,
    stockStatus: lowest.stockStatus,
    gpuCount: PINNED_GPU_COUNT,
  };
}

export async function querySecure4090Price(apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey) {
    return { ok: false, reason: 'RUNPOD_API_KEY secret is missing.' };
  }
  const response = await fetchFn(GRAPHQL_URL, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      query: `query SecurePrice($id: String) {
        gpuTypes(input: { id: $id }) {
          id
          lowestPrice(input: { gpuCount: 1, secureCloud: true }) {
            uninterruptablePrice
            stockStatus
          }
        }
      }`,
      variables: { id: PINNED_GPU_TYPE_ID },
    }),
  });
  if (response.status < 200 || response.status > 299) {
    return { ok: false, reason: 'Price lookup failed.' };
  }
  const { ok, parsed } = await readJsonSilently(response);
  if (!ok) {
    return { ok: false, reason: 'API response could not be parsed.' };
  }
  return parseSecurePricePayload(parsed);
}

export function formatPlanLines(plan) {
  return [
    '=== TivvleJoy render plan ===',
    `GPU: ${PINNED_GPU_TYPE_ID}`,
    `Cloud: ${PINNED_CLOUD_TYPE}`,
    `GPU count: ${PINNED_GPU_COUNT}`,
    `Current hourly price: ${plan.hourlyMicros == null ? 'unverified' : formatUsdFromMicros(plan.hourlyMicros)}`,
    `Maximum runtime: ${MAX_RUNTIME_MINUTES} minutes`,
    `Maximum projected compute cost: ${
      plan.projectedMicros == null ? 'unverified' : formatUsdFromMicros(plan.projectedMicros)
    }`,
    `Plan: ${plan.verdict}`,
    plan.reason ? `Reason: ${plan.reason}` : null,
  ].filter(Boolean);
}

export async function runRenderPlan({ apiKey, fetchFn = globalThis.fetch, log = console.log }) {
  try {
    const auth = await authenticateRunpod(apiKey, fetchFn);
    if (!auth.ok) {
      log('render_plan REFUSE');
      log(auth.reason);
      return { ok: false, createdPod: false };
    }
    const quote = await querySecure4090Price(apiKey, fetchFn);
    if (!quote.ok) {
      const refused = evaluateGpuPlan({
        hourlyUsdRaw: null,
        stockStatus: null,
        gpuCount: PINNED_GPU_COUNT,
      });
      for (const line of formatPlanLines({ ...refused, verdict: 'REFUSE', reason: quote.reason })) {
        log(line);
      }
      return { ok: false, createdPod: false };
    }
    const plan = evaluateGpuPlan(quote);
    for (const line of formatPlanLines(plan)) {
      log(line);
    }
    return { ok: plan.ok, createdPod: false, plan };
  } catch {
    log('render_plan REFUSE');
    log('Price or availability lookup failed closed.');
    return { ok: false, createdPod: false };
  }
}

export async function createGuardedPod({ apiKey, templateId, runId, fetchFn = globalThis.fetch }) {
  const payload = buildCreatePodPayload({ templateId, runId });
  const response = await fetchFn(REST_PODS_URL, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  if (response.status < 200 || response.status > 299) {
    return { ok: false, reason: 'Pod create was refused by the API.' };
  }
  const { ok, parsed } = await readJsonSilently(response);
  if (!ok) {
    return { ok: false, reason: 'Pod create response could not be parsed.' };
  }
  const podId = extractPodId(parsed);
  if (!podId) {
    return { ok: false, reason: 'Pod create response did not include a usable Pod ID.' };
  }
  return { ok: true, podId };
}

export async function deleteGuardedPod({ apiKey, podId, fetchFn = globalThis.fetch }) {
  if (!extractPodId({ id: podId })) {
    return { ok: false, reason: 'Cleanup Pod ID is invalid.' };
  }
  const response = await fetchFn(`${REST_PODS_URL}/${encodeURIComponent(podId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.status === 200 || response.status === 204 || response.status === 404) {
    return { ok: true, alreadyGone: response.status === 404 };
  }
  return { ok: false, reason: `Cleanup HTTP ${response.status} was not a confirmed delete.` };
}

export async function runRenderLaunch({
  apiKey,
  templateId,
  runId,
  confirmPaidGpu,
  paidApprovalPhrase,
  fetchFn = globalThis.fetch,
  log = console.log,
  env = process.env,
}) {
  const approvals = evaluateApprovals({
    mode: 'render_launch',
    confirmPaidGpu,
    paidApprovalPhrase,
    templateId,
  });
  if (!approvals.ok) {
    log('render_launch REFUSE');
    log(approvals.reason);
    return { ok: false, createdPod: false };
  }

  const planned = await runRenderPlan({ apiKey, fetchFn, log });
  if (!planned.ok) {
    log('render_launch REFUSE');
    log('render_plan safety checks must pass immediately before launch.');
    return { ok: false, createdPod: false };
  }

  let created;
  try {
    created = await createGuardedPod({ apiKey, templateId, runId, fetchFn });
  } catch {
    log('render_launch REFUSE');
    log('Pod create failed closed before a Pod ID was recorded.');
    return { ok: false, createdPod: false };
  }
  if (!created.ok) {
    log('render_launch REFUSE');
    log(created.reason);
    return { ok: false, createdPod: false };
  }

  persistPodId(created.podId, env);
  log('launch PASS');
  log(`Pod ID: ${created.podId}`);
  log(`Selected GPU: ${PINNED_GPU_TYPE_ID}`);
  log(`Hourly price: ${formatUsdFromMicros(planned.plan.hourlyMicros)}`);
  log(`Runtime cap: ${MAX_RUNTIME_MINUTES} minutes`);
  log(`Projected maximum compute cost: ${formatUsdFromMicros(planned.plan.projectedMicros)}`);
  log(SCENE_EXECUTION_BOUNDARY);
  return { ok: true, createdPod: true, podId: created.podId };
}

export async function runCleanup({ apiKey, fetchFn = globalThis.fetch, log = console.log, env = process.env }) {
  const podId = readPersistedPodId(env);
  if (!podId) {
    log('Cleanup: no Pod was created. Nothing to delete.');
    return { ok: true, skipped: true };
  }
  if (!apiKey) {
    log(CLEANUP_ATTENTION);
    log(`Pod ID: ${podId}`);
    return { ok: false, skipped: false, podId };
  }
  let deleted;
  try {
    deleted = await deleteGuardedPod({ apiKey, podId, fetchFn });
  } catch {
    log(CLEANUP_ATTENTION);
    log(`Pod ID: ${podId}`);
    return { ok: false, skipped: false, podId };
  }
  if (!deleted.ok) {
    log(CLEANUP_ATTENTION);
    log(`Pod ID: ${podId}`);
    return { ok: false, skipped: false, podId };
  }
  log(`Cleanup confirmed for Pod ID: ${podId}`);
  return { ok: true, skipped: false, podId };
}

async function cli(command, env = process.env, fetchFn = globalThis.fetch) {
  const apiKey = env.RUNPOD_API_KEY ?? '';
  if (command === 'render-plan') {
    const result = await runRenderPlan({ apiKey, fetchFn });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'render-launch') {
    const result = await runRenderLaunch({
      apiKey,
      templateId: env.RUNPOD_RENDER_TEMPLATE_ID ?? '',
      runId: env.GITHUB_RUN_ID ?? '',
      confirmPaidGpu: env.CONFIRM_PAID_GPU,
      paidApprovalPhrase: env.PAID_APPROVAL_PHRASE ?? '',
      fetchFn,
      env,
    });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  if (command === 'cleanup') {
    const result = await runCleanup({ apiKey, fetchFn, env });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  console.log('Unknown command. Use render-plan, render-launch, or cleanup.');
  process.exitCode = 1;
}

const invokedDirectly = Boolean(process.argv[1] && process.argv[1].endsWith('tivvlejoy-guarded-render.mjs'));
if (invokedDirectly && process.env.VITEST !== 'true') {
  await cli(process.argv[2] ?? '');
}

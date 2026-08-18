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
export const GITHUB_JOB_TIMEOUT_MINUTES = 25;
export const REMOTE_RENDER_TIMEOUT_CONTRACT = Object.freeze({
  hardDeadlineMinutes: MAX_RUNTIME_MINUTES,
  githubOuterTimeoutMinutes: GITHUB_JOB_TIMEOUT_MINUTES,
  cleanupWindowMinutes: GITHUB_JOB_TIMEOUT_MINUTES - MAX_RUNTIME_MINUTES,
  githubTimeoutIsOuterEmergencyGuardOnly: true,
  timeoutOrFailureMustFlowIntoPodCleanup: true,
  remoteBlenderCommandPresent: false,
  requirement:
    'When remote Blender execution is added, it must have its own hard 20-minute deadline. Timeout or failure must flow into Pod cleanup. The GitHub 25-minute job timeout is only an outer emergency guard so cleanup can run before the runner is killed.',
});

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

export function evaluateModePaidConfirmation(mode, confirmPaidGpu) {
  const paid = isConfirmPaidGpu(confirmPaidGpu);
  if (mode === 'render_launch') {
    if (paid) return { ok: true, reason: null };
    return { ok: false, reason: 'render_launch refused: confirm_paid_gpu must be true.' };
  }
  if (paid) {
    return { ok: false, reason: 'Paid GPU confirmation is not allowed outside render_launch.' };
  }
  return { ok: true, reason: null };
}

export function evaluateApprovals({ mode, confirmPaidGpu, paidApprovalPhrase, templateId }) {
  const modeGate = evaluateModePaidConfirmation(mode, confirmPaidGpu);
  if (!modeGate.ok) {
    return modeGate;
  }
  if (mode !== 'render_launch') {
    return { ok: true, reason: null };
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

export function createHttpStatusRequiresRecovery(status) {
  if (!Number.isInteger(status)) return true;
  return status < 200 || status > 299;
}

export function extractPodId(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const id = parsed.id;
  if (typeof id !== 'string' || !POD_ID_PATTERN.test(id)) return null;
  return id;
}

export function normalizePodList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pods)) return parsed.pods;
  return null;
}

export function extractExactNameMatches(items, exactName) {
  if (!Array.isArray(items)) {
    return { ok: false, matches: [], reason: 'Pod list response could not be parsed.' };
  }
  if (typeof exactName !== 'string' || exactName.length === 0) {
    return { ok: false, matches: [], reason: 'Intended Pod name is missing.' };
  }
  const matches = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, matches: [], reason: 'Pod list response could not be parsed.' };
    }
    if (item.name !== exactName) continue;
    const id = extractPodId(item);
    if (!id) {
      return { ok: false, matches: [], reason: 'Exact-name match had no usable Pod ID.' };
    }
    matches.push({ id, name: exactName });
  }
  return { ok: true, matches, reason: null };
}

export function buildRemoteRenderDeadlineWrapper(commandParts) {
  if (!Array.isArray(commandParts) || commandParts.length === 0) {
    return {
      ok: false,
      reason: 'No remote render command is present yet. Scene execution remains the next integration boundary.',
      argv: null,
      hardDeadlineMinutes: MAX_RUNTIME_MINUTES,
    };
  }
  return {
    ok: true,
    reason: null,
    argv: ['timeout', '--kill-after=30s', `${MAX_RUNTIME_MINUTES}m`, ...commandParts],
    hardDeadlineMinutes: MAX_RUNTIME_MINUTES,
  };
}

export function intendedPodName(runId) {
  if (!runId || !/^[0-9]+$/.test(String(runId))) return null;
  return `${POD_NAME_PREFIX}${runId}`;
}

export function persistLaunchIntent({ podName, env = process.env }) {
  if (typeof podName !== 'string' || !podName.startsWith(POD_NAME_PREFIX) || podName === POD_NAME_PREFIX) {
    throw new Error('Refusing to persist an invalid intended Pod name.');
  }
  if (env.TIVVLEJOY_POD_NAME_FILE) {
    writeFileSync(env.TIVVLEJOY_POD_NAME_FILE, podName, { encoding: 'utf8', mode: 0o600 });
  }
  if (env.TIVVLEJOY_CREATE_ATTEMPTED_FILE) {
    writeFileSync(env.TIVVLEJOY_CREATE_ATTEMPTED_FILE, 'true', { encoding: 'utf8', mode: 0o600 });
  }
  if (env.GITHUB_ENV) {
    appendFileSync(env.GITHUB_ENV, `TIVVLEJOY_POD_NAME=${podName}\nTIVVLEJOY_CREATE_ATTEMPTED=true\n`);
  }
  return { podName, createAttempted: true };
}

export function readLaunchIntent(env = process.env) {
  const fromEnvName = typeof env.TIVVLEJOY_POD_NAME === 'string' ? env.TIVVLEJOY_POD_NAME.trim() : '';
  const nameFile = env.TIVVLEJOY_POD_NAME_FILE;
  const fromFileName =
    nameFile && existsSync(nameFile) ? readFileSync(nameFile, 'utf8').trim() : '';
  const podName = fromEnvName || fromFileName || null;
  const attemptedEnv = env.TIVVLEJOY_CREATE_ATTEMPTED;
  const attemptedFile = env.TIVVLEJOY_CREATE_ATTEMPTED_FILE;
  const attemptedFromFile =
    attemptedFile && existsSync(attemptedFile) ? readFileSync(attemptedFile, 'utf8').trim() === 'true' : false;
  const createAttempted = attemptedEnv === 'true' || attemptedFromFile || Boolean(podName);
  return { podName, createAttempted };
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

export async function listPodsReadonly(apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey) {
    return { ok: false, items: null, reason: 'RUNPOD_API_KEY secret is missing.' };
  }
  let response;
  try {
    response = await fetchFn(REST_PODS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    return { ok: false, items: null, reason: 'Pod list lookup failed.' };
  }
  if (response.status < 200 || response.status > 299) {
    return { ok: false, items: null, reason: 'Pod list lookup failed.' };
  }
  const { ok, parsed } = await readJsonSilently(response);
  if (!ok) {
    return { ok: false, items: null, reason: 'Pod list response could not be parsed.' };
  }
  const items = normalizePodList(parsed);
  if (items === null) {
    return { ok: false, items: null, reason: 'Pod list response could not be parsed.' };
  }
  return { ok: true, items, reason: null };
}

export async function recoverPodByExactName({ apiKey, exactName, fetchFn = globalThis.fetch }) {
  const listed = await listPodsReadonly(apiKey, fetchFn);
  if (!listed.ok) {
    return { kind: 'attention', matches: [], reason: listed.reason };
  }
  const extracted = extractExactNameMatches(listed.items, exactName);
  if (!extracted.ok) {
    return { kind: 'attention', matches: [], reason: extracted.reason };
  }
  if (extracted.matches.length === 0) {
    return { kind: 'zero', matches: [], reason: `Recovery confirmed zero exact-name matches for ${exactName}.` };
  }
  if (extracted.matches.length === 1) {
    return { kind: 'one', matches: extracted.matches, podId: extracted.matches[0].id, reason: null };
  }
  return {
    kind: 'attention',
    matches: extracted.matches,
    reason: `Recovery found ${extracted.matches.length} Pods with the exact name ${exactName}.`,
  };
}

function resolveGuardedCreateBody({ templateId, runId, payload }) {
  if (payload && typeof payload === 'object') {
    if (templateId && payload.templateId && payload.templateId !== templateId) {
      throw new Error('Guarded create payload templateId does not match the approved template.');
    }
    return {
      name: payload.name,
      cloudType: payload.cloudType,
      computeType: payload.computeType,
      gpuTypeIds: payload.gpuTypeIds,
      gpuTypePriority: payload.gpuTypePriority,
      gpuCount: payload.gpuCount,
      interruptible: payload.interruptible,
      locked: payload.locked ?? false,
      templateId: payload.templateId || templateId,
      ports: payload.ports ?? [],
      ...(payload.env ? { env: payload.env } : {}),
    };
  }
  return buildCreatePodPayload({ templateId, runId });
}

export async function createGuardedPod({
  apiKey,
  templateId,
  runId,
  fetchFn = globalThis.fetch,
  env = process.env,
  payload,
} = {}) {
  const body = resolveGuardedCreateBody({ templateId, runId, payload });
  persistLaunchIntent({ podName: body.name, env });
  let response;
  try {
    response = await fetchFn(REST_PODS_URL, {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      recover: true,
      reason: 'Pod create transport was ambiguous after the request was sent.',
      podName: body.name,
    };
  }
  if (createHttpStatusRequiresRecovery(response.status)) {
    return {
      ok: false,
      recover: true,
      reason: `Pod create HTTP ${response.status} was ambiguous after the request was sent.`,
      podName: body.name,
    };
  }
  const { ok, parsed } = await readJsonSilently(response);
  if (!ok) {
    return { ok: false, recover: true, reason: 'Pod create response could not be parsed.', podName: body.name };
  }
  const podId = extractPodId(parsed);
  if (!podId) {
    return {
      ok: false,
      recover: true,
      reason: 'Pod create response did not include a usable Pod ID.',
      podName: body.name,
    };
  }
  return { ok: true, recover: false, podId, podName: body.name };
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
    created = await createGuardedPod({ apiKey, templateId, runId, fetchFn, env });
  } catch {
    log('render_launch REFUSE');
    log('Pod create failed closed before a create attempt was recorded.');
    return { ok: false, createdPod: false };
  }
  if (created.ok) {
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
  if (!created.recover) {
    log('render_launch REFUSE');
    log(created.reason);
    return { ok: false, createdPod: false };
  }
  return recoverAfterAmbiguousCreate({
    apiKey,
    exactName: created.podName ?? intendedPodName(runId),
    reason: created.reason,
    fetchFn,
    log,
    env,
  });
}

function printAttention(log, { podId, podName, matches }) {
  log(CLEANUP_ATTENTION);
  if (podId) log(`Pod ID: ${podId}`);
  if (podName) log(`Exact name: ${podName}`);
  if (Array.isArray(matches) && matches.length > 0) {
    log(`Matching Pod IDs: ${matches.map((match) => match.id).join(', ')}`);
  }
}

async function deletePersistedPod({ apiKey, podId, fetchFn, log }) {
  if (!apiKey) {
    printAttention(log, { podId });
    return { ok: false, skipped: false, podId };
  }
  let deleted;
  try {
    deleted = await deleteGuardedPod({ apiKey, podId, fetchFn });
  } catch {
    printAttention(log, { podId });
    return { ok: false, skipped: false, podId };
  }
  if (!deleted.ok) {
    printAttention(log, { podId });
    return { ok: false, skipped: false, podId };
  }
  log(`Cleanup confirmed for Pod ID: ${podId}`);
  return { ok: true, skipped: false, podId };
}

async function recoverAfterAmbiguousCreate({ apiKey, exactName, reason, fetchFn, log, env }) {
  log('Create response was ambiguous. Entering exact-name recovery.');
  if (reason) log(reason);
  if (!exactName) {
    printAttention(log, {});
    log('Intended Pod name is missing.');
    return { ok: false, createdPod: false, recovered: false };
  }
  const recovered = await recoverPodByExactName({ apiKey, exactName, fetchFn });
  if (recovered.kind === 'one') {
    persistPodId(recovered.podId, env);
    log(`Recovered Pod ID: ${recovered.podId}`);
    const deleted = await deletePersistedPod({ apiKey, podId: recovered.podId, fetchFn, log });
    return {
      ok: false,
      createdPod: true,
      recovered: true,
      cleaned: deleted.ok,
      podId: recovered.podId,
    };
  }
  if (recovered.kind === 'zero') {
    log(recovered.reason);
    return { ok: false, createdPod: false, recovered: true, confirmedZero: true };
  }
  printAttention(log, { podName: exactName, matches: recovered.matches });
  if (recovered.reason) log(recovered.reason);
  return { ok: false, createdPod: false, recovered: true, attention: true };
}

export async function runCleanup({ apiKey, fetchFn = globalThis.fetch, log = console.log, env = process.env }) {
  const podId = readPersistedPodId(env);
  if (podId) {
    return deletePersistedPod({ apiKey, podId, fetchFn, log });
  }
  const intent = readLaunchIntent(env);
  if (!intent.createAttempted) {
    log('Cleanup: no create attempt was recorded. Nothing to delete.');
    return { ok: true, skipped: true };
  }
  if (!intent.podName) {
    printAttention(log, {});
    log('A create attempt was recorded but the intended Pod name is missing.');
    return { ok: false, skipped: false };
  }
  const recovered = await recoverPodByExactName({ apiKey, exactName: intent.podName, fetchFn });
  if (recovered.kind === 'one') {
    persistPodId(recovered.podId, env);
    return deletePersistedPod({ apiKey, podId: recovered.podId, fetchFn, log });
  }
  if (recovered.kind === 'zero') {
    log(recovered.reason);
    return { ok: true, skipped: true, confirmedZero: true };
  }
  printAttention(log, { podName: intent.podName, matches: recovered.matches });
  if (recovered.reason) log(recovered.reason);
  return { ok: false, skipped: false, attention: true };
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

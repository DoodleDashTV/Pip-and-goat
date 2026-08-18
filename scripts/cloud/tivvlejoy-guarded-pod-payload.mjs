/**
 * TivvleJoy guarded future Pod-create payload.
 *
 * Combines the existing guarded RunPod launch configuration, an immutable
 * STAGED job package, the least-privilege worker environment, and a fresh
 * render_plan receipt into one deterministic request body.
 *
 * BUILD AND VALIDATE THE PAYLOAD ONLY. Do not send it.
 * This module never invokes the guarded create helper, never fetch()es RunPod,
 * and never mutates real R2.
 *
 * CURRENT STATUS: GUARDED POD LAUNCH PAYLOAD FOUNDATION
 * NOT YET ENABLED: paid GPU execution, real Pod creation, remote Blender
 * execution, automatic production rendering.
 *
 * Flow:
 *   TivvleJoy job → worker manifest → immutable staged package
 *   → least-privilege worker env → guarded Pod payload → STOP
 */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
  POD_NAME_PREFIX,
  REQUIRED_APPROVAL_PHRASE,
  buildCreatePodPayload,
  formatUsdFromMicros,
  parseUsdToMicros,
  projectedComputeMicros,
  templateIdIsConfigured,
} from './tivvlejoy-guarded-render.mjs';
import {
  LAUNCHER_ONLY_ENV,
  PACKAGE_STATE_NOT_READY,
  PACKAGE_STATE_STAGED,
  WORKER_SECRET_ENV_KEYS,
  buildTivvleJoyRemoteJobPackage,
  buildWorkerEnvironment,
  createInMemoryR2Adapter,
  createSampleWorkspace,
  defaultPilotJob,
  hashCanonical,
  redactWorkerSecrets,
  runPreflight,
  sanitizeWorkerEnvForLog,
  simulatePublishJobPackage,
} from './tivvlejoy-remote-blender-foundation.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const POD_PAYLOAD_STATUS = 'GUARDED POD LAUNCH PAYLOAD FOUNDATION';
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const AUTOMATIC_PRODUCTION_RENDERING_ENABLED = false;
export const MAX_WORKER_ENV_KEYS = 50;
export const RENDER_PLAN_RECEIPT_MAX_AGE_MS = 5 * 60 * 1000;
export const RENDER_PLAN_RECEIPT_FRESHNESS_NOTE =
  'A real launch must run render_plan immediately before create. The receipt is supporting evidence, not a replacement for immediate preflight.';

export const IDENTITY_LAYERS = Object.freeze({
  renderIdentity: 'jobPackageSha256 + workerManifestSha256 lock immutable render content. Credential rotation must not change them.',
  launchIdentity: 'launchIntentSha256 binds non-secret launch configuration (template identity, Pod name, GPU pins, caps, hashes). It excludes raw credentials.',
  credentials: 'Scoped R2 secrets exist only in the private worker env. They are never hashed into render or launch identity and never logged.',
});

export const ALLOWED_POD_PAYLOAD_KEYS = Object.freeze([
  'name',
  'cloudType',
  'computeType',
  'gpuTypeIds',
  'gpuTypePriority',
  'gpuCount',
  'interruptible',
  'locked',
  'templateId',
  'ports',
  'env',
]);

export const FORBIDDEN_WORKER_ENV_KEYS = Object.freeze([
  'RUNPOD_API_KEY',
  'RUNPOD_API_ENDPOINT',
  'RUNPOD_RENDER_TEMPLATE_ID',
  'LAUNCH_TIVVLEJOY_GPU',
  'PAID_APPROVAL_PHRASE',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'VERCEL_TOKEN',
  'VERCEL_OIDC_TOKEN',
  'confirm_paid_gpu',
  'RUNPOD_POD_ID',
]);

const LAUNCHER_ONLY_SET = new Set(LAUNCHER_ONLY_ENV);
const SECRET_ENV_SET = new Set(WORKER_SECRET_ENV_KEYS);
const FORBIDDEN_ENV_SET = new Set(FORBIDDEN_WORKER_ENV_KEYS);
const UNSAFE_TEXT = /[;|&$`<>\\\n\r\0]|\$\(|\.\.|file:\/\//i;

function fail(reason, code) {
  return {
    ok: false,
    reason,
    code,
    privateExecutionPayload: null,
    sanitizedPayloadSummary: null,
    launchIntentSha256: null,
    contactedPaidEndpoint: false,
    postPodsCalled: false,
    deletePodsCalled: false,
    podCreated: false,
    gpuLaunched: false,
    blenderExecuted: false,
    realR2: false,
    rawSecretPayloadLogged: false,
  };
}

function hourlyUsdFromMicros(micros) {
  const formatted = formatUsdFromMicros(micros);
  return formatted ? formatted.slice(1) : null;
}

export function isPaidPodMutation(url, method) {
  const target = String(url || '');
  const verb = String(method || 'GET').toUpperCase();
  const podsRest = /rest\.runpod\.io\/v1\/pods(?:\/|$|\?)/i.test(target) || /\/v1\/pods(?:\/|$|\?)/i.test(target);
  return podsRest && (verb === 'POST' || verb === 'DELETE');
}

export function createPaidMutationTripwire(recorder = { attempts: [] }) {
  return async function tripwireFetch(url, opts = {}) {
    const method = opts.method || 'GET';
    recorder.attempts.push({ url: String(url || ''), method: String(method).toUpperCase() });
    if (isPaidPodMutation(url, method)) {
      const err = new Error('Paid Pod mutation attempted during payload construction or dry-run.');
      err.code = 'PAID_MUTATION_TRIPWIRE';
      throw err;
    }
    throw new Error('Network is disabled during guarded Pod payload construction.');
  };
}

export function assertNoPaidPodMutation(recorder = { attempts: [] }) {
  const paid = (recorder.attempts || []).filter((attempt) => isPaidPodMutation(attempt.url, attempt.method));
  if (paid.length > 0) {
    const err = new Error('Paid Pod mutation tripwire fired.');
    err.code = 'PAID_MUTATION_TRIPWIRE';
    throw err;
  }
  return true;
}

function packageFromInput(stagedJobPackage) {
  if (!stagedJobPackage || typeof stagedJobPackage !== 'object') return null;
  if (stagedJobPackage.jobPackage && typeof stagedJobPackage.jobPackage === 'object') {
    return {
      wrapper: stagedJobPackage,
      pkg: stagedJobPackage.jobPackage,
      state: stagedJobPackage.state || stagedJobPackage.jobPackage.state,
      code: stagedJobPackage.code,
      partial: stagedJobPackage.partial === true,
    };
  }
  return {
    wrapper: stagedJobPackage,
    pkg: stagedJobPackage,
    state: stagedJobPackage.state,
    code: stagedJobPackage.code,
    partial: stagedJobPackage.partial === true,
  };
}

export function validateStagedJobPackage(stagedJobPackage) {
  const parsed = packageFromInput(stagedJobPackage);
  if (!parsed) return fail('A STAGED job package is required.', 'NOT_READY');
  if (parsed.partial) return fail('Partial staging cannot build a Pod payload.', 'NOT_READY');
  if (parsed.code === 'JOB_IDENTITY_CONFLICT' || parsed.wrapper?.code === 'JOB_IDENTITY_CONFLICT') {
    return fail('Job identity conflict refuses Pod payload generation.', 'JOB_IDENTITY_CONFLICT');
  }
  if (parsed.code === 'HASH_MISMATCH') {
    return fail('Hash mismatch refuses Pod payload generation.', 'HASH_MISMATCH');
  }
  if (parsed.state !== PACKAGE_STATE_STAGED) {
    return fail(
      `Job package state ${parsed.state || PACKAGE_STATE_NOT_READY} is not STAGED.`,
      parsed.code || 'NOT_READY',
    );
  }
  const pkg = parsed.pkg;
  const required = [
    ['jobId', pkg.jobId],
    ['jobPackageSha256', pkg.jobPackageSha256],
    ['workerManifestSha256', pkg.workerManifestSha256],
    ['manifestKey', pkg.manifestKey],
    ['outputKey', pkg.outputKey],
    ['blenderVersion', pkg.blenderVersion],
    ['runtimeLimit', pkg.runtimeLimit],
    ['costLimit', pkg.costLimit],
  ];
  const missing = required.filter(([, value]) => value === undefined || value === null || value === '').map(([name]) => name);
  if (missing.length > 0) {
    return fail(`Staged package is missing immutable identity: ${missing.join(', ')}.`, 'NOT_READY');
  }
  if (!/^[0-9a-f]{64}$/.test(String(pkg.jobPackageSha256)) || !/^[0-9a-f]{64}$/.test(String(pkg.workerManifestSha256))) {
    return fail('Staged package hashes are not valid SHA-256 digests.', 'HASH_MISMATCH');
  }
  if (pkg.manifestKey !== `jobs/${pkg.jobId}/manifest.json`) {
    return fail('Manifest key does not match the staged job identity.', 'JOB_IDENTITY_CONFLICT');
  }
  if (!pkg.workerManifest || pkg.workerManifest.jobId !== pkg.jobId) {
    return fail('Worker manifest identity does not match the staged job package.', 'JOB_IDENTITY_CONFLICT');
  }
  if (pkg.workerManifest.outputKey !== pkg.outputKey) {
    return fail('outputKey does not match the staged worker manifest.', 'JOB_IDENTITY_CONFLICT');
  }
  return { ok: true, jobPackage: pkg };
}

export function validateRenderPlanReceipt(receipt, { now = Date.now() } = {}) {
  if (!receipt || typeof receipt !== 'object') {
    return fail('A render-plan receipt is required.', 'RENDER_PLAN_INVALID');
  }
  const required = ['gpu', 'cloud', 'gpuCount', 'hourlyMicros', 'projectedMicros', 'maxRuntimeMinutes', 'checkedAt', 'verdict'];
  const missing = required.filter((key) => receipt[key] === undefined || receipt[key] === null || receipt[key] === '');
  if (missing.length > 0) {
    return fail(`Render-plan receipt is missing ${missing.join(', ')}.`, 'RENDER_PLAN_INVALID');
  }
  if (receipt.verdict !== 'PASS') {
    return fail('Render-plan receipt verdict must be PASS.', 'RENDER_PLAN_INVALID');
  }
  if (receipt.gpu !== PINNED_GPU_TYPE_ID) {
    return fail('Render-plan receipt GPU must be NVIDIA GeForce RTX 4090.', 'RENDER_PLAN_INVALID');
  }
  if (receipt.cloud !== PINNED_CLOUD_TYPE) {
    return fail('Render-plan receipt cloud must be SECURE.', 'RENDER_PLAN_INVALID');
  }
  if (receipt.gpuCount !== PINNED_GPU_COUNT) {
    return fail('Render-plan receipt GPU count must be 1.', 'RENDER_PLAN_INVALID');
  }
  if (!Number.isSafeInteger(receipt.hourlyMicros) || receipt.hourlyMicros < 0) {
    return fail('Render-plan receipt hourlyMicros is invalid.', 'RENDER_PLAN_INVALID');
  }
  if (!Number.isSafeInteger(receipt.projectedMicros) || receipt.projectedMicros < 0) {
    return fail('Render-plan receipt projectedMicros is invalid.', 'RENDER_PLAN_INVALID');
  }
  if (!Number.isSafeInteger(receipt.maxRuntimeMinutes) || receipt.maxRuntimeMinutes <= 0) {
    return fail('Render-plan receipt maxRuntimeMinutes is invalid.', 'RENDER_PLAN_INVALID');
  }
  const maxHourly = parseUsdToMicros(MAX_HOURLY_USD);
  const maxCompute = parseUsdToMicros(MAX_COMPUTE_USD);
  if (receipt.hourlyMicros > maxHourly) {
    return fail(`Hourly price exceeds the $${MAX_HOURLY_USD} cap.`, 'RENDER_PLAN_INVALID');
  }
  if (receipt.projectedMicros > maxCompute) {
    return fail(`Projected compute exceeds the $${MAX_COMPUTE_USD} cap.`, 'RENDER_PLAN_INVALID');
  }
  if (receipt.maxRuntimeMinutes > MAX_RUNTIME_MINUTES) {
    return fail(`Runtime cap exceeds ${MAX_RUNTIME_MINUTES} minutes.`, 'RENDER_PLAN_INVALID');
  }
  const expectedProjected = projectedComputeMicros(receipt.hourlyMicros, receipt.maxRuntimeMinutes);
  if (expectedProjected !== null && receipt.projectedMicros < expectedProjected) {
    return fail('Render-plan receipt projected cost is below the conservative projection.', 'RENDER_PLAN_INVALID');
  }
  const checkedAt = Date.parse(receipt.checkedAt);
  if (!Number.isFinite(checkedAt)) {
    return fail('Render-plan receipt checkedAt is invalid.', 'RENDER_PLAN_INVALID');
  }
  if (now - checkedAt > RENDER_PLAN_RECEIPT_MAX_AGE_MS) {
    return fail('Render-plan receipt is stale. A real launch must run render_plan immediately before create.', 'STALE_RENDER_PLAN');
  }
  if (checkedAt > now + 1000) {
    return fail('Render-plan receipt checkedAt is in the future.', 'RENDER_PLAN_INVALID');
  }
  return { ok: true, receipt };
}

export function buildRenderPlanReceipt(input = {}, { now = Date.now() } = {}) {
  const hourlyMicros = Number.isSafeInteger(input.hourlyMicros)
    ? input.hourlyMicros
    : parseUsdToMicros(input.hourlyUsd ?? MAX_HOURLY_USD);
  const maxRuntimeMinutes = input.maxRuntimeMinutes ?? MAX_RUNTIME_MINUTES;
  const projectedMicros = Number.isSafeInteger(input.projectedMicros)
    ? input.projectedMicros
    : projectedComputeMicros(hourlyMicros, maxRuntimeMinutes);
  return {
    gpu: input.gpu ?? PINNED_GPU_TYPE_ID,
    cloud: input.cloud ?? PINNED_CLOUD_TYPE,
    gpuCount: input.gpuCount ?? PINNED_GPU_COUNT,
    hourlyMicros,
    projectedMicros,
    maxRuntimeMinutes,
    checkedAt: input.checkedAt ?? new Date(now).toISOString(),
    verdict: input.verdict ?? 'PASS',
  };
}

export function hashLaunchIntent(identity) {
  return hashCanonical({
    jobPackageSha256: identity.jobPackageSha256,
    workerManifestSha256: identity.workerManifestSha256,
    jobId: identity.jobId,
    manifestKey: identity.manifestKey,
    outputKey: identity.outputKey,
    templateIdentity: identity.templateIdentity,
    intendedPodName: identity.intendedPodName,
    gpuType: identity.gpuType,
    cloudType: identity.cloudType,
    gpuCount: identity.gpuCount,
    interruptible: identity.interruptible,
    runtimeCap: identity.runtimeCap,
    costCap: identity.costCap,
    hourlyQuote: identity.hourlyQuote,
  });
}

function envLooksUnsafe(env) {
  for (const [key, value] of Object.entries(env || {})) {
    if (FORBIDDEN_ENV_SET.has(key) || LAUNCHER_ONLY_SET.has(key) || key === REQUIRED_APPROVAL_PHRASE) {
      return `Launcher-only key ${key} cannot enter payload.env.`;
    }
    const text = String(value);
    if (SECRET_ENV_SET.has(key)) continue;
    if (UNSAFE_TEXT.test(key) || UNSAFE_TEXT.test(text)) {
      return `Unsafe text in worker env ${key}.`;
    }
    if (text.includes(REQUIRED_APPROVAL_PHRASE)) {
      return 'Paid approval phrase cannot enter payload.env.';
    }
  }
  return null;
}

export function validatePrivatePodPayload(payload, { jobPackage } = {}) {
  if (!payload || typeof payload !== 'object') {
    return fail('Private execution payload is missing.', 'PAYLOAD_INVALID');
  }
  const extra = Object.keys(payload).filter((key) => !ALLOWED_POD_PAYLOAD_KEYS.includes(key));
  if (extra.length > 0) {
    return fail(`Unexpected Pod payload fields: ${extra.sort().join(', ')}.`, 'PAYLOAD_INVALID');
  }
  if (!String(payload.name || '').startsWith(POD_NAME_PREFIX)) {
    return fail('Pod name must start with tivvlejoy-render-.', 'PAYLOAD_INVALID');
  }
  if (payload.cloudType !== PINNED_CLOUD_TYPE) {
    return fail('cloudType must be SECURE.', 'PAYLOAD_INVALID');
  }
  if (payload.computeType !== 'GPU') {
    return fail('computeType must be GPU.', 'PAYLOAD_INVALID');
  }
  if (!Array.isArray(payload.gpuTypeIds) || payload.gpuTypeIds.length !== 1 || payload.gpuTypeIds[0] !== PINNED_GPU_TYPE_ID) {
    return fail('gpuTypeIds must be exactly [NVIDIA GeForce RTX 4090].', 'PAYLOAD_INVALID');
  }
  if (payload.gpuCount !== PINNED_GPU_COUNT) {
    return fail('gpuCount must be 1.', 'PAYLOAD_INVALID');
  }
  if (payload.interruptible !== false) {
    return fail('interruptible must be false.', 'PAYLOAD_INVALID');
  }
  if (!templateIdIsConfigured(payload.templateId)) {
    return fail('templateId is required on the Pod-create request.', 'TEMPLATE_REQUIRED');
  }
  if (!Array.isArray(payload.ports) || payload.ports.length !== 0) {
    return fail('ports must stay empty for the single-shot worker.', 'PAYLOAD_INVALID');
  }
  if (!payload.env || typeof payload.env !== 'object' || Array.isArray(payload.env)) {
    return fail('payload.env must be an object.', 'PAYLOAD_INVALID');
  }
  const envKeyCount = Object.keys(payload.env).length;
  if (envKeyCount > MAX_WORKER_ENV_KEYS) {
    return fail(`Worker env key count ${envKeyCount} exceeds the ${MAX_WORKER_ENV_KEYS} guard.`, 'ENV_COUNT_EXCEEDED');
  }
  if (payload.env.ALLOW_WORKER_SELF_TERMINATE !== 'false') {
    return fail('ALLOW_WORKER_SELF_TERMINATE must be false.', 'PAYLOAD_INVALID');
  }
  if (jobPackage) {
    if (payload.env.RENDER_JOB_ID !== jobPackage.jobId) {
      return fail('RENDER_JOB_ID does not match the staged job package.', 'JOB_IDENTITY_CONFLICT');
    }
    if (payload.env.RENDER_JOB_MANIFEST_KEY !== jobPackage.manifestKey) {
      return fail('RENDER_JOB_MANIFEST_KEY does not match the staged job package.', 'JOB_IDENTITY_CONFLICT');
    }
  }
  const unsafe = envLooksUnsafe(payload.env);
  if (unsafe) return fail(unsafe, 'LAUNCHER_ONLY_SECRET');
  if (payload.env.RUNPOD_RENDER_TEMPLATE_ID || payload.templateId && payload.env.RUNPOD_RENDER_TEMPLATE_ID) {
    return fail('Template ID must not enter payload.env.', 'LAUNCHER_ONLY_SECRET');
  }
  return { ok: true, envKeyCount };
}

export function sanitizePodPayloadForLog({
  payload,
  jobPackage,
  launchIntentSha256,
  hourlyQuote,
} = {}) {
  const env = payload?.env || {};
  const envNames = Object.keys(env).sort();
  return {
    podName: payload?.name || null,
    gpu: PINNED_GPU_TYPE_ID,
    cloud: PINNED_CLOUD_TYPE,
    gpuCount: PINNED_GPU_COUNT,
    interruptible: false,
    templateConfigured: templateIdIsConfigured(payload?.templateId),
    jobId: jobPackage?.jobId || env.RENDER_JOB_ID || null,
    manifestKey: jobPackage?.manifestKey || env.RENDER_JOB_MANIFEST_KEY || null,
    outputKey: jobPackage?.outputKey || null,
    jobPackageSha256: jobPackage?.jobPackageSha256 || null,
    workerManifestSha256: jobPackage?.workerManifestSha256 || null,
    blenderVersion: jobPackage?.blenderVersion || null,
    runtimeLimit: jobPackage?.runtimeLimit ?? null,
    costLimit: jobPackage?.costLimit ?? null,
    hourlyRate: hourlyQuote || null,
    envKeyNames: envNames,
    envKeyCount: envNames.length,
    envRedacted: sanitizeWorkerEnvForLog(env),
    launchIntentSha256,
    secretValues: '[REDACTED]',
  };
}

function resolveWorkerEnvironment({ workerEnvironment, jobPackage, renderPlanReceipt, storageConfig, storageCredentials, runtimeConfig }) {
  if (workerEnvironment?.ok && workerEnvironment.env) {
    if (workerEnvironment.env.RUNPOD_POD_ID) {
      return fail('RUNPOD_POD_ID must not be fabricated in a pre-launch payload.', 'LAUNCHER_ONLY_SECRET');
    }
    return workerEnvironment;
  }
  const hourlyUsd = hourlyUsdFromMicros(renderPlanReceipt.hourlyMicros);
  return buildWorkerEnvironment({
    jobPackage,
    storageConfig,
    storageCredentials,
    runtimeConfig,
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: hourlyUsd,
      RENDER_WORKER_ID: `tivvlejoy-worker-${jobPackage.jobId}`,
    },
  });
}

export function buildGuardedWorkerPodPayload(input = {}) {
  const recorder = input.mutationRecorder || { attempts: [] };
  const fetchFn = input.fetchFn || createPaidMutationTripwire(recorder);
  try {
    if (typeof fetchFn === 'function' && input.invokeNetwork === true) {
      fetchFn(REST_PODS_URL, { method: 'POST' });
    }
    if (!templateIdIsConfigured(input.templateId)) {
      return fail('RUNPOD_RENDER_TEMPLATE_ID is required to build a launchable payload.', 'TEMPLATE_REQUIRED');
    }
    const staged = validateStagedJobPackage(input.stagedJobPackage);
    if (!staged.ok) return staged;
    const receipt = validateRenderPlanReceipt(input.renderPlanReceipt, { now: input.now });
    if (!receipt.ok) return receipt;

    const workerEnv = resolveWorkerEnvironment({
      workerEnvironment: input.workerEnvironment,
      jobPackage: staged.jobPackage,
      renderPlanReceipt: receipt.receipt,
      storageConfig: input.storageConfig,
      storageCredentials: input.storageCredentials,
      runtimeConfig: input.runtimeConfig,
    });
    if (!workerEnv.ok) return { ...fail(workerEnv.reason, workerEnv.code || 'WORKER_ENV_INCOMPLETE') };

    const envKeyCount = Object.keys(workerEnv.env).length;
    if (envKeyCount > MAX_WORKER_ENV_KEYS) {
      return fail(`Worker env key count ${envKeyCount} exceeds the ${MAX_WORKER_ENV_KEYS} guard.`, 'ENV_COUNT_EXCEEDED');
    }

    let base;
    try {
      base = buildCreatePodPayload({ templateId: input.templateId, runId: input.runId });
    } catch (error) {
      const message = String(error && error.message);
      if (/TEMPLATE|template/i.test(message)) return fail(message, 'TEMPLATE_REQUIRED');
      return fail(message, 'PAYLOAD_INVALID');
    }

    const privateExecutionPayload = { ...base, env: { ...workerEnv.env } };
    const validated = validatePrivatePodPayload(privateExecutionPayload, { jobPackage: staged.jobPackage });
    if (!validated.ok) return validated;

    const hourlyQuote = hourlyUsdFromMicros(receipt.receipt.hourlyMicros);
    const launchIntentSha256 = hashLaunchIntent({
      jobPackageSha256: staged.jobPackage.jobPackageSha256,
      workerManifestSha256: staged.jobPackage.workerManifestSha256,
      jobId: staged.jobPackage.jobId,
      manifestKey: staged.jobPackage.manifestKey,
      outputKey: staged.jobPackage.outputKey,
      templateIdentity: createHash('sha256').update(String(input.templateId)).digest('hex'),
      intendedPodName: privateExecutionPayload.name,
      gpuType: PINNED_GPU_TYPE_ID,
      cloudType: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      interruptible: false,
      runtimeCap: staged.jobPackage.runtimeLimit,
      costCap: staged.jobPackage.costLimit,
      hourlyQuote,
    });

    assertNoPaidPodMutation(recorder);

    const sanitizedPayloadSummary = sanitizePodPayloadForLog({
      payload: privateExecutionPayload,
      jobPackage: staged.jobPackage,
      launchIntentSha256,
      hourlyQuote,
    });

    return {
      ok: true,
      privateExecutionPayload,
      sanitizedPayloadSummary,
      launchIntentSha256,
      envKeyCount: validated.envKeyCount,
      jobPackage: staged.jobPackage,
      renderPlanReceipt: receipt.receipt,
      freshnessNote: RENDER_PLAN_RECEIPT_FRESHNESS_NOTE,
      identityLayers: IDENTITY_LAYERS,
      contactedPaidEndpoint: false,
      postPodsCalled: false,
      deletePodsCalled: false,
      podCreated: false,
      gpuLaunched: false,
      blenderExecuted: false,
      realR2: false,
      rawSecretPayloadLogged: false,
    };
  } catch (error) {
    if (error && error.code === 'PAID_MUTATION_TRIPWIRE') {
      return fail(error.message, 'PAID_MUTATION_TRIPWIRE');
    }
    return fail(error && error.message ? error.message : 'Payload construction failed closed.', 'PAYLOAD_INVALID');
  }
}

function fakeTestStorage() {
  return {
    storageConfig: {
      R2_BUCKET: 'tivvlejoy-test-bucket',
      R2_ENDPOINT: 'https://example.invalid',
      R2_REGION: 'auto',
    },
    storageCredentials: {
      R2_ACCESS_KEY_ID: 'FAKE_TEST_ACCESS',
      R2_SECRET_ACCESS_KEY: 'FAKE_TEST_STORAGE_SECRET',
    },
  };
}

export function runPodPayloadDryRun({
  workspaceRoot,
  log = console.log,
  now = Date.now(),
  templateId = 'tpl-dry-run-test',
  runId = '20260818001',
  fetchFn,
  mutationRecorder,
} = {}) {
  const recorder = mutationRecorder || { attempts: [] };
  const tripwire = fetchFn || createPaidMutationTripwire(recorder);
  const roots = createSampleWorkspace(workspaceRoot);
  const job = defaultPilotJob({
    scene_sha256: roots.sceneSha256,
    pip_sha256: roots.pipSha256,
    assets: [
      {
        id: 'pip',
        role: 'pip',
        kind: 'blend',
        reference: 'pip.blend',
        r2Key: 'characters/pip/v1/pip.blend',
        sha256: roots.pipSha256,
      },
    ],
  });
  const preflight = runPreflight(job, { roots });
  if (!preflight.ok) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log(preflight.reason);
    return { ok: false, preflight, contactedPaidEndpoint: false };
  }
  const packaged = buildTivvleJoyRemoteJobPackage(job);
  if (!packaged.ok) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log(packaged.reason);
    return { ok: false, packaged, contactedPaidEndpoint: false };
  }
  const adapter = createInMemoryR2Adapter();
  const localSources = Object.fromEntries(
    packaged.jobPackage.expectedAssets.map((asset) => {
      const local = preflight.assets.find((item) => item.role === asset.role);
      return [asset.r2Key, { body: local?.localPath ? asset.sha256 : asset.sha256, sha256: asset.sha256 }];
    }),
  );
  const staged = simulatePublishJobPackage(packaged, { adapter, localSources });
  if (!staged.ok) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log(staged.reason);
    return { ok: false, staged, contactedPaidEndpoint: false };
  }
  const receipt = buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now });
  const storage = fakeTestStorage();
  const workerEnv = buildWorkerEnvironment({
    jobPackage: staged.jobPackage,
    ...storage,
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: '0.74',
      RENDER_WORKER_ID: `tivvlejoy-worker-${staged.jobPackage.jobId}`,
    },
  });
  if (!workerEnv.ok) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log(workerEnv.reason);
    return { ok: false, workerEnv, contactedPaidEndpoint: false };
  }

  const built = buildGuardedWorkerPodPayload({
    templateId,
    runId,
    stagedJobPackage: staged,
    workerEnvironment: workerEnv,
    renderPlanReceipt: receipt,
    now,
    fetchFn: tripwire,
    mutationRecorder: recorder,
  });
  if (!built.ok) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log(redactWorkerSecrets(built.reason));
    return { ...built, staged, workerEnv };
  }

  assertNoPaidPodMutation(recorder);
  const summary = built.sanitizedPayloadSummary;
  const dumped = [
    'POD PAYLOAD DRY RUN: PASS',
    `Status: ${POD_PAYLOAD_STATUS}`,
    `Pod name: ${summary.podName}`,
    `GPU: ${summary.gpu}`,
    `Cloud: ${summary.cloud}`,
    `GPU count: ${summary.gpuCount}`,
    `Interruptible: ${summary.interruptible}`,
    `Template configured: ${summary.templateConfigured}`,
    `Job ID: ${summary.jobId}`,
    `Manifest key: ${summary.manifestKey}`,
    `outputKey: ${summary.outputKey}`,
    `jobPackageSha256: ${summary.jobPackageSha256}`,
    `workerManifestSha256: ${summary.workerManifestSha256}`,
    `Blender version: ${summary.blenderVersion}`,
    `Runtime limit: ${summary.runtimeLimit}`,
    `Cost limit: ${summary.costLimit}`,
    `Hourly rate: ${summary.hourlyRate}`,
    `Env key count: ${summary.envKeyCount}`,
    `Env key names: ${summary.envKeyNames.join(',')}`,
    `launchIntentSha256: ${summary.launchIntentSha256}`,
    'Pod request sent: false',
    'GPU launched: false',
    'Pod created: false',
    'POST /v1/pods called: false',
    'DELETE /v1/pods called: false',
    'Paid mutation contacted: false',
    'Real R2 mutated: false',
    'Blender executed: false',
    'Raw secret payload logged: false',
    'Paid GPU execution is not enabled.',
    'Real Pod creation is not enabled.',
    'Remote Blender execution is not enabled.',
  ];
  const joined = dumped.join('\n');
  if (/FAKE_TEST_STORAGE_SECRET|FAKE_TEST_ACCESS|rpa_|LAUNCH_TIVVLEJOY_GPU/.test(joined)) {
    log('POD PAYLOAD DRY RUN: REFUSE');
    log('Sanitized dry-run output leaked a secret value.');
    return fail('Sanitized dry-run output leaked a secret value.', 'SECRET_LEAK');
  }
  for (const line of dumped) log(line);

  return {
    ok: true,
    job,
    packaged,
    staged,
    workerEnv,
    privateExecutionPayload: built.privateExecutionPayload,
    sanitizedPayloadSummary: summary,
    launchIntentSha256: built.launchIntentSha256,
    renderPlanReceipt: receipt,
    mutationAttempts: recorder.attempts,
    contactedPaidEndpoint: false,
    postPodsCalled: false,
    deletePodsCalled: false,
    podCreated: false,
    gpuLaunched: false,
    blenderExecuted: false,
    realR2: false,
    rawSecretPayloadLogged: false,
  };
}

async function cli(command) {
  if (command === 'pod-payload-dry-run') {
    const root = path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'pod-payload-dry-run');
    mkdirSync(root, { recursive: true });
    const result = runPodPayloadDryRun({ workspaceRoot: root });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  console.log('Unknown command. Use pod-payload-dry-run.');
  process.exitCode = 1;
}

const invokedDirectly = Boolean(process.argv[1] && process.argv[1].endsWith('tivvlejoy-guarded-pod-payload.mjs'));
if (invokedDirectly && process.env.VITEST !== 'true') {
  await cli(process.argv[2] ?? '');
}

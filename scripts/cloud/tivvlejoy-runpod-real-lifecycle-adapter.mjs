/**
 * TivvleJoy real RunPod lifecycle adapter.
 *
 * Wires the PR #61 single-Pod lifecycle controller to the existing guarded
 * create/delete/recovery/render-plan primitives. Same adapter interface as
 * createSimulatedRunPodAdapter(). One lifecycle controller remains the source
 * of truth.
 *
 * THIS MODULE DOES NOT LAUNCH A POD BY DEFAULT.
 * Default mode is REAL_BUT_BLOCKED. Paid smoke-test authorization is prepared
 * but not enabled. Never print secrets.
 */

import { spawnSync } from 'node:child_process';
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
  REST_PODS_URL,
  createGuardedPod,
  deleteGuardedPod,
  extractPodId,
  isConfirmPaidGpu,
  parseUsdToMicros,
  projectedComputeMicros,
  recoverPodByExactName,
  runRenderPlan,
} from './tivvlejoy-guarded-render.mjs';
import {
  createInMemoryR2Adapter,
  redactWorkerSecrets,
  sanitizeWorkerEnvForLog,
} from './tivvlejoy-remote-blender-foundation.mjs';
import { validateRenderPlanReceipt } from './tivvlejoy-guarded-pod-payload.mjs';
import {
  APPROVED_TEMPLATE_BINDING,
  APPROVED_TEMPLATE_ID,
  assertNoLaunchMutation,
  createLaunchDryRunTripwire,
  runBoundLaunchDryRun,
} from './tivvlejoy-runpod-template-binding.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  CLEANUP_ATTENTION_CODE,
  LIFECYCLE_STATUS,
  PAID_GPU_ENABLED as LIFECYCLE_PAID_GPU_ENABLED,
  POD_CREATION_ENABLED as LIFECYCLE_POD_CREATION_ENABLED,
  REMOTE_BLENDER_EXECUTION_ENABLED as LIFECYCLE_REMOTE_BLENDER_ENABLED,
  createSimulatedRunPodAdapter,
  runPodLifecycle,
} from './tivvlejoy-runpod-lifecycle.mjs';
import {
  REQUIRED_IMAGE_NAME,
  redactSecrets,
} from './tivvlejoy-runpod-template-readiness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const REAL_ADAPTER_STATUS = 'REAL_ADAPTER_READY';
export const REQUIRED_PAID_SMOKE_MODE = 'paid-smoke-test';
export const REQUIRED_PAID_APPROVAL_PHRASE = REQUIRED_APPROVAL_PHRASE;
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const REAL_NETWORK_MUTATION_ENABLED = false;
export const ADAPTER_MODES = Object.freeze(['SIMULATED', 'REAL_BUT_BLOCKED', 'REAL_AUTHORIZED']);

function fail(reason, code, extras = {}) {
  return {
    ok: false,
    code,
    reason,
    podId: extras.podId ?? null,
    paidExecutionEnabled: false,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    secretExposed: false,
    ...extras,
  };
}

export function adapterContractMethods() {
  return ['createPod', 'deletePod', 'createCount', 'deleteCount'];
}

export function adaptersShareLifecycleContract(left, right) {
  return adapterContractMethods().every((name) => typeof left?.[name] === 'function' && typeof right?.[name] === 'function');
}

export function countRecordedPodMutations(operations = []) {
  const http = operations.filter((item) => item.op === 'HTTP');
  const urlIsPods = (url) => /\/v1\/pods(?:\/|$|\?)/i.test(String(url || ''));
  return {
    postPods: http.filter((item) => item.method === 'POST' && urlIsPods(item.url)).length,
    deletePods: http.filter((item) => item.method === 'DELETE' && urlIsPods(item.url)).length,
    patchPods: http.filter((item) => item.method === 'PATCH' && urlIsPods(item.url)).length,
    getPods: http.filter((item) => item.method === 'GET' && urlIsPods(item.url)).length,
    templateMutations: http.filter((item) => /\/v1\/templates/i.test(String(item.url || '')) && ['POST', 'PATCH', 'DELETE'].includes(item.method)).length,
  };
}

export function runIdFromPodPayload(payload) {
  const explicit = payload?.runId;
  if (explicit && /^[0-9]+$/.test(String(explicit))) return String(explicit);
  const name = typeof payload?.name === 'string' ? payload.name : '';
  if (name.startsWith(POD_NAME_PREFIX)) {
    const suffix = name.slice(POD_NAME_PREFIX.length);
    if (/^[0-9]+$/.test(suffix)) return suffix;
  }
  return null;
}

function wrapRecordingFetch(fetchFn, operations) {
  return async function recordedFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    operations.push({
      op: 'HTTP',
      method,
      url: String(url || ''),
      realNetwork: false,
    });
    return fetchFn(url, opts);
  };
}

export function evaluatePaidSmokeGate(input = {}) {
  const paidGpuEnabled = input.paidGpuEnabled ?? PAID_GPU_ENABLED;
  const podCreationEnabled = input.podCreationEnabled ?? POD_CREATION_ENABLED;
  const remoteBlenderEnabled = input.remoteBlenderExecutionEnabled ?? REMOTE_BLENDER_EXECUTION_ENABLED;
  const realNetworkEnabled = input.realNetworkMutationEnabled ?? REAL_NETWORK_MUTATION_ENABLED;
  const mode = input.mode ?? input.env?.TIVVLEJOY_LIFECYCLE_MODE ?? input.env?.MODE;
  const confirmPaidGpu = input.confirmPaidGpu ?? input.env?.CONFIRM_PAID_GPU;
  const paidApprovalPhrase = input.paidApprovalPhrase ?? input.env?.PAID_APPROVAL_PHRASE;
  const templateId = input.templateId ?? input.env?.RUNPOD_RENDER_TEMPLATE_ID;
  const imageName = input.imageName ?? REQUIRED_IMAGE_NAME;
  const launchIntentSha256 = input.launchIntentSha256 ?? input.expectedLaunchIntentSha256;
  const now = input.now;

  if (LIFECYCLE_PAID_GPU_ENABLED !== false || LIFECYCLE_POD_CREATION_ENABLED !== false || LIFECYCLE_REMOTE_BLENDER_ENABLED !== false) {
    return fail('Lifecycle paid-execution constants were loosened.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (paidGpuEnabled !== true || podCreationEnabled !== true) {
    return fail('Paid execution is not authorized.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (remoteBlenderEnabled === true) {
    return fail('Remote Blender execution is not authorized from the launcher.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (realNetworkEnabled === true && input.allowRealNetwork !== true) {
    return fail('Real network mutation is disabled in this adapter PR.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (mode !== REQUIRED_PAID_SMOKE_MODE) {
    return fail('Paid smoke-test mode is required.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (!isConfirmPaidGpu(confirmPaidGpu)) {
    return fail('CONFIRM_PAID_GPU must be true for paid smoke-test authorization.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (paidApprovalPhrase !== REQUIRED_PAID_APPROVAL_PHRASE) {
    return fail('Paid approval phrase does not match the required phrase.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (templateId !== APPROVED_TEMPLATE_ID) {
    return fail(`Template ID is not the approved template ${APPROVED_TEMPLATE_ID}.`, 'TEMPLATE_ID_MISMATCH');
  }
  if (imageName !== REQUIRED_IMAGE_NAME) {
    return fail('Immutable worker image does not match the approved digest.', 'IMAGE_MISMATCH');
  }
  if (APPROVED_TEMPLATE_BINDING.templateId !== APPROVED_TEMPLATE_ID) {
    return fail('Approved binding is not TEMPLATE_BOUND.', 'TEMPLATE_ID_MISMATCH');
  }

  const receipt = validateRenderPlanReceipt(input.renderPlanReceipt, { now });
  if (!receipt.ok) return fail(receipt.reason, receipt.code || 'RENDER_PLAN_INVALID');
  const hourlyCap = parseUsdToMicros(MAX_HOURLY_USD);
  const computeCap = parseUsdToMicros(MAX_COMPUTE_USD);
  if (!Number.isSafeInteger(input.renderPlanReceipt.hourlyMicros)) {
    return fail('Price cannot be verified.', 'PRICE_UNVERIFIED');
  }
  if (input.renderPlanReceipt.hourlyMicros > hourlyCap) {
    return fail('Hourly price exceeds the $0.75 cap.', 'PRICE_ABOVE_CAP');
  }
  if (input.renderPlanReceipt.projectedMicros > computeCap) {
    return fail('Projected compute exceeds the $0.25 cap.', 'PROJECTED_COST_ABOVE_CAP');
  }
  if (input.renderPlanReceipt.maxRuntimeMinutes > MAX_RUNTIME_MINUTES) {
    return fail('Runtime would exceed 20 minutes.', 'RUNTIME_ABOVE_CAP');
  }
  const projected = projectedComputeMicros(input.renderPlanReceipt.hourlyMicros, input.renderPlanReceipt.maxRuntimeMinutes);
  if (projected != null && projected > computeCap) {
    return fail('Projected compute exceeds the $0.25 cap.', 'PROJECTED_COST_ABOVE_CAP');
  }
  if (input.renderPlanReceipt.gpu !== PINNED_GPU_TYPE_ID || input.renderPlanReceipt.cloud !== PINNED_CLOUD_TYPE) {
    return fail('Render plan must be Secure RTX 4090.', 'RENDER_PLAN_INVALID');
  }
  if (input.renderPlanReceipt.gpuCount !== PINNED_GPU_COUNT) {
    return fail('GPU count must be 1.', 'RENDER_PLAN_INVALID');
  }
  if ((input.lifecycleReady ?? LIFECYCLE_STATUS) !== LIFECYCLE_STATUS) {
    return fail('Lifecycle controller is not ready.', 'LIFECYCLE_NOT_READY');
  }
  const expectedIntent = input.expectedLaunchIntentSha256 ?? APPROVED_LAUNCH_INTENT_SHA256;
  if (launchIntentSha256 !== APPROVED_LAUNCH_INTENT_SHA256 || expectedIntent !== APPROVED_LAUNCH_INTENT_SHA256) {
    return fail('launchIntentSha256 does not match the approved launch intent.', 'LAUNCH_INTENT_MISMATCH');
  }
  return {
    ok: true,
    code: 'PAID_SMOKE_AUTHORIZED',
    mode: 'REAL_AUTHORIZED',
    reason: null,
    paidExecutionEnabled: false,
  };
}

export function createRealReadOnlyR2Observer({ inner, authorized = false } = {}) {
  const memory = inner || createInMemoryR2Adapter();
  const operations = [];
  return {
    kind: authorized ? 'REAL_AUTHORIZED' : 'REAL_BUT_BLOCKED',
    realR2: false,
    operations,
    get(key) {
      operations.push({ op: 'GET', key, real: false });
      return memory.get(key);
    },
    head(key) {
      operations.push({ op: 'HEAD', key, real: false });
      return memory.head(key);
    },
    put() {
      operations.push({ op: 'PUT_BLOCKED', real: false });
      return { ok: false, code: 'R2_MUTATION_FORBIDDEN' };
    },
    delete() {
      operations.push({ op: 'DELETE_BLOCKED', real: false });
      return { ok: false, code: 'R2_MUTATION_FORBIDDEN' };
    },
  };
}

export function createRealRunPodLifecycleAdapter({
  apiKey,
  fetchFn,
  env = {},
  authorization = {},
  allowRealNetwork = false,
} = {}) {
  const operations = [];
  let created = false;
  let deleted = false;
  let assignedId = null;
  const usesRealNetworkFetch = !fetchFn || fetchFn === globalThis.fetch;
  const gateInput = {
    ...authorization,
    env,
    paidGpuEnabled: authorization.paidGpuEnabled ?? PAID_GPU_ENABLED,
    podCreationEnabled: authorization.podCreationEnabled ?? POD_CREATION_ENABLED,
    remoteBlenderExecutionEnabled: authorization.remoteBlenderExecutionEnabled ?? REMOTE_BLENDER_EXECUTION_ENABLED,
    realNetworkMutationEnabled: authorization.realNetworkMutationEnabled ?? REAL_NETWORK_MUTATION_ENABLED,
    allowRealNetwork,
  };
  const gate = evaluatePaidSmokeGate(gateInput);
  const authorized = gate.ok === true && usesRealNetworkFetch === false && allowRealNetwork !== true;
  const mode = authorized ? 'REAL_AUTHORIZED' : 'REAL_BUT_BLOCKED';
  const recordedFetch = fetchFn && !usesRealNetworkFetch ? wrapRecordingFetch(fetchFn, operations) : null;

  const adapter = {
    kind: 'real',
    mode,
    realNetwork: false,
    lastPodId: null,
    operations,
    authorizationCode: authorized ? gate.code : gate.code || 'PAID_EXECUTION_NOT_AUTHORIZED',
    authorizationReason: authorized ? null : gate.reason,
    createCount() {
      return operations.filter((item) => item.op === 'CREATE').length;
    },
    deleteCount() {
      return operations.filter((item) => item.op === 'DELETE').length;
    },
    recordedMutations() {
      return countRecordedPodMutations(operations);
    },
    async createPod(payload) {
      const liveGate = evaluatePaidSmokeGate(gateInput);
      if (!liveGate.ok) {
        operations.push({
          op: 'CREATE_BLOCKED',
          url: REST_PODS_URL,
          code: liveGate.code,
          realNetwork: false,
        });
        return {
          ok: false,
          code: liveGate.code,
          reason: liveGate.reason,
          parsed: null,
          podId: null,
        };
      }
      if (payload?.templateId && payload.templateId !== APPROVED_TEMPLATE_ID) {
        operations.push({ op: 'CREATE_BLOCKED', url: REST_PODS_URL, code: 'TEMPLATE_ID_MISMATCH', realNetwork: false });
        return {
          ok: false,
          code: 'TEMPLATE_ID_MISMATCH',
          reason: `Template ID is not the approved template ${APPROVED_TEMPLATE_ID}.`,
          parsed: null,
          podId: null,
        };
      }
      if (mode !== 'REAL_AUTHORIZED' || !recordedFetch) {
        operations.push({
          op: 'CREATE_BLOCKED',
          url: REST_PODS_URL,
          code: 'PAID_EXECUTION_NOT_AUTHORIZED',
          realNetwork: false,
        });
        return {
          ok: false,
          code: 'PAID_EXECUTION_NOT_AUTHORIZED',
          reason: adapter.authorizationReason || 'Paid execution is not authorized.',
          parsed: null,
          podId: null,
        };
      }
      if (created) {
        operations.push({ op: 'CREATE_DUPLICATE_REFUSED', url: REST_PODS_URL, realNetwork: false });
        return { ok: false, code: 'DUPLICATE_CREATE', parsed: null, podId: assignedId };
      }
      const envKeys = payload?.env && typeof payload.env === 'object' ? payload.env : {};
      if ('RUNPOD_API_KEY' in envKeys || 'RUNPOD_RENDER_TEMPLATE_ID' in envKeys) {
        return {
          ok: false,
          code: 'LAUNCHER_ONLY_SECRET',
          reason: 'Launcher secrets must stay out of payload.env.',
          parsed: null,
          podId: null,
        };
      }

      const templateId = payload?.templateId;
      const runId = runIdFromPodPayload(payload);
      created = true;

      if (authorization.freshRenderPlan !== false) {
        const planned = await runRenderPlan({
          apiKey,
          fetchFn: recordedFetch,
          log: () => {},
        });
        operations.push({ op: 'RENDER_PLAN', ok: planned.ok === true, realNetwork: false });
        if (!planned.ok) {
          created = false;
          return {
            ok: false,
            code: 'RENDER_PLAN_REFUSED',
            reason: 'Fresh render-plan PASS is required before create.',
            parsed: null,
            podId: null,
          };
        }
      }

      let createdPod;
      try {
        createdPod = await createGuardedPod({
          apiKey,
          templateId,
          runId,
          fetchFn: recordedFetch,
          env,
        });
      } catch (error) {
        operations.push({ op: 'CREATE', url: REST_PODS_URL, ok: false, realNetwork: false });
        return {
          ok: false,
          code: 'CREATE_FAILED',
          reason: redactWorkerSecrets(error && error.message ? error.message : 'Pod create failed closed.'),
          parsed: null,
          podId: null,
          recover: true,
        };
      }

      operations.push({
        op: 'CREATE',
        url: REST_PODS_URL,
        ok: createdPod.ok === true,
        recover: createdPod.recover === true,
        realNetwork: false,
        templateId: templateId || null,
      });

      if (createdPod.ok && extractPodId({ id: createdPod.podId })) {
        assignedId = createdPod.podId;
        adapter.lastPodId = assignedId;
        return {
          ok: true,
          code: 'CREATED',
          status: 201,
          parsed: { id: assignedId },
          podId: assignedId,
        };
      }

      if (createdPod.recover) {
        const exactName = createdPod.podName || payload?.name || null;
        const recovered = await recoverPodByExactName({
          apiKey,
          exactName,
          fetchFn: recordedFetch,
        });
        operations.push({
          op: 'RECOVER',
          kind: recovered.kind,
          exactName,
          matchCount: Array.isArray(recovered.matches) ? recovered.matches.length : 0,
          realNetwork: false,
        });
        if (recovered.kind === 'one' && extractPodId({ id: recovered.podId })) {
          assignedId = recovered.podId;
          adapter.lastPodId = assignedId;
          return {
            ok: false,
            code: 'AMBIGUOUS_CREATE',
            reason: createdPod.reason || 'Create response was ambiguous. Exactly one Pod was recovered.',
            parsed: { id: assignedId },
            podId: assignedId,
            recover: true,
            recovered: 'one',
            cleanupRequired: true,
          };
        }
        if (recovered.kind === 'zero') {
          return {
            ok: false,
            code: 'CREATE_FAILED',
            reason: recovered.reason || 'Recovery confirmed zero Pods.',
            parsed: null,
            podId: null,
            recover: true,
            recovered: 'zero',
            confirmedZero: true,
          };
        }
        return {
          ok: false,
          code: CLEANUP_ATTENTION_CODE,
          reason: recovered.reason || 'Multiple exact-name Pod matches. Do not guess.',
          parsed: null,
          podId: null,
          recover: true,
          recovered: 'attention',
          matches: recovered.matches || [],
        };
      }

      return {
        ok: false,
        code: 'CREATE_FAILED',
        reason: createdPod.reason || 'Pod create failed.',
        parsed: null,
        podId: null,
      };
    },
    async deletePod(id) {
      if (deleted) {
        operations.push({ op: 'DELETE_DUPLICATE_REFUSED', url: `${REST_PODS_URL}/${id}`, realNetwork: false });
        return { ok: false, code: 'DUPLICATE_DELETE' };
      }
      if (mode !== 'REAL_AUTHORIZED' || !recordedFetch) {
        operations.push({
          op: 'DELETE_BLOCKED',
          url: `${REST_PODS_URL}/${id}`,
          code: 'PAID_EXECUTION_NOT_AUTHORIZED',
          realNetwork: false,
        });
        return { ok: false, code: 'PAID_EXECUTION_NOT_AUTHORIZED', reason: 'Paid execution is not authorized.' };
      }
      if (!extractPodId({ id })) {
        return { ok: false, code: CLEANUP_ATTENTION_CODE, reason: 'Cleanup Pod ID is invalid. No ID was fabricated.' };
      }
      operations.push({ op: 'DELETE', url: `${REST_PODS_URL}/${id}`, realNetwork: false });
      deleted = true;
      let deletedPod;
      try {
        deletedPod = await deleteGuardedPod({ apiKey, podId: id, fetchFn: recordedFetch });
      } catch (error) {
        return {
          ok: false,
          code: CLEANUP_ATTENTION_CODE,
          reason: redactWorkerSecrets(error && error.message ? error.message : 'Pod delete failed closed.'),
        };
      }
      if (!deletedPod.ok) {
        return { ok: false, code: CLEANUP_ATTENTION_CODE, reason: deletedPod.reason || 'Pod delete was not confirmed.' };
      }
      return { ok: true, alreadyGone: deletedPod.alreadyGone === true };
    },
  };
  return adapter;
}

export function completePaidSmokeAuthorization(overrides = {}) {
  const now = overrides.now ?? Date.parse('2026-08-18T19:00:00.000Z');
  return {
    mode: REQUIRED_PAID_SMOKE_MODE,
    confirmPaidGpu: true,
    paidApprovalPhrase: REQUIRED_PAID_APPROVAL_PHRASE,
    templateId: APPROVED_TEMPLATE_ID,
    imageName: REQUIRED_IMAGE_NAME,
    launchIntentSha256: APPROVED_LAUNCH_INTENT_SHA256,
    expectedLaunchIntentSha256: APPROVED_LAUNCH_INTENT_SHA256,
    paidGpuEnabled: true,
    podCreationEnabled: true,
    remoteBlenderExecutionEnabled: false,
    realNetworkMutationEnabled: false,
    lifecycleReady: LIFECYCLE_STATUS,
    now,
    renderPlanReceipt: overrides.renderPlanReceipt ?? {
      gpu: PINNED_GPU_TYPE_ID,
      cloud: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      hourlyMicros: parseUsdToMicros('0.74'),
      projectedMicros: projectedComputeMicros(parseUsdToMicros('0.74'), MAX_RUNTIME_MINUTES),
      maxRuntimeMinutes: MAX_RUNTIME_MINUTES,
      checkedAt: new Date(now).toISOString(),
      verdict: 'PASS',
    },
    ...overrides,
    now,
  };
}

export async function runRealLifecyclePreflight(options = {}) {
  const say = (line) => (options.log || (() => {}))(redactSecrets(line));
  const recorder = options.mutationRecorder || { attempts: [] };
  const tripwire = options.fetchFn || createLaunchDryRunTripwire(recorder);
  const root =
    options.workspaceRoot || path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'real-lifecycle-preflight');
  mkdirSync(root, { recursive: true });

  const launch = await runBoundLaunchDryRun({
    ...options,
    workspaceRoot: root,
    mutationRecorder: recorder,
    fetchFn: tripwire,
    log: () => {},
    verifyImage: options.verifyImage,
    verifyPreflight: options.verifyPreflight,
    liveTemplateAudit: false,
    env: { ...(options.env || process.env), RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    now: options.now ?? Date.parse('2026-08-18T19:00:00.000Z'),
    runId: options.runId ?? '20260818001',
  });
  if (!launch.ok) {
    say('REAL_LIFECYCLE_PREFLIGHT: FAIL');
    return fail(launch.reason || 'Bound launch dry-run failed.', launch.code || 'PRECHECK_FAILED');
  }

  const adapter = createRealRunPodLifecycleAdapter({
    apiKey: 'unused-blocked-adapter',
    fetchFn: tripwire,
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
  });
  const blocked = await adapter.createPod(launch.privateExecutionPayload);
  const observer = createRealReadOnlyR2Observer();
  const simulated = createSimulatedRunPodAdapter();
  assertNoLaunchMutation(recorder);

  if (blocked.code !== 'PAID_EXECUTION_NOT_AUTHORIZED') {
    say('REAL_LIFECYCLE_PREFLIGHT: FAIL');
    return fail('Real adapter did not refuse unpaid create.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (adapter.mode !== 'REAL_BUT_BLOCKED' || adapter.createCount() !== 0 || adapter.deleteCount() !== 0) {
    say('REAL_LIFECYCLE_PREFLIGHT: FAIL');
    return fail('Real adapter must stay REAL_BUT_BLOCKED with zero mutations.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }
  if (!adaptersShareLifecycleContract(adapter, simulated)) {
    say('REAL_LIFECYCLE_PREFLIGHT: FAIL');
    return fail('Real adapter does not match the simulated lifecycle contract.', 'ADAPTER_CONTRACT_MISMATCH');
  }
  if (observer.realR2 === true) {
    return fail('Real R2 observer must stay fake in this PR.', 'R2_MUTATION_FORBIDDEN');
  }

  say('WORKER_IMAGE_READY');
  say('TEMPLATE_READY');
  say('TEMPLATE_BOUND');
  say('POD_PAYLOAD_READY');
  say('LAUNCH_INTENT_READY');
  say('LIFECYCLE_READY');
  say('REAL_ADAPTER_READY');
  say('PAID_EXECUTION_ENABLED=false');
  say('REAL_POST_PODS=0');
  say('REAL_DELETE_PODS=0');
  say('GPU_LAUNCHED=false');
  say('PAID_COMPUTE=false');
  say('REAL_LIFECYCLE_PREFLIGHT_PASS');

  return {
    ok: true,
    code: 'REAL_LIFECYCLE_PREFLIGHT_PASS',
    reason: null,
    workerImage: 'WORKER_IMAGE_READY',
    templateReady: 'TEMPLATE_READY',
    templateBound: 'TEMPLATE_BOUND',
    podPayload: 'POD_PAYLOAD_READY',
    launchIntent: 'LAUNCH_INTENT_READY',
    lifecycleReady: LIFECYCLE_STATUS,
    realAdapter: REAL_ADAPTER_STATUS,
    paidExecutionEnabled: false,
    paidGpuEnabled: PAID_GPU_ENABLED,
    podCreationEnabled: POD_CREATION_ENABLED,
    remoteBlenderExecutionEnabled: REMOTE_BLENDER_EXECUTION_ENABLED,
    adapterMode: adapter.mode,
    launchIntentSha256: launch.launchIntentSha256,
    approvedTemplateId: APPROVED_TEMPLATE_ID,
    approvedImage: REQUIRED_IMAGE_NAME,
    envKeyNames: Object.keys(launch.privateExecutionPayload.env).sort(),
    envRedacted: sanitizeWorkerEnvForLog(launch.privateExecutionPayload.env),
    realPostPods: 0,
    realDeletePods: 0,
    realGetCount: 0,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    realR2Reads: 0,
    realR2Writes: 0,
    realR2Deletes: 0,
    secretExposed: false,
    contractMatch: true,
  };
}

export { runPodLifecycle, createSimulatedRunPodAdapter };

function runNamedPnpmScript(script) {
  const result = spawnSync('pnpm', [script], { cwd: REPO_ROOT, encoding: 'utf8', env: process.env });
  return { ok: result.status === 0, output: redactSecrets(`${result.stdout || ''}\n${result.stderr || ''}`) };
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'real-lifecycle-preflight') {
    console.log('usage: node scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs real-lifecycle-preflight');
    return 2;
  }
  const result = await runRealLifecyclePreflight({
    log: (line) => console.log(line),
    verifyImage: async () => runNamedPnpmScript('cloud:verify-image'),
    verifyPreflight: async () => runNamedPnpmScript('cloud:preflight-offline'),
  });
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

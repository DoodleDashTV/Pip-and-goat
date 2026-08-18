/**
 * TivvleJoy single-Pod lifecycle controller.
 *
 * DRY-RUN / SIMULATION ONLY. Never POSTs or DELETEs a real Pod.
 * Never mutates Production R2. Never prints secrets.
 *
 * Observes the existing single-shot worker contract:
 *   jobs/{jobId}/startup-status.json
 *   jobs/{jobId}/status.json
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
  REST_PODS_URL,
  extractPodId,
  parseUsdToMicros,
  projectedComputeMicros,
} from './tivvlejoy-guarded-render.mjs';
import {
  createInMemoryR2Adapter,
  hashCanonical,
  redactWorkerSecrets,
  sanitizeWorkerEnvForLog,
} from './tivvlejoy-remote-blender-foundation.mjs';
import { validateRenderPlanReceipt } from './tivvlejoy-guarded-pod-payload.mjs';
import {
  APPROVED_TEMPLATE_ID,
  APPROVED_TEMPLATE_BINDING,
  assertNoLaunchMutation,
  buildBoundGuardedPodPayload,
  countLaunchMutations,
  createLaunchDryRunTripwire,
  resolveApprovedTemplateBinding,
  runBoundLaunchDryRun,
  verifyPinnedWorkerImageContract,
} from './tivvlejoy-runpod-template-binding.mjs';
import {
  REQUIRED_IMAGE_NAME,
  redactSecrets,
} from './tivvlejoy-runpod-template-readiness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const APPROVED_LAUNCH_INTENT_SHA256 =
  '71b73dd63e9432c68f2ea24a9232936f628cfd5cf5f1492ec6da1cddff1d29fc';

export const LIFECYCLE_STATES = Object.freeze([
  'PRECHECK',
  'LAUNCH_AUTHORIZED',
  'CREATE_REQUEST_READY',
  'POD_CREATED',
  'WAITING_FOR_WORKER',
  'WORKER_STARTED',
  'WORKER_READY',
  'RENDER_RUNNING',
  'RENDER_COMPLETE',
  'RENDER_FAILED',
  'TIMED_OUT',
  'CLEANUP_REQUIRED',
  'DELETE_REQUEST_READY',
  'POD_DELETED',
  'CLEANUP_VERIFIED',
]);

export const LIFECYCLE_STATUS = 'LIFECYCLE_READY';
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const CLEANUP_ATTENTION_CODE = 'RUNPOD_CLEANUP_REQUIRES_ATTENTION';

const PROGRESS_STATUSES = new Set([
  'PREPARING_ASSETS',
  'RENDERING',
  'ENCODING',
  'UPLOADING',
  'QC',
  'VERIFY_READBACK',
  'BOOTING',
]);

function fail(reason, code, extras = {}) {
  return {
    ok: false,
    code,
    reason,
    history: extras.history || [],
    podId: extras.podId ?? null,
    simulatedCreateCount: extras.simulatedCreateCount ?? 0,
    simulatedDeleteCount: extras.simulatedDeleteCount ?? 0,
    realPostPods: 0,
    realDeletePods: 0,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    secretExposed: false,
    ...extras,
  };
}

export function createClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
      return current;
    },
  };
}

export function createSimulatedRunPodAdapter({
  createMode = 'success',
  deleteMode = 'success',
  podId = 'simrc8eyeq1',
} = {}) {
  const operations = [];
  let created = false;
  let deleted = false;
  let assignedId = null;

  return {
    kind: 'simulated',
    realNetwork: false,
    lastPodId: null,
    operations,
    createCount() {
      return operations.filter((item) => item.op === 'CREATE').length;
    },
    deleteCount() {
      return operations.filter((item) => item.op === 'DELETE').length;
    },
    createPod(payload) {
      if (created) {
        operations.push({ op: 'CREATE_DUPLICATE_REFUSED', simulated: true, url: REST_PODS_URL });
        return { ok: false, code: 'DUPLICATE_CREATE', parsed: null, podId: assignedId };
      }
      operations.push({ op: 'CREATE', simulated: true, url: REST_PODS_URL, templateId: payload?.templateId || null });
      created = true;
      if (createMode === 'failure') {
        return { ok: false, code: 'CREATE_FAILED', status: 400, parsed: { error: 'simulated create failure' }, podId: null };
      }
      if (createMode === 'malformed') {
        return { ok: true, code: 'MALFORMED_CREATE', status: 201, parsed: { name: payload?.name || 'missing-id' }, podId: null };
      }
      assignedId = podId;
      this.lastPodId = assignedId;
      return { ok: true, code: 'CREATED', status: 201, parsed: { id: assignedId }, podId: assignedId };
    },
    deletePod(id) {
      if (deleted) {
        operations.push({ op: 'DELETE_DUPLICATE_REFUSED', simulated: true, url: `${REST_PODS_URL}/${id}` });
        return { ok: false, code: 'DUPLICATE_DELETE' };
      }
      operations.push({ op: 'DELETE', simulated: true, url: `${REST_PODS_URL}/${id}` });
      deleted = true;
      if (deleteMode === 'failure') {
        return { ok: false, code: CLEANUP_ATTENTION_CODE, reason: 'Simulated delete failed.' };
      }
      if (deleteMode === 'gone') {
        return { ok: true, alreadyGone: true };
      }
      return { ok: true, alreadyGone: false };
    },
  };
}

function putJson(adapter, key, value) {
  const body = JSON.stringify(value);
  adapter.put(key, body, hashCanonical(value));
}

export function sanitizeObservedStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    jobId: typeof raw.jobId === 'string' ? raw.jobId : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    stage: typeof raw.stage === 'string' ? raw.stage : null,
    bootStage: typeof raw.bootStage === 'string' ? raw.bootStage : null,
    kind: typeof raw.kind === 'string' ? raw.kind : raw.detail?.kind || null,
    result: typeof raw.result === 'string' ? raw.result : null,
    classification: typeof raw.classification === 'string' ? raw.classification : null,
    code: typeof raw.code === 'string' ? raw.code : null,
    artifactKey: typeof raw.artifactKey === 'string' ? raw.artifactKey : null,
    artifactSha256: typeof raw.artifactSha256 === 'string' ? raw.artifactSha256 : null,
  };
}

function readJsonObject(adapter, key) {
  const got = adapter.get(key);
  if (!got.ok) return { present: false, value: null, malformed: false };
  try {
    const text = Buffer.isBuffer(got.body) ? got.body.toString('utf8') : String(got.body);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: true, value: null, malformed: true };
    }
    return { present: true, value: parsed, malformed: false };
  } catch {
    return { present: true, value: null, malformed: true };
  }
}

export function interpretStartupStatus(raw) {
  if (raw == null) return { kind: 'ABSENT' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'MALFORMED' };
  const kind = raw.kind || raw.detail?.kind || raw.bootStage;
  if (raw.result === 'FAILED') {
    return { kind: 'FAILED', classification: raw.classification || raw.code || 'WORKER_FAILED' };
  }
  if (kind === 'WORKER_READY') return { kind: 'WORKER_READY' };
  if (kind === 'PROCESS_STARTED' || raw.result === 'RUNNING' || raw.classification === 'BOOTING') {
    return { kind: 'PROCESS_STARTED' };
  }
  return { kind: 'UNKNOWN' };
}

export function interpretRenderStatus(raw) {
  if (raw == null) return { kind: 'ABSENT' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'MALFORMED' };
  if (raw.status === 'COMPLETE') {
    if (!/^[0-9a-f]{64}$/.test(String(raw.artifactSha256 || '')) || !raw.artifactKey) {
      return { kind: 'MALFORMED', reason: 'COMPLETE missing artifact evidence.' };
    }
    return { kind: 'COMPLETE', artifactSha256: raw.artifactSha256, artifactKey: raw.artifactKey };
  }
  if (raw.status === 'FAILED') {
    return { kind: 'FAILED', classification: raw.classification || raw.code || 'RENDER_FAILED' };
  }
  if (PROGRESS_STATUSES.has(raw.status)) return { kind: 'PROGRESS', status: raw.status };
  return { kind: 'UNKNOWN' };
}

export function createScriptedWorkerProgress({ r2, jobPackage, mode = 'complete' }) {
  let step = 0;
  const jobId = jobPackage.jobId;
  const startupKey = jobPackage.startupStatusKey;
  const statusKey = jobPackage.statusKey;
  const evidenceSha = 'a'.repeat(64);
  return function tick() {
    if (mode === 'startup-timeout' || mode === 'none') {
      step += 1;
      return;
    }
    if (mode === 'malformed-startup' && step === 0) {
      r2.put(startupKey, 'not-json', hashCanonical('not-json'));
      step += 1;
      return;
    }
    if (mode === 'malformed-status') {
      if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
      if (step === 1) putJson(r2, startupKey, { jobId, kind: 'WORKER_READY', bootStage: 'WORKER_READY', result: 'RUNNING' });
      if (step === 2) r2.put(statusKey, '{', hashCanonical('{'));
      step += 1;
      return;
    }
    if (mode === 'complete-without-evidence') {
      if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
      if (step === 1) putJson(r2, startupKey, { jobId, kind: 'WORKER_READY', bootStage: 'WORKER_READY', result: 'RUNNING' });
      if (step === 2) putJson(r2, statusKey, { jobId, status: 'COMPLETE' });
      step += 1;
      return;
    }
    if (mode === 'ready-timeout') {
      if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
      step += 1;
      return;
    }
    if (mode === 'render-timeout') {
      if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
      if (step === 1) putJson(r2, startupKey, { jobId, kind: 'WORKER_READY', bootStage: 'WORKER_READY', result: 'RUNNING' });
      if (step === 2) putJson(r2, statusKey, { jobId, status: 'RENDERING', stage: 'RENDER' });
      step += 1;
      return;
    }
    if (mode === 'failed') {
      if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
      if (step === 1) putJson(r2, startupKey, { jobId, kind: 'WORKER_READY', bootStage: 'WORKER_READY', result: 'RUNNING' });
      if (step === 2) {
        putJson(r2, statusKey, { jobId, status: 'FAILED', classification: 'RENDER_FAILED', code: 'RENDER_FAILED' });
      }
      step += 1;
      return;
    }
    if (step === 0) putJson(r2, startupKey, { jobId, kind: 'PROCESS_STARTED', bootStage: 'PROCESS_STARTED', result: 'RUNNING' });
    if (step === 1) putJson(r2, startupKey, { jobId, kind: 'WORKER_READY', bootStage: 'WORKER_READY', result: 'RUNNING' });
    if (step === 2) putJson(r2, statusKey, { jobId, status: 'RENDERING', stage: 'RENDER' });
    if (step === 3) {
      putJson(r2, statusKey, {
        jobId,
        status: 'COMPLETE',
        artifactKey: jobPackage.outputKey,
        artifactSha256: evidenceSha,
      });
    }
    step += 1;
  };
}

function enter(history, state) {
  if (history[history.length - 1] !== state) history.push(state);
  return state;
}

function costGuards(receipt, now) {
  const validated = validateRenderPlanReceipt(receipt, { now });
  if (!validated.ok) return validated;
  const hourlyCap = parseUsdToMicros(MAX_HOURLY_USD);
  const computeCap = parseUsdToMicros(MAX_COMPUTE_USD);
  if (!Number.isSafeInteger(receipt.hourlyMicros)) return fail('Price cannot be verified.', 'PRICE_UNVERIFIED');
  if (receipt.hourlyMicros > hourlyCap) return fail('Hourly price exceeds the $0.75 cap.', 'PRICE_ABOVE_CAP');
  if (receipt.projectedMicros > computeCap) return fail('Projected compute exceeds the $0.25 cap.', 'PROJECTED_COST_ABOVE_CAP');
  if (receipt.maxRuntimeMinutes > MAX_RUNTIME_MINUTES) {
    return fail('Runtime would exceed 20 minutes.', 'RUNTIME_ABOVE_CAP');
  }
  const projected = projectedComputeMicros(receipt.hourlyMicros, receipt.maxRuntimeMinutes);
  if (projected != null && projected > computeCap) {
    return fail('Projected compute exceeds the $0.25 cap.', 'PROJECTED_COST_ABOVE_CAP');
  }
  return { ok: true, receipt };
}

async function cleanupPod({ adapter, podId, history, extra = {} }) {
  enter(history, 'CLEANUP_REQUIRED');
  if (!podId) {
    return fail('Cleanup required but no Pod ID exists.', CLEANUP_ATTENTION_CODE, {
      history,
      podId: null,
      ...extra,
    });
  }
  enter(history, 'DELETE_REQUEST_READY');
  const deleted = adapter.deletePod(podId);
  extra.simulatedCreateCount = adapter.createCount();
  extra.simulatedDeleteCount = adapter.deleteCount();
  if (!deleted.ok) {
    return fail(deleted.reason || 'Pod delete was not confirmed.', CLEANUP_ATTENTION_CODE, {
      history,
      podId,
      cleanupVerified: false,
      ...extra,
    });
  }
  enter(history, 'POD_DELETED');
  enter(history, 'CLEANUP_VERIFIED');
  return {
    ok: true,
    code: 'CLEANUP_VERIFIED',
    history,
    podId,
    cleanupVerified: true,
    ...extra,
  };
}

export async function runSimulatedPodLifecycle(input = {}) {
  const history = [];
  enter(history, 'PRECHECK');
  const recorder = input.mutationRecorder || { attempts: [] };
  const tripwire = input.fetchFn || createLaunchDryRunTripwire(recorder);
  const clock = input.clock || createClock();
  const r2 = input.r2 || createInMemoryR2Adapter();
  const adapter = input.runpod || createSimulatedRunPodAdapter();
  const startupTimeoutMs = input.startupTimeoutMs ?? 3;
  const readyTimeoutMs = input.readyTimeoutMs ?? 5;
  const renderTimeoutMs = input.renderTimeoutMs ?? MAX_RUNTIME_MINUTES * 60_000;

  try {
    if (input.invokeRealNetwork === true) {
      const attempted = tripwire(REST_PODS_URL, { method: input.invokeMethod || 'POST' });
      if (attempted && typeof attempted.then === 'function') attempted.catch(() => {});
      return fail('Real RunPod mutation attempted during lifecycle simulation.', 'RUNPOD_MUTATION_TRIPWIRE', { history });
    }

    const image = verifyPinnedWorkerImageContract();
    if (!image.ok) return fail(image.reason, image.code || 'IMAGE_MISMATCH', { history });
    if ((input.imageName || REQUIRED_IMAGE_NAME) !== REQUIRED_IMAGE_NAME) {
      return fail('Immutable worker image does not match the approved digest.', 'IMAGE_MISMATCH', { history });
    }

    const bound = resolveApprovedTemplateBinding(input);
    if (!bound.ok) return fail(bound.reason, bound.code, { history });

    const built = input.builtPayload?.ok
      ? input.builtPayload
      : buildBoundGuardedPodPayload({
          ...input,
          templateId: bound.templateId,
          fetchFn: tripwire,
          mutationRecorder: recorder,
        });
    if (!built.ok) return fail(built.reason, built.code, { history });

    const payload = built.privateExecutionPayload;
    if (payload.env.ALLOW_WORKER_SELF_TERMINATE !== 'false') {
      return fail('ALLOW_WORKER_SELF_TERMINATE must stay false.', 'PAYLOAD_INVALID', { history });
    }
    if ('RUNPOD_RENDER_TEMPLATE_ID' in payload.env || 'RUNPOD_API_KEY' in payload.env || 'RUNPOD_POD_ID' in payload.env) {
      return fail('Launcher secrets leaked into payload.env.', 'LAUNCHER_ONLY_SECRET', { history });
    }

    const receiptCheck = costGuards(input.renderPlanReceipt, input.now);
    if (!receiptCheck.ok) return fail(receiptCheck.reason, receiptCheck.code, { history });

    const expectedIntent = input.expectedLaunchIntentSha256 ?? APPROVED_LAUNCH_INTENT_SHA256;
    if (built.launchIntentSha256 !== expectedIntent) {
      return fail('launchIntentSha256 does not match the approved launch intent.', 'LAUNCH_INTENT_MISMATCH', { history });
    }

    const jobPackage = input.jobPackage || built.jobPackage;
    if (!jobPackage?.startupStatusKey || !jobPackage.statusKey) {
      return fail('Staged job package status keys are required.', 'NOT_READY', { history });
    }

    enter(history, 'LAUNCH_AUTHORIZED');
    enter(history, 'CREATE_REQUEST_READY');

    const created = adapter.createPod(payload);
    const extracted = extractPodId(created.parsed);
    if (!created.ok || created.code === 'CREATE_FAILED') {
      return fail('Simulated Pod create failed.', 'CREATE_FAILED', {
        history,
        podId: null,
        simulatedCreateCount: adapter.createCount(),
        simulatedDeleteCount: adapter.deleteCount(),
      });
    }
    if (!extracted) {
      return fail('Create response did not include a usable Pod ID. No ID was fabricated.', 'MALFORMED_CREATE', {
        history,
        podId: null,
        simulatedCreateCount: adapter.createCount(),
        simulatedDeleteCount: adapter.deleteCount(),
      });
    }

    const podId = extracted;
    enter(history, 'POD_CREATED');
    enter(history, 'WAITING_FOR_WORKER');
    if (typeof input.afterCreateHook === 'function') input.afterCreateHook({ podId, payload });

    const tick = input.tick || createScriptedWorkerProgress({ r2, jobPackage, mode: input.workerMode || 'complete' });
    const createdAt = clock.now();
    let started = false;
    let ready = false;
    let running = false;
    let terminal = null;

    for (let i = 0; i < (input.maxTicks || 12); i += 1) {
      tick({ now: clock.now(), podId });
      const startupRead = readJsonObject(r2, jobPackage.startupStatusKey);
      const statusRead = readJsonObject(r2, jobPackage.statusKey);
      if (startupRead.malformed || statusRead.malformed) {
        terminal = { kind: 'MALFORMED', reason: 'Malformed worker status was refused.' };
        break;
      }
      const startup = interpretStartupStatus(sanitizeObservedStatus(startupRead.value));
      const render = interpretRenderStatus(sanitizeObservedStatus(statusRead.value));
      if (startup.kind === 'MALFORMED' || render.kind === 'MALFORMED') {
        terminal = { kind: 'MALFORMED', reason: render.reason || 'Malformed worker status was refused.' };
        break;
      }
      if (startup.kind === 'PROCESS_STARTED' && !started) {
        started = true;
        enter(history, 'WORKER_STARTED');
      }
      if (startup.kind === 'WORKER_READY' && !ready) {
        started = true;
        ready = true;
        enter(history, 'WORKER_STARTED');
        enter(history, 'WORKER_READY');
      }
      if (render.kind === 'PROGRESS' && !running) {
        running = true;
        enter(history, 'RENDER_RUNNING');
      }
      if (render.kind === 'COMPLETE') {
        enter(history, 'RENDER_COMPLETE');
        terminal = { kind: 'COMPLETE', ...render };
        break;
      }
      if (render.kind === 'FAILED' || startup.kind === 'FAILED') {
        enter(history, 'RENDER_FAILED');
        terminal = { kind: 'FAILED', classification: render.classification || startup.classification };
        break;
      }

      const elapsed = clock.now() - createdAt;
      if (!started && elapsed >= startupTimeoutMs) {
        enter(history, 'TIMED_OUT');
        terminal = { kind: 'TIMEOUT', phase: 'startup' };
        break;
      }
      if (started && !ready && elapsed >= readyTimeoutMs) {
        enter(history, 'TIMED_OUT');
        terminal = { kind: 'TIMEOUT', phase: 'worker-ready' };
        break;
      }
      if (ready && elapsed >= renderTimeoutMs) {
        enter(history, 'TIMED_OUT');
        terminal = { kind: 'TIMEOUT', phase: 'render' };
        break;
      }
      clock.advance(input.tickMs || 1);
    }

    if (!terminal) {
      enter(history, 'TIMED_OUT');
      terminal = { kind: 'TIMEOUT', phase: 'observe' };
    }

    const cleaned = await cleanupPod({
      adapter,
      podId,
      history,
      extra: {
        simulatedCreateCount: adapter.createCount(),
        simulatedDeleteCount: adapter.deleteCount(),
        terminal,
        launchIntentSha256: built.launchIntentSha256,
        templateId: bound.templateId,
        envKeyNames: Object.keys(payload.env).sort(),
        envRedacted: sanitizeWorkerEnvForLog(payload.env),
      },
    });

    assertNoLaunchMutation(recorder);
    const real = countLaunchMutations(recorder);
    if (!cleaned.ok) {
      return {
        ...cleaned,
        realPostPods: real.postPodsCount,
        realDeletePods: real.deletePodsCount,
        gpuLaunched: false,
        paidCompute: false,
        blenderExecuted: false,
        realR2: r2.realR2 === true,
      };
    }

    const success = terminal.kind === 'COMPLETE';
    return {
      ok: success,
      code: success ? 'LIFECYCLE_PASS' : terminal.kind === 'TIMEOUT' ? 'TIMED_OUT' : terminal.kind === 'FAILED' ? 'RENDER_FAILED' : 'WORKER_STATUS_MALFORMED',
      reason: success ? null : terminal.reason || terminal.classification || terminal.phase || terminal.kind,
      history: cleaned.history,
      podId,
      templateId: bound.templateId,
      imageName: REQUIRED_IMAGE_NAME,
      launchIntentSha256: built.launchIntentSha256,
      simulatedCreateCount: adapter.createCount(),
      simulatedDeleteCount: adapter.deleteCount(),
      realPostPods: real.postPodsCount,
      realDeletePods: real.deletePodsCount,
      realGetCount: real.getCount,
      templateMutationCount: real.templatePostCount + real.templatePatchCount + real.templateDeleteCount,
      gpuLaunched: false,
      paidCompute: false,
      blenderExecuted: false,
      realR2: r2.realR2 === true,
      realR2Writes: 0,
      realR2Deletes: 0,
      cleanupVerified: cleaned.cleanupVerified === true,
      terminal,
      envKeyNames: Object.keys(payload.env).sort(),
      secretExposed: false,
      rawSecretPayloadLogged: false,
    };
  } catch (error) {
    if (error && error.code === 'RUNPOD_MUTATION_TRIPWIRE') {
      return fail(error.message, 'RUNPOD_MUTATION_TRIPWIRE', { history });
    }
    const knownId = adapter.lastPodId;
    const createdOp = adapter.createCount() > 0;
    if (createdOp && knownId && extractPodId({ id: knownId })) {
      const cleaned = await cleanupPod({
        adapter,
        podId: knownId,
        history,
        extra: { simulatedCreateCount: adapter.createCount(), simulatedDeleteCount: adapter.deleteCount() },
      });
      return {
        ...cleaned,
        ok: false,
        code: cleaned.ok ? 'LAUNCHER_EXCEPTION' : cleaned.code,
        reason: redactWorkerSecrets(error && error.message ? error.message : 'Launcher exception after Pod creation.'),
        gpuLaunched: false,
        paidCompute: false,
      };
    }
    return fail(redactWorkerSecrets(error && error.message ? error.message : 'Lifecycle failed closed.'), 'LIFECYCLE_FAILED', {
      history,
    });
  }
}

export async function runLifecycleDryRun(options = {}) {
  const say = (line) => (options.log || (() => {}))(redactSecrets(line));
  const recorder = options.mutationRecorder || { attempts: [] };
  const root =
    options.workspaceRoot || path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'lifecycle-dry-run');
  mkdirSync(root, { recursive: true });

  const launch = await runBoundLaunchDryRun({
    ...options,
    workspaceRoot: root,
    mutationRecorder: recorder,
    log: () => {},
    verifyImage: options.verifyImage,
    verifyPreflight: options.verifyPreflight,
    liveTemplateAudit: false,
    env: { ...(options.env || process.env), RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    now: options.now ?? Date.parse('2026-08-18T19:00:00.000Z'),
    runId: options.runId ?? '20260818001',
  });
  if (!launch.ok) {
    say('LIFECYCLE_SIMULATION: FAIL');
    return fail(launch.reason || 'Bound launch dry-run failed.', launch.code || 'PRECHECK_FAILED');
  }
  say('WORKER_IMAGE_READY');
  say('TEMPLATE_READY');
  say('TEMPLATE_BOUND');
  say('POD_PAYLOAD_READY');
  say('LAUNCH_INTENT_READY');

  const r2 = options.r2 || createInMemoryR2Adapter();
  const result = await runSimulatedPodLifecycle({
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    templateId: APPROVED_TEMPLATE_ID,
    builtPayload: {
      ok: true,
      privateExecutionPayload: launch.privateExecutionPayload,
      launchIntentSha256: launch.launchIntentSha256,
      jobPackage: launch.privateExecutionPayload && {
        jobId: launch.sanitizedPayloadSummary.jobId,
        startupStatusKey: `jobs/${launch.sanitizedPayloadSummary.jobId}/startup-status.json`,
        statusKey: `jobs/${launch.sanitizedPayloadSummary.jobId}/status.json`,
        outputKey: launch.sanitizedPayloadSummary.outputKey,
      },
    },
    jobPackage: {
      jobId: launch.sanitizedPayloadSummary.jobId,
      startupStatusKey: `jobs/${launch.sanitizedPayloadSummary.jobId}/startup-status.json`,
      statusKey: `jobs/${launch.sanitizedPayloadSummary.jobId}/status.json`,
      outputKey: launch.sanitizedPayloadSummary.outputKey,
    },
    renderPlanReceipt: {
      gpu: PINNED_GPU_TYPE_ID,
      cloud: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      hourlyMicros: parseUsdToMicros('0.74'),
      projectedMicros: projectedComputeMicros(parseUsdToMicros('0.74'), MAX_RUNTIME_MINUTES),
      maxRuntimeMinutes: MAX_RUNTIME_MINUTES,
      checkedAt: new Date(options.now ?? Date.parse('2026-08-18T19:00:00.000Z')).toISOString(),
      verdict: 'PASS',
    },
    now: options.now ?? Date.parse('2026-08-18T19:00:00.000Z'),
    expectedLaunchIntentSha256: launch.launchIntentSha256,
    mutationRecorder: recorder,
    r2,
    runpod: options.runpod || createSimulatedRunPodAdapter(),
    workerMode: 'complete',
    clock: createClock(),
    startupTimeoutMs: 8,
    readyTimeoutMs: 8,
    renderTimeoutMs: 8,
  });

  if (!result.ok) {
    say('LIFECYCLE_SIMULATION: FAIL');
    return result;
  }

  say('LIFECYCLE_SIMULATION: PASS');
  say(`SIMULATED_POST_PODS=${result.simulatedCreateCount}`);
  say(`SIMULATED_DELETE_PODS=${result.simulatedDeleteCount}`);
  say(`REAL_POST_PODS=${result.realPostPods}`);
  say(`REAL_DELETE_PODS=${result.realDeletePods}`);
  say('GPU_LAUNCHED=false');
  say('PAID_COMPUTE=false');
  say('CLEANUP_VERIFIED');
  say('LIFECYCLE_PASS');

  return {
    ...result,
    workerImage: 'WORKER_IMAGE_READY',
    templateReady: 'TEMPLATE_READY',
    templateBound: 'TEMPLATE_BOUND',
    podPayload: 'POD_PAYLOAD_READY',
    launchIntent: 'LAUNCH_INTENT_READY',
    lifecycleReady: LIFECYCLE_STATUS,
    approvedTemplateId: APPROVED_TEMPLATE_ID,
    approvedImage: REQUIRED_IMAGE_NAME,
    approvedBinding: APPROVED_TEMPLATE_BINDING,
  };
}

function runNamedPnpmScript(script) {
  const result = spawnSync('pnpm', [script], { cwd: REPO_ROOT, encoding: 'utf8', env: process.env });
  return { ok: result.status === 0, output: redactSecrets(`${result.stdout || ''}\n${result.stderr || ''}`) };
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'lifecycle-dry-run') {
    console.log('usage: node scripts/cloud/tivvlejoy-runpod-lifecycle.mjs lifecycle-dry-run');
    return 2;
  }
  const result = await runLifecycleDryRun({
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

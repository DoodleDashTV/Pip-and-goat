/**
 * TivvleJoy approved RunPod template binding and launch dry-run.
 *
 * Binds the current TEMPLATE_READY worker template to the guarded Pod payload.
 * BUILD AND VALIDATE ONLY. Never POST /v1/pods. Never launches a GPU.
 * Never prints secrets, Authorization headers, or raw worker env values.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID,
  PAID_SMOKE_ATTEMPT_1_TEMPLATE_NAME,
  PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE,
  TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT,
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  TRUSTED_TEMPLATE_ID,
  hashSanitizedCreatePayload,
  receiptIsTrusted,
  receiptMatchesTemplate,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';
import {
  assessTemplateCompatibilityWithProvenance,
  auditNormalizedTemplateReadiness,
} from './tivvlejoy-runpod-template-normalization.mjs';
import {
  REQUIRED_IMAGE_DIGEST,
  REQUIRED_IMAGE_NAME,
  REST_PODS_URL,
  REST_TEMPLATES_URL,
  SUGGESTED_TEMPLATE_NAME,
  isAllowedTemplateRead,
  isForbiddenRunpodMutation,
  redactSecrets,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  FORBIDDEN_WORKER_ENV_KEYS,
  buildGuardedWorkerPodPayload,
  isPaidPodMutation,
  runPodPayloadDryRun,
} from './tivvlejoy-guarded-pod-payload.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const APPROVED_TEMPLATE_ID = TRUSTED_TEMPLATE_ID;
export const APPROVED_TEMPLATE_NAME = SUGGESTED_TEMPLATE_NAME;
export const APPROVED_TEMPLATE_PROVENANCE = 'TEMPLATE_READY';
export const BINDING_STATUS = 'TEMPLATE_BOUND';
export const DRY_RUN_ONLY = true;
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;

export const APPROVED_TEMPLATE_BINDING = Object.freeze({
  templateId: APPROVED_TEMPLATE_ID,
  templateName: APPROVED_TEMPLATE_NAME,
  imageName: REQUIRED_IMAGE_NAME,
  imageDigest: REQUIRED_IMAGE_DIGEST,
  sanitizedCreatePayloadHash: TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash,
  createHttpStatus: TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.createHttpStatus,
  provenance: APPROVED_TEMPLATE_PROVENANCE,
});

export const PAID_SMOKE_ATTEMPT_1_TEMPLATE_BINDING = Object.freeze({
  templateId: PAID_SMOKE_ATTEMPT_1_TEMPLATE_ID,
  templateName: PAID_SMOKE_ATTEMPT_1_TEMPLATE_NAME,
  imageName: PAID_SMOKE_ATTEMPT_1_WORKER_IMAGE,
  imageDigest: TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT.imageName.slice(
    TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT.imageName.indexOf('sha256:'),
  ),
  sanitizedCreatePayloadHash: TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash,
  createHttpStatus: TIVVLEJOY_HISTORICAL_ATTEMPT_1_TEMPLATE_CREATION_RECEIPT.createHttpStatus,
  provenance: 'HISTORICAL_PAID_SMOKE_ATTEMPT_1',
});

function fail(reason, code, extras = {}) {
  return {
    ok: false,
    code,
    reason,
    binding: null,
    templateId: null,
    privateExecutionPayload: null,
    sanitizedPayloadSummary: null,
    launchIntentSha256: null,
    getCount: 0,
    postPodsCount: 0,
    deletePodsCount: 0,
    templatePostCount: 0,
    templatePatchCount: 0,
    templateDeleteCount: 0,
    podCreated: false,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    rawSecretPayloadLogged: false,
    secretExposed: false,
    ...extras,
  };
}

export function approvedTemplateRepresentation(overrides = {}) {
  return {
    category: 'NVIDIA',
    containerDiskInGb: 50,
    id: APPROVED_TEMPLATE_ID,
    imageName: REQUIRED_IMAGE_NAME,
    name: APPROVED_TEMPLATE_NAME,
    startJupyter: true,
    startSsh: true,
    volumeMountPath: '/workspace',
    ...overrides,
  };
}

export function resolveControlPlaneTemplateId({ templateId, env = {} } = {}) {
  const explicit = typeof templateId === 'string' ? templateId.trim() : '';
  if (explicit) return explicit;
  const fromEnv = typeof env.RUNPOD_RENDER_TEMPLATE_ID === 'string' ? env.RUNPOD_RENDER_TEMPLATE_ID.trim() : '';
  return fromEnv;
}

export function verifyPinnedWorkerImageContract() {
  const bindingImage = APPROVED_TEMPLATE_BINDING.imageName;
  if (bindingImage !== REQUIRED_IMAGE_NAME) {
    return { ok: false, code: 'IMAGE_MISMATCH', reason: 'Approved binding image does not match the pinned digest.' };
  }
  if (!bindingImage.includes(REQUIRED_IMAGE_DIGEST.replace(/^sha256:/, ''))) {
    return { ok: false, code: 'IMAGE_MISMATCH', reason: 'Approved binding is missing the immutable digest.' };
  }
  if (/:(latest|production|stable)(?:@|$)/.test(bindingImage)) {
    return { ok: false, code: 'MUTABLE_IMAGE_TAG', reason: 'Approved binding must not use a mutable tag.' };
  }
  return { ok: true, code: 'WORKER_IMAGE_READY', imageName: bindingImage };
}

export function resolveApprovedTemplateBinding(input = {}) {
  const bindings = input.approvedBindings ?? [APPROVED_TEMPLATE_BINDING];
  if (!Array.isArray(bindings) || bindings.length === 0) {
    return fail('No approved template binding is configured.', 'TEMPLATE_ID_MISSING');
  }
  if (bindings.length !== 1) {
    return fail('Multiple approved template identities exist. Do not guess.', 'DUPLICATE_APPROVED_IDENTITY');
  }

  const templateId = resolveControlPlaneTemplateId(input);
  if (!templateId) {
    return fail('RUNPOD_RENDER_TEMPLATE_ID is missing.', 'TEMPLATE_ID_MISSING');
  }
  if (templateId !== APPROVED_TEMPLATE_ID) {
    return fail(`Template ID ${templateId} is not the approved template ${APPROVED_TEMPLATE_ID}.`, 'TEMPLATE_ID_MISMATCH');
  }

  const binding = bindings[0];
  if (!binding || binding.templateId !== APPROVED_TEMPLATE_ID || binding.templateName !== APPROVED_TEMPLATE_NAME) {
    return fail(`Approved binding identity does not match ${APPROVED_TEMPLATE_ID}.`, 'TEMPLATE_ID_MISMATCH');
  }

  const receipt = input.receipt ?? TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT;
  const expectedHash = hashSanitizedCreatePayload();
  if (
    !receipt ||
    receipt.sanitizedCreatePayloadHash !== expectedHash ||
    receipt.sanitizedCreatePayloadHash !== binding.sanitizedCreatePayloadHash
  ) {
    return fail('Creation receipt hash does not match the trusted sanitized payload.', 'RECEIPT_HASH_MISMATCH');
  }
  if (!receiptIsTrusted(receipt)) {
    return fail('Trusted creation receipt is missing or untrusted.', 'RECEIPT_UNTRUSTED');
  }
  if (receipt.templateId !== templateId || receipt.name !== APPROVED_TEMPLATE_NAME) {
    return fail('Creation receipt identity does not match the approved template.', 'RECEIPT_IDENTITY_MISMATCH');
  }

  const imageName = input.imageName ?? binding.imageName ?? REQUIRED_IMAGE_NAME;
  if (imageName !== REQUIRED_IMAGE_NAME || imageName !== receipt.imageName || imageName !== binding.imageName) {
    return fail('Immutable worker image does not match the approved digest.', 'IMAGE_MISMATCH');
  }

  const provenance = input.provenance === undefined ? binding.provenance : input.provenance;
  if (provenance !== APPROVED_TEMPLATE_PROVENANCE) {
    return fail('TEMPLATE_READY provenance is absent.', 'TEMPLATE_READY_PROVENANCE_MISSING');
  }

  const template = input.template ?? approvedTemplateRepresentation({ imageName });
  if (!receiptMatchesTemplate(template, receipt)) {
    return fail('Template representation does not match the trusted creation receipt.', 'RECEIPT_IDENTITY_MISMATCH');
  }

  const assessed = assessTemplateCompatibilityWithProvenance(template, { receipt });
  if (!assessed.compatible || !assessed.provenanceMatched) {
    return fail(
      `PR #59 semantic normalization did not prove TEMPLATE_READY (${(assessed.reasons || []).join(',')}).`,
      'TEMPLATE_NOT_READY',
      { assessed },
    );
  }

  return {
    ok: true,
    code: BINDING_STATUS,
    reason: null,
    binding: { ...binding },
    templateId,
    assessed,
    imageName,
    provenance: APPROVED_TEMPLATE_PROVENANCE,
    receiptHash: receipt.sanitizedCreatePayloadHash,
    secretExposed: false,
  };
}

export function isForbiddenLaunchMutation(url, method) {
  const verb = String(method || 'GET').toUpperCase();
  const target = String(url || '');
  if (isAllowedTemplateRead(url, method)) return false;
  if (isForbiddenRunpodMutation(url, method)) return true;
  if (isPaidPodMutation(url, method)) return true;
  if (/api\.runpod\.io\/graphql/i.test(target)) return true;
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(verb)) return true;
  return false;
}

export function createLaunchDryRunTripwire(recorder = { attempts: [] }) {
  return async function tripwireFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    recorder.attempts.push({ url: String(url || ''), method });
    if (!isAllowedTemplateRead(url, method) || isForbiddenLaunchMutation(url, method)) {
      const err = new Error('RunPod mutation or disallowed request attempted during launch dry-run.');
      err.code = 'RUNPOD_MUTATION_TRIPWIRE';
      throw err;
    }
    const err = new Error('Network is disabled by the launch dry-run tripwire.');
    err.code = 'NETWORK_DISABLED';
    throw err;
  };
}

export function wrapLaunchDryRunFetch(innerFetch, recorder = { attempts: [] }) {
  return async function guardedFetch(url, opts = {}) {
    const method = String(opts.method || 'GET').toUpperCase();
    recorder.attempts.push({ url: String(url || ''), method });
    if (!isAllowedTemplateRead(url, method) || isForbiddenLaunchMutation(url, method)) {
      const err = new Error('RunPod mutation or disallowed request attempted during launch dry-run.');
      err.code = 'RUNPOD_MUTATION_TRIPWIRE';
      throw err;
    }
    return innerFetch(url, opts);
  };
}

export function countLaunchMutations(recorder = { attempts: [] }) {
  const attempts = recorder.attempts || [];
  const methodOn = (method, matcher) =>
    attempts.filter((attempt) => attempt.method === method && matcher.test(String(attempt.url || ''))).length;
  return {
    getCount: attempts.filter((attempt) => attempt.method === 'GET').length,
    postPodsCount: methodOn('POST', /\/v1\/pods(?:\/|$|\?)/i),
    deletePodsCount: methodOn('DELETE', /\/v1\/pods(?:\/|$|\?)/i),
    patchPodsCount: methodOn('PATCH', /\/v1\/pods(?:\/|$|\?)/i),
    templatePostCount: methodOn('POST', /\/v1\/templates/i),
    templatePatchCount: methodOn('PATCH', /\/v1\/templates/i),
    templateDeleteCount: methodOn('DELETE', /\/v1\/templates/i),
  };
}

export function assertNoLaunchMutation(recorder = { attempts: [] }) {
  const bad = (recorder.attempts || []).filter((attempt) => isForbiddenLaunchMutation(attempt.url, attempt.method));
  const counts = countLaunchMutations(recorder);
  if (
    bad.length > 0 ||
    counts.postPodsCount !== 0 ||
    counts.deletePodsCount !== 0 ||
    counts.patchPodsCount !== 0 ||
    counts.templatePostCount !== 0 ||
    counts.templatePatchCount !== 0 ||
    counts.templateDeleteCount !== 0
  ) {
    const err = new Error('RunPod mutation tripwire fired.');
    err.code = 'RUNPOD_MUTATION_TRIPWIRE';
    throw err;
  }
  return counts;
}

function payloadLeaksControlPlane(payload) {
  const env = payload?.env || {};
  if ('RUNPOD_RENDER_TEMPLATE_ID' in env) return 'RUNPOD_RENDER_TEMPLATE_ID must not enter payload.env.';
  if ('RUNPOD_API_KEY' in env) return 'RUNPOD_API_KEY must not enter payload.env.';
  if ('RUNPOD_POD_ID' in env) return 'RUNPOD_POD_ID must not be fabricated before launch.';
  for (const key of FORBIDDEN_WORKER_ENV_KEYS) {
    if (key in env) return `${key} must not enter payload.env.`;
  }
  return null;
}

export function buildBoundGuardedPodPayload(input = {}) {
  const recorder = input.mutationRecorder || { attempts: [] };
  const fetchFn = input.fetchFn || createLaunchDryRunTripwire(recorder);
  const bound = resolveApprovedTemplateBinding(input);
  if (!bound.ok) {
    return fail(bound.reason, bound.code, { ...countLaunchMutations(recorder) });
  }

  const built = buildGuardedWorkerPodPayload({
    ...input,
    templateId: bound.templateId,
    fetchFn,
    mutationRecorder: recorder,
  });
  if (!built.ok) {
    return fail(built.reason, built.code, { ...countLaunchMutations(recorder) });
  }

  const leak = payloadLeaksControlPlane(built.privateExecutionPayload);
  if (leak) {
    return fail(leak, 'LAUNCHER_ONLY_SECRET', { ...countLaunchMutations(recorder) });
  }
  if (built.privateExecutionPayload.templateId !== APPROVED_TEMPLATE_ID) {
    return fail('Pod payload top-level templateId is not the approved template.', 'TEMPLATE_ID_MISMATCH');
  }

  const serialized = JSON.stringify(built.sanitizedPayloadSummary);
  if (/RUNPOD_API_KEY=|R2_SECRET_ACCESS_KEY=[^[]|Authorization: Bearer \S+/.test(serialized)) {
    return fail('Sanitized launch summary leaked a credential.', 'SECRET_LEAK');
  }

  try {
    assertNoLaunchMutation(recorder);
  } catch (error) {
    return fail(error.message, error.code || 'RUNPOD_MUTATION_TRIPWIRE');
  }

  return {
    ok: true,
    code: 'POD_PAYLOAD_READY',
    reason: null,
    binding: bound.binding,
    templateId: bound.templateId,
    provenance: APPROVED_TEMPLATE_PROVENANCE,
    privateExecutionPayload: built.privateExecutionPayload,
    sanitizedPayloadSummary: {
      ...built.sanitizedPayloadSummary,
      templateId: bound.templateId,
    },
    launchIntentSha256: built.launchIntentSha256,
    envKeyCount: built.envKeyCount,
    envKeyNames: built.sanitizedPayloadSummary.envKeyNames,
    assessed: bound.assessed,
    ...countLaunchMutations(recorder),
    podCreated: false,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    rawSecretPayloadLogged: false,
    secretExposed: false,
  };
}

function runNamedPnpmScript(script) {
  const result = spawnSync('pnpm', [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    ok: result.status === 0,
    output: redactSecrets(`${result.stdout || ''}\n${result.stderr || ''}`),
  };
}

export async function runBoundLaunchDryRun({
  env = process.env,
  log = () => {},
  workspaceRoot,
  now = Date.now(),
  runId = '20260818001',
  mutationRecorder = { attempts: [] },
  fetchFn,
  verifyImage,
  verifyPreflight,
  liveTemplateAudit = false,
  receipt = TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  template,
  provenance = APPROVED_TEMPLATE_PROVENANCE,
} = {}) {
  const say = (line) => log(redactSecrets(line));
  const recorder = mutationRecorder;
  const tripwire = fetchFn || createLaunchDryRunTripwire(recorder);

  const image = verifyPinnedWorkerImageContract();
  if (!image.ok) {
    say('WORKER_IMAGE: FAIL');
    return fail(image.reason, image.code, { ...countLaunchMutations(recorder) });
  }
  const imageCheck = verifyImage ? await verifyImage() : { ok: true, skipped: true };
  if (!imageCheck.ok) {
    say('WORKER_IMAGE: FAIL');
    return fail('Immutable worker image verification failed.', 'IMAGE_MISMATCH', { ...countLaunchMutations(recorder) });
  }
  say('WORKER_IMAGE_READY');

  const preflight = verifyPreflight ? await verifyPreflight() : { ok: true, skipped: true };
  if (!preflight.ok) {
    say('PREFLIGHT: FAIL');
    return fail('Offline cloud preflight failed.', 'PREFLIGHT_FAILED', { ...countLaunchMutations(recorder) });
  }

  const controlPlane = {
    ...env,
    RUNPOD_RENDER_TEMPLATE_ID: resolveControlPlaneTemplateId({ env }) || APPROVED_TEMPLATE_ID,
  };
  const bound = resolveApprovedTemplateBinding({
    env: controlPlane,
    receipt,
    template: template ?? approvedTemplateRepresentation(),
    provenance,
  });
  if (!bound.ok) {
    say('TEMPLATE_BINDING: FAIL');
    say(bound.reason);
    return fail(bound.reason, bound.code, { ...countLaunchMutations(recorder) });
  }
  say('TEMPLATE_BINDING: PASS');
  say(`templateId=${bound.templateId}`);
  say('TEMPLATE_READY');

  const root = workspaceRoot || path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'launch-dry-run');
  mkdirSync(root, { recursive: true });
  const payloadDry = runPodPayloadDryRun({
    workspaceRoot: root,
    log: () => {},
    now,
    templateId: bound.templateId,
    runId,
    fetchFn: tripwire,
    mutationRecorder: recorder,
  });
  if (!payloadDry.ok) {
    say('POD_PAYLOAD: FAIL');
    return fail(payloadDry.reason || 'Guarded Pod payload dry-run failed.', payloadDry.code || 'PAYLOAD_INVALID', {
      ...countLaunchMutations(recorder),
    });
  }

  const built = buildBoundGuardedPodPayload({
    env: controlPlane,
    templateId: bound.templateId,
    receipt,
    template: template ?? approvedTemplateRepresentation(),
    provenance,
    stagedJobPackage: payloadDry.staged,
    workerEnvironment: payloadDry.workerEnv,
    renderPlanReceipt: payloadDry.renderPlanReceipt,
    now,
    runId,
    fetchFn: tripwire,
    mutationRecorder: recorder,
  });
  if (!built.ok) {
    say('POD_PAYLOAD: FAIL');
    return built;
  }
  say('POD_PAYLOAD: PASS');
  say(`top-level templateId=${built.templateId}`);
  say(`worker env key count=${built.envKeyCount}`);
  say(`worker env key names=${built.envKeyNames.join(',')}`);
  say('LAUNCH_INTENT: PASS');
  say(`launchIntentSha256=${built.launchIntentSha256}`);
  say('DRY_RUN_ONLY');

  let live = null;
  if (liveTemplateAudit) {
    live = await auditNormalizedTemplateReadiness({
      env,
      fetchFn: wrapLaunchDryRunFetch(globalThis.fetch, recorder),
      mutationRecorder: recorder,
      log: () => {},
    });
    if (!live.ok || live.code !== 'TEMPLATE_READY' || live.compatibleCount !== 1) {
      say('TEMPLATE_READY: FAIL');
      return fail(live.reasons?.join(' ') || 'Live TEMPLATE_READY verification failed.', live.code || 'TEMPLATE_NOT_READY', {
        ...countLaunchMutations(recorder),
        live,
      });
    }
    say('TEMPLATE_READY');
  }

  const counts = assertNoLaunchMutation(recorder);
  say(`POST_PODS=${counts.postPodsCount}`);
  say(`GPU_LAUNCHED=${built.gpuLaunched}`);
  say(`PAID_COMPUTE=${built.paidCompute}`);
  say('DRY_RUN_PASS');

  const dumped = [
    `TEMPLATE_BINDING: PASS`,
    `templateId=${built.templateId}`,
    `TEMPLATE_READY`,
    `POD_PAYLOAD: PASS`,
    `LAUNCH_INTENT: PASS`,
    `DRY_RUN_ONLY`,
    `POST_PODS=${counts.postPodsCount}`,
    `GPU_LAUNCHED=false`,
    `PAID_COMPUTE=false`,
  ].join('\n');
  if (/FAKE_TEST_STORAGE_SECRET|rpa_|Bearer [A-Za-z0-9]|LAUNCH_TIVVLEJOY_GPU/.test(dumped)) {
    return fail('Sanitized dry-run output leaked a secret value.', 'SECRET_LEAK');
  }

  return {
    ok: true,
    code: 'DRY_RUN_PASS',
    workerImage: 'WORKER_IMAGE_READY',
    templateReady: 'TEMPLATE_READY',
    templateBound: BINDING_STATUS,
    podPayload: 'POD_PAYLOAD_READY',
    launchIntent: 'LAUNCH_INTENT_READY',
    templateId: built.templateId,
    launchIntentSha256: built.launchIntentSha256,
    envKeyCount: built.envKeyCount,
    envKeyNames: built.envKeyNames,
    privateExecutionPayload: built.privateExecutionPayload,
    sanitizedPayloadSummary: built.sanitizedPayloadSummary,
    binding: bound.binding,
    live,
    ...counts,
    podCreated: false,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    realR2: false,
    networkVolumeCreated: false,
    endpointCreated: false,
    rawSecretPayloadLogged: false,
    secretExposed: false,
  };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv[0] !== 'launch-dry-run') {
    console.log('usage: node scripts/cloud/tivvlejoy-runpod-template-binding.mjs launch-dry-run');
    return 2;
  }
  const result = await runBoundLaunchDryRun({
    env,
    log: (line) => console.log(line),
    verifyImage: async () => runNamedPnpmScript('cloud:verify-image'),
    verifyPreflight: async () => runNamedPnpmScript('cloud:preflight-offline'),
    liveTemplateAudit: false,
  });
  if (!result.ok) {
    console.log(redactSecrets(result.reason || result.code));
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

export { REST_PODS_URL, REST_TEMPLATES_URL };

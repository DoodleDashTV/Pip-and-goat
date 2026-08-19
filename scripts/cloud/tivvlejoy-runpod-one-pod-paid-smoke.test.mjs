import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
  REST_PODS_URL,
  createGuardedPod,
} from './tivvlejoy-guarded-render.mjs';
import {
  APPROVED_TEMPLATE_ID,
  createLaunchDryRunTripwire,
} from './tivvlejoy-runpod-template-binding.mjs';
import { REQUIRED_IMAGE_NAME } from './tivvlejoy-runpod-template-readiness.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  createSimulatedRunPodAdapter,
  runPodLifecycle,
} from './tivvlejoy-runpod-lifecycle.mjs';
import {
  REAL_NETWORK_MUTATION_ENABLED,
  completePaidSmokeAuthorization,
  createRealRunPodLifecycleAdapter,
  evaluatePaidSmokeGate,
} from './tivvlejoy-runpod-real-lifecycle-adapter.mjs';
import {
  PAID_GPU_ENABLED,
  PAID_SMOKE_STATUS,
  POD_CREATION_ENABLED,
  REAL_NETWORK_MUTATION_ENABLED as SMOKE_REAL_NETWORK,
  REMOTE_BLENDER_EXECUTION_ENABLED,
  SMOKE_FRAME_END,
  SMOKE_STARTUP_WATCHDOG_MS,
  buildSmokeJob,
  resolveFoundingAssets,
  runPaidSmokeExecute,
  runPaidSmokePreflight,
  validatePaidSmokeLaunchReceipt,
} from './tivvlejoy-runpod-one-pod-paid-smoke.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-one-pod-paid-smoke.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-one-pod-paid-smoke.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs'), 'utf8');
const adapterSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs'), 'utf8');

const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function jsonResponse(status, body) {
  return { status, text: async () => JSON.stringify(body) };
}

function scriptedFetch(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: String(init.method || 'GET').toUpperCase(), body: init.body || null });
    const next = script[calls.length - 1];
    if (!next) throw new Error(`Unexpected fetch ${init.method || 'GET'} ${url}`);
    return next.response;
  };
  return { fetchFn, calls };
}

describe('defaults stay fail-closed', () => {
  it('keeps committed paid flags false and refuses unauthorized real network', async () => {
    assert.equal(PAID_GPU_ENABLED, false);
    assert.equal(POD_CREATION_ENABLED, false);
    assert.equal(REMOTE_BLENDER_EXECUTION_ENABLED, false);
    assert.equal(SMOKE_REAL_NETWORK, false);
    assert.equal(REAL_NETWORK_MUTATION_ENABLED, false);
    const gate = evaluatePaidSmokeGate({
      allowRealNetwork: true,
      realNetworkMutationEnabled: true,
      paidGpuEnabled: true,
      podCreationEnabled: true,
      mode: 'paid-smoke-test',
      confirmPaidGpu: true,
      paidApprovalPhrase: 'wrong',
      templateId: APPROVED_TEMPLATE_ID,
      launchIntentSha256: APPROVED_LAUNCH_INTENT_SHA256,
      renderPlanReceipt: completePaidSmokeAuthorization().renderPlanReceipt,
    });
    assert.equal(gate.ok, false);
    const adapter = createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: globalThis.fetch,
      allowRealNetwork: true,
    });
    assert.equal(adapter.mode, 'REAL_BUT_BLOCKED');
    const blocked = await adapter.createPod({ templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-1' });
    assert.equal(blocked.code, 'PAID_EXECUTION_NOT_AUTHORIZED');
    assert.equal(adapter.createCount(), 0);
  });
});

describe('launch receipt binds the real staged identity', () => {
  it('accepts a fresh receipt and refuses a loosened or mismatched one', () => {
    const assets = resolveFoundingAssets();
    const job = buildSmokeJob({ assets, jobId: 'tjsmo20260818235900', createdAt: '2026-08-18T23:59:00.000Z' });
    assert.equal(job.frame_end, SMOKE_FRAME_END);
    assert.equal(job.render_profile, 'FINAL_1080P');
    const receipt = {
      launchIntentSha256: 'a'.repeat(64),
      templateId: APPROVED_TEMPLATE_ID,
      imageName: REQUIRED_IMAGE_NAME,
      podName: 'tivvlejoy-render-20260818235900',
      gpuType: PINNED_GPU_TYPE_ID,
      cloudType: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      runtimeCap: MAX_RUNTIME_MINUTES,
      costCap: MAX_COMPUTE_USD,
      jobPackageSha256: 'b'.repeat(64),
      workerManifestSha256: 'c'.repeat(64),
      manifestKey: 'jobs/tjsmo20260818235900/manifest.json',
      jobId: 'tjsmo20260818235900',
    };
    assert.equal(validatePaidSmokeLaunchReceipt(receipt, { launchIntentSha256: 'a'.repeat(64) }).ok, true);
    assert.equal(
      validatePaidSmokeLaunchReceipt({ ...receipt, templateId: 'nope' }, { launchIntentSha256: 'a'.repeat(64) }).code,
      'TEMPLATE_ID_MISMATCH',
    );
    assert.equal(
      validatePaidSmokeLaunchReceipt({ ...receipt, runtimeCap: 30 }, { launchIntentSha256: 'a'.repeat(64) }).code,
      'RENDER_PLAN_INVALID',
    );
    assert.equal(
      validatePaidSmokeLaunchReceipt(
        { ...receipt, launchIntentSha256: APPROVED_LAUNCH_INTENT_SHA256 },
        { launchIntentSha256: APPROVED_LAUNCH_INTENT_SHA256, jobPackage: { jobId: 'tjsmo20260818235900' } },
      ).code,
      'LAUNCH_INTENT_MISMATCH',
    );
    assert.equal(MAX_HOURLY_USD, '0.75');
    assert.equal(SMOKE_STARTUP_WATCHDOG_MS, 300_000);
    assert.ok(SMOKE_STARTUP_WATCHDOG_MS < MAX_RUNTIME_MINUTES * 60_000);
    assert.equal(moduleSource.includes('STARTUP_WATCHDOG_MS: String(SMOKE_STARTUP_WATCHDOG_MS)'), true);
    assert.equal(docs.includes('No automatic paid retry'), true);
    assert.equal(moduleSource.includes('createPodForBenchmark'), false);
  });
});

describe('createGuardedPod sends the bound worker env', () => {
  it('POSTs the provided payload env and never injects launcher secrets', async () => {
    let posted = null;
    const created = await createGuardedPod({
      apiKey: FAKE_API_KEY,
      templateId: APPROVED_TEMPLATE_ID,
      runId: '20260818235900',
      payload: {
        name: 'tivvlejoy-render-20260818235900',
        cloudType: PINNED_CLOUD_TYPE,
        computeType: 'GPU',
        gpuTypeIds: [PINNED_GPU_TYPE_ID],
        gpuTypePriority: 'custom',
        gpuCount: 1,
        interruptible: false,
        locked: false,
        templateId: APPROVED_TEMPLATE_ID,
        ports: [],
        env: {
          RENDER_JOB_ID: 'tjsmo20260818235900',
          ALLOW_WORKER_SELF_TERMINATE: 'false',
        },
      },
      fetchFn: async (url, init) => {
        posted = { url, method: init.method, body: JSON.parse(init.body) };
        return jsonResponse(201, { id: 'podsmoke01' });
      },
    });
    assert.equal(created.ok, true);
    assert.equal(posted.url, REST_PODS_URL);
    assert.equal(posted.body.templateId, APPROVED_TEMPLATE_ID);
    assert.equal(posted.body.env.RENDER_JOB_ID, 'tjsmo20260818235900');
    assert.equal(posted.body.env.ALLOW_WORKER_SELF_TERMINATE, 'false');
    assert.equal('RUNPOD_API_KEY' in posted.body.env, false);
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in posted.body.env, false);
  });
});

describe('preexisting pods and tripwire', () => {
  it('refuses execute when any Pod already exists and keeps the mutation tripwire', async () => {
    const { fetchFn, calls } = scriptedFetch([
      { response: jsonResponse(200, [{ id: 'already1', name: 'someone-else' }]) },
    ]);
    const result = await runPaidSmokeExecute({
      env: {
        RUNPOD_API_KEY: FAKE_API_KEY,
        R2_BUCKET: 'bucket',
        R2_ENDPOINT: 'https://example.invalid',
        R2_ACCESS_KEY_ID: 'id',
        R2_SECRET_ACCESS_KEY: 'secret',
      },
      fetchFn,
      log: () => {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PREEXISTING_PODS_PRESENT');
    assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
    const tripwire = createLaunchDryRunTripwire({ attempts: [] });
    await assert.rejects(() => tripwire(REST_PODS_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
  });
});

describe('preflight command', () => {
  it('prints paid-smoke preflight markers without authorizing spend', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-paid-preflight-'));
    temps.push(root);
    const logs = [];
    const result = await runPaidSmokePreflight({
      workspaceRoot: root,
      log: (line) => logs.push(String(line)),
      verifyImage: async () => ({ ok: true }),
      verifyPreflight: async () => ({ ok: true }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, PAID_SMOKE_STATUS);
    assert.equal(result.paidExecutionEnabled, false);
    assert.equal(logs.includes('WORKER_IMAGE_READY'), true);
    assert.equal(logs.includes('REAL_ADAPTER_READY'), true);
    assert.equal(logs.includes('PAID_SMOKE_PREFLIGHT_PASS'), true);
    assert.equal(logs.includes('PAID_EXECUTION_ENABLED=false'), true);
    assert.equal(logs.includes('REAL_POST_PODS=0'), true);
  });
});

describe('lifecycle still works after async R2 reads', () => {
  it('keeps the simulated controller as the source of truth', async () => {
    const adapter = createSimulatedRunPodAdapter();
    assert.equal(typeof adapter.createPod, 'function');
    assert.equal(workflow.includes('confirm_paid_gpu'), false);
    assert.equal(workflow.includes('CONFIRM_PAID_GPU'), false);
    assert.equal(workflow.includes('LAUNCH_TIVVLEJOY_GPU'), false);
    assert.equal(docs.includes('PAID_SMOKE_TEST_PASS'), true);
    assert.equal(docs.includes('Do not POST /v1/pods'), true);
    assert.equal(moduleSource.includes('createPodForBenchmark'), false);
    assert.equal(adapterSource.includes('allowRealNetwork === true'), true);
    assert.equal(typeof runPodLifecycle, 'function');
  });
});

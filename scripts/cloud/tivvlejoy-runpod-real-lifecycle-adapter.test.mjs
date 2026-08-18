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
  parseUsdToMicros,
  projectedComputeMicros,
} from './tivvlejoy-guarded-render.mjs';
import {
  buildTivvleJoyRemoteJobPackage,
  buildWorkerEnvironment,
  createInMemoryR2Adapter,
  createSampleWorkspace,
  defaultPilotJob,
  simulatePublishJobPackage,
} from './tivvlejoy-remote-blender-foundation.mjs';
import { buildRenderPlanReceipt } from './tivvlejoy-guarded-pod-payload.mjs';
import {
  APPROVED_TEMPLATE_ID,
  createLaunchDryRunTripwire,
} from './tivvlejoy-runpod-template-binding.mjs';
import { buildBoundGuardedPodPayload } from './tivvlejoy-runpod-template-binding.mjs';
import {
  REQUIRED_IMAGE_NAME,
  REST_TEMPLATES_URL,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  CLEANUP_ATTENTION_CODE,
  createClock,
  createSimulatedRunPodAdapter,
  runPodLifecycle,
} from './tivvlejoy-runpod-lifecycle.mjs';
import {
  ADAPTER_MODES,
  PAID_GPU_ENABLED,
  POD_CREATION_ENABLED,
  REAL_ADAPTER_STATUS,
  REAL_NETWORK_MUTATION_ENABLED,
  REMOTE_BLENDER_EXECUTION_ENABLED,
  REQUIRED_PAID_APPROVAL_PHRASE,
  REQUIRED_PAID_SMOKE_MODE,
  adapterContractMethods,
  adaptersShareLifecycleContract,
  completePaidSmokeAuthorization,
  countRecordedPodMutations,
  createRealReadOnlyR2Observer,
  createRealRunPodLifecycleAdapter,
  evaluatePaidSmokeGate,
  runRealLifecyclePreflight,
} from './tivvlejoy-runpod-real-lifecycle-adapter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-real-lifecycle-adapter.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-real-lifecycle-adapter.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-real-lifecycle-adapter.mjs'), 'utf8');
const lifecycleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-lifecycle.mjs'), 'utf8');

const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET_value_do_not_log';

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-real-lifecycle-'));
  temps.push(root);
  return createSampleWorkspace(root);
}

function isolatedEnv(dir = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-real-env-'))) {
  temps.push(dir);
  return {
    TIVVLEJOY_POD_ID_FILE: path.join(dir, 'pod-id'),
    TIVVLEJOY_POD_NAME_FILE: path.join(dir, 'pod-name'),
    TIVVLEJOY_CREATE_ATTEMPTED_FILE: path.join(dir, 'create-attempted'),
    GITHUB_ENV: path.join(dir, 'github-env'),
    RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID,
  };
}

function stage(roots) {
  const packaged = buildTivvleJoyRemoteJobPackage(
    defaultPilotJob({
      scene_sha256: roots.sceneSha256,
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
    }),
  );
  assert.equal(packaged.ok, true);
  const adapter = createInMemoryR2Adapter();
  const localSources = Object.fromEntries(
    packaged.jobPackage.expectedAssets.map((asset) => [asset.r2Key, { body: asset.sha256, sha256: asset.sha256 }]),
  );
  const staged = simulatePublishJobPackage(packaged, { adapter, localSources });
  assert.equal(staged.ok, true);
  return staged;
}

function workerEnv(jobPackage) {
  return buildWorkerEnvironment({
    jobPackage,
    storageConfig: { R2_BUCKET: 'tivvlejoy-test-bucket', R2_ENDPOINT: 'https://example.invalid', R2_REGION: 'auto' },
    storageCredentials: { R2_ACCESS_KEY_ID: 'FAKE_TEST_ACCESS', R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET },
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: '0.74',
      RENDER_WORKER_ID: `tivvlejoy-worker-${jobPackage.jobId}`,
    },
  });
}

function prepare(extra = {}) {
  const roots = extra.roots || workspace();
  const staged = extra.staged || stage(roots);
  const now = extra.now ?? Date.parse('2026-08-18T19:00:00.000Z');
  const built = buildBoundGuardedPodPayload({
    templateId: extra.templateId ?? APPROVED_TEMPLATE_ID,
    env: extra.env ?? { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID, RUNPOD_API_KEY: FAKE_API_KEY },
    stagedJobPackage: staged,
    workerEnvironment: extra.workerEnvironment ?? workerEnv(staged.jobPackage),
    renderPlanReceipt: extra.payloadReceipt ?? buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now }),
    now,
    runId: extra.runId ?? '20260818001',
    mutationRecorder: extra.mutationRecorder ?? { attempts: [] },
    imageName: extra.imageName,
  });
  return {
    roots,
    staged,
    now,
    built,
    jobPackage: staged.jobPackage,
    renderPlanReceipt: extra.payloadReceipt ?? extra.renderPlanReceipt ?? buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now }),
  };
}

function jsonResponse(status, body) {
  return { status, text: async () => JSON.stringify(body) };
}

function priceBody(price = 0.74) {
  return {
    data: {
      gpuTypes: [
        {
          id: PINNED_GPU_TYPE_ID,
          lowestPrice: { uninterruptablePrice: price, stockStatus: 'High' },
        },
      ],
    },
  };
}

function scriptedFetch(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url: String(url), method: String(init.method || 'GET').toUpperCase(), hasAuthHeader: Boolean(init.headers?.Authorization) });
    const next = script[calls.length - 1];
    if (!next) throw new Error(`Unexpected fetch ${init.method || 'GET'} ${url}`);
    if (next.throw) throw next.throw === true ? new Error('ambiguous transport') : next.throw;
    return next.response;
  };
  return { fetchFn, calls };
}

function authAndPrice() {
  return [
    { response: jsonResponse(200, { data: { myself: { id: 'acct' } } }) },
    { response: jsonResponse(200, priceBody()) },
  ];
}

function authorizedAdapter({ script, authorization, env } = {}) {
  const scripted = scriptedFetch(script || [...authAndPrice(), { response: jsonResponse(201, { id: 'podreal001' }) }]);
  const adapter = createRealRunPodLifecycleAdapter({
    apiKey: FAKE_API_KEY,
    fetchFn: scripted.fetchFn,
    env: env || isolatedEnv(),
    authorization: completePaidSmokeAuthorization(authorization),
  });
  return { adapter, calls: scripted.calls };
}

async function runWithRealAdapter(extra = {}) {
  const prep = extra.prep || prepare(extra);
  const r2 = extra.r2 || createInMemoryR2Adapter();
  const env = extra.env || isolatedEnv();
  const scripted = extra.scripted || scriptedFetch([
    ...authAndPrice(),
    { response: jsonResponse(201, { id: extra.podId || 'podreal001' }) },
    { response: { status: 204, text: async () => '' } },
  ]);
  const runpod =
    extra.runpod ||
    createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: scripted.fetchFn,
      env,
      authorization: completePaidSmokeAuthorization({
        ...extra.authorization,
        renderPlanReceipt: extra.renderPlanReceipt ?? prep.renderPlanReceipt,
        launchIntentSha256: extra.launchIntentSha256 ?? prep.built.launchIntentSha256,
        now: extra.now ?? prep.now,
      }),
    });
  const result = await runPodLifecycle({
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    templateId: extra.templateId ?? APPROVED_TEMPLATE_ID,
    builtPayload: extra.skipBuilt ? undefined : prep.built,
    jobPackage: prep.jobPackage,
    renderPlanReceipt: extra.renderPlanReceipt ?? prep.renderPlanReceipt,
    now: extra.now ?? prep.now,
    expectedLaunchIntentSha256: extra.expectedLaunchIntentSha256 ?? prep.built.launchIntentSha256,
    imageName: extra.imageName,
    r2,
    runpod,
    workerMode: extra.workerMode ?? 'complete',
    clock: extra.clock || createClock(),
    startupTimeoutMs: extra.startupTimeoutMs ?? 4,
    readyTimeoutMs: extra.readyTimeoutMs ?? 4,
    renderTimeoutMs: extra.renderTimeoutMs ?? 6,
    maxTicks: extra.maxTicks ?? 12,
    afterCreateHook: extra.afterCreateHook,
    mutationRecorder: extra.mutationRecorder ?? { attempts: [] },
  });
  return { result, runpod, calls: scripted.calls, prep };
}

describe('1-2. real adapter contract and default block', () => {
  it('matches the simulated adapter interface and stays blocked by default', () => {
    const simulated = createSimulatedRunPodAdapter();
    const real = createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: async () => jsonResponse(200, {}),
    });
    assert.equal(adaptersShareLifecycleContract(simulated, real), true);
    assert.deepEqual(adapterContractMethods(), ['createPod', 'deletePod', 'createCount', 'deleteCount']);
    assert.equal(simulated.mode, 'SIMULATED');
    assert.equal(real.mode, 'REAL_BUT_BLOCKED');
    assert.deepEqual(ADAPTER_MODES, ['SIMULATED', 'REAL_BUT_BLOCKED', 'REAL_AUTHORIZED']);
    assert.equal(PAID_GPU_ENABLED, false);
    assert.equal(POD_CREATION_ENABLED, false);
    assert.equal(REMOTE_BLENDER_EXECUTION_ENABLED, false);
    assert.equal(REAL_NETWORK_MUTATION_ENABLED, false);
  });
});

describe('3-6. unpaid authorization refuses before create', () => {
  it('refuses missing authorization, wrong mode, missing confirmation, and wrong phrase', async () => {
    const payload = { templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-20260818001' };
    const missing = createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: async () => jsonResponse(201, { id: 'should-not-create' }),
    });
    const missingResult = await missing.createPod(payload);
    assert.equal(missingResult.code, 'PAID_EXECUTION_NOT_AUTHORIZED');
    assert.equal(missing.createCount(), 0);
    assert.equal(missing.recordedMutations().postPods, 0);

    const wrongMode = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ mode: 'render_launch' }));
    assert.equal(wrongMode.ok, false);
    assert.equal(wrongMode.code, 'PAID_EXECUTION_NOT_AUTHORIZED');

    const missingConfirm = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ confirmPaidGpu: false }));
    assert.equal(missingConfirm.ok, false);
    assert.equal(missingConfirm.code, 'PAID_EXECUTION_NOT_AUTHORIZED');

    const wrongPhrase = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ paidApprovalPhrase: 'wrong-phrase' }));
    assert.equal(wrongPhrase.ok, false);
    assert.equal(wrongPhrase.code, 'PAID_EXECUTION_NOT_AUTHORIZED');

    const blockedMode = createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: async () => jsonResponse(201, { id: 'nope' }),
      authorization: completePaidSmokeAuthorization({ mode: 'dry-run' }),
    });
    const refused = await blockedMode.createPod(payload);
    assert.equal(refused.code, 'PAID_EXECUTION_NOT_AUTHORIZED');
    assert.equal(blockedMode.createCount(), 0);
  });
});

describe('7-13. safety gates refuse before create', () => {
  it('refuses wrong template, image, stale plan, price, cost, runtime, and intent', async () => {
    const now = Date.parse('2026-08-18T19:00:00.000Z');
    const payload = { templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-20260818001' };

    const wrongTemplate = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ templateId: 'not-approved' }));
    assert.equal(wrongTemplate.ok, false);
    assert.equal(wrongTemplate.code, 'TEMPLATE_ID_MISMATCH');

    const imageName = REQUIRED_IMAGE_NAME.replace(/sha256:[0-9a-f]{64}/, `sha256:${'b'.repeat(64)}`);
    const wrongImage = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ imageName }));
    assert.equal(wrongImage.ok, false);
    assert.equal(wrongImage.code, 'IMAGE_MISMATCH');

    const stale = evaluatePaidSmokeGate(
      completePaidSmokeAuthorization({
        renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now: now - 10 * 60 * 1000 }),
        now,
      }),
    );
    assert.equal(stale.ok, false);
    assert.equal(stale.code, 'STALE_RENDER_PLAN');

    const expensive = evaluatePaidSmokeGate(
      completePaidSmokeAuthorization({
        renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.76' }, { now }),
        now,
      }),
    );
    assert.equal(expensive.ok, false);
    assert.ok(['PRICE_ABOVE_CAP', 'RENDER_PLAN_INVALID'].includes(expensive.code));

    const overProject = evaluatePaidSmokeGate(
      completePaidSmokeAuthorization({
        renderPlanReceipt: buildRenderPlanReceipt(
          { hourlyUsd: '0.74', projectedMicros: parseUsdToMicros(MAX_COMPUTE_USD) + 1 },
          { now },
        ),
        now,
      }),
    );
    assert.equal(overProject.ok, false);
    assert.ok(['PROJECTED_COST_ABOVE_CAP', 'RENDER_PLAN_INVALID'].includes(overProject.code));

    const longRuntime = evaluatePaidSmokeGate(
      completePaidSmokeAuthorization({
        renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.74', maxRuntimeMinutes: 21 }, { now }),
        now,
      }),
    );
    assert.equal(longRuntime.ok, false);
    assert.ok(['RUNTIME_ABOVE_CAP', 'RENDER_PLAN_INVALID'].includes(longRuntime.code));

    const mismatch = evaluatePaidSmokeGate(completePaidSmokeAuthorization({ launchIntentSha256: '0'.repeat(64) }));
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'LAUNCH_INTENT_MISMATCH');

    const adapter = createRealRunPodLifecycleAdapter({
      apiKey: FAKE_API_KEY,
      fetchFn: async () => jsonResponse(201, { id: 'should-not-create' }),
      authorization: completePaidSmokeAuthorization({ templateId: 'not-approved' }),
    });
    const refused = await adapter.createPod(payload);
    assert.equal(refused.code, 'TEMPLATE_ID_MISMATCH');
    assert.equal(adapter.createCount(), 0);
    assert.equal(adapter.recordedMutations().postPods, 0);
    assert.equal(MAX_HOURLY_USD, '0.75');
    assert.equal(MAX_COMPUTE_USD, '0.25');
    assert.equal(MAX_RUNTIME_MINUTES, 20);
    assert.equal(PINNED_CLOUD_TYPE, 'SECURE');
    assert.equal(PINNED_GPU_COUNT, 1);
  });
});

describe('14-15. authorized fake-fetch create and delete', () => {
  it('records exactly one POST /v1/pods on the authorized create path', async () => {
    const { adapter, calls } = authorizedAdapter();
    const created = await adapter.createPod({
      templateId: APPROVED_TEMPLATE_ID,
      name: 'tivvlejoy-render-20260818001',
      env: { ALLOW_WORKER_SELF_TERMINATE: 'false' },
    });
    assert.equal(created.ok, true);
    assert.equal(created.podId, 'podreal001');
    assert.equal(adapter.createCount(), 1);
    assert.equal(adapter.recordedMutations().postPods, 1);
    assert.equal(calls.filter((call) => call.method === 'POST' && call.url === REST_PODS_URL).length, 1);
    const second = await adapter.createPod({ templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-20260818001' });
    assert.equal(second.code, 'DUPLICATE_CREATE');
    assert.equal(adapter.createCount(), 1);
    assert.equal(adapter.recordedMutations().postPods, 1);
  });

  it('records exactly one DELETE /v1/pods on the authorized delete path', async () => {
    const { adapter, calls } = authorizedAdapter({
      script: [
        ...authAndPrice(),
        { response: jsonResponse(201, { id: 'podreal001' }) },
        { response: { status: 204, text: async () => '' } },
      ],
    });
    const created = await adapter.createPod({ templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-20260818001' });
    const deleted = await adapter.deletePod(created.podId);
    assert.equal(deleted.ok, true);
    assert.equal(adapter.deleteCount(), 1);
    assert.equal(adapter.recordedMutations().deletePods, 1);
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
    const second = await adapter.deletePod(created.podId);
    assert.equal(second.code, 'DUPLICATE_DELETE');
    assert.equal(adapter.deleteCount(), 1);
  });
});

describe('16-17. lifecycle uses one create and one delete', () => {
  it('completes the same lifecycle through the real adapter with one create and one delete', async () => {
    const { result, runpod, calls } = await runWithRealAdapter();
    assert.equal(result.ok, true);
    assert.equal(result.code, 'LIFECYCLE_PASS');
    assert.deepEqual(result.history, [
      'PRECHECK',
      'LAUNCH_AUTHORIZED',
      'CREATE_REQUEST_READY',
      'POD_CREATED',
      'WAITING_FOR_WORKER',
      'WORKER_STARTED',
      'WORKER_READY',
      'RENDER_RUNNING',
      'RENDER_COMPLETE',
      'CLEANUP_REQUIRED',
      'DELETE_REQUEST_READY',
      'POD_DELETED',
      'CLEANUP_VERIFIED',
    ]);
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 1);
    assert.equal(countRecordedPodMutations(runpod.operations).postPods, 1);
    assert.equal(countRecordedPodMutations(runpod.operations).deletePods, 1);
    assert.equal(result.realPostPods, 0);
    assert.equal(result.paidCompute, false);
    assert.equal(calls.some((call) => call.method === 'POST' && call.url === REST_PODS_URL), true);
  });

  it('deletes once after a worker failure that occurred after create', async () => {
    const { result, runpod } = await runWithRealAdapter({ workerMode: 'failed' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RENDER_FAILED');
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 1);
    assert.equal(result.cleanupVerified, true);
  });
});

describe('18-20. exact-name recovery and no fabricated IDs', () => {
  it('recovers exactly one Pod after an ambiguous create and deletes it', async () => {
    const env = isolatedEnv();
    const scripted = scriptedFetch([
      ...authAndPrice(),
      { response: jsonResponse(201, { name: 'tivvlejoy-render-20260818001' }) },
      { response: jsonResponse(200, [{ id: 'podrec001', name: 'tivvlejoy-render-20260818001' }]) },
      { response: { status: 204, text: async () => '' } },
    ]);
    const { result, runpod } = await runWithRealAdapter({
      env,
      scripted,
      runpod: createRealRunPodLifecycleAdapter({
        apiKey: FAKE_API_KEY,
        fetchFn: scripted.fetchFn,
        env,
        authorization: completePaidSmokeAuthorization(),
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AMBIGUOUS_CREATE_RECOVERED');
    assert.equal(result.podId, 'podrec001');
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 1);
    assert.equal(runpod.operations.some((item) => item.op === 'RECOVER' && item.kind === 'one'), true);
    assert.equal(scripted.calls.some((call) => call.method === 'GET' && call.url === REST_PODS_URL), true);
  });

  it('returns cleanup attention when recovery finds multiple exact-name matches', async () => {
    const env = isolatedEnv();
    const scripted = scriptedFetch([
      ...authAndPrice(),
      { response: jsonResponse(201, { name: 'tivvlejoy-render-20260818001' }) },
      {
        response: jsonResponse(200, [
          { id: 'podrec001', name: 'tivvlejoy-render-20260818001' },
          { id: 'podrec002', name: 'tivvlejoy-render-20260818001' },
        ]),
      },
    ]);
    const { result, runpod } = await runWithRealAdapter({
      env,
      scripted,
      runpod: createRealRunPodLifecycleAdapter({
        apiKey: FAKE_API_KEY,
        fetchFn: scripted.fetchFn,
        env,
        authorization: completePaidSmokeAuthorization(),
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, CLEANUP_ATTENTION_CODE);
    assert.equal(result.podId, null);
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 0);
  });

  it('does not fabricate a Pod ID when create and recovery yield none', async () => {
    const env = isolatedEnv();
    const { adapter } = authorizedAdapter({
      env,
      script: [
        ...authAndPrice(),
        { response: jsonResponse(201, { name: 'tivvlejoy-render-20260818001' }) },
        { response: jsonResponse(200, []) },
      ],
    });
    const created = await adapter.createPod({ templateId: APPROVED_TEMPLATE_ID, name: 'tivvlejoy-render-20260818001' });
    assert.equal(created.ok, false);
    assert.equal(created.podId, null);
    assert.equal(created.recovered, 'zero');
    assert.equal(created.confirmedZero, true);
    assert.equal(extractNoId(created), true);
  });
});

function extractNoId(created) {
  return created.podId == null && created.parsed == null;
}

describe('21-23. launcher-only secrets stay out of worker env and logs', () => {
  it('keeps API key and template ID out of worker env and redacts secrets', async () => {
    const { result, prep } = await runWithRealAdapter();
    assert.equal(result.ok, true);
    assert.equal(prep.built.privateExecutionPayload.env.ALLOW_WORKER_SELF_TERMINATE, 'false');
    assert.equal('RUNPOD_API_KEY' in prep.built.privateExecutionPayload.env, false);
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in prep.built.privateExecutionPayload.env, false);
    const dumped = JSON.stringify({ result, operations: result });
    assert.equal(dumped.includes(FAKE_API_KEY), false);
    assert.equal(dumped.includes(FAKE_R2_SECRET), false);
    assert.equal(dumped.includes('Authorization'), false);
  });
});

describe('24-25. default CLI and tripwire stay mutation-free', () => {
  it('default preflight performs zero paid mutation and keeps the tripwire armed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-real-preflight-'));
    temps.push(root);
    const logs = [];
    const recorder = { attempts: [] };
    const result = await runRealLifecyclePreflight({
      workspaceRoot: root,
      mutationRecorder: recorder,
      log: (line) => logs.push(String(line)),
      verifyImage: async () => ({ ok: true }),
      verifyPreflight: async () => ({ ok: true }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'REAL_LIFECYCLE_PREFLIGHT_PASS');
    assert.equal(result.paidExecutionEnabled, false);
    assert.equal(result.realPostPods, 0);
    assert.equal(result.realDeletePods, 0);
    assert.equal(result.realR2, false);
    assert.equal(logs.includes('WORKER_IMAGE_READY'), true);
    assert.equal(logs.includes('TEMPLATE_READY'), true);
    assert.equal(logs.includes('TEMPLATE_BOUND'), true);
    assert.equal(logs.includes('POD_PAYLOAD_READY'), true);
    assert.equal(logs.includes('LAUNCH_INTENT_READY'), true);
    assert.equal(logs.includes('LIFECYCLE_READY'), true);
    assert.equal(logs.includes('REAL_ADAPTER_READY'), true);
    assert.equal(logs.includes('PAID_EXECUTION_ENABLED=false'), true);
    assert.equal(logs.includes('REAL_POST_PODS=0'), true);
    assert.equal(logs.includes('REAL_DELETE_PODS=0'), true);
    assert.equal(logs.includes('GPU_LAUNCHED=false'), true);
    assert.equal(logs.includes('PAID_COMPUTE=false'), true);
    assert.equal(logs.includes('REAL_LIFECYCLE_PREFLIGHT_PASS'), true);
    assert.equal(result.launchIntentSha256, APPROVED_LAUNCH_INTENT_SHA256);
    assert.equal(REAL_ADAPTER_STATUS, 'REAL_ADAPTER_READY');

    const tripwire = createLaunchDryRunTripwire({ attempts: [] });
    await assert.rejects(() => tripwire(REST_PODS_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => tripwire(`${REST_PODS_URL}/podreal001`, { method: 'DELETE' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => tripwire(REST_TEMPLATES_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    assert.equal(logs.some((line) => line.includes(FAKE_API_KEY) || line.includes(REQUIRED_PAID_APPROVAL_PHRASE)), false);
  });
});

describe('R2 observer and source contract', () => {
  it('prepares a read-only observer that never mutates real R2', () => {
    const observer = createRealReadOnlyR2Observer();
    assert.equal(observer.realR2, false);
    assert.equal(observer.put('jobs/x/status.json', '{}', 'a'.repeat(64)).code, 'R2_MUTATION_FORBIDDEN');
    assert.equal(observer.delete('jobs/x/status.json').code, 'R2_MUTATION_FORBIDDEN');
    assert.equal(observer.get('jobs/x/status.json').ok, false);
    assert.equal(lifecycleSource.includes('createGuardedPod'), false);
    assert.equal(moduleSource.includes('createGuardedPod('), true);
    assert.equal(moduleSource.includes('deleteGuardedPod('), true);
    assert.equal(moduleSource.includes('recoverPodByExactName('), true);
    assert.equal(moduleSource.includes('runRenderPlan('), true);
    assert.match(workflow, /cursor\/tivvlejoy-runpod-real-lifecycle-adapter-73f1/);
    assert.equal(workflow.includes('confirm_paid_gpu'), false);
    assert.equal(workflow.includes('CONFIRM_PAID_GPU'), false);
    assert.equal(workflow.includes(REQUIRED_PAID_APPROVAL_PHRASE), false);
    assert.equal(docs.includes('REAL_LIFECYCLE_PREFLIGHT_PASS'), true);
    assert.equal(docs.includes('Do not POST /v1/pods'), true);
    assert.equal(REQUIRED_PAID_SMOKE_MODE, 'paid-smoke-test');
  });
});

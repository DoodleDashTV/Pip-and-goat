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
import {
  REQUIRED_IMAGE_NAME,
  REST_TEMPLATES_URL,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  CLEANUP_ATTENTION_CODE,
  LIFECYCLE_STATES,
  createClock,
  createScriptedWorkerProgress,
  createSimulatedRunPodAdapter,
  interpretRenderStatus,
  interpretStartupStatus,
  runLifecycleDryRun,
  runSimulatedPodLifecycle,
} from './tivvlejoy-runpod-lifecycle.mjs';
import { buildBoundGuardedPodPayload } from './tivvlejoy-runpod-template-binding.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-pod-lifecycle.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-pod-lifecycle.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-lifecycle.mjs'), 'utf8');
const normalizationTests = readFileSync(
  path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-normalization.test.mjs'),
  'utf8',
);

const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET_value_do_not_log';

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-lifecycle-'));
  temps.push(root);
  return createSampleWorkspace(root);
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
    receipt: extra.receipt,
    provenance: extra.provenance,
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

async function simulate(extra = {}) {
  const prep = extra.prep || prepare(extra);
  const r2 = extra.r2 || createInMemoryR2Adapter();
  const runpod = extra.runpod || createSimulatedRunPodAdapter({ createMode: extra.createMode, deleteMode: extra.deleteMode });
  return runSimulatedPodLifecycle({
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    templateId: extra.templateId ?? APPROVED_TEMPLATE_ID,
    builtPayload: extra.skipBuilt ? undefined : prep.built,
    jobPackage: prep.jobPackage,
    renderPlanReceipt: extra.renderPlanReceipt ?? prep.renderPlanReceipt,
    now: extra.now ?? prep.now,
    expectedLaunchIntentSha256: extra.expectedLaunchIntentSha256 ?? prep.built.launchIntentSha256,
    imageName: extra.imageName,
    provenance: extra.provenance,
    receipt: extra.receipt,
    approvedBindings: extra.approvedBindings,
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
    fetchFn: extra.fetchFn,
    invokeRealNetwork: extra.invokeRealNetwork,
    invokeMethod: extra.invokeMethod,
  });
}

describe('1-5. successful complete lifecycle', () => {
  it('walks the happy path with one simulated create and one delete', async () => {
    const runpod = createSimulatedRunPodAdapter();
    const result = await simulate({ runpod });
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
    assert.equal(result.simulatedCreateCount, 1);
    assert.equal(result.simulatedDeleteCount, 1);
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 1);
    const secondCreate = runpod.createPod({ templateId: APPROVED_TEMPLATE_ID });
    assert.equal(secondCreate.code, 'DUPLICATE_CREATE');
    const secondDelete = runpod.deletePod(result.podId);
    assert.equal(secondDelete.code, 'DUPLICATE_DELETE');
    assert.equal(runpod.createCount(), 1);
    assert.equal(runpod.deleteCount(), 1);
    assert.equal(result.realPostPods, 0);
    assert.equal(result.paidCompute, false);
    assert.equal(LIFECYCLE_STATES.includes('CLEANUP_VERIFIED'), true);
  });
});

describe('6-8. create failure and malformed response', () => {
  it('refuses a create failure without fabricating an ID or deleting', async () => {
    const result = await simulate({ createMode: 'failure' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'CREATE_FAILED');
    assert.equal(result.podId, null);
    assert.equal(result.simulatedCreateCount, 1);
    assert.equal(result.simulatedDeleteCount, 0);
  });

  it('refuses a malformed create response without fabricating a Pod ID', async () => {
    const result = await simulate({ createMode: 'malformed' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MALFORMED_CREATE');
    assert.equal(result.podId, null);
    assert.equal(result.simulatedDeleteCount, 0);
  });
});

describe('9-12. timeouts and worker FAILED', () => {
  it('times out when the worker never starts and still deletes once', async () => {
    const result = await simulate({ workerMode: 'startup-timeout', startupTimeoutMs: 1, maxTicks: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TIMED_OUT');
    assert.equal(result.history.includes('TIMED_OUT'), true);
    assert.equal(result.simulatedCreateCount, 1);
    assert.equal(result.simulatedDeleteCount, 1);
    assert.equal(result.cleanupVerified, true);
  });

  it('times out when the worker never becomes ready and deletes once', async () => {
    const result = await simulate({ workerMode: 'ready-timeout', readyTimeoutMs: 1, maxTicks: 4 });
    assert.equal(result.ok, false);
    assert.equal(result.history.includes('WORKER_STARTED'), true);
    assert.equal(result.history.includes('TIMED_OUT'), true);
    assert.equal(result.simulatedDeleteCount, 1);
  });

  it('times out when render exceeds the budget and deletes once', async () => {
    const result = await simulate({ workerMode: 'render-timeout', renderTimeoutMs: 2, maxTicks: 8 });
    assert.equal(result.ok, false);
    assert.equal(result.history.includes('RENDER_RUNNING'), true);
    assert.equal(result.history.includes('TIMED_OUT'), true);
    assert.equal(result.simulatedDeleteCount, 1);
  });

  it('captures sanitized FAILED status and deletes once', async () => {
    const result = await simulate({ workerMode: 'failed' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RENDER_FAILED');
    assert.equal(result.terminal.classification, 'RENDER_FAILED');
    assert.equal(result.simulatedDeleteCount, 1);
    assert.equal(JSON.stringify(result).includes(FAKE_R2_SECRET), false);
  });
});

describe('13-15. malformed status and COMPLETE evidence', () => {
  it('fails closed on malformed startup status and deletes once', async () => {
    const result = await simulate({ workerMode: 'malformed-startup' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WORKER_STATUS_MALFORMED');
    assert.equal(result.simulatedDeleteCount, 1);
  });

  it('fails closed on malformed render status and deletes once', async () => {
    const result = await simulate({ workerMode: 'malformed-status' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'WORKER_STATUS_MALFORMED');
    assert.equal(result.simulatedDeleteCount, 1);
  });

  it('refuses COMPLETE without artifact evidence', async () => {
    assert.equal(interpretRenderStatus({ status: 'COMPLETE' }).kind, 'MALFORMED');
    const result = await simulate({ workerMode: 'complete-without-evidence' });
    assert.equal(result.ok, false);
    assert.equal(result.simulatedDeleteCount, 1);
    assert.equal(interpretStartupStatus({ kind: 'PROCESS_STARTED' }).kind, 'PROCESS_STARTED');
    assert.equal(interpretStartupStatus({ bootStage: 'WORKER_READY' }).kind, 'WORKER_READY');
    assert.equal(interpretStartupStatus({ bootStage: 'RENDER_STARTED' }).kind, 'WORKER_READY');
    assert.equal(interpretStartupStatus({ bootStage: 'BLENDER_PREFLIGHT_START' }).kind, 'WORKER_READY');
    assert.equal(interpretStartupStatus({ bootStage: 'R2_CLIENT_CREATED' }).kind, 'PROCESS_STARTED');
    assert.equal(interpretStartupStatus({ bootStage: 'STARTUP_TIMEOUT', result: 'FAILED', classification: 'TIMEOUT' }).kind, 'FAILED');
  });
});

describe('16-19. cleanup invariants', () => {
  it('cleans up after worker failure, render timeout, launcher exception, and delete failure', async () => {
    const failed = await simulate({ workerMode: 'failed' });
    assert.equal(failed.simulatedDeleteCount, 1);
    const timed = await simulate({ workerMode: 'render-timeout', renderTimeoutMs: 2 });
    assert.equal(timed.simulatedDeleteCount, 1);

    const exploding = createSimulatedRunPodAdapter();
    const thrown = await simulate({
      runpod: exploding,
      afterCreateHook: () => {
        throw new Error('launcher exploded after create');
      },
    });
    assert.equal(thrown.ok, false);
    assert.equal(thrown.simulatedDeleteCount, 1);
    assert.equal(thrown.cleanupVerified, true);
    assert.equal(JSON.stringify(thrown).includes(FAKE_API_KEY), false);

    const attention = await simulate({ deleteMode: 'failure' });
    assert.equal(attention.ok, false);
    assert.equal(attention.code, CLEANUP_ATTENTION_CODE);
    assert.equal(attention.cleanupVerified, false);
  });
});

describe('20-25. refuse before create', () => {
  it('refuses price, projected cost, stale receipt, wrong template, wrong image, and intent mismatch', async () => {
    const now = Date.parse('2026-08-18T19:00:00.000Z');
    const expensive = await simulate({
      renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.76' }, { now }),
    });
    assert.equal(expensive.ok, false);
    assert.ok(['PRICE_ABOVE_CAP', 'RENDER_PLAN_INVALID'].includes(expensive.code));
    assert.equal(expensive.simulatedCreateCount, 0);

    const overProject = await simulate({
      renderPlanReceipt: buildRenderPlanReceipt(
        { hourlyUsd: '0.74', projectedMicros: parseUsdToMicros(MAX_COMPUTE_USD) + 1 },
        { now },
      ),
    });
    assert.equal(overProject.ok, false);
    assert.ok(['PROJECTED_COST_ABOVE_CAP', 'RENDER_PLAN_INVALID'].includes(overProject.code));
    assert.equal(overProject.simulatedCreateCount, 0);

    const stale = await simulate({
      renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now: now - 10 * 60 * 1000 }),
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, 'STALE_RENDER_PLAN');
    assert.equal(stale.simulatedCreateCount, 0);

    const wrongTemplate = await simulate({ templateId: 'not-approved' });
    assert.equal(wrongTemplate.ok, false);
    assert.equal(wrongTemplate.code, 'TEMPLATE_ID_MISMATCH');
    assert.equal(wrongTemplate.simulatedCreateCount, 0);

    const imageName = REQUIRED_IMAGE_NAME.replace(/sha256:[0-9a-f]{64}/, `sha256:${'b'.repeat(64)}`);
    const wrongImage = await simulate({ imageName });
    assert.equal(wrongImage.ok, false);
    assert.equal(wrongImage.code, 'IMAGE_MISMATCH');
    assert.equal(wrongImage.simulatedCreateCount, 0);

    const mismatch = await simulate({ expectedLaunchIntentSha256: '0'.repeat(64) });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'LAUNCH_INTENT_MISMATCH');
    assert.equal(mismatch.simulatedCreateCount, 0);
    assert.equal(MAX_HOURLY_USD, '0.75');
    assert.equal(MAX_COMPUTE_USD, '0.25');
    assert.equal(MAX_RUNTIME_MINUTES, 20);
    assert.equal(projectedComputeMicros(parseUsdToMicros('0.74'), 20) > parseUsdToMicros('0.25'), false);
  });
});

describe('26-28. worker env isolation', () => {
  it('keeps template ID and API key out of env and disables self-termination', async () => {
    const prep = prepare();
    const result = await simulate({ prep });
    assert.equal(result.ok, true);
    assert.equal(prep.built.privateExecutionPayload.env.ALLOW_WORKER_SELF_TERMINATE, 'false');
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in prep.built.privateExecutionPayload.env, false);
    assert.equal('RUNPOD_API_KEY' in prep.built.privateExecutionPayload.env, false);
    assert.equal('RUNPOD_POD_ID' in prep.built.privateExecutionPayload.env, false);
    assert.equal(JSON.stringify(result).includes(FAKE_API_KEY), false);
    assert.equal(JSON.stringify(result).includes(FAKE_R2_SECRET), false);
  });
});

describe('29-31. real mutation tripwire and zero paid compute', () => {
  it('blocks real POST and DELETE /v1/pods and keeps paid compute at zero', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createLaunchDryRunTripwire(recorder);
    await assert.rejects(() => fetchFn(REST_PODS_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_PODS_URL}/simrc8eyeq1`, { method: 'DELETE' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(REST_TEMPLATES_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');

    const posted = await simulate({ invokeRealNetwork: true, invokeMethod: 'POST', mutationRecorder: { attempts: [] } });
    assert.equal(posted.code, 'RUNPOD_MUTATION_TRIPWIRE');
    const deleted = await simulate({ invokeRealNetwork: true, invokeMethod: 'DELETE', mutationRecorder: { attempts: [] } });
    assert.equal(deleted.code, 'RUNPOD_MUTATION_TRIPWIRE');

    const result = await simulate();
    assert.equal(result.realPostPods, 0);
    assert.equal(result.realDeletePods, 0);
    assert.equal(result.gpuLaunched, false);
    assert.equal(result.paidCompute, false);
    assert.equal(result.blenderExecuted, false);
    assert.equal(result.realR2, false);
  });
});

describe('dry-run command and approved intent', () => {
  it('prints the required lifecycle dry-run markers', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-lifecycle-cli-'));
    temps.push(root);
    const logs = [];
    const result = await runLifecycleDryRun({
      workspaceRoot: root,
      log: (line) => logs.push(String(line)),
      verifyImage: async () => ({ ok: true }),
      verifyPreflight: async () => ({ ok: true }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'LIFECYCLE_PASS');
    assert.equal(result.launchIntentSha256, APPROVED_LAUNCH_INTENT_SHA256);
    assert.equal(logs.includes('WORKER_IMAGE_READY'), true);
    assert.equal(logs.includes('TEMPLATE_READY'), true);
    assert.equal(logs.includes('TEMPLATE_BOUND'), true);
    assert.equal(logs.includes('POD_PAYLOAD_READY'), true);
    assert.equal(logs.includes('LAUNCH_INTENT_READY'), true);
    assert.equal(logs.includes('LIFECYCLE_SIMULATION: PASS'), true);
    assert.equal(logs.includes('SIMULATED_POST_PODS=1'), true);
    assert.equal(logs.includes('SIMULATED_DELETE_PODS=1'), true);
    assert.equal(logs.includes('REAL_POST_PODS=0'), true);
    assert.equal(logs.includes('REAL_DELETE_PODS=0'), true);
    assert.equal(logs.includes('GPU_LAUNCHED=false'), true);
    assert.equal(logs.includes('PAID_COMPUTE=false'), true);
    assert.equal(logs.includes('CLEANUP_VERIFIED'), true);
    assert.equal(logs.includes('LIFECYCLE_PASS'), true);
    assert.equal(logs.some((line) => line.includes(FAKE_R2_SECRET)), false);
    assert.equal(createScriptedWorkerProgress({ r2: createInMemoryR2Adapter(), jobPackage: { jobId: 'x', startupStatusKey: 'jobs/x/startup-status.json', statusKey: 'jobs/x/status.json', outputKey: 'renders/x.mp4' } }) && true, true);
  });
});

describe('workflow and docs stay simulation-only', () => {
  it('is branch-scoped and never enables paid launch', () => {
    assert.match(
      workflow,
      /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-pod-lifecycle-73f1\n/m,
    );
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.equal(workflow.includes('confirm_paid_gpu'), false);
    assert.equal(workflow.includes('LAUNCH_TIVVLEJOY_GPU'), false);
    assert.equal(workflow.includes('createGuardedPod'), false);
    assert.equal(moduleSource.includes('createGuardedPod'), false);
    assert.match(docs, /LIFECYCLE_PASS/);
    assert.match(docs, /Do not POST \/v1\/pods/);
    assert.match(docs, /rc8eyeqhn2/);
    assert.match(normalizationTests, /S\. mutation tripwire remains intact/);
  });
});

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
  REQUIRED_APPROVAL_PHRASE,
  REST_PODS_URL,
} from './tivvlejoy-guarded-render.mjs';
import {
  PACKAGE_STATE_NOT_READY,
  PACKAGE_STATE_STAGED,
  buildTivvleJoyRemoteJobPackage,
  buildWorkerEnvironment,
  createInMemoryR2Adapter,
  createSampleWorkspace,
  defaultPilotJob,
  simulatePublishJobPackage,
} from './tivvlejoy-remote-blender-foundation.mjs';
import {
  AUTOMATIC_PRODUCTION_RENDERING_ENABLED,
  IDENTITY_LAYERS,
  MAX_WORKER_ENV_KEYS,
  PAID_GPU_ENABLED,
  POD_CREATION_ENABLED,
  POD_PAYLOAD_STATUS,
  REMOTE_BLENDER_EXECUTION_ENABLED,
  RENDER_PLAN_RECEIPT_MAX_AGE_MS,
  assertNoPaidPodMutation,
  buildGuardedWorkerPodPayload,
  buildRenderPlanReceipt,
  createPaidMutationTripwire,
  hashLaunchIntent,
  isPaidPodMutation,
  runPodPayloadDryRun,
  validatePrivatePodPayload,
  validateRenderPlanReceipt,
  validateStagedJobPackage,
} from './tivvlejoy-guarded-pod-payload.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const payloadSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-guarded-pod-payload.mjs'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-blender-execution.md'), 'utf8');

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-pod-payload-'));
  temps.push(root);
  return createSampleWorkspace(root);
}

function validJob(roots, overrides = {}) {
  return defaultPilotJob({
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
    ...overrides,
  });
}

function stagePackage(roots, overrides = {}) {
  const packaged = buildTivvleJoyRemoteJobPackage(validJob(roots, overrides));
  assert.equal(packaged.ok, true);
  const adapter = createInMemoryR2Adapter();
  const localSources = Object.fromEntries(
    packaged.jobPackage.expectedAssets.map((asset) => [asset.r2Key, { body: asset.sha256, sha256: asset.sha256 }]),
  );
  const staged = simulatePublishJobPackage(packaged, { adapter, localSources });
  assert.equal(staged.ok, true);
  assert.equal(staged.state, PACKAGE_STATE_STAGED);
  return { packaged, staged, adapter, localSources };
}

function storage(extra = {}) {
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
    ...extra,
  };
}

function workerEnvFor(jobPackage, extra = {}) {
  return buildWorkerEnvironment({
    jobPackage,
    ...storage(),
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: '0.74',
      RENDER_WORKER_ID: `tivvlejoy-worker-${jobPackage.jobId}`,
      ...(extra.launchMetadata || {}),
    },
    runtimeConfig: extra.runtimeConfig,
    injected: extra.injected,
  });
}

function validInputs(roots, extra = {}) {
  const { staged } = stagePackage(roots);
  const now = extra.now ?? Date.parse('2026-08-18T19:00:00.000Z');
  const workerEnvironment = extra.workerEnvironment ?? workerEnvFor(staged.jobPackage);
  return {
    templateId: extra.templateId ?? 'tpl-test-001',
    runId: extra.runId ?? '20260818001',
    stagedJobPackage: extra.stagedJobPackage ?? staged,
    workerEnvironment,
    renderPlanReceipt: extra.renderPlanReceipt ?? buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now }),
    now,
    mutationRecorder: extra.mutationRecorder ?? { attempts: [] },
  };
}

describe('status flags remain foundation-only', () => {
  it('does not enable paid GPU, Pod creation, or remote Blender', () => {
    assert.equal(POD_PAYLOAD_STATUS, 'GUARDED POD LAUNCH PAYLOAD FOUNDATION');
    assert.equal(PAID_GPU_ENABLED, false);
    assert.equal(POD_CREATION_ENABLED, false);
    assert.equal(REMOTE_BLENDER_EXECUTION_ENABLED, false);
    assert.equal(AUTOMATIC_PRODUCTION_RENDERING_ENABLED, false);
    assert.equal(/createGuardedPod\s*\(/.test(payloadSource), false);
    assert.match(docs, /GUARDED POD LAUNCH PAYLOAD FOUNDATION/);
    assert.match(docs, /least-privilege worker env/);
    assert.match(docs, /guarded Pod payload/);
    assert.match(IDENTITY_LAYERS.renderIdentity, /jobPackageSha256/);
    assert.match(IDENTITY_LAYERS.launchIdentity, /launchIntentSha256/);
    assert.equal(RENDER_PLAN_RECEIPT_MAX_AGE_MS, 5 * 60 * 1000);
  });
});

describe('valid integrated Pod payload', () => {
  it('builds a private payload from a STAGED package, worker env, and fresh PASS receipt', () => {
    const roots = workspace();
    const built = buildGuardedWorkerPodPayload(validInputs(roots));
    assert.equal(built.ok, true);
    const payload = built.privateExecutionPayload;
    assert.equal(payload.name.startsWith('tivvlejoy-render-'), true);
    assert.equal(payload.cloudType, PINNED_CLOUD_TYPE);
    assert.equal(payload.computeType, 'GPU');
    assert.deepEqual(payload.gpuTypeIds, [PINNED_GPU_TYPE_ID]);
    assert.equal(payload.gpuCount, PINNED_GPU_COUNT);
    assert.equal(payload.interruptible, false);
    assert.equal(payload.templateId, 'tpl-test-001');
    assert.deepEqual(payload.ports, []);
    assert.equal(typeof payload.env, 'object');
    assert.equal(payload.env.RENDER_JOB_ID, built.jobPackage.jobId);
    assert.equal(payload.env.RENDER_JOB_MANIFEST_KEY, built.jobPackage.manifestKey);
    assert.equal(payload.env.ALLOW_WORKER_SELF_TERMINATE, 'false');
    assert.equal(payload.env.R2_SECRET_ACCESS_KEY, 'FAKE_TEST_STORAGE_SECRET');
    assert.equal(payload.env.R2_ACCESS_KEY_ID, 'FAKE_TEST_ACCESS');
    assert.equal('RUNPOD_API_KEY' in payload.env, false);
    assert.equal('RUNPOD_API_ENDPOINT' in payload.env, false);
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in payload.env, false);
    assert.equal('LAUNCH_TIVVLEJOY_GPU' in payload.env, false);
    assert.equal('GITHUB_TOKEN' in payload.env, false);
    assert.equal('GH_TOKEN' in payload.env, false);
    assert.equal('GITHUB_PAT' in payload.env, false);
    assert.equal('VERCEL_TOKEN' in payload.env, false);
    assert.equal('VERCEL_OIDC_TOKEN' in payload.env, false);
    assert.equal('RUNPOD_POD_ID' in payload.env, false);
    assert.equal(JSON.stringify(payload.env).includes(REQUIRED_APPROVAL_PHRASE), false);
    assert.ok(Object.keys(payload.env).length <= MAX_WORKER_ENV_KEYS);
    assert.equal(built.envKeyCount, Object.keys(payload.env).length);
    assert.equal(built.sanitizedPayloadSummary.envKeyCount, built.envKeyCount);
    assert.equal(built.sanitizedPayloadSummary.templateConfigured, true);
    assert.equal(built.sanitizedPayloadSummary.envRedacted.R2_SECRET_ACCESS_KEY, '[REDACTED]');
    assert.equal(built.sanitizedPayloadSummary.envRedacted.R2_ACCESS_KEY_ID, '[REDACTED]');
    assert.equal(JSON.stringify(built.sanitizedPayloadSummary).includes('FAKE_TEST_STORAGE_SECRET'), false);
    assert.equal(JSON.stringify(built.sanitizedPayloadSummary).includes('FAKE_TEST_ACCESS'), false);
    assert.equal(built.launchIntentSha256.length, 64);
    assert.equal(built.contactedPaidEndpoint, false);
    assert.equal(built.postPodsCalled, false);
    assert.equal(built.podCreated, false);
    assert.equal(built.rawSecretPayloadLogged, false);
  });
});

describe('staged package gates', () => {
  it('accepts STAGED and refuses NOT_READY, partial, and identity conflict', () => {
    const roots = workspace();
    const { packaged, staged, adapter, localSources } = stagePackage(roots);
    assert.equal(validateStagedJobPackage(staged).ok, true);

    const notReady = buildGuardedWorkerPodPayload(
      validInputs(roots, { stagedJobPackage: { ...packaged.jobPackage, state: PACKAGE_STATE_NOT_READY } }),
    );
    assert.equal(notReady.ok, false);
    assert.equal(notReady.code, 'NOT_READY');

    const missing = simulatePublishJobPackage(packaged, { adapter: createInMemoryR2Adapter(), localSources: {} });
    assert.equal(missing.ok, false);
    assert.equal(missing.state, PACKAGE_STATE_NOT_READY);
    const missingPayload = buildGuardedWorkerPodPayload(validInputs(roots, { stagedJobPackage: missing }));
    assert.equal(missingPayload.ok, false);
    assert.ok(['NOT_READY', 'MISSING_ASSET'].includes(missingPayload.code));

    const partial = simulatePublishJobPackage(packaged, {
      adapter: createInMemoryR2Adapter(),
      localSources,
      failOnKey: packaged.jobPackage.expectedAssets[0].r2Key,
    });
    assert.equal(partial.partial, true);
    assert.equal(buildGuardedWorkerPodPayload(validInputs(roots, { stagedJobPackage: partial })).code, 'NOT_READY');

    const changed = buildTivvleJoyRemoteJobPackage(validJob(roots, { frame_end: 80 }));
    const conflict = simulatePublishJobPackage(changed, { adapter, localSources: localSources });
    assert.equal(conflict.code, 'JOB_IDENTITY_CONFLICT');
    assert.equal(buildGuardedWorkerPodPayload(validInputs(roots, { stagedJobPackage: conflict })).code, 'JOB_IDENTITY_CONFLICT');
  });

  it('refuses a wrong job/package mapping', () => {
    const roots = workspace();
    const { staged } = stagePackage(roots);
    const other = workerEnvFor(staged.jobPackage);
    other.env.RENDER_JOB_ID = 'other-job';
    const built = buildGuardedWorkerPodPayload(validInputs(roots, { stagedJobPackage: staged, workerEnvironment: other }));
    assert.equal(built.ok, false);
    assert.equal(built.code, 'JOB_IDENTITY_CONFLICT');
  });
});

describe('template contract', () => {
  it('refuses a missing template and never places template ID in env', () => {
    const roots = workspace();
    const missing = buildGuardedWorkerPodPayload(validInputs(roots, { templateId: '' }));
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'TEMPLATE_REQUIRED');
    const built = buildGuardedWorkerPodPayload(validInputs(roots));
    assert.equal(built.ok, true);
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in built.privateExecutionPayload.env, false);
    assert.equal(built.privateExecutionPayload.templateId, 'tpl-test-001');
  });
});

describe('render-plan receipt', () => {
  it('refuses invalid, stale, wrong GPU/cloud/count, and over-cap receipts', () => {
    const roots = workspace();
    const now = Date.parse('2026-08-18T19:00:00.000Z');
    const inputs = validInputs(roots, { now });

    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ verdict: 'REFUSE' }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ gpu: 'NVIDIA GeForce RTX 3090' }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ cloud: 'COMMUNITY' }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ gpuCount: 2 }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ hourlyUsd: '0.76' }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    const overCompute = buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now });
    overCompute.projectedMicros = parseInt(String(Number(MAX_COMPUTE_USD) * 1_000_000 + 1), 10);
    overCompute.projectedMicros = 250_001;
    assert.equal(buildGuardedWorkerPodPayload({ ...inputs, renderPlanReceipt: overCompute }).code, 'RENDER_PLAN_INVALID');
    assert.equal(
      buildGuardedWorkerPodPayload({
        ...inputs,
        renderPlanReceipt: buildRenderPlanReceipt({ maxRuntimeMinutes: MAX_RUNTIME_MINUTES + 1 }, { now }),
      }).code,
      'RENDER_PLAN_INVALID',
    );
    const stale = buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now: now - RENDER_PLAN_RECEIPT_MAX_AGE_MS - 1 });
    assert.equal(validateRenderPlanReceipt(stale, { now }).code, 'STALE_RENDER_PLAN');
    assert.equal(buildGuardedWorkerPodPayload({ ...inputs, renderPlanReceipt: stale }).code, 'STALE_RENDER_PLAN');
    assert.equal(MAX_HOURLY_USD, '0.75');
  });
});

describe('worker env and env-count guard', () => {
  it('attaches validated worker env and refuses fabricated Pod IDs and launcher secrets', () => {
    const roots = workspace();
    const { staged } = stagePackage(roots);
    const withPodId = workerEnvFor(staged.jobPackage, { launchMetadata: { RUNPOD_POD_ID: 'pod-fabricated' } });
    assert.equal(withPodId.ok, true);
    assert.equal(
      buildGuardedWorkerPodPayload(validInputs(roots, { stagedJobPackage: staged, workerEnvironment: withPodId })).code,
      'LAUNCHER_ONLY_SECRET',
    );
    assert.equal(
      workerEnvFor(staged.jobPackage, { injected: { RUNPOD_API_KEY: 'rpa_ABC123' } }).code,
      'LAUNCHER_ONLY_SECRET',
    );
    assert.equal(
      workerEnvFor(staged.jobPackage, { injected: { GITHUB_TOKEN: 'ghp_abc' } }).code,
      'LAUNCHER_ONLY_SECRET',
    );
    assert.equal(
      workerEnvFor(staged.jobPackage, { injected: { VERCEL_TOKEN: 'vercel_abc' } }).code,
      'LAUNCHER_ONLY_SECRET',
    );
  });

  it('accepts env count <= 50 and refuses count > 50 without trimming', () => {
    const roots = workspace();
    const built = buildGuardedWorkerPodPayload(validInputs(roots));
    assert.equal(built.ok, true);
    assert.ok(built.envKeyCount <= 50);
    const inflated = { ...built.privateExecutionPayload, env: { ...built.privateExecutionPayload.env } };
    for (let i = 0; i < 51; i += 1) inflated.env[`PAD_${i}`] = '1';
    const refused = validatePrivatePodPayload(inflated, { jobPackage: built.jobPackage });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'ENV_COUNT_EXCEEDED');
    assert.ok(Object.keys(inflated.env).length > 50);
  });

  it('refuses unexpected payload fields', () => {
    const roots = workspace();
    const built = buildGuardedWorkerPodPayload(validInputs(roots));
    const extra = { ...built.privateExecutionPayload, fallbackGpu: 'RTX 3090' };
    assert.equal(validatePrivatePodPayload(extra, { jobPackage: built.jobPackage }).code, 'PAYLOAD_INVALID');
  });
});

describe('launch intent hash', () => {
  it('is deterministic and ignores credential rotation', () => {
    const roots = workspace();
    const now = Date.parse('2026-08-18T19:00:00.000Z');
    const { staged } = stagePackage(roots);
    const firstEnv = workerEnvFor(staged.jobPackage);
    const rotated = buildWorkerEnvironment({
      jobPackage: staged.jobPackage,
      storageConfig: { R2_BUCKET: 'tivvlejoy-test-bucket', R2_ENDPOINT: 'https://example.invalid', R2_REGION: 'auto' },
      storageCredentials: { R2_ACCESS_KEY_ID: 'FAKE_TEST_ACCESS_2', R2_SECRET_ACCESS_KEY: 'FAKE_TEST_STORAGE_SECRET_2' },
      launchMetadata: { RUNPOD_GPU_HOURLY_RATE: '0.74', RENDER_WORKER_ID: `tivvlejoy-worker-${staged.jobPackage.jobId}` },
    });
    const first = buildGuardedWorkerPodPayload(
      validInputs(roots, { now, stagedJobPackage: staged, workerEnvironment: firstEnv }),
    );
    const second = buildGuardedWorkerPodPayload(
      validInputs(roots, { now, stagedJobPackage: staged, workerEnvironment: rotated }),
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.jobPackage.jobPackageSha256, second.jobPackage.jobPackageSha256);
    assert.equal(first.jobPackage.workerManifestSha256, second.jobPackage.workerManifestSha256);
    assert.equal(first.launchIntentSha256, second.launchIntentSha256);
    assert.notEqual(first.privateExecutionPayload.env.R2_SECRET_ACCESS_KEY, second.privateExecutionPayload.env.R2_SECRET_ACCESS_KEY);
    const again = hashLaunchIntent({
      jobPackageSha256: first.jobPackage.jobPackageSha256,
      workerManifestSha256: first.jobPackage.workerManifestSha256,
      jobId: first.jobPackage.jobId,
      manifestKey: first.jobPackage.manifestKey,
      outputKey: first.jobPackage.outputKey,
      templateIdentity: first.sanitizedPayloadSummary.launchIntentSha256 && first.privateExecutionPayload.templateId
        ? undefined
        : undefined,
      intendedPodName: first.privateExecutionPayload.name,
      gpuType: PINNED_GPU_TYPE_ID,
      cloudType: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      interruptible: false,
      runtimeCap: first.jobPackage.runtimeLimit,
      costCap: first.jobPackage.costLimit,
      hourlyQuote: '0.74',
    });
    assert.equal(typeof again, 'string');
    assert.equal(again.length, 64);
  });
});

describe('mutation tripwire', () => {
  it('fails the test if POST or DELETE /v1/pods is attempted', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createPaidMutationTripwire(recorder);
    await assert.rejects(() => fetchFn('https://rest.runpod.io/v1/pods', { method: 'POST' }), (error) => {
      assert.equal(error.code, 'PAID_MUTATION_TRIPWIRE');
      return true;
    });
    await assert.rejects(() => fetchFn('https://rest.runpod.io/v1/pods/abc', { method: 'DELETE' }), (error) => {
      assert.equal(error.code, 'PAID_MUTATION_TRIPWIRE');
      return true;
    });
    assert.equal(isPaidPodMutation('https://rest.runpod.io/v1/pods', 'POST'), true);
    assert.equal(isPaidPodMutation('https://rest.runpod.io/v1/pods', 'GET'), false);
    assert.throws(() => assertNoPaidPodMutation(recorder), (error) => error.code === 'PAID_MUTATION_TRIPWIRE');
  });

  it('integrated invokeNetwork path trips POST /v1/pods without a real fetch', () => {
    const roots = workspace();
    const recorder = { attempts: [] };
    const fetchFn = createPaidMutationTripwire(recorder);
    const built = buildGuardedWorkerPodPayload({
      ...validInputs(roots),
      fetchFn,
      mutationRecorder: recorder,
      invokeNetwork: true,
    });
    assert.equal(built.ok, false);
    assert.equal(built.code, 'PAID_MUTATION_TRIPWIRE');
    assert.notEqual(built.code, 'PAYLOAD_INVALID');
    assert.equal(String(built.reason || '').includes('ReferenceError'), false);
    assert.equal(String(built.reason || '').includes('is not defined'), false);
    assert.equal(recorder.attempts.length, 1);
    assert.equal(recorder.attempts[0].method, 'POST');
    assert.equal(recorder.attempts[0].url, REST_PODS_URL);
    assert.match(recorder.attempts[0].url, /\/v1\/pods$/);
    assert.equal(built.podCreated, false);
    assert.equal(built.gpuLaunched, false);
    assert.equal(built.contactedPaidEndpoint, false);
    assert.equal(built.postPodsCalled, false);
    assert.equal(built.deletePodsCalled, false);
  });
});

describe('pod-payload-dry-run', () => {
  it('builds and validates a payload then stops before network', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-pod-payload-dry-'));
    temps.push(root);
    const logs = [];
    const recorder = { attempts: [] };
    const result = runPodPayloadDryRun({
      workspaceRoot: root,
      log: (line) => logs.push(String(line)),
      mutationRecorder: recorder,
      now: Date.parse('2026-08-18T19:00:00.000Z'),
    });
    assert.equal(result.ok, true);
    assert.equal(logs[0], 'POD PAYLOAD DRY RUN: PASS');
    assert.equal(logs.includes('Pod request sent: false'), true);
    assert.equal(logs.includes('GPU launched: false'), true);
    assert.equal(logs.includes('Pod created: false'), true);
    assert.equal(logs.includes('POST /v1/pods called: false'), true);
    assert.equal(logs.includes('DELETE /v1/pods called: false'), true);
    assert.equal(logs.includes('Paid mutation contacted: false'), true);
    assert.equal(logs.includes('Real R2 mutated: false'), true);
    assert.equal(logs.includes('Blender executed: false'), true);
    assert.equal(logs.includes('Raw secret payload logged: false'), true);
    assert.equal(logs.some((line) => line.includes('FAKE_TEST_STORAGE_SECRET')), false);
    assert.equal(logs.some((line) => line.includes('FAKE_TEST_ACCESS')), false);
    assert.equal(logs.some((line) => /rpa_|LAUNCH_TIVVLEJOY_GPU/.test(line)), false);
    assert.equal(recorder.attempts.length, 0);
    assert.equal(result.postPodsCalled, false);
    assert.equal(result.deletePodsCalled, false);
    assert.equal(result.podCreated, false);
    assert.equal(result.gpuLaunched, false);
    assert.equal(result.blenderExecuted, false);
    assert.equal(result.realR2, false);
    assert.equal(result.rawSecretPayloadLogged, false);
    assert.equal('RUNPOD_API_KEY' in result.privateExecutionPayload.env, false);
    assert.ok(logs.some((line) => line.startsWith('Env key names:')));
  });
});

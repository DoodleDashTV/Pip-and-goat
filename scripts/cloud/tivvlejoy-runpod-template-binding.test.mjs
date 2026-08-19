import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_IMAGE_DIGEST,
  REQUIRED_IMAGE_NAME,
  REST_PODS_URL,
  REST_TEMPLATES_URL,
  SUGGESTED_TEMPLATE_NAME,
} from './tivvlejoy-runpod-template-readiness.mjs';
import {
  TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT,
  hashSanitizedCreatePayload,
} from './tivvlejoy-runpod-template-creation-receipt.mjs';
import { assessTemplateCompatibilityWithProvenance } from './tivvlejoy-runpod-template-normalization.mjs';
import {
  APPROVED_TEMPLATE_BINDING,
  APPROVED_TEMPLATE_ID,
  APPROVED_TEMPLATE_NAME,
  APPROVED_TEMPLATE_PROVENANCE,
  approvedTemplateRepresentation,
  assertNoLaunchMutation,
  buildBoundGuardedPodPayload,
  countLaunchMutations,
  createLaunchDryRunTripwire,
  resolveApprovedTemplateBinding,
  resolveControlPlaneTemplateId,
  runBoundLaunchDryRun,
  verifyPinnedWorkerImageContract,
} from './tivvlejoy-runpod-template-binding.mjs';
import { buildRenderPlanReceipt, hashLaunchIntent } from './tivvlejoy-guarded-pod-payload.mjs';
import {
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
} from './tivvlejoy-guarded-render.mjs';
import {
  buildTivvleJoyRemoteJobPackage as buildPackage,
  buildWorkerEnvironment as buildEnv,
  createInMemoryR2Adapter as memoryR2,
  createSampleWorkspace as sampleWorkspace,
  defaultPilotJob as pilotJob,
  simulatePublishJobPackage as publishPackage,
} from './tivvlejoy-remote-blender-foundation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod-template-binding.yml'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-template-binding.md'), 'utf8');
const moduleSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-binding.mjs'), 'utf8');
const normalizationTests = readFileSync(
  path.join(repoRoot, 'scripts/cloud/tivvlejoy-runpod-template-normalization.test.mjs'),
  'utf8',
);
const common = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');

const FAKE_API_KEY = 'FAKE_RUNPOD_KEY_value_do_not_log';
const FAKE_R2_SECRET = 'FAKE_R2_SECRET_value_do_not_log';

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-binding-'));
  temps.push(root);
  return sampleWorkspace(root);
}

function stage(roots) {
  const packaged = buildPackage(
    pilotJob({
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
  const adapter = memoryR2();
  const localSources = Object.fromEntries(
    packaged.jobPackage.expectedAssets.map((asset) => [asset.r2Key, { body: asset.sha256, sha256: asset.sha256 }]),
  );
  const staged = publishPackage(packaged, { adapter, localSources });
  assert.equal(staged.ok, true);
  return staged;
}

function workerEnv(jobPackage) {
  return buildEnv({
    jobPackage,
    storageConfig: { R2_BUCKET: 'tivvlejoy-test-bucket', R2_ENDPOINT: 'https://example.invalid', R2_REGION: 'auto' },
    storageCredentials: { R2_ACCESS_KEY_ID: 'FAKE_TEST_ACCESS', R2_SECRET_ACCESS_KEY: FAKE_R2_SECRET },
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: '0.74',
      RENDER_WORKER_ID: `tivvlejoy-worker-${jobPackage.jobId}`,
    },
  });
}

function boundInputs(roots, extra = {}) {
  const staged = extra.stagedJobPackage ?? stage(roots);
  const now = extra.now ?? Date.parse('2026-08-18T19:00:00.000Z');
  return {
    templateId: extra.templateId ?? APPROVED_TEMPLATE_ID,
    env: extra.env ?? { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    stagedJobPackage: staged,
    workerEnvironment: extra.workerEnvironment ?? workerEnv(staged.jobPackage),
    renderPlanReceipt: extra.renderPlanReceipt ?? buildRenderPlanReceipt({ hourlyUsd: '0.74' }, { now }),
    now,
    runId: extra.runId ?? '20260818001',
    mutationRecorder: extra.mutationRecorder ?? { attempts: [] },
    receipt: extra.receipt,
    template: extra.template,
    provenance: extra.provenance,
    imageName: extra.imageName,
    approvedBindings: extra.approvedBindings,
  };
}

describe('1. correct template ID', () => {
  it('binds the current approved template and reuses PR #59 provenance', () => {
    const result = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'TEMPLATE_BOUND');
    assert.equal(result.templateId, APPROVED_TEMPLATE_ID);
    assert.equal(result.templateId !== 'rc8eyeqhn2', true);
    assert.equal(result.provenance, 'TEMPLATE_READY');
    assert.equal(result.assessed.compatible, true);
    assert.equal(result.assessed.provenanceMatched, true);
  });
});

describe('2. missing template ID', () => {
  it('fails closed', () => {
    const result = resolveApprovedTemplateBinding({ env: {} });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEMPLATE_ID_MISSING');
    assert.equal(resolveControlPlaneTemplateId({}), '');
  });
});

describe('3. wrong template ID', () => {
  it('fails closed', () => {
    const result = resolveApprovedTemplateBinding({ templateId: 'other-template' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEMPLATE_ID_MISMATCH');
  });

  it('refuses historical attempt #1 template rc8eyeqhn2 for current launch', () => {
    const result = resolveApprovedTemplateBinding({ templateId: 'rc8eyeqhn2' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEMPLATE_ID_MISMATCH');
    assert.equal(APPROVED_TEMPLATE_ID !== 'rc8eyeqhn2', true);
  });
});

describe('4. correct ID but wrong image', () => {
  it('fails closed', () => {
    const imageName = REQUIRED_IMAGE_NAME.replace(/sha256:[0-9a-f]{64}/, `sha256:${'a'.repeat(64)}`);
    const result = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      imageName,
      template: approvedTemplateRepresentation({ imageName }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IMAGE_MISMATCH');
  });
});

describe('5. correct ID but missing TEMPLATE_READY provenance', () => {
  it('fails closed', () => {
    const result = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      provenance: '',
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'TEMPLATE_READY_PROVENANCE_MISSING');
  });
});

describe('6. receipt hash mismatch', () => {
  it('fails closed', () => {
    const result = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      receipt: { ...TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT, sanitizedCreatePayloadHash: '0'.repeat(64) },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RECEIPT_HASH_MISMATCH');
  });
});

describe('7. duplicate approved identity', () => {
  it('fails closed', () => {
    const result = resolveApprovedTemplateBinding({
      templateId: APPROVED_TEMPLATE_ID,
      approvedBindings: [APPROVED_TEMPLATE_BINDING, { ...APPROVED_TEMPLATE_BINDING }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'DUPLICATE_APPROVED_IDENTITY');
  });
});

describe('8-14. bound payload isolation and identity', () => {
  it('keeps control-plane IDs out of worker env and sets top-level templateId', () => {
    const roots = workspace();
    const built = buildBoundGuardedPodPayload(
      boundInputs(roots, { env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID, RUNPOD_API_KEY: FAKE_API_KEY } }),
    );
    assert.equal(built.ok, true);
    assert.equal(built.code, 'POD_PAYLOAD_READY');
    assert.equal(built.privateExecutionPayload.templateId, APPROVED_TEMPLATE_ID);
    assert.equal(built.privateExecutionPayload.templateId !== 'rc8eyeqhn2', true);
    assert.equal('RUNPOD_RENDER_TEMPLATE_ID' in built.privateExecutionPayload.env, false);
    assert.equal('RUNPOD_API_KEY' in built.privateExecutionPayload.env, false);
    assert.equal('RUNPOD_POD_ID' in built.privateExecutionPayload.env, false);
    assert.equal(built.envKeyCount, Object.keys(built.privateExecutionPayload.env).length);
    assert.equal(built.envKeyCount <= 50, true);
    assert.equal(JSON.stringify(built.sanitizedPayloadSummary).includes(FAKE_API_KEY), false);
    assert.equal(JSON.stringify(built.sanitizedPayloadSummary).includes(FAKE_R2_SECRET), false);
    assert.equal(built.sanitizedPayloadSummary.envRedacted.R2_SECRET_ACCESS_KEY, '[REDACTED]');
  });
});

describe('10. API key excluded from launchIntentSha256', () => {
  it('does not change when a launcher API key is present only in control-plane env', () => {
    const roots = workspace();
    const staged = stage(roots);
    const now = Date.parse('2026-08-18T19:00:00.000Z');
    const first = buildBoundGuardedPodPayload(boundInputs(roots, { stagedJobPackage: staged, now, env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID } }));
    const second = buildBoundGuardedPodPayload(
      boundInputs(roots, {
        stagedJobPackage: staged,
        now,
        env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID, RUNPOD_API_KEY: FAKE_API_KEY },
      }),
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.launchIntentSha256, second.launchIntentSha256);
    assert.equal(first.launchIntentSha256.includes(FAKE_API_KEY), false);
    const again = hashLaunchIntent({
      jobPackageSha256: first.privateExecutionPayload && first.sanitizedPayloadSummary.jobPackageSha256,
      workerManifestSha256: first.sanitizedPayloadSummary.workerManifestSha256,
      jobId: first.sanitizedPayloadSummary.jobId,
      manifestKey: first.sanitizedPayloadSummary.manifestKey,
      outputKey: first.sanitizedPayloadSummary.outputKey,
      templateIdentity: APPROVED_TEMPLATE_ID,
      intendedPodName: first.privateExecutionPayload.name,
      gpuType: PINNED_GPU_TYPE_ID,
      cloudType: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      interruptible: false,
      runtimeCap: first.sanitizedPayloadSummary.runtimeLimit,
      costCap: first.sanitizedPayloadSummary.costLimit,
      hourlyQuote: '0.74',
      RUNPOD_API_KEY: FAKE_API_KEY,
    });
    assert.equal(again.includes(FAKE_API_KEY), false);
  });
});

describe('15-17. mutation tripwire', () => {
  it('blocks Pod POST/DELETE and template mutations', async () => {
    const recorder = { attempts: [] };
    const fetchFn = createLaunchDryRunTripwire(recorder);
    await assert.rejects(() => fetchFn(REST_PODS_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_PODS_URL}/abc`, { method: 'DELETE' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(REST_TEMPLATES_URL, { method: 'POST' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/${APPROVED_TEMPLATE_ID}`, { method: 'PATCH' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    await assert.rejects(() => fetchFn(`${REST_TEMPLATES_URL}/${APPROVED_TEMPLATE_ID}`, { method: 'DELETE' }), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
    assert.throws(() => assertNoLaunchMutation(recorder), (error) => error.code === 'RUNPOD_MUTATION_TRIPWIRE');
  });
});

describe('18. dry-run performs zero paid operations', () => {
  it('builds the bound payload and stops before network mutation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-launch-dry-'));
    temps.push(root);
    const logs = [];
    const recorder = { attempts: [] };
    const result = await runBoundLaunchDryRun({
      workspaceRoot: root,
      log: (line) => logs.push(String(line)),
      mutationRecorder: recorder,
      now: Date.parse('2026-08-18T19:00:00.000Z'),
      env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
      verifyImage: async () => ({ ok: true }),
      verifyPreflight: async () => ({ ok: true }),
      liveTemplateAudit: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'DRY_RUN_PASS');
    assert.equal(result.templateId, APPROVED_TEMPLATE_ID);
    assert.equal(result.privateExecutionPayload.templateId, APPROVED_TEMPLATE_ID);
    assert.equal(result.postPodsCount, 0);
    assert.equal(result.deletePodsCount, 0);
    assert.equal(result.templatePostCount, 0);
    assert.equal(result.templatePatchCount, 0);
    assert.equal(result.templateDeleteCount, 0);
    assert.equal(result.podCreated, false);
    assert.equal(result.gpuLaunched, false);
    assert.equal(result.paidCompute, false);
    assert.equal(result.blenderExecuted, false);
    assert.equal(result.realR2, false);
    assert.equal(logs.includes('TEMPLATE_BINDING: PASS'), true);
    assert.equal(logs.includes('TEMPLATE_READY'), true);
    assert.equal(logs.includes('POD_PAYLOAD: PASS'), true);
    assert.equal(logs.includes('LAUNCH_INTENT: PASS'), true);
    assert.equal(logs.includes('DRY_RUN_ONLY'), true);
    assert.equal(logs.includes('DRY_RUN_PASS'), true);
    assert.equal(logs.some((line) => line.includes(FAKE_R2_SECRET)), false);
    assert.equal(logs.some((line) => line.includes(FAKE_API_KEY)), false);
    assert.deepEqual(countLaunchMutations(recorder).postPodsCount, 0);
  });
});

describe('19. approved immutable worker image remains exact', () => {
  it('pins the same digest as the worker-image contract', () => {
    const image = verifyPinnedWorkerImageContract();
    assert.equal(image.ok, true);
    assert.equal(image.code, 'WORKER_IMAGE_READY');
    assert.equal(APPROVED_TEMPLATE_BINDING.imageName, REQUIRED_IMAGE_NAME);
    assert.equal(APPROVED_TEMPLATE_BINDING.imageDigest, REQUIRED_IMAGE_DIGEST);
    assert.equal(common.includes(REQUIRED_IMAGE_DIGEST.replace('sha256:', '')), true);
    assert.equal(REQUIRED_IMAGE_NAME.includes(':latest'), false);
  });
});

describe('20. PR #59 semantic-normalization tests remain intact', () => {
  it('does not weaken the provenance assessor and leaves those tests in place', () => {
    assert.match(normalizationTests, /A\. fully populated compatible response/);
    assert.match(normalizationTests, /C\. missing fields without trusted provenance/);
    assert.match(normalizationTests, /S\. mutation tripwire remains intact/);
    const missing = assessTemplateCompatibilityWithProvenance(approvedTemplateRepresentation({ id: 'other-template' }));
    assert.equal(missing.compatible, false);
    const ready = assessTemplateCompatibilityWithProvenance(approvedTemplateRepresentation());
    assert.equal(ready.compatible, true);
    assert.equal(ready.provenanceMatched, true);
    assert.equal(TIVVLEJOY_TRUSTED_TEMPLATE_CREATION_RECEIPT.sanitizedCreatePayloadHash, hashSanitizedCreatePayload());
    assert.equal(APPROVED_TEMPLATE_NAME, SUGGESTED_TEMPLATE_NAME);
    assert.equal(APPROVED_TEMPLATE_PROVENANCE, 'TEMPLATE_READY');
  });
});

describe('workflow and docs stay dry-run only', () => {
  it('is branch-scoped, contents:read only, and never launches', () => {
    assert.match(
      workflow,
      /^on:\n  push:\n    branches:\n      - cursor\/tivvlejoy-runpod-template-binding-73f1\n/m,
    );
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.doesNotMatch(workflow, /packages: write/);
    assert.doesNotMatch(workflow, /workflow_dispatch/);
    assert.equal(workflow.includes('create-template'), false);
    assert.equal(workflow.includes('LAUNCH_TIVVLEJOY_GPU'), false);
    assert.equal(workflow.includes('echo "${RUNPOD_API_KEY}"'), false);
    assert.equal(workflow.includes('RUNPOD_RENDER_TEMPLATE_ID: rc8eyeqhn2'), true);
    assert.equal(APPROVED_TEMPLATE_ID !== 'rc8eyeqhn2', true);
    assert.equal(moduleSource.includes("method: 'POST'"), false);
    assert.equal(moduleSource.includes('createGuardedPod'), false);
  });

  it('documents the approved binding and dry-run stop', () => {
    assert.match(docs, /rc8eyeqhn2/);
    assert.match(docs, /TEMPLATE_BOUND/);
    assert.match(docs, /DRY_RUN_ONLY/);
    assert.match(docs, /Do not POST \/v1\/pods/);
    assert.match(docs, /RUNPOD_RENDER_TEMPLATE_ID/);
    assert.equal(docs.includes('payload.env'), true);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_BACKEND_IDENTITY,
  FIXTURE_ASSETS,
  FORBIDDEN_PREVIEW_RENDER_STATES,
  HISTORICAL_ATTEMPT_1_TEMPLATE_ID,
  PAID_AUTHORIZATION_DISABLED,
  PAID_GPU_ENABLED,
  PAID_SMOKE_ATTEMPT_2_TELEMETRY,
  POD_CREATION_ENABLED,
  PROVEN_TEMPLATE_ID,
  PROVEN_WORKER_IMAGE_DIGEST,
  REAL_NETWORK_MUTATION_ENABLED,
  ZERO_MUTATIONS,
  acceptVisualApproval,
  backendIdentityMatches,
  createBrowserPaidAuthorization,
  createReadinessTripwire,
  definePaidRenderAuthorizationContract,
  evaluateCacheEligibility,
  evaluateRenderBackendReadiness,
  fixtureCost,
  fixtureJob,
  fixtureShot,
  fixtureVisualApproval,
  hashJobPackage,
  hashLaunchIntent,
  hashShotDependency,
  hashWorkerManifest,
  buildWorkerManifest,
  issuePaidRenderAuthorization,
  toPreviewReadinessCard,
  ZeroGpuMutationTripwireError,
} from './tivvlejoy-render-backend-readiness';

const repoRoot = path.resolve(__dirname, '../../../..');

function evaluate(overrides: Record<string, unknown> = {}) {
  const shot = fixtureShot((overrides.shot as object) || {});
  const job = fixtureJob(shot);
  return evaluateRenderBackendReadiness({
    jobId: 'job-fixture-001',
    job: { ...job, ...(overrides.job as object) },
    shot,
    requiredAssets: FIXTURE_ASSETS,
    presentAssets: FIXTURE_ASSETS,
    visualApproval: fixtureVisualApproval(hashShotDependency(shot)),
    cost: fixtureCost(),
    ...overrides,
  });
}

describe('TivvleJoy render backend readiness hashes', () => {
  it('is deterministic for the same job and changes when assets change', () => {
    const shot = fixtureShot();
    const job = fixtureJob(shot);
    expect(hashJobPackage(job)).toBe(hashJobPackage(job));
    expect(hashShotDependency(shot)).toBe(hashShotDependency(shot));
    const changedAssets = job.assetReceipts.map((item, index) =>
      index === 0 ? { ...item, sha256: '99'.repeat(32) } : item,
    );
    expect(hashJobPackage({ ...job, assetReceipts: changedAssets })).not.toBe(hashJobPackage(job));
  });

  it('changes shot dependency for camera, lighting, and materials but not notes', () => {
    const base = fixtureShot();
    const noteIgnored = hashShotDependency(base);
    expect(hashShotDependency({ ...base, camera: 'CAM_OTHER' })).not.toBe(noteIgnored);
    expect(hashShotDependency({ ...base, lighting: 'TJ_GOLDEN_HOUR' })).not.toBe(noteIgnored);
    expect(hashShotDependency({ ...base, materials: ['other'] })).not.toBe(noteIgnored);
    expect(noteIgnored).toBe(hashShotDependency(fixtureShot({ camera: base.camera })));
    const withTitle = evaluate({ episodeTitle: 'Edited title', notes: 'ui only' });
    const withoutTitle = evaluate();
    expect(withTitle.shotDependencySha256).toBe(withoutTitle.shotDependencySha256);
    expect(withTitle.jobPackageSha256).toBe(withoutTitle.jobPackageSha256);
  });

  it('hashes the exact worker manifest bytes', () => {
    const job = fixtureJob();
    const manifest = buildWorkerManifest(job);
    expect(hashWorkerManifest(manifest)).toBe(hashWorkerManifest(manifest));
    expect(hashWorkerManifest({ ...manifest, fps: 24 })).not.toBe(hashWorkerManifest(manifest));
  });
});

describe('asset and visual gates', () => {
  it('blocks missing, mismatched, quarantined, and unapproved assets', () => {
    expect(evaluate({ presentAssets: FIXTURE_ASSETS.slice(1) }).status).toBe('BLOCKED_ASSET_MISSING');
    expect(
      evaluate({
        presentAssets: FIXTURE_ASSETS.map((item, index) =>
          index === 0 ? { ...item, sha256: 'aa'.repeat(32) } : item,
        ),
      }).status,
    ).toBe('BLOCKED_HASH_MISMATCH');
    expect(
      evaluate({
        presentAssets: FIXTURE_ASSETS.map((item, index) =>
          index === 2 ? { ...item, quarantined: true, approvalStatus: 'quarantined' } : item,
        ),
      }).status,
    ).toBe('BLOCKED_ASSET_QUARANTINED');
    expect(
      evaluate({
        presentAssets: FIXTURE_ASSETS.map((item, index) =>
          index === 2 ? { ...item, approvalStatus: 'unapproved' } : item,
        ),
      }).status,
    ).toBe('BLOCKED_ASSET_UNAPPROVED');
    expect(
      evaluate({
        presentAssets: FIXTURE_ASSETS.map((item, index) =>
          index === 0 ? { ...item, heroSafe: false, stylizationApproval: 'unapproved' } : item,
        ),
      }).status,
    ).toBe('BLOCKED_ASSET_UNAPPROVED');
  });

  it('enforces visual score bands, blockers, and stale dependency', () => {
    const shot = fixtureShot();
    const dep = hashShotDependency(shot);
    expect(acceptVisualApproval(fixtureVisualApproval(dep, { score: 89, result: 'REVISION_REQUIRED' }), dep).ok).toBe(
      false,
    );
    expect(acceptVisualApproval(fixtureVisualApproval(dep, { score: 90, result: 'VISUALLY_APPROVED' }), dep).ok).toBe(
      true,
    );
    expect(
      acceptVisualApproval(fixtureVisualApproval(dep, { score: 100, hardBlockers: ['PIP_EYES_OCCLUDED'] }), dep).ok,
    ).toBe(false);
    expect(evaluate({ visualApproval: fixtureVisualApproval('0'.repeat(64)) }).status).toBe(
      'BLOCKED_VISUAL_APPROVAL_STALE',
    );
  });
});

describe('backend, cost, and cache', () => {
  it('blocks template, digest, and receipt mismatches', () => {
    expect(backendIdentityMatches({ templateId: HISTORICAL_ATTEMPT_1_TEMPLATE_ID }).ok).toBe(false);
    expect(evaluate({ job: { ...fixtureJob(), templateId: 'other' } }).status).toBe('BLOCKED_BACKEND_MISMATCH');
    expect(evaluate({ job: { ...fixtureJob(), workerImageDigest: 'sha256:deadbeef' } }).status).toBe(
      'BLOCKED_BACKEND_MISMATCH',
    );
    expect(
      backendIdentityMatches({
        templateId: PROVEN_TEMPLATE_ID,
        workerImageDigest: PROVEN_WORKER_IMAGE_DIGEST,
        templateReceiptHash: '0'.repeat(64),
      }).ok,
    ).toBe(false);
  });

  it('blocks cost, runtime, and low-confidence FINAL estimates', () => {
    expect(evaluate({ cost: fixtureCost({ hourlyRateUsd: 0.76 }) }).status).toBe('BLOCKED_COST_ABOVE_CAP');
    expect(evaluate({ cost: fixtureCost({ frameCount: 800, samples: 256 }) }).status).toBe('BLOCKED_RUNTIME_ABOVE_CAP');
    expect(evaluate({ cost: fixtureCost({ renderEngine: 'CYCLES', resolution: '999x999' }) }).status).toBe(
      'BLOCKED_ESTIMATE_LOW_CONFIDENCE',
    );
  });

  it('makes cache eligibility exact-match only', () => {
    const dep = hashShotDependency(fixtureShot());
    expect(evaluateCacheEligibility(dep, dep)).toBe('CACHE_REUSE_ELIGIBLE');
    expect(evaluateCacheEligibility(dep, '1'.repeat(64))).toBe('CACHE_REUSE_NOT_ELIGIBLE');
    expect(evaluate({ cachedShotDependencySha256: dep }).cacheEligibility).toBe('CACHE_REUSE_ELIGIBLE');
    expect(evaluate({ cachedShotDependencySha256: '1'.repeat(64) }).cacheEligibility).toBe(
      'CACHE_REUSE_NOT_ELIGIBLE',
    );
  });
});

describe('zero-GPU modes and paid boundary', () => {
  it('reaches BACKEND_READY_PAID_AUTH_REQUIRED for the proven fixture', () => {
    const receipt = evaluate();
    expect(receipt.status).toBe('BACKEND_READY_PAID_AUTH_REQUIRED');
    expect(receipt.gpuLaunched).toBe(false);
    expect(receipt.paidCompute).toBe(false);
    expect(receipt.launchAuthorized).toBe(false);
    expect(receipt.paidAuthorization).toBe('REQUIRED');
    expect(receipt.providerMutationCount).toBe(0);
    expect(receipt.templateId).toBe(PROVEN_TEMPLATE_ID);
    expect(receipt.estimateConfidence).toBe('HIGH');
    const card = toPreviewReadinessCard(receipt, { episodeLabel: 'EP012', shotLabel: 'SH030' });
    expect(card.backendProven).toBe(true);
    expect(card.gpuLaunched).toBe(false);
    expect(card.status).toBe('BACKEND_READY_PAID_AUTH_REQUIRED');
  });

  it('keeps OFFLINE_READINESS from contacting a provider and LIVE_READONLY GET-only', async () => {
    const offline = evaluate({ mode: 'OFFLINE_READINESS' });
    expect(offline.providerContacted).toBe(false);
    expect(offline.livePriceVerified).toBe(false);
    const recorder = { attempts: [] as Array<{ method: string; url: string }> };
    const fetchFn = createReadinessTripwire(recorder);
    await expect(fetchFn('https://rest.runpod.io/v1/pods', { method: 'POST' })).rejects.toBeInstanceOf(
      ZeroGpuMutationTripwireError,
    );
    expect(evaluate({ mode: 'LIVE_READONLY_PREFLIGHT', live: { stockVerified: true, hourlyRateUsd: 0.74, templateReady: true, compatibleCount: 1 } }).livePriceVerified).toBe(true);
    expect(evaluate({ mode: 'LIVE_READONLY_PREFLIGHT', live: { compatibleCount: 2 } }).status).toBe(
      'BLOCKED_BACKEND_MISMATCH',
    );
  });

  it('never issues paid authorization and keeps defaults false', () => {
    expect(PAID_GPU_ENABLED).toBe(false);
    expect(POD_CREATION_ENABLED).toBe(false);
    expect(REAL_NETWORK_MUTATION_ENABLED).toBe(false);
    expect(definePaidRenderAuthorizationContract({ jobId: 'x', launchIntentSha256: '1'.repeat(64) }).issued).toBe(
      false,
    );
    expect(() => issuePaidRenderAuthorization()).toThrow(PAID_AUTHORIZATION_DISABLED);
    expect(() => createBrowserPaidAuthorization()).toThrow(/Preview cannot fabricate/);
    expect(ZERO_MUTATIONS.postPods).toBe(0);
    expect(ZERO_MUTATIONS.deletePods).toBe(0);
    expect(() =>
      evaluateRenderBackendReadiness({
        jobId: 'x',
        job: fixtureJob(),
        shot: fixtureShot(),
        requiredAssets: FIXTURE_ASSETS,
        presentAssets: FIXTURE_ASSETS,
        visualApproval: null,
        cost: fixtureCost(),
        mutations: { ...ZERO_MUTATIONS, postPods: 1 },
      }),
    ).toThrow(ZeroGpuMutationTripwireError);
  });

  it('excludes secret values and GPU-active Preview states', () => {
    const receipt = evaluate();
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('RUNPOD_API_KEY');
    expect(serialized).not.toContain('R2_SECRET_ACCESS_KEY');
    expect(serialized).not.toContain('"Authorization"');
    expect(serialized).not.toContain('RUNPOD_API_KEY=');
    expect(FORBIDDEN_PREVIEW_RENDER_STATES).toEqual(['RUNNING', 'GPU_STARTING', 'RENDERING']);
    expect(CURRENT_BACKEND_IDENTITY.provenAttempt).toBe('PAID_SMOKE_TEST_PASS');
    expect(PAID_SMOKE_ATTEMPT_2_TELEMETRY.result).toBe('PAID_SMOKE_TEST_PASS');
    expect(hashLaunchIntent({
      jobPackageSha256: receipt.jobPackageSha256,
      workerManifestSha256: receipt.workerManifestSha256,
      shotDependencySha256: receipt.shotDependencySha256,
    })).toBe(receipt.launchIntentSha256);
  });
});

describe('docs and UI contracts', () => {
  it('documents the admission controller and keeps Preview copy TivvleJoy-only', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_RUNPOD_RENDER_BACKEND_READINESS_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/PreviewRenderQueue.tsx'), 'utf8');
    expect(docs).toContain('BACKEND_READY_PAID_AUTH_REQUIRED');
    expect(docs).toContain('34a9iknfuc');
    expect(docs).toContain('PAID_SMOKE_TEST_PASS');
    expect(docs).toContain('ZERO_GPU_MUTATION_TRIPWIRE');
    expect(ui).toContain('BACKEND_READY_PAID_AUTH_REQUIRED');
    expect(ui).not.toMatch(/DoodleDash/i);
    expect(ui).toContain('Paid authorization');
    expect(ui).toContain('GPU launched');
  });
});

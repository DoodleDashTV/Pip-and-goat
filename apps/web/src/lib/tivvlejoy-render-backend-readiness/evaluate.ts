import { classifyRequiredAssets } from './assets';
import {
  acceptVisualApproval,
  buildWorkerManifest,
  evaluateCacheEligibility,
  hashJobPackage,
  hashLaunchIntent,
  hashShotDependency,
  hashWorkerManifest,
} from './contracts';
import { estimateRenderCost, evaluateCostEnvelope } from './cost';
import {
  CURRENT_BACKEND_IDENTITY,
  PAID_GPU_ENABLED,
  PINNED_GPU_TYPE,
  POD_CREATION_ENABLED,
  PROVEN_TEMPLATE_ID,
  PROVEN_TEMPLATE_NAME,
  PROVEN_WORKER_IMAGE_DIGEST,
  REAL_NETWORK_MUTATION_ENABLED,
  backendIdentityMatches,
  imageUsesMutableTag,
} from './identity';
import {
  FORBIDDEN_PREVIEW_RENDER_STATES,
  FORBIDDEN_RECEIPT_KEYS,
  RENDER_BACKEND_READINESS_SCHEMA,
  ZERO_MUTATIONS,
  type AssetRenderReceipt,
  type CostEstimateInput,
  type JobPackageInput,
  type LiveReadonlyObservation,
  type MutationCounts,
  type PreviewReadinessCard,
  type ReadinessMode,
  type ReadinessStatus,
  type RenderBackendReadinessReceipt,
  type ShotDependencyInput,
  type ShotVisualApprovalReceipt,
} from './types';
import { formatRuntime, formatUsd } from './cost';
import { MAX_COMPUTE_USD } from './identity';

export class ZeroGpuMutationTripwireError extends Error {
  readonly code = 'ZERO_GPU_MUTATION_TRIPWIRE';
  constructor(message = 'Zero-GPU readiness refused a forbidden RunPod mutation.') {
    super(message);
    this.name = 'ZeroGpuMutationTripwireError';
  }
}

export function assertZeroMutations(counts: MutationCounts = ZERO_MUTATIONS): void {
  if (
    counts.postPods !== 0 ||
    counts.deletePods !== 0 ||
    counts.patchPods !== 0 ||
    counts.postTemplates !== 0 ||
    counts.patchTemplates !== 0 ||
    counts.deleteTemplates !== 0
  ) {
    throw new ZeroGpuMutationTripwireError();
  }
}

export function createReadinessTripwire(recorder: { attempts: Array<{ method: string; url: string }> } = { attempts: [] }) {
  return async (url: string, init?: RequestInit) => {
    const method = String(init?.method || 'GET').toUpperCase();
    recorder.attempts.push({ method, url: String(url) });
    if (method !== 'GET') {
      throw new ZeroGpuMutationTripwireError(`${method} is forbidden during zero-GPU readiness.`);
    }
    throw new Error('LIVE_READONLY fetch must be injected by the caller.');
  };
}

function receiptHasSecrets(value: unknown): boolean {
  return collectKeys(value).some((key) => FORBIDDEN_RECEIPT_KEYS.includes(key));
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

export type EvaluateReadinessInput = {
  jobId: string;
  mode?: ReadinessMode;
  createdAt?: string;
  job: JobPackageInput;
  shot: ShotDependencyInput;
  requiredAssets: AssetRenderReceipt[];
  presentAssets: AssetRenderReceipt[];
  visualApproval: ShotVisualApprovalReceipt | null;
  cost: CostEstimateInput;
  cachedShotDependencySha256?: string | null;
  declaredHashes?: {
    jobPackageSha256?: string;
    workerManifestSha256?: string;
    shotDependencySha256?: string;
    launchIntentSha256?: string;
  };
  live?: LiveReadonlyObservation;
  mutations?: MutationCounts;
  notes?: string;
  episodeTitle?: string;
};

function finish(
  input: EvaluateReadinessInput,
  hashes: {
    jobPackageSha256: string;
    workerManifestSha256: string;
    shotDependencySha256: string;
    launchIntentSha256: string;
  },
  status: ReadinessStatus,
  extras: Partial<RenderBackendReadinessReceipt>,
): RenderBackendReadinessReceipt {
  const estimate = extras.estimatedTotalSeconds != null ? extras : {};
  const receipt: RenderBackendReadinessReceipt = {
    schemaVersion: RENDER_BACKEND_READINESS_SCHEMA,
    status,
    jobId: input.jobId,
    productionId: input.job.productionId,
    episodeId: input.job.episodeId,
    shotId: input.job.shotId,
    renderProfile: input.job.renderProfile,
    templateId: CURRENT_BACKEND_IDENTITY.templateId,
    templateName: CURRENT_BACKEND_IDENTITY.templateName,
    workerImageDigest: CURRENT_BACKEND_IDENTITY.workerImageDigest,
    templateReceiptHash: CURRENT_BACKEND_IDENTITY.templateReceiptHash,
    ...hashes,
    assetsRequired: input.requiredAssets.length,
    assetsApproved: extras.assetsApproved ?? 0,
    assetReceipts: input.presentAssets,
    shotApproved: extras.shotApproved ?? false,
    visualApprovalVersion: extras.visualApprovalVersion ?? input.visualApproval?.visualApprovalVersion ?? null,
    visualScore: extras.visualScore ?? input.visualApproval?.score ?? null,
    visualResult: extras.visualResult ?? input.visualApproval?.result ?? null,
    hardBlockers: extras.hardBlockers ?? input.visualApproval?.hardBlockers ?? [],
    cacheEligibility: extras.cacheEligibility ?? 'CACHE_REUSE_NOT_ELIGIBLE',
    estimatedStartupSeconds: extras.estimatedStartupSeconds ?? null,
    estimatedRenderSeconds: extras.estimatedRenderSeconds ?? null,
    estimatedTotalSeconds: extras.estimatedTotalSeconds ?? null,
    hourlyRateUsd: extras.hourlyRateUsd ?? input.cost.hourlyRateUsd,
    estimatedComputeUsd: extras.estimatedComputeUsd ?? null,
    worstCaseComputeUsd: extras.worstCaseComputeUsd ?? null,
    estimateConfidence: extras.estimateConfidence ?? null,
    gpuLaunched: false,
    paidCompute: false,
    providerMutationCount: 0,
    paidAuthorization: 'REQUIRED',
    providerContacted: input.mode === 'LIVE_READONLY_PREFLIGHT',
    livePriceVerified: extras.livePriceVerified ?? false,
    launchAuthorized: false,
    mode: input.mode ?? 'OFFLINE_READINESS',
    blockingReason: extras.blockingReason ?? null,
    createdAt: input.createdAt ?? '2026-08-19T00:00:00.000Z',
    ...estimate,
  };
  if (collectKeys(receipt).some((key) => FORBIDDEN_RECEIPT_KEYS.includes(key))) {
    return { ...receipt, status: 'BLOCKED_SECRET_SAFETY', blockingReason: 'Receipt would include a secret key.' };
  }
  if (receiptHasSecrets(receipt)) {
    return { ...receipt, status: 'BLOCKED_SECRET_SAFETY', blockingReason: 'Receipt would include secret material.' };
  }
  return receipt;
}

export function evaluateRenderBackendReadiness(input: EvaluateReadinessInput): RenderBackendReadinessReceipt {
  assertZeroMutations(input.mutations ?? ZERO_MUTATIONS);
  if (PAID_GPU_ENABLED || POD_CREATION_ENABLED || REAL_NETWORK_MUTATION_ENABLED) {
    throw new Error('Paid execution defaults were loosened.');
  }
  const mode = input.mode ?? 'OFFLINE_READINESS';
  const shotDependencySha256 = hashShotDependency(input.shot);
  const job: JobPackageInput = { ...input.job, shotDependencySha256 };
  const manifest = buildWorkerManifest(job);
  const workerManifestSha256 = hashWorkerManifest(manifest);
  const jobPackageSha256 = hashJobPackage(job);
  const launchIntentSha256 = hashLaunchIntent({
    jobPackageSha256,
    workerManifestSha256,
    shotDependencySha256,
  });
  const hashes = { jobPackageSha256, workerManifestSha256, shotDependencySha256, launchIntentSha256 };

  if (FORBIDDEN_PREVIEW_RENDER_STATES.some((state) => String(input.job.renderProfile) === state)) {
    return finish(input, hashes, 'BLOCKED_UNKNOWN', { blockingReason: 'Active GPU states are not Preview states.' });
  }

  const identity = backendIdentityMatches({
    templateId: job.templateId,
    workerImageDigest: job.workerImageDigest,
    templateReceiptHash: CURRENT_BACKEND_IDENTITY.templateReceiptHash,
  });
  if (!identity.ok || imageUsesMutableTag(job.workerImageDigest)) {
    return finish(input, hashes, 'BLOCKED_BACKEND_MISMATCH', {
      blockingReason: identity.ok ? 'Mutable image tag refused.' : identity.reason,
    });
  }

  if (mode === 'LIVE_READONLY_PREFLIGHT') {
    if (input.live?.compatibleCount != null && input.live.compatibleCount !== 1) {
      return finish(input, hashes, 'BLOCKED_BACKEND_MISMATCH', {
        blockingReason: 'Live preflight requires exactly one current compatible backend.',
      });
    }
    if (input.live?.templateReady === false) {
      return finish(input, hashes, 'BLOCKED_BACKEND_MISMATCH', {
        blockingReason: 'Live template is not TEMPLATE_READY.',
      });
    }
  }

  if (input.declaredHashes?.shotDependencySha256 && input.declaredHashes.shotDependencySha256 !== shotDependencySha256) {
    return finish(input, hashes, 'BLOCKED_HASH_MISMATCH', { blockingReason: 'Declared shotDependencySha256 does not match.' });
  }
  if (input.declaredHashes?.jobPackageSha256 && input.declaredHashes.jobPackageSha256 !== jobPackageSha256) {
    return finish(input, hashes, 'BLOCKED_HASH_MISMATCH', { blockingReason: 'Declared jobPackageSha256 does not match.' });
  }
  if (input.declaredHashes?.workerManifestSha256 && input.declaredHashes.workerManifestSha256 !== workerManifestSha256) {
    return finish(input, hashes, 'BLOCKED_HASH_MISMATCH', { blockingReason: 'Declared workerManifestSha256 does not match.' });
  }
  if (input.declaredHashes?.launchIntentSha256 && input.declaredHashes.launchIntentSha256 !== launchIntentSha256) {
    return finish(input, hashes, 'BLOCKED_HASH_MISMATCH', { blockingReason: 'Declared launchIntentSha256 does not match.' });
  }

  const assets = classifyRequiredAssets(input.requiredAssets, input.presentAssets);
  if (!assets.ok) {
    return finish(input, hashes, assets.code, { blockingReason: assets.reason, assetsApproved: 0 });
  }

  const cacheEligibility = evaluateCacheEligibility(shotDependencySha256, input.cachedShotDependencySha256 ?? null);

  if (job.renderProfile === 'FINAL') {
    const visual = acceptVisualApproval(input.visualApproval, shotDependencySha256);
    if (!visual.ok) {
      return finish(input, hashes, visual.code as ReadinessStatus, {
        blockingReason: visual.reason,
        assetsApproved: assets.approved,
        cacheEligibility,
        shotApproved: false,
      });
    }
  }

  const estimate = estimateRenderCost(input.cost);
  if (job.renderProfile === 'FINAL' && estimate.estimateConfidence === 'LOW') {
    return finish(input, hashes, 'BLOCKED_ESTIMATE_LOW_CONFIDENCE', {
      blockingReason: 'FINAL paid readiness requires more than LOW estimate confidence.',
      assetsApproved: assets.approved,
      cacheEligibility,
      shotApproved: Boolean(input.visualApproval),
      ...estimate,
    });
  }
  const envelope = evaluateCostEnvelope(estimate);
  if (!envelope.ok) {
    return finish(input, hashes, envelope.code, {
      blockingReason: envelope.reason,
      assetsApproved: assets.approved,
      cacheEligibility,
      ...estimate,
    });
  }

  const livePriceVerified =
    mode === 'LIVE_READONLY_PREFLIGHT' &&
    input.live?.stockVerified === true &&
    typeof input.live.hourlyRateUsd === 'number' &&
    input.live.hourlyRateUsd <= 0.75;

  const readyStatus =
    job.renderProfile === 'FINAL' ? 'BACKEND_READY_PAID_AUTH_REQUIRED' : 'ZERO_GPU_READY';

  return finish(input, hashes, readyStatus, {
    assetsApproved: assets.approved,
    cacheEligibility,
    shotApproved: job.renderProfile === 'FINAL' ? true : Boolean(input.visualApproval),
    visualApprovalVersion: input.visualApproval?.visualApprovalVersion ?? null,
    visualScore: input.visualApproval?.score ?? null,
    visualResult: input.visualApproval?.result ?? null,
    hardBlockers: input.visualApproval?.hardBlockers ?? [],
    livePriceVerified,
    blockingReason: null,
    ...estimate,
  });
}

export function toPreviewReadinessCard(
  receipt: RenderBackendReadinessReceipt,
  labels?: { episodeLabel?: string; shotLabel?: string },
): PreviewReadinessCard {
  return {
    episodeLabel: labels?.episodeLabel ?? receipt.episodeId,
    shotLabel: labels?.shotLabel ?? receipt.shotId,
    status: receipt.status,
    backendProven:
      receipt.templateId === PROVEN_TEMPLATE_ID &&
      receipt.templateName === PROVEN_TEMPLATE_NAME &&
      receipt.workerImageDigest === PROVEN_WORKER_IMAGE_DIGEST,
    hashesVerified: Boolean(receipt.jobPackageSha256 && receipt.launchIntentSha256),
    assetsApprovedLabel: `${receipt.assetsApproved} / ${receipt.assetsRequired} approved`,
    shotApprovalLabel: receipt.visualResult
      ? `${receipt.visualResult} — ${receipt.visualScore ?? '—'}/100`
      : 'unavailable',
    cacheLabel:
      receipt.cacheEligibility === 'CACHE_REUSE_ELIGIBLE' ? 'Exact dependency match' : 'No matching final',
    estimatedRuntimeLabel: formatRuntime(receipt.estimatedTotalSeconds),
    gpuLabel: `Secure ${PINNED_GPU_TYPE.replace('NVIDIA GeForce ', '')}`,
    hourlyQuoteLabel: formatUsd(receipt.hourlyRateUsd),
    estimatedComputeLabel: formatUsd(receipt.estimatedComputeUsd),
    maximumCostLabel: formatUsd(MAX_COMPUTE_USD),
    providerContacted: false,
    gpuLaunched: false,
    paidAuthorization: 'REQUIRED',
    blockingReason: receipt.blockingReason,
  };
}

/**
 * Cloud cost / safety config — env overrides + studio settings merge.
 * Defaults are intentionally conservative. CLOUD_RENDER_ENABLED=false until explicit enable.
 */
import type { CloudCostLimits } from './types';

export const DEFAULT_CLOUD_COST_LIMITS: CloudCostLimits = {
  cloudRenderEnabled: false,
  maxGpuHourlyPrice: 0.8,
  maxSingleJobCost: 2.0,
  maxDailyGpuCost: 10.0,
  maxMonthlyGpuCost: 50.0,
  idleShutdownMinutes: 5,
  maxJobRuntimeMinutes: 180,
  allowPaidGpuLaunch: false,
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve limits from process env (never embeds secret values). */
export function resolveCloudCostLimitsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CloudCostLimits {
  return {
    cloudRenderEnabled: envBoolFrom(env, 'CLOUD_RENDER_ENABLED', DEFAULT_CLOUD_COST_LIMITS.cloudRenderEnabled),
    maxGpuHourlyPrice: envNumberFrom(env, 'MAX_GPU_HOURLY_PRICE', DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice),
    maxSingleJobCost: envNumberFrom(env, 'MAX_SINGLE_JOB_COST', DEFAULT_CLOUD_COST_LIMITS.maxSingleJobCost),
    maxDailyGpuCost: envNumberFrom(env, 'MAX_DAILY_GPU_COST', DEFAULT_CLOUD_COST_LIMITS.maxDailyGpuCost),
    maxMonthlyGpuCost: envNumberFrom(env, 'MAX_MONTHLY_GPU_COST', DEFAULT_CLOUD_COST_LIMITS.maxMonthlyGpuCost),
    idleShutdownMinutes: envNumberFrom(
      env,
      'IDLE_SHUTDOWN_MINUTES',
      DEFAULT_CLOUD_COST_LIMITS.idleShutdownMinutes,
    ),
    maxJobRuntimeMinutes: envNumberFrom(
      env,
      'MAX_JOB_RUNTIME_MINUTES',
      DEFAULT_CLOUD_COST_LIMITS.maxJobRuntimeMinutes,
    ),
    allowPaidGpuLaunch: envBoolFrom(env, 'ALLOW_PAID_GPU_LAUNCH', DEFAULT_CLOUD_COST_LIMITS.allowPaidGpuLaunch),
  };
}

function envBoolFrom(env: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function envNumberFrom(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function mergeCloudCostLimits(
  base: CloudCostLimits,
  overrides: Partial<CloudCostLimits> | null | undefined,
): CloudCostLimits {
  return { ...base, ...(overrides ?? {}) };
}

export const PREFERRED_RUNPOD_GPU_TYPES = [
  'NVIDIA GeForce RTX 4090',
  'NVIDIA GeForce RTX 5090',
  'NVIDIA L40S',
  'NVIDIA L40',
  'NVIDIA RTX A6000',
  'NVIDIA RTX 6000 Ada Generation',
] as const;

export const DEFAULT_BLENDER_VERSION = '4.2';
export const CLOUD_JOB_MANIFEST_SCHEMA = 'ddp-cloud-job-manifest-v1' as const;

/**
 * Trusted registry for the published Runpod GPU worker image. The image is
 * built + pushed by CI (workers/runpod-blender/Dockerfile) and MUST be pinned
 * by an immutable @sha256 digest so a paid pod always boots the exact bytes we
 * smoke-tested. Mutable tags (e.g. :latest) are rejected on purpose.
 */
export const RUNPOD_WORKER_IMAGE_REGISTRY = 'ghcr.io' as const;

/** Read the configured Runpod worker image reference (never a secret). */
export function resolveRunpodWorkerImage(
  env: Record<string, string | undefined> = process.env,
): string {
  return String(env.RUNPOD_WORKER_IMAGE ?? '').trim();
}

export type WorkerImageValidation = {
  ok: boolean;
  ref: string;
  code:
    | 'OK'
    | 'WORKER_IMAGE_MISSING'
    | 'WORKER_IMAGE_UNTRUSTED_REGISTRY'
    | 'WORKER_IMAGE_MUTABLE_TAG'
    | 'WORKER_IMAGE_NOT_PINNED'
    | 'WORKER_IMAGE_BAD_DIGEST'
    | 'WORKER_IMAGE_MALFORMED';
  reason: string;
  registry: string | null;
  repository: string | null;
  digest: string | null;
};

/**
 * Fail-closed validation of a worker image reference. Accepts ONLY an
 * immutable ghcr.io reference pinned by @sha256 digest, e.g.
 *   ghcr.io/OWNER/ddp-runpod-blender@sha256:<64-hex>
 * Rejects empty, non-ghcr.io, mutable (:latest / tag-only) and malformed refs.
 */
export function validateRunpodWorkerImageRef(ref: string | undefined): WorkerImageValidation {
  const value = String(ref ?? '').trim();
  const base: Pick<WorkerImageValidation, 'ref' | 'registry' | 'repository' | 'digest'> = {
    ref: value,
    registry: null,
    repository: null,
    digest: null,
  };

  if (!value) {
    return {
      ...base,
      ok: false,
      code: 'WORKER_IMAGE_MISSING',
      reason: 'RUNPOD_WORKER_IMAGE is not configured. Set the immutable @sha256 worker image digest.',
    };
  }

  const atIndex = value.indexOf('@');
  if (atIndex === -1) {
    // No digest at all — a tag-only reference is mutable and rejected.
    if (/:latest$/i.test(value)) {
      return { ...base, ok: false, code: 'WORKER_IMAGE_MUTABLE_TAG', reason: 'Mutable :latest tag is not allowed; pin the @sha256 digest.' };
    }
    return {
      ...base,
      ok: false,
      code: 'WORKER_IMAGE_NOT_PINNED',
      reason: 'Worker image must be pinned by an immutable @sha256 digest (repo@sha256:...).',
    };
  }

  const repoPart = value.slice(0, atIndex);
  const digest = value.slice(atIndex + 1);

  // Reject a mutable tag even when a digest is present (e.g. repo:latest@sha256:...).
  if (/:latest$/i.test(repoPart)) {
    return { ...base, ref: value, registry: null, repository: null, digest, ok: false, code: 'WORKER_IMAGE_MUTABLE_TAG', reason: 'Mutable :latest tag is not allowed; use the bare repo@sha256 digest.' };
  }

  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    return { ...base, digest, ok: false, code: 'WORKER_IMAGE_BAD_DIGEST', reason: 'Worker image digest must be sha256:<64 lowercase hex>.' };
  }

  // Strip an optional (non-latest) tag from the repo portion for parsing.
  const repoNoTag = repoPart.replace(/:[^/:@]+$/, '');
  const slash = repoNoTag.indexOf('/');
  const registry = slash === -1 ? '' : repoNoTag.slice(0, slash);
  const repository = slash === -1 ? repoNoTag : repoNoTag.slice(slash + 1);

  if (registry.toLowerCase() !== RUNPOD_WORKER_IMAGE_REGISTRY) {
    return {
      ...base,
      digest,
      registry: registry || null,
      repository: repository || null,
      ok: false,
      code: 'WORKER_IMAGE_UNTRUSTED_REGISTRY',
      reason: `Worker image must be hosted on ${RUNPOD_WORKER_IMAGE_REGISTRY} (got '${registry || 'none'}').`,
    };
  }

  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/.test(repository)) {
    return {
      ...base,
      digest,
      registry,
      repository: repository || null,
      ok: false,
      code: 'WORKER_IMAGE_MALFORMED',
      reason: `Worker image repository path is malformed: '${repository}'.`,
    };
  }

  return {
    ok: true,
    ref: value,
    code: 'OK',
    reason: 'Worker image pinned by immutable @sha256 digest on ghcr.io.',
    registry,
    repository,
    digest,
  };
}

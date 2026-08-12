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

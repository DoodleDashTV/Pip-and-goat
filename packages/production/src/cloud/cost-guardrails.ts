/**
 * Cost guardrails — refuse new paid jobs when projected/actual limits exceeded (Phase 12).
 */
import { resolveCloudCostLimitsFromEnv, mergeCloudCostLimits, DEFAULT_CLOUD_COST_LIMITS } from './config';
import type { CloudCostLimits, CostEstimate, CostGuardDecision } from './types';

export type SpendSnapshot = {
  dailySpentUsd: number;
  monthlySpentUsd: number;
};

export class CloudCostGuardrails {
  constructor(private readonly limits: CloudCostLimits = resolveCloudCostLimitsFromEnv()) {}

  static fromPartial(overrides: Partial<CloudCostLimits>): CloudCostGuardrails {
    return new CloudCostGuardrails(mergeCloudCostLimits(DEFAULT_CLOUD_COST_LIMITS, overrides));
  }

  getLimits(): CloudCostLimits {
    return { ...this.limits };
  }

  evaluate(input: {
    estimate: CostEstimate;
    spend?: SpendSnapshot;
    paidGpuApproved?: boolean;
  }): CostGuardDecision {
    const limits = this.limits;
    const spend = input.spend ?? { dailySpentUsd: 0, monthlySpentUsd: 0 };

    if (!limits.cloudRenderEnabled) {
      return {
        allowed: false,
        reason: 'CLOUD_RENDER_ENABLED=false — cloud rendering is disabled until explicitly enabled.',
        code: 'CLOUD_RENDER_DISABLED',
        limits,
        estimate: input.estimate,
      };
    }

    if (input.paidGpuApproved === false) {
      return {
        allowed: false,
        reason: 'Paid GPU launch not approved. Waiting for explicit user approval.',
        code: 'PAID_GPU_NOT_APPROVED',
        limits,
        estimate: input.estimate,
      };
    }

    if (input.estimate.gpuHourlyPriceUsd > limits.maxGpuHourlyPrice) {
      return {
        allowed: false,
        reason: `GPU hourly price $${input.estimate.gpuHourlyPriceUsd} exceeds MAX_GPU_HOURLY_PRICE $${limits.maxGpuHourlyPrice}.`,
        code: 'HOURLY_PRICE_EXCEEDED',
        limits,
        estimate: input.estimate,
      };
    }

    if (input.estimate.estimatedCostUsd > limits.maxSingleJobCost) {
      return {
        allowed: false,
        reason: `Estimated job cost $${input.estimate.estimatedCostUsd} exceeds MAX_SINGLE_JOB_COST $${limits.maxSingleJobCost}.`,
        code: 'JOB_COST_EXCEEDED',
        limits,
        estimate: input.estimate,
      };
    }

    if (spend.dailySpentUsd + input.estimate.estimatedCostUsd > limits.maxDailyGpuCost) {
      return {
        allowed: false,
        reason: `Projected daily spend $${(spend.dailySpentUsd + input.estimate.estimatedCostUsd).toFixed(4)} exceeds MAX_DAILY_GPU_COST $${limits.maxDailyGpuCost}.`,
        code: 'DAILY_COST_EXCEEDED',
        limits,
        estimate: input.estimate,
      };
    }

    if (spend.monthlySpentUsd + input.estimate.estimatedCostUsd > limits.maxMonthlyGpuCost) {
      return {
        allowed: false,
        reason: `Projected monthly spend $${(spend.monthlySpentUsd + input.estimate.estimatedCostUsd).toFixed(4)} exceeds MAX_MONTHLY_GPU_COST $${limits.maxMonthlyGpuCost}.`,
        code: 'MONTHLY_COST_EXCEEDED',
        limits,
        estimate: input.estimate,
      };
    }

    return {
      allowed: true,
      reason: 'Within configured cloud cost guardrails.',
      code: 'OK',
      limits,
      estimate: input.estimate,
    };
  }
}

export const cloudCostGuardrails = new CloudCostGuardrails();

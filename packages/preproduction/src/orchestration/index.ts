/**
 * Local render orchestration contracts: cache, retry, recovery, spend.
 *
 * Advisory only. Cannot authorize a paid GPU. Defaults refuse cloud spend.
 * Recovery is local-draft only — a failed animatic clip retries from its cache
 * key, never by launching a pod.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { AnimaticPlan } from '../animatic';
import type { ShotPlan } from '../shotplan';

export const RetryPolicySchema = z.object({
  maxAttempts: z.literal(3),
  backoffSeconds: z.tuple([z.literal(1), z.literal(2), z.literal(4)]),
  paidRetryAllowed: z.literal(false),
});

export const SpendPolicySchema = z.object({
  cloudRenderEnabled: z.literal(false),
  allowPaidGpuLaunch: z.literal(false),
  maxLocalDraftUsd: z.literal(0),
  refuseIfEstimatePositive: z.literal(true),
});

export const RecoveryActionSchema = z.object({
  clipId: z.string(),
  action: z.enum(['REUSE_CACHE', 'RETRY_LOCAL_DRAFT', 'FAIL_CLOSED']),
  cacheKey: z.string(),
});

export const OrchestrationPlanSchema = z.object({
  episodeId: z.string(),
  retry: RetryPolicySchema,
  spend: SpendPolicySchema,
  cacheKeys: z.array(z.string()),
  recovery: z.array(RecoveryActionSchema),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.orchestration),
});
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>;

export function planOrchestration(
  animatic: AnimaticPlan,
  shotPlan: ShotPlan,
): { orchestration: OrchestrationPlan; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const cacheKeys = [animatic.cacheKey, shotPlan.cacheKey, ...animatic.clips.map((clip) => clip.clipId)];
  const recovery = animatic.clips.map((clip) => ({
    clipId: clip.clipId,
    action: 'REUSE_CACHE' as const,
    cacheKey: `${animatic.cacheKey}:${clip.clipId}`,
  }));

  if (animatic.renderTier !== 'DRAFT') {
    issues.push({
      code: 'ORCHESTRATION_NON_DRAFT',
      severity: 'ERROR',
      system: 'orchestration',
      message: 'Local orchestration only accepts DRAFT animatics.',
    });
  }

  const orchestration = OrchestrationPlanSchema.parse({
    episodeId: animatic.episodeId,
    retry: { maxAttempts: 3, backoffSeconds: [1, 2, 4], paidRetryAllowed: false },
    spend: {
      cloudRenderEnabled: false,
      allowPaidGpuLaunch: false,
      maxLocalDraftUsd: 0,
      refuseIfEstimatePositive: true,
    },
    cacheKeys,
    recovery,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.orchestration,
  });
  orchestration.cacheKey = stableHash({
    version: orchestration.version,
    retry: orchestration.retry,
    spend: orchestration.spend,
    cacheKeys,
  });

  return { orchestration, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}

export function evaluateLocalSpend(estimateUsd: number): { allowed: boolean; code: string } {
  if (estimateUsd > 0) {
    return { allowed: false, code: 'PREPRODUCTION_SPEND_REFUSED' };
  }
  return { allowed: true, code: 'LOCAL_ZERO_COST' };
}

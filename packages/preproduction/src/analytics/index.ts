/**
 * Draft analytics and cost estimation.
 *
 * Estimates are always $0. A positive estimate is refused. This never
 * authorizes spend, a paid GPU, or a cloud render.
 */
import { evaluatePaidResourcePolicy } from '../launch-safety';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { WorkflowRun } from '../workflow';

export function estimateDraftCost(input: { estimateUsd?: number } = {}): {
  estimatedUsd: 0;
  paidAuthorized: false;
  cloudRenderEnabled: false;
  refused: boolean;
  code: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.analytics;
} {
  const requested = input.estimateUsd ?? 0;
  const policy = evaluatePaidResourcePolicy({ estimateUsd: requested });
  return {
    estimatedUsd: 0,
    paidAuthorized: false,
    cloudRenderEnabled: false,
    refused: requested > 0 || !policy.allowed,
    code: requested > 0 ? policy.code : 'LOCAL_ZERO_COST',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.analytics,
  };
}

export function draftAnalytics(run: WorkflowRun): {
  episodeId: string;
  beatCount: number;
  shotCount: number;
  clipCount: number;
  errorCount: number;
  outputClass: string;
  label: 'DRAFT_NONCANONICAL';
  cost: ReturnType<typeof estimateDraftCost>;
} {
  return {
    episodeId: run.episodeId,
    beatCount: run.bundle.draft.beats.length,
    shotCount: run.bundle.shotPlan.shots.length,
    clipCount: run.bundle.animatic.clips.length,
    errorCount: run.issues.filter((issue) => issue.severity === 'ERROR').length,
    outputClass: run.bundle.outputClass,
    label: 'DRAFT_NONCANONICAL',
    cost: estimateDraftCost(),
  };
}

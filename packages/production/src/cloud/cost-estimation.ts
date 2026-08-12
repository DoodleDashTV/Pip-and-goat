/**
 * GPU cost estimation before paid render starts (Phase 11).
 */
import type { CloudRenderProfile, CostEstimate } from './types';

export type EstimateCloudRenderInput = {
  frameCount: number;
  resolution: string;
  profile: CloudRenderProfile;
  gpuType: string;
  gpuHourlyPriceUsd: number;
  /** Historical seconds per frame when known. */
  historicalSecondsPerFrame?: number | null;
  encodeOverheadMinutes?: number;
  assetSyncMinutes?: number;
};

const DEFAULT_SECONDS_PER_FRAME: Record<CloudRenderProfile, number> = {
  AUDIT_FAST: 0.4,
  DRAFT_FAST: 1.2,
  DRAFT_HD: 2.0,
  FINAL_1080P: 3.5,
  PREMIUM: 8.0,
};

export function estimateCloudRenderCost(input: EstimateCloudRenderInput): CostEstimate {
  const spf =
    input.historicalSecondsPerFrame && input.historicalSecondsPerFrame > 0
      ? input.historicalSecondsPerFrame
      : DEFAULT_SECONDS_PER_FRAME[input.profile];

  const renderSeconds = input.frameCount * spf;
  const overheadMinutes = (input.encodeOverheadMinutes ?? 1) + (input.assetSyncMinutes ?? 2);
  const estimatedRuntimeMinutes = Number((renderSeconds / 60 + overheadMinutes).toFixed(3));
  const estimatedGpuHours = Number((estimatedRuntimeMinutes / 60).toFixed(4));
  const estimatedCostUsd = Number((estimatedGpuHours * input.gpuHourlyPriceUsd).toFixed(4));

  let confidence: CostEstimate['confidence'] = 'LOW';
  if (input.historicalSecondsPerFrame && input.historicalSecondsPerFrame > 0) {
    confidence = 'HIGH';
  } else if (input.profile === 'AUDIT_FAST' || input.profile === 'DRAFT_FAST') {
    confidence = 'MEDIUM';
  }

  return {
    estimatedGpuHours,
    estimatedCostUsd,
    confidence,
    gpuType: input.gpuType,
    gpuHourlyPriceUsd: input.gpuHourlyPriceUsd,
    estimatedRuntimeMinutes,
    frameCount: input.frameCount,
    assumptions: {
      secondsPerFrame: spf,
      historical: Boolean(input.historicalSecondsPerFrame),
      resolution: input.resolution,
      profile: input.profile,
      overheadMinutes,
      note: 'Estimate only — actual cost stored after completion from measured runtime × hourly price.',
    },
  };
}

export function actualCostFromRuntime(input: {
  runtimeMinutes: number;
  gpuHourlyPriceUsd: number;
}): { actualGpuHours: number; actualCostUsd: number } {
  const actualGpuHours = Number((input.runtimeMinutes / 60).toFixed(4));
  const actualCostUsd = Number((actualGpuHours * input.gpuHourlyPriceUsd).toFixed(4));
  return { actualGpuHours, actualCostUsd };
}

/** Rough Season 1 projection helper (60 × ~60s episodes). */
export function estimateSeasonGpuCost(input: {
  costPer60sEpisodeUsd: number;
  episodeCount?: number;
}): { episodeCount: number; estimatedSeasonGpuCostUsd: number } {
  const episodeCount = input.episodeCount ?? 60;
  return {
    episodeCount,
    estimatedSeasonGpuCostUsd: Number((input.costPer60sEpisodeUsd * episodeCount).toFixed(2)),
  };
}

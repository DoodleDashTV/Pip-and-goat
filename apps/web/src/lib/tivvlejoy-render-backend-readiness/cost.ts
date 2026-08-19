import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
} from './identity';
import type { CostEstimate, CostEstimateInput, ReadinessBlockedState } from './types';

/**
 * Attempt #2 paid-smoke telemetry. Do not fabricate additional runs.
 * 8 frames, 1080x1920, 30 fps, EEVEE, 24 samples, Secure RTX 4090.
 */
export const PAID_SMOKE_ATTEMPT_2_TELEMETRY = Object.freeze({
  jobId: 'tjsmo20260819105505',
  podId: 'iqgio6a31mpf5z',
  result: 'PAID_SMOKE_TEST_PASS',
  frames: 8,
  resolution: '1080x1920',
  fps: 30,
  engine: 'EEVEE',
  samples: 24,
  startupSeconds: 476,
  assetDownloadSeconds: 11.62,
  renderSeconds: 46.218,
  encodeSeconds: 0.69,
  uploadSeconds: 12.636,
  totalJobSeconds: 71.164,
  hourlyRateUsd: 0.74,
});

const RESOLUTION_PIXELS: Record<string, number> = {
  '270x480': 270 * 480,
  '540x960': 540 * 960,
  '1080x1920': 1080 * 1920,
};

function pixels(resolution: string): number {
  if (RESOLUTION_PIXELS[resolution]) return RESOLUTION_PIXELS[resolution];
  const match = /^(\d+)x(\d+)$/.exec(resolution);
  if (!match) return RESOLUTION_PIXELS['1080x1920'];
  return Number(match[1]) * Number(match[2]);
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateRenderCost(input: CostEstimateInput): CostEstimate {
  const comparable =
    input.renderEngine === PAID_SMOKE_ATTEMPT_2_TELEMETRY.engine &&
    input.resolution === PAID_SMOKE_ATTEMPT_2_TELEMETRY.resolution;
  const exact =
    comparable &&
    input.frameCount === PAID_SMOKE_ATTEMPT_2_TELEMETRY.frames &&
    input.samples === PAID_SMOKE_ATTEMPT_2_TELEMETRY.samples &&
    input.renderProfile === 'FINAL';

  const pixelScale = pixels(input.resolution) / pixels(PAID_SMOKE_ATTEMPT_2_TELEMETRY.resolution);
  const frameScale = input.frameCount / PAID_SMOKE_ATTEMPT_2_TELEMETRY.frames;
  const sampleScale = Math.max(1, input.samples) / PAID_SMOKE_ATTEMPT_2_TELEMETRY.samples;
  const complexity =
    1 +
    Math.min(0.4, (input.visibleTriangles ?? 0) / 5_000_000) +
    (input.volumetrics ? 0.15 : 0) +
    (input.simulations ? 0.2 : 0) +
    Math.min(0.2, (input.scatterDensity ?? 0) / 10);

  const estimatedStartupSeconds = PAID_SMOKE_ATTEMPT_2_TELEMETRY.startupSeconds;
  const estimatedRenderSeconds = Number(
    (PAID_SMOKE_ATTEMPT_2_TELEMETRY.renderSeconds * frameScale * pixelScale * sampleScale * complexity).toFixed(3),
  );
  const estimatedEncodeSeconds = Number(
    (PAID_SMOKE_ATTEMPT_2_TELEMETRY.encodeSeconds * Math.max(1, frameScale)).toFixed(3),
  );
  const estimatedUploadSeconds = PAID_SMOKE_ATTEMPT_2_TELEMETRY.uploadSeconds;
  const estimatedTotalSeconds = Number(
    (estimatedStartupSeconds + estimatedRenderSeconds + estimatedEncodeSeconds + estimatedUploadSeconds).toFixed(3),
  );
  const worstCaseSeconds = Number(
    (
      estimatedStartupSeconds +
      estimatedRenderSeconds * 1.25 +
      estimatedEncodeSeconds +
      estimatedUploadSeconds
    ).toFixed(3),
  );

  const hourly = input.hourlyRateUsd;
  const estimatedComputeUsd = roundUsd((hourly * estimatedTotalSeconds) / 3600);
  const worstCaseComputeUsd = roundUsd((hourly * worstCaseSeconds) / 3600);

  let estimateConfidence: CostEstimate['estimateConfidence'] = 'LOW';
  if (exact) estimateConfidence = 'HIGH';
  else if (comparable && input.renderProfile !== 'PLANNING') estimateConfidence = 'MEDIUM';

  return {
    estimatedStartupSeconds,
    estimatedRenderSeconds,
    estimatedEncodeSeconds,
    estimatedUploadSeconds,
    estimatedTotalSeconds,
    hourlyRateUsd: hourly,
    estimatedComputeUsd,
    worstCaseComputeUsd,
    estimateConfidence,
    telemetrySource: 'PAID_SMOKE_ATTEMPT_2',
  };
}

export function evaluateCostEnvelope(estimate: CostEstimate): {
  ok: true;
} | { ok: false; code: ReadinessBlockedState; reason: string } {
  if (!Number.isFinite(estimate.hourlyRateUsd) || estimate.hourlyRateUsd <= 0) {
    return { ok: false, code: 'BLOCKED_COST_ABOVE_CAP', reason: 'Hourly rate cannot be verified.' };
  }
  if (estimate.hourlyRateUsd > MAX_HOURLY_USD) {
    return { ok: false, code: 'BLOCKED_COST_ABOVE_CAP', reason: `Hourly rate ${estimate.hourlyRateUsd} exceeds $0.75.` };
  }
  if (estimate.estimatedTotalSeconds > MAX_RUNTIME_MINUTES * 60) {
    return {
      ok: false,
      code: 'BLOCKED_RUNTIME_ABOVE_CAP',
      reason: `Estimated runtime ${estimate.estimatedTotalSeconds}s exceeds 20 minutes.`,
    };
  }
  if (estimate.worstCaseComputeUsd > MAX_COMPUTE_USD || estimate.estimatedComputeUsd > MAX_COMPUTE_USD) {
    return {
      ok: false,
      code: 'BLOCKED_COST_ABOVE_CAP',
      reason: `Worst-case compute ${estimate.worstCaseComputeUsd} exceeds $0.25.`,
    };
  }
  return { ok: true };
}

export function formatRuntime(seconds: number | null): string {
  if (seconds == null) return 'unavailable';
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rem = whole % 60;
  return `${minutes}m ${String(rem).padStart(2, '0')}s`;
}

export function formatUsd(value: number | null): string {
  if (value == null) return 'unavailable';
  return `$${value.toFixed(3)}`;
}

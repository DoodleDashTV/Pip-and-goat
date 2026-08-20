import { sha256Canonical } from './hash';
import { BUDGET_PLAN_SCHEMA, RENDER_COST_SCHEMA, SEASON_SCHEDULE_SCHEMA, DAILY_QUEUE_SCHEMA } from './types';

export type RenderCostForecast = {
  schemaVersion: typeof RENDER_COST_SCHEMA;
  estimatedFrameCount: number;
  estimatedRenderMinutes: number;
  estimatedComputeHours: number;
  estimatedCost: number;
  confidence: 'LOW_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'HIGH_CONFIDENCE';
  assumptions: string[];
  authorizationIssued: false;
  forecastSha256: string;
};

export function forecastRenderCost(input: {
  shots: number;
  secondsPerShot: number;
  fps?: number;
  qualityTier: 'PREVIEW' | 'REVIEW' | 'FINAL';
  usdPerGpuHour?: number;
  framesPerMinute?: number;
  reuseRatio?: number;
}): RenderCostForecast {
  const fps = input.fps ?? 30;
  const frames = Math.round(input.shots * input.secondsPerShot * fps * (1 - (input.reuseRatio ?? 0)));
  const framesPerMinute = input.framesPerMinute ?? (input.qualityTier === 'FINAL' ? 20 : input.qualityTier === 'REVIEW' ? 60 : 180);
  const minutes = frames / framesPerMinute;
  const hours = minutes / 60;
  const rate = input.usdPerGpuHour ?? 0;
  const body = {
    schemaVersion: RENDER_COST_SCHEMA,
    estimatedFrameCount: frames,
    estimatedRenderMinutes: Number(minutes.toFixed(2)),
    estimatedComputeHours: Number(hours.toFixed(3)),
    estimatedCost: Number((hours * rate).toFixed(2)),
    confidence: input.usdPerGpuHour == null ? 'LOW_CONFIDENCE' : input.framesPerMinute ? 'MEDIUM_CONFIDENCE' : 'LOW_CONFIDENCE',
    assumptions: [
      `quality=${input.qualityTier}`,
      `fps=${fps}`,
      `reuseRatio=${input.reuseRatio ?? 0}`,
      'Caller-supplied rates only. No provider was contacted.',
    ],
    authorizationIssued: false as const,
  };
  return { ...body, forecastSha256: sha256Canonical(body) };
}

export function forecastSeasonCost(episodes = 60, shotsPerEpisode = 12) {
  return {
    PREVIEW: forecastRenderCost({ shots: episodes * shotsPerEpisode, secondsPerShot: 4, qualityTier: 'PREVIEW', reuseRatio: 0.35 }),
    REVIEW: forecastRenderCost({ shots: episodes * shotsPerEpisode, secondsPerShot: 4, qualityTier: 'REVIEW', reuseRatio: 0.2 }),
    FINAL: forecastRenderCost({ shots: episodes * shotsPerEpisode, secondsPerShot: 4, qualityTier: 'FINAL', reuseRatio: 0.05 }),
  };
}

export type BudgetPlan = {
  schemaVersion: typeof BUDGET_PLAN_SCHEMA;
  estimatedUsd: number;
  budgetCapUsd: number | null;
  withinCap: boolean | null;
  humanAuthorizationRequired: true;
  authorizationIssued: false;
  categories: Record<'VOICE' | 'RENDER' | 'STORAGE' | 'OPTIONAL_ASSETS' | 'OPTIONAL_TOOLS', number>;
  assumptions: string[];
};

export function planBudget(input: {
  rates?: Partial<Record<'VOICE' | 'RENDER' | 'STORAGE' | 'OPTIONAL_ASSETS' | 'OPTIONAL_TOOLS', number>>;
  budgetCapUsd?: number;
}): BudgetPlan {
  const categories = {
    VOICE: input.rates?.VOICE ?? 0,
    RENDER: input.rates?.RENDER ?? 0,
    STORAGE: input.rates?.STORAGE ?? 0,
    OPTIONAL_ASSETS: input.rates?.OPTIONAL_ASSETS ?? 0,
    OPTIONAL_TOOLS: input.rates?.OPTIONAL_TOOLS ?? 0,
  };
  const estimatedUsd = Object.values(categories).reduce((sum, value) => sum + value, 0);
  return {
    schemaVersion: BUDGET_PLAN_SCHEMA,
    estimatedUsd,
    budgetCapUsd: input.budgetCapUsd ?? null,
    withinCap: input.budgetCapUsd == null ? null : estimatedUsd <= input.budgetCapUsd,
    humanAuthorizationRequired: true,
    authorizationIssued: false,
    categories,
    assumptions: ['Caller-supplied rates only. This plan is not spend authorization.'],
  };
}

export function planSeasonSchedule(episodes = 60) {
  return {
    schemaVersion: SEASON_SCHEDULE_SCHEMA,
    batches: [
      { name: 'story/directing', episodes, parallel: true },
      { name: 'voice prep', episodes, blockedUnlessVoice: true },
      { name: 'scenery prep', sharedLocations: true },
      { name: 'animation prep', blockedUnlessRigs: true },
      { name: 'camera/staging', episodes },
      { name: 'editorial', episodes },
      { name: 'review', capacityBound: true },
      { name: 'render', authorizationRequired: true },
      { name: 'QC', episodes },
    ],
    executed: false,
  };
}

export function buildDailyQueue(input: { blocked: string[]; ready: string[] }) {
  return {
    schemaVersion: DAILY_QUEUE_SCHEMA,
    DIRECTOR_QUEUE: input.ready.filter((item) => item.startsWith('DIR')),
    ASSET_REVIEW_QUEUE: input.ready.filter((item) => item.startsWith('ASSET')),
    ANIMATION_QUEUE: input.ready.filter((item) => item.startsWith('ANIM')),
    EDITORIAL_QUEUE: input.ready.filter((item) => item.startsWith('EDIT')),
    AUDIO_QUEUE: input.ready.filter((item) => item.startsWith('AUD')),
    REVIEW_QUEUE: input.ready.filter((item) => item.startsWith('REV')),
    RENDER_PREFLIGHT_QUEUE: input.ready.filter((item) => item.startsWith('RND')),
    QC_QUEUE: input.ready.filter((item) => item.startsWith('QC')),
    blockedNotScheduled: input.blocked,
  };
}

export function cacheReuseDecision(input: { dependencyChanged: boolean; kind: string }): 'REUSE' | 'RECOMPUTE' {
  return input.dependencyChanged ? 'RECOMPUTE' : 'REUSE';
}

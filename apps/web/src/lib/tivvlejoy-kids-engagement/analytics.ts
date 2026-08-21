import { sha256Canonical } from './hash';
import {
  COMPARISON_DIMENSIONS,
  FORBIDDEN_CHILD_OR_VIEWER_KEYS,
  OBSERVATION_WINDOWS,
  PILOT_ANALYTICS_SNAPSHOT_SCHEMA,
  PILOT_COMPARISON_REPORT_SCHEMA,
  ZERO_SIDE_EFFECTS,
  type ComparisonDimension,
  type ComparisonDimensionFinding,
  type ObservationWindow,
  type PilotAnalyticsSnapshot,
  type PilotComparisonReport,
} from './types';

export type PilotAnalyticsInput = {
  pilotId: PilotAnalyticsSnapshot['pilotId'];
  observationWindow: ObservationWindow;
  views?: number | null;
  engagedViews?: number | null;
  viewedVersusSwipedAway?: number | null;
  averageViewDurationSec?: number | null;
  averagePercentageViewed?: number | null;
  retentionMarkers?: PilotAnalyticsSnapshot['retentionMarkers'];
  replayOrRepeatedViewIndicators?: number | null;
  likes?: number | null;
  shares?: number | null;
  uniqueViewers?: number | null;
  productionTimeMinutes?: number | null;
  renderCostUsd?: number | null;
  humanComprehensionNotes?: string | null;
  humanEnjoymentNotes?: string | null;
  humanReplayInterestNotes?: string | null;
  source?: PilotAnalyticsSnapshot['source'];
};

export type PilotAnalyticsAcceptance =
  | { ok: true; snapshot: PilotAnalyticsSnapshot }
  | { ok: false; reason: string; rejectedKeys: readonly string[] };

const ALLOWED_ANALYTICS_KEYS = [
  'pilotId',
  'observationWindow',
  'views',
  'engagedViews',
  'viewedVersusSwipedAway',
  'averageViewDurationSec',
  'averagePercentageViewed',
  'retentionMarkers',
  'replayOrRepeatedViewIndicators',
  'likes',
  'shares',
  'uniqueViewers',
  'productionTimeMinutes',
  'renderCostUsd',
  'humanComprehensionNotes',
  'humanEnjoymentNotes',
  'humanReplayInterestNotes',
  'source',
] as const;

function isForbiddenKey(key: string): boolean {
  return (FORBIDDEN_CHILD_OR_VIEWER_KEYS as readonly string[]).includes(key);
}

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function acceptPilotAnalyticsSnapshot(input: Record<string, unknown>): PilotAnalyticsAcceptance {
  const rejectedKeys = Object.keys(input).filter((key) => isForbiddenKey(key) || !ALLOWED_ANALYTICS_KEYS.includes(key as (typeof ALLOWED_ANALYTICS_KEYS)[number]));
  const forbidden = Object.keys(input).filter(isForbiddenKey);
  if (forbidden.length > 0) {
    return {
      ok: false,
      reason: 'Child-level or viewer-identifying fields cannot enter the aggregate analytics contract.',
      rejectedKeys: forbidden,
    };
  }
  if (!['PILOT_1', 'PILOT_2', 'PILOT_3'].includes(String(input.pilotId))) {
    return { ok: false, reason: 'Unknown pilot.', rejectedKeys };
  }
  if (!(OBSERVATION_WINDOWS as readonly string[]).includes(String(input.observationWindow))) {
    return { ok: false, reason: 'Observation window must be 24h, 7d, or 28d.', rejectedKeys };
  }

  const body: Omit<PilotAnalyticsSnapshot, 'snapshotSha256'> = {
    schemaVersion: PILOT_ANALYTICS_SNAPSHOT_SCHEMA,
    pilotId: input.pilotId as PilotAnalyticsSnapshot['pilotId'],
    observationWindow: input.observationWindow as ObservationWindow,
    views: nullableNumber(input.views as number | null | undefined),
    engagedViews: nullableNumber(input.engagedViews as number | null | undefined),
    viewedVersusSwipedAway: nullableNumber(input.viewedVersusSwipedAway as number | null | undefined),
    averageViewDurationSec: nullableNumber(input.averageViewDurationSec as number | null | undefined),
    averagePercentageViewed: nullableNumber(input.averagePercentageViewed as number | null | undefined),
    retentionMarkers: Array.isArray(input.retentionMarkers) ? input.retentionMarkers as PilotAnalyticsSnapshot['retentionMarkers'] : null,
    replayOrRepeatedViewIndicators: nullableNumber(input.replayOrRepeatedViewIndicators as number | null | undefined),
    likes: nullableNumber(input.likes as number | null | undefined),
    shares: nullableNumber(input.shares as number | null | undefined),
    uniqueViewers: nullableNumber(input.uniqueViewers as number | null | undefined),
    productionTimeMinutes: nullableNumber(input.productionTimeMinutes as number | null | undefined),
    renderCostUsd: nullableNumber(input.renderCostUsd as number | null | undefined),
    humanComprehensionNotes: typeof input.humanComprehensionNotes === 'string' ? input.humanComprehensionNotes : null,
    humanEnjoymentNotes: typeof input.humanEnjoymentNotes === 'string' ? input.humanEnjoymentNotes : null,
    humanReplayInterestNotes: typeof input.humanReplayInterestNotes === 'string' ? input.humanReplayInterestNotes : null,
    source: input.source === 'MANUAL_AGGREGATE' ? 'MANUAL_AGGREGATE' : 'SYNTHETIC_PREVIEW',
    childLevelDataPresent: false,
    viewerIdentifyingDataPresent: false,
    commentsIngested: false,
    usernamesCollected: false,
    externalAnalyticsContacted: false,
  };
  return { ok: true, snapshot: { ...body, snapshotSha256: sha256Canonical(body) } };
}

function availability(value: unknown): 'OBSERVED' | 'NOT_AVAILABLE' {
  if (value == null) return 'NOT_AVAILABLE';
  if (Array.isArray(value) && value.length === 0) return 'NOT_AVAILABLE';
  if (typeof value === 'string' && value.trim() === '') return 'NOT_AVAILABLE';
  return 'OBSERVED';
}

function finding(
  snapshots: readonly PilotAnalyticsSnapshot[],
  dimension: ComparisonDimension,
  pick: (snapshot: PilotAnalyticsSnapshot) => unknown,
  note: string,
): ComparisonDimensionFinding {
  const observed = snapshots.some((snapshot) => availability(pick(snapshot)) === 'OBSERVED');
  return {
    dimension,
    availability: observed ? 'OBSERVED' : 'NOT_AVAILABLE',
    note,
  };
}

export function comparePilotAnalytics(
  snapshots: readonly PilotAnalyticsSnapshot[],
): PilotComparisonReport {
  const findings: ComparisonDimensionFinding[] = COMPARISON_DIMENSIONS.map((dimension) => {
    if (dimension === 'appeal') return finding(snapshots, dimension, (item) => item.likes ?? item.shares, 'Appeal uses likes or shares when a human entered them. Raw views are not enough.');
    if (dimension === 'engagement') return finding(snapshots, dimension, (item) => item.engagedViews ?? item.viewedVersusSwipedAway, 'Engagement uses engaged views or viewed-versus-swiped-away when available.');
    if (dimension === 'completion') return finding(snapshots, dimension, (item) => item.averagePercentageViewed ?? item.averageViewDurationSec ?? item.retentionMarkers, 'Completion uses duration, percentage viewed, or retention markers.');
    if (dimension === 'replaySignals') return finding(snapshots, dimension, (item) => item.replayOrRepeatedViewIndicators, 'Replay signals stay optional and aggregate-only.');
    if (dimension === 'satisfaction') return finding(snapshots, dimension, (item) => item.humanEnjoymentNotes ?? item.humanComprehensionNotes, 'Satisfaction requires human enjoyment or comprehension notes.');
    if (dimension === 'cost') return finding(snapshots, dimension, (item) => item.renderCostUsd, 'Cost uses manually entered render cost.');
    if (dimension === 'productionTime') return finding(snapshots, dimension, (item) => item.productionTimeMinutes, 'Production time uses manually entered minutes.');
    if (dimension === 'characterFit') return finding(snapshots, dimension, (item) => item.humanComprehensionNotes, 'Character fit is a human note, not a view count.');
    return finding(snapshots, dimension, (item) => item.humanEnjoymentNotes, 'Parent-safe quality is a human note, not a view count.');
  });

  const body: Omit<PilotComparisonReport, 'comparisonSha256'> = {
    schemaVersion: PILOT_COMPARISON_REPORT_SCHEMA,
    snapshots,
    findings,
    selectedWinnerPilotId: null,
    winnerSelectedBy: null,
    viewsAloneSelectedWinner: false,
    humanMustSelectWinner: true,
    automaticBatchAuthorized: false,
    automaticSpendAuthorized: false,
    nextBatchAuthorizedByHuman: false,
    viralityGuaranteed: false,
    synthetic: true,
    ...ZERO_SIDE_EFFECTS,
  };
  return { ...body, comparisonSha256: sha256Canonical(body) };
}

export function selectPilotWinner(
  report: PilotComparisonReport,
  input: { actor: string; winningPilotId: PilotAnalyticsSnapshot['pilotId']; authorizeNextBatch?: boolean },
): PilotComparisonReport {
  if (input.actor !== 'HUMAN') {
    return report;
  }
  const { comparisonSha256: _ignored, ...rest } = report;
  const body: Omit<PilotComparisonReport, 'comparisonSha256'> = {
    ...rest,
    selectedWinnerPilotId: input.winningPilotId,
    winnerSelectedBy: 'HUMAN',
    viewsAloneSelectedWinner: false,
    nextBatchAuthorizedByHuman: input.authorizeNextBatch === true,
    automaticBatchAuthorized: false,
    automaticSpendAuthorized: false,
  };
  return { ...body, comparisonSha256: sha256Canonical(body) };
}

function mustAccept(input: Record<string, unknown>): PilotAnalyticsSnapshot {
  const accepted = acceptPilotAnalyticsSnapshot(input);
  if (!accepted.ok) {
    throw new Error(accepted.reason);
  }
  return accepted.snapshot;
}

export const SYNTHETIC_PREVIEW_ANALYTICS: readonly PilotAnalyticsSnapshot[] = [
  mustAccept({
    pilotId: 'PILOT_1',
    observationWindow: '24h',
    views: 1200,
    engagedViews: 640,
    viewedVersusSwipedAway: 0.41,
    averageViewDurationSec: 18,
    averagePercentageViewed: 72,
    replayOrRepeatedViewIndicators: 90,
    likes: 40,
    shares: 8,
    uniqueViewers: 980,
    productionTimeMinutes: 240,
    renderCostUsd: null,
    humanComprehensionNotes: 'Synthetic Preview note: spectacle reads clearly.',
    humanEnjoymentNotes: 'Synthetic Preview note: laughter lands without peril.',
    humanReplayInterestNotes: 'Synthetic Preview note: button gag invites one more look.',
    source: 'SYNTHETIC_PREVIEW',
  }),
  mustAccept({
    pilotId: 'PILOT_2',
    observationWindow: '7d',
    views: 900,
    engagedViews: 700,
    viewedVersusSwipedAway: null,
    averageViewDurationSec: 22,
    averagePercentageViewed: 81,
    replayOrRepeatedViewIndicators: 210,
    likes: 36,
    shares: 11,
    uniqueViewers: null,
    productionTimeMinutes: 300,
    renderCostUsd: null,
    humanComprehensionNotes: 'Synthetic Preview note: hidden clue is findable without comments.',
    humanEnjoymentNotes: 'Synthetic Preview note: pause before reveal feels kind.',
    humanReplayInterestNotes: 'Synthetic Preview note: background clue rewards a second watch.',
    source: 'SYNTHETIC_PREVIEW',
  }),
  mustAccept({
    pilotId: 'PILOT_3',
    observationWindow: '28d',
    views: 800,
    engagedViews: null,
    viewedVersusSwipedAway: null,
    averageViewDurationSec: 24,
    averagePercentageViewed: null,
    replayOrRepeatedViewIndicators: null,
    likes: 44,
    shares: 9,
    uniqueViewers: null,
    productionTimeMinutes: 280,
    renderCostUsd: null,
    humanComprehensionNotes: 'Synthetic Preview note: gentle peril stays readable as safe.',
    humanEnjoymentNotes: 'Synthetic Preview note: kindness is shown, not lectured.',
    humanReplayInterestNotes: null,
    source: 'SYNTHETIC_PREVIEW',
  }),
];

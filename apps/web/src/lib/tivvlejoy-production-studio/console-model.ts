import { defaultLongevityInput } from '@/lib/tivvlejoy-scenery-longevity';
import { syntheticRegistry } from '@/lib/tivvlejoy-approved-asset-registry';
import { episodeWaitingOn } from './state-graph';
import { locationUsage, simulateSeason } from './simulation';
import { buildProductionStudioPlan, studioInputFromSeason } from './orchestrator';

export type ConsoleShotRow = {
  shotId: string;
  locationId: string;
  stateLabel: string;
  environmentSha256: string | null;
  assemblySha256: string | null;
};

export type ConsoleEpisodeRow = {
  episodeId: string;
  readinessLabel: string;
  shotCount: number;
  waitingOn: string[];
  packetSha256: string;
  qcPassed: boolean;
  deliveryLabel: string;
  shots: ConsoleShotRow[];
};

export type ProductionConsoleModel = {
  banner: 'PREVIEW / SYNTHETIC PRODUCTION DATA';
  note: string;
  studioReadiness: string;
  studioReadinessLabel: string;
  seasonHealth: {
    total: number;
    planningReady: number;
    blocked: number;
    waitingAssets: number;
    waitingRigs: number;
    waitingVoices: number;
    waitingApproval: number;
    renderPreflightReady: number;
    qcReady: number;
    deliveryReady: number;
  };
  longevity: {
    coverage: string;
    risk: string;
    confidence: string;
    purchase: string;
  } | null;
  criticalBlockers: Array<{ label: string; episodeId: string; detail: string }>;
  nextActions: Array<{ label: string; episodeId: string }>;
  batches: Array<{ batchId: string; jobType: string; count: number; reuse: string | null; blocked: boolean }>;
  reuseOpportunities: string[];
  continuityWarnings: Array<{ reason: string; episodeId: string }>;
  assetGaps: string[];
  locationLoad: Array<{ locationId: string; uses: number }>;
  episodes: ConsoleEpisodeRow[];
  recovery: { jobCount: number; renderJobsRequireAuth: number };
  totals: { episodes: number; shots: number; edges: number; facts: number; jobs: number };
  hashes: { graphSha256: string; orchestratorSha256: string; batchPlanSha256: string };
};

function humanStudioReadiness(value: string): string {
  if (value === 'WAITING_FOR_CHARACTER_RIGS') return 'Waiting for Pip and Goat production rigs';
  if (value === 'WAITING_FOR_REAL_ASSETS') return 'Waiting for real approved production assets';
  if (value === 'PRODUCTION_READY') return 'Production ready';
  return value.split('_').join(' ').toLowerCase();
}

let cached: ProductionConsoleModel | null = null;

export function buildPreviewStudioConsoleModel(): ProductionConsoleModel {
  if (cached) return cached;
  const season = simulateSeason();
  const plan = buildProductionStudioPlan(
    studioInputFromSeason(season, {
      evidenceClass: 'SYNTHETIC_PREVIEW',
      approvedAssetRegistry: syntheticRegistry(),
      longevity: defaultLongevityInput({ requestedEpisodeCount: season.episodeCount }),
    }),
  );
  const usage = locationUsage(season.episodes);
  const episodes: ConsoleEpisodeRow[] = plan.packets.map((packet) => {
    const waiting = episodeWaitingOn(plan.graph, packet.episodeId);
    const shots = season.episodes.find((item) => item.episodeId === packet.episodeId)?.shots ?? [];
    return {
      episodeId: packet.episodeId,
      readinessLabel: packet.readiness === 'PLANNING_COMPLETE' ? 'Planning complete' : packet.readiness.split('_').join(' ').toLowerCase(),
      shotCount: shots.length,
      waitingOn: [...new Set(waiting.map((item) => item.humanLabel))].slice(0, 8),
      packetSha256: packet.productionPacketSha256,
      qcPassed: plan.qcReports.find((item) => item.episodeId === packet.episodeId)?.passed === true,
      deliveryLabel:
        plan.deliveries.find((item) => item.episodeId === packet.episodeId)?.readiness.split('_').join(' ').toLowerCase() ??
        'not ready',
      shots: shots.map((shot) => ({
        shotId: shot.shotId,
        locationId: shot.locationId,
        stateLabel: waiting.find((item) => item.nodeId.includes(`::SHOT::${shot.shotId}`))?.humanLabel ?? `Shot ${shot.shotId}`,
        environmentSha256: shot.environmentDependencySha256,
        assemblySha256: shot.assemblyDependencySha256,
      })),
    };
  });
  cached = {
    banner: 'PREVIEW / SYNTHETIC PRODUCTION DATA',
    note: 'No episode has been rendered. This console is planning-only.',
    studioReadiness: plan.studioReadiness,
    studioReadinessLabel: humanStudioReadiness(plan.studioReadiness),
    seasonHealth: plan.seasonHealth,
    longevity: plan.longevity
      ? {
          coverage: plan.longevity.coverageStrength,
          risk: plan.longevity.repetitionRisk.overallRisk,
          confidence: plan.longevity.coverageConfidence,
          purchase: plan.longevity.purchaseDecision,
        }
      : null,
    criticalBlockers: plan.graph.nodes
      .filter((node) => node.blockerClass && node.state !== 'COMPLETE' && (node.kind === 'CHARACTER_RIG' || node.kind === 'RENDER' || node.kind === 'VISUAL_APPROVAL'))
      .slice(0, 12)
      .map((node) => ({ label: node.humanLabel, episodeId: node.episodeId, detail: node.blockerCode ?? node.kind })),
    nextActions: plan.safeNextActions.slice(0, 12).map((item) => ({ label: item.label, episodeId: item.episodeId })),
    batches: plan.batchPlan.batches.slice(0, 20).map((batch) => ({
      batchId: batch.batchId,
      jobType: batch.jobType,
      count: batch.unitIds.length,
      reuse: batch.reuseOpportunity,
      blocked: batch.blocked,
    })),
    reuseOpportunities: plan.batchPlan.cacheReuse.slice(0, 12),
    continuityWarnings: plan.continuityIssues.slice(0, 12).map((item) => ({ reason: item.reason, episodeId: item.episodeId })),
    assetGaps: plan.longevity?.specialtyGaps.map((item) => item.reason).slice(0, 8) ?? [],
    locationLoad: Object.entries(usage)
      .map(([locationId, uses]) => ({ locationId, uses }))
      .sort((left, right) => right.uses - left.uses),
    episodes,
    recovery: {
      jobCount: plan.jobs.length,
      renderJobsRequireAuth: plan.jobs.filter((job) => job.jobType === 'RENDER').length,
    },
    totals: {
      episodes: season.episodeCount,
      shots: season.shotCount,
      edges: plan.graph.edges.length,
      facts: season.continuityFacts.length,
      jobs: plan.jobs.length,
    },
    hashes: {
      graphSha256: plan.graph.graphSha256,
      orchestratorSha256: plan.orchestratorSha256,
      batchPlanSha256: plan.batchPlan.batchPlanSha256,
    },
  };
  return cached;
}

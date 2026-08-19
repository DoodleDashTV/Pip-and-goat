import type { ApprovedAssetRegistry } from '@/lib/tivvlejoy-approved-asset-registry/types';
import { defaultLongevityInput, evaluateSceneryLongevity, type SceneryLongevityInput, type SceneryLongevityReport } from '@/lib/tivvlejoy-scenery-longevity';
import { sha256Canonical } from './hash';
import { compileEpisodeProductionPacket, type EpisodeProductionPacket } from './packet';
import { buildContinuityLedger, evaluateContinuity, type ContinuityIssue } from './continuity';
import { planProductionBatches, type BatchPlan, type SchedulableUnit } from './scheduler';
import { evaluateEpisodeQc, type EpisodeQcReport } from './qc';
import { compileDeliveryPackage, type DeliveryPackage } from './delivery';
import { buildProductionStateGraph, changeImpact, type ProductionStateGraph } from './state-graph';
import { buildSafeNextActions, type SafeNextAction } from './next-actions';
import { jobIdempotencyKey } from './recovery';
import type { SimulatedSeason } from './simulation';
import {
  ORCHESTRATOR_SCHEMA,
  type ContinuityFact,
  type QcProfileId,
  type ProductionJob,
  type StudioReadiness,
  type VoiceReceipt,
  type VisualApprovalReceipt,
} from './types';

export type OrchestratorEpisodeInput = {
  episodeId: string;
  episodeVersion: string;
  episodeNumber: number;
  scriptSha256: string;
  shots: Array<{
    shotId: string;
    locationId: string;
    locationSha256?: string | null;
    environmentDependencySha256?: string | null;
    assemblyDependencySha256?: string | null;
    cameraTemplateId?: string;
    lightingPresetId?: string;
    lightingFamily?: string;
    dialogueRefs?: string[];
    charactersVisible?: string[];
    approvedAssetIds?: string[];
    visualApproval?: VisualApprovalReceipt | null;
  }>;
  voiceReceipts?: VoiceReceipt[];
};

export type ProductionStudioInput = {
  episodes: OrchestratorEpisodeInput[];
  approvedAssetRegistry?: ApprovedAssetRegistry;
  voiceReceipts?: VoiceReceipt[];
  characterReadiness?: {
    characterRigsResolved?: boolean;
    pipRigVersion?: string;
    goatRigVersion?: string;
  };
  visualApprovals?: VisualApprovalReceipt[];
  renderBackendReadiness?: { authorized?: boolean; backendId?: string };
  usageHistory?: SceneryLongevityInput['episodeUsageHistory'];
  continuityFacts?: ContinuityFact[];
  continuityObservations?: Array<{ episodeId: string; shotId: string; topic: string; subjectId: string; state: string }>;
  deliveryProfiles?: QcProfileId[];
  characterRigsResolved?: boolean;
  pipRigVersion?: string;
  goatRigVersion?: string;
  longevity?: SceneryLongevityInput;
  evidenceClass?: 'SYNTHETIC_PREVIEW' | 'APPROVED_PRODUCTION_PLAN';
};

export function studioInputFromSeason(season: SimulatedSeason, extras: Partial<ProductionStudioInput> = {}): ProductionStudioInput {
  return {
    episodes: season.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      episodeVersion: 'sim-v1',
      episodeNumber: episode.episodeNumber,
      scriptSha256: episode.scriptSha256,
      shots: episode.shots.map((shot) => ({
        shotId: shot.shotId,
        locationId: shot.locationId,
        locationSha256: shot.locationSha256,
        environmentDependencySha256: shot.environmentDependencySha256,
        assemblyDependencySha256: shot.assemblyDependencySha256,
        lightingFamily: shot.lightingFamily,
        dialogueRefs: [shot.dialogueRef],
        charactersVisible: shot.charactersVisible,
        approvedAssetIds: shot.approvedAssetIds,
      })),
      voiceReceipts: episode.voiceReceipts,
    })),
    continuityFacts: season.continuityFacts,
    evidenceClass: 'SYNTHETIC_PREVIEW',
    ...extras,
  };
}

export type ProductionStudioPlan = {
  schemaVersion: typeof ORCHESTRATOR_SCHEMA;
  graph: ProductionStateGraph;
  packets: EpisodeProductionPacket[];
  continuityIssues: ContinuityIssue[];
  longevity: SceneryLongevityReport | null;
  batchPlan: BatchPlan;
  qcReports: EpisodeQcReport[];
  deliveries: DeliveryPackage[];
  jobs: ProductionJob[];
  safeNextActions: SafeNextAction[];
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
  studioReadiness: StudioReadiness;
  syntheticFixturesClaimProductionReady: false;
  paidRenderClosed: true;
  renderBackendReportedReady: boolean;
  orchestratorSha256: string;
};

export function studioReadinessFor(input: ProductionStudioInput): StudioReadiness {
  const rigsResolved = input.characterReadiness?.characterRigsResolved ?? input.characterRigsResolved;
  if (input.evidenceClass === 'SYNTHETIC_PREVIEW' || input.evidenceClass === undefined) {
    return rigsResolved ? 'WAITING_FOR_REAL_ASSETS' : 'WAITING_FOR_CHARACTER_RIGS';
  }
  if (!rigsResolved) return 'WAITING_FOR_CHARACTER_RIGS';
  return 'PRODUCTION_ORCHESTRATION_OPERATIONAL';
}

export function buildProductionStudioPlan(input: ProductionStudioInput): ProductionStudioPlan {
  const characterRigsResolved = input.characterReadiness?.characterRigsResolved ?? input.characterRigsResolved;
  const pipRigVersion = input.characterReadiness?.pipRigVersion ?? input.pipRigVersion;
  const goatRigVersion = input.characterReadiness?.goatRigVersion ?? input.goatRigVersion;
  const graph = buildProductionStateGraph(
    input.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      scriptSha256: episode.scriptSha256,
      shots: episode.shots.map((shot) => ({
        ...shot,
        visualApproval: shot.visualApproval ?? input.visualApprovals?.find((item) => item.shotId === shot.shotId) ?? null,
      })),
      voiceReceipts: episode.voiceReceipts ?? input.voiceReceipts,
      characterRigsResolved,
      pipRigVersion,
      goatRigVersion,
    })),
  );
  const ledger = buildContinuityLedger(input.continuityFacts ?? []);
  const continuity = evaluateContinuity(ledger, input.continuityObservations ?? []);
  const packets = input.episodes.map((episode) =>
    compileEpisodeProductionPacket({
      episodeId: episode.episodeId,
      episodeVersion: episode.episodeVersion,
      scriptSha256: episode.scriptSha256,
      voiceReceipts: episode.voiceReceipts ?? input.voiceReceipts,
      shots: episode.shots,
      approvedAssetResolutions: input.approvedAssetRegistry?.assets
        .filter((asset) => (episode.shots ?? []).some((shot) => (shot.approvedAssetIds ?? []).includes(asset.assetId)))
        .map((asset) => ({
          assetId: asset.assetId,
          assetVersion: asset.assetVersion,
          assetDependencySha256: asset.assetDependencySha256,
        })),
      continuityDependencySha256: ledger.ledgerSha256,
      characterRigsResolved,
      pipRigVersion,
      goatRigVersion,
    }),
  );
  const units: SchedulableUnit[] = input.episodes.flatMap((episode) =>
    episode.shots.flatMap((shot) => [
      {
        unitId: `${episode.episodeId}::ENV::${shot.shotId}`,
        jobType: 'ENVIRONMENT_PREP' as const,
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        locationId: shot.locationId,
        lightingFamily: shot.lightingFamily,
        inputDependencySha256: shot.environmentDependencySha256 ?? 'UNRESOLVED',
        blocked: false,
      },
      {
        unitId: `${episode.episodeId}::ASM::${shot.shotId}`,
        jobType: 'SHOT_ASSEMBLY' as const,
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        locationId: shot.locationId,
        inputDependencySha256: shot.assemblyDependencySha256 ?? 'UNRESOLVED',
        blocked: characterRigsResolved !== true,
        blockerLabel: 'Wait for production Pip/Goat rig',
      },
      {
        unitId: `${episode.episodeId}::RENDER::${shot.shotId}`,
        jobType: 'RENDER' as const,
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        inputDependencySha256: shot.assemblyDependencySha256 ?? 'UNRESOLVED',
        blocked: true,
        blockerLabel: 'Paid render authorization required',
      },
    ]),
  );
  const batchPlan = planProductionBatches(units);
  const qcReports = packets.map((packet) =>
    evaluateEpisodeQc({
      episodeId: packet.episodeId,
      profileId: input.deliveryProfiles?.[0],
      characterRigVersion: pipRigVersion ?? 'UNRESOLVED_PRODUCTION_RIG',
      visualApprovalPresent: false,
      visualApprovalFresh: false,
    }),
  );
  const deliveries = packets.map((packet, index) =>
    compileDeliveryPackage({
      episodeId: packet.episodeId,
      episodeVersion: packet.episodeVersion,
      episodeNumber: input.episodes[index]?.episodeNumber ?? index + 1,
      seasonNumber: 1,
      title: packet.episodeId,
      productionPacketSha256: packet.productionPacketSha256,
      qcPassed: false,
      qcSha256: qcReports[index]?.episodeQcSha256,
    }),
  );
  const jobs: ProductionJob[] = units.map((unit) => {
    const job = {
      jobId: unit.unitId,
      jobType: unit.jobType,
      episodeId: unit.episodeId,
      shotId: unit.shotId,
      inputDependencySha256: unit.inputDependencySha256,
      attemptNumber: 1,
      idempotencyKey: '',
      checkpointRef: null,
      resultReceiptRef: null,
      retryClass: unit.jobType === 'RENDER' ? ('REQUIRES_NEW_AUTHORIZATION' as const) : ('SAFE_RETRY' as const),
      authorizationReceiptRef: null,
    };
    return { ...job, idempotencyKey: jobIdempotencyKey(job) };
  });
  const safeNextActions = buildSafeNextActions({ graph, qcReports, deliveries });
  const nodes = graph.nodes;
  const seasonHealth = {
    total: input.episodes.length,
    planningReady: packets.filter((packet) => packet.readiness === 'PLANNING_COMPLETE').length,
    blocked: nodes.filter((node) => node.kind === 'EPISODE' && node.state === 'BLOCKED').length,
    waitingAssets: nodes.filter((node) => node.state === 'WAITING_FOR_ASSET').length,
    waitingRigs: nodes.filter((node) => node.state === 'WAITING_FOR_RIG').length,
    waitingVoices: nodes.filter((node) => node.state === 'WAITING_FOR_VOICE').length,
    waitingApproval: nodes.filter((node) => node.state === 'WAITING_FOR_APPROVAL').length,
    renderPreflightReady: nodes.filter((node) => node.state === 'READY_FOR_RENDER_PREFLIGHT').length,
    qcReady: qcReports.filter((item) => item.passed).length,
    deliveryReady: deliveries.filter((item) => item.readiness === 'READY_FOR_MANUAL_RELEASE').length,
  };
  const longevityInput =
    input.longevity ??
    (input.approvedAssetRegistry || input.usageHistory
      ? defaultLongevityInput({
          requestedEpisodeCount: Math.max(1, input.episodes.length),
          approvedAssetRegistry: input.approvedAssetRegistry,
          episodeUsageHistory: input.usageHistory,
          evidenceClass: input.evidenceClass === 'APPROVED_PRODUCTION_PLAN' ? 'APPROVED_PRODUCTION_PLAN' : 'SYNTHETIC_PREVIEW',
        })
      : null);
  const longevity = longevityInput ? evaluateSceneryLongevity(longevityInput) : null;
  const readiness = studioReadinessFor({ ...input, characterRigsResolved, evidenceClass: input.evidenceClass ?? 'SYNTHETIC_PREVIEW' });
  const body = {
    schemaVersion: ORCHESTRATOR_SCHEMA,
    graph,
    packets,
    continuityIssues: continuity.issues,
    longevity,
    batchPlan,
    qcReports,
    deliveries,
    jobs,
    safeNextActions,
    seasonHealth,
    studioReadiness: readiness,
    syntheticFixturesClaimProductionReady: false as const,
    paidRenderClosed: true as const,
    renderBackendReportedReady: input.renderBackendReadiness?.authorized === true,
  };
  return { ...body, orchestratorSha256: sha256Canonical({ graph: graph.graphSha256, packets: packets.map((item) => item.productionPacketSha256), batches: batchPlan.batchPlanSha256 }) };
}

export function invalidateAfterChange(plan: ProductionStudioPlan, nodeIds: string[]): string[] {
  return changeImpact(plan.graph, nodeIds);
}

import { syntheticRegistry } from '@/lib/tivvlejoy-approved-asset-registry';
import { defaultLongevityInput } from '@/lib/tivvlejoy-scenery-longevity';
import {
  buildProductionStudioPlan,
  studioInputFromSeason,
  type ProductionStudioInput,
  type ProductionStudioPlan,
} from '@/lib/tivvlejoy-production-studio';
import { simulateSeason, type SimulatedSeason } from '@/lib/tivvlejoy-production-studio/simulation';
import { createMemoryPersistenceStore } from './adapters';
import { eventTypeFor } from './events';
import { sha256Canonical } from './hash';
import { ProductionPersistenceStore } from './store';
import type { EntityType, WriteReceipt } from './types';

export type PersistSeasonOptions = {
  persistEveryJob?: boolean;
  extras?: Partial<ProductionStudioInput>;
  season?: SimulatedSeason;
  plan?: ProductionStudioPlan;
};

export type PersistSeasonResult = {
  workspaceId: string;
  season: SimulatedSeason;
  plan: ProductionStudioPlan;
  receipts: WriteReceipt[];
  hashes: Record<string, string>;
  counts: {
    episodes: number;
    shots: number;
    jobs: number;
    packets: number;
    continuityFacts: number;
    qcReceipts: number;
    deliveryPackages: number;
    events: number;
    records: number;
  };
  writeMs: number;
};

type RecordWrite = {
  entityType: EntityType;
  entityId: string;
  payload: Record<string, unknown>;
  dependencySha256: string;
};

function asPayload(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function add(
  records: RecordWrite[],
  entityType: EntityType,
  entityId: string,
  payload: Record<string, unknown>,
): void {
  records.push({
    entityType,
    entityId,
    payload,
    dependencySha256: sha256Canonical({ entityType, entityId, payload }),
  });
}

export function persistSeasonToStore(
  store: ProductionPersistenceStore,
  options: PersistSeasonOptions = {},
): PersistSeasonResult {
  const started = Date.now();
  const persistEveryJob = options.persistEveryJob !== false;
  const season = options.season ?? simulateSeason();
  const plan =
    options.plan ??
    buildProductionStudioPlan(
      studioInputFromSeason(season, {
        evidenceClass: 'SYNTHETIC_PREVIEW',
        approvedAssetRegistry: syntheticRegistry(),
        longevity: defaultLongevityInput({ requestedEpisodeCount: season.episodeCount }),
        ...options.extras,
      }),
    );
  const receipts: WriteReceipt[] = [];
  const hashes: Record<string, string> = {};

  const commit = (
    records: RecordWrite[],
    eventType: ReturnType<typeof eventTypeFor>,
    reason: string,
    snapshot = false,
  ) => {
    if (!records.length) return;
    const receipt = store.commitAggregate({
      expectedRevision: store.getRevision(),
      records,
      eventType,
      reason,
      snapshot,
    });
    receipts.push(receipt);
    for (const record of records) hashes[`${record.entityType}:${record.entityId}`] = record.dependencySha256;
  };

  const workspaceId = store.getWorkspaceId();
  const header: RecordWrite[] = [];
  add(header, 'WORKSPACE', workspaceId, {
    workspaceId,
    persistenceMode: store.getMode(),
    seasonId: 'S01',
  });
  add(header, 'PRODUCTION', 'prd_s01', { productionId: 'prd_s01', seasonId: 'S01' });
  add(header, 'SEASON', 'S01', {
    seasonId: 'S01',
    episodeCount: season.episodeCount,
    shotCount: season.shotCount,
    edgeCount: plan.graph.edges.length,
    nodeCount: plan.graph.nodes.length,
    jobCount: plan.jobs.length,
    seasonHealth: plan.seasonHealth,
    studioReadiness: plan.studioReadiness,
    graphSha256: plan.graph.graphSha256,
    orchestratorSha256: plan.orchestratorSha256,
    batchPlanSha256: plan.batchPlan.batchPlanSha256,
  });
  commit(header, 'WORKSPACE_SAVED', 'persist workspace/production/season');

  for (const episode of season.episodes) {
    const packet = plan.packets.find((item) => item.episodeId === episode.episodeId);
    const qc = plan.qcReports.find((item) => item.episodeId === episode.episodeId);
    const delivery = plan.deliveries.find((item) => item.episodeId === episode.episodeId);
    const episodeJobs = plan.jobs.filter((job) => job.episodeId === episode.episodeId);
    const batch = {
      records: [] as RecordWrite[],
    };
    add(batch.records, 'EPISODE', episode.episodeId, {
      episodeId: episode.episodeId,
      episodeNumber: episode.episodeNumber,
      scriptSha256: episode.scriptSha256,
      packetSha256: packet?.productionPacketSha256 ?? null,
      qcPassed: qc?.passed === true,
      qcSha256: qc?.episodeQcSha256 ?? null,
      deliveryReadiness: delivery?.readiness ?? null,
      deliverySha256: delivery?.deliveryPackageSha256 ?? null,
    });
    add(batch.records, 'PRODUCTION_PACKET', episode.episodeId, {
      episodeId: episode.episodeId,
      packetSha256: packet?.productionPacketSha256 ?? null,
      readiness: packet?.readiness ?? null,
      shotCount: episode.shots.length,
    });
    add(batch.records, 'QC_RECEIPT', episode.episodeId, {
      episodeId: episode.episodeId,
      passed: qc?.passed === true,
      qcSha256: qc?.episodeQcSha256 ?? null,
    });
    add(batch.records, 'DELIVERY_PACKAGE', episode.episodeId, {
      episodeId: episode.episodeId,
      readiness: delivery?.readiness ?? null,
      deliverySha256: delivery?.deliveryPackageSha256 ?? null,
    });
    add(batch.records, 'SCRIPT_VERSION', `script_${episode.episodeId}`, {
      episodeId: episode.episodeId,
      scriptSha256: episode.scriptSha256,
      scriptVersion: 'sim-v1',
    });
    add(batch.records, 'VOICE_RECEIPT', `voice_${episode.episodeId}`, {
      episodeId: episode.episodeId,
      receipts: episode.voiceReceipts.map((item) => ({
        dialogueRef: item.dialogueRef,
        receiptRef: item.receiptRef,
        receiptSha256: item.receiptSha256,
      })),
    });
    add(batch.records, 'RECOVERY_CHECKPOINT', `chk_${episode.episodeId}`, {
      episodeId: episode.episodeId,
      jobCount: episodeJobs.length,
    });
    for (const shot of episode.shots) {
      add(batch.records, 'SHOT', shot.shotId, {
        shotId: shot.shotId,
        episodeId: episode.episodeId,
        locationId: shot.locationId,
        environmentDependencySha256: shot.environmentDependencySha256,
        assemblyDependencySha256: shot.assemblyDependencySha256,
        shotAnimationManifestSha256: null,
        characterRigDependencySha256: 'UNRESOLVED_PRODUCTION_RIG',
        animationQcRequirement: 'REQUIRED',
      });
    }
    if (persistEveryJob) {
      for (const job of episodeJobs) {
        add(batch.records, 'PRODUCTION_JOB', job.jobId, {
          jobId: job.jobId,
          jobType: job.jobType,
          idempotencyKey: job.idempotencyKey,
          inputDependencySha256: job.inputDependencySha256,
          retryClass: job.retryClass,
        });
      }
    }
    commit(batch.records, 'EPISODE_CREATED', `persist ${episode.episodeId}`);
  }

  const locations = [...new Set(season.episodes.flatMap((episode) => episode.shots.map((shot) => shot.locationId)))];
  const locationRecords: RecordWrite[] = [];
  for (const locationId of locations) {
    add(locationRecords, 'LOCATION_INSTANCE', locationId, { locationId, family: locationId });
  }
  commit(locationRecords, 'ASSET_RESOLUTION_BOUND', 'persist location instances');

  const factRecords: RecordWrite[] = [];
  for (const fact of season.continuityFacts) {
    add(factRecords, 'CONTINUITY_FACT', fact.continuityFactId, asPayload({
      factId: fact.continuityFactId,
      topic: fact.topic,
      subjectId: fact.subjectId,
      state: fact.state,
      factSha256: fact.dependencySha256,
      effectiveEpisode: fact.effectiveEpisode,
    }));
  }
  commit(factRecords, 'CONTINUITY_FACT_ADDED', 'persist continuity facts');

  const refs: RecordWrite[] = [];
  add(refs, 'APPROVED_ASSET_REFERENCE', 'AA_FOREST_HERO_TREE', {
    approvedAssetId: 'AA_FOREST_HERO_TREE',
    referenceOnly: true,
  });
  add(refs, 'VISUAL_APPROVAL_REFERENCE', 'vis_s01', { visualApprovalState: 'NOT_RECORDED' });
  add(refs, 'RENDER_PREFLIGHT_REFERENCE', 'preflight_s01', { renderReady: false });
  add(refs, 'RENDER_RECEIPT_REFERENCE', 'receipt_s01', { renderReceiptPresent: false });
  add(refs, 'BATCH_PLAN', workspaceId, {
    batchPlanSha256: plan.batchPlan.batchPlanSha256,
    units: plan.batchPlan.units,
    batchCount: plan.batchPlan.batches.length,
  });
  add(refs, 'PRODUCTION_STATE_NODE', 'graph_nodes', {
    nodeCount: plan.graph.nodes.length,
    graphSha256: plan.graph.graphSha256,
  });
  add(refs, 'PRODUCTION_STATE_EDGE', 'graph_edges', {
    edgeCount: plan.graph.edges.length,
    graphSha256: plan.graph.graphSha256,
  });
  add(refs, 'AUDIT_EVENT', 'audit_season_persist', {
    studioReadiness: plan.studioReadiness,
    synthetic: true,
  });
  add(refs, 'RIG_ADMISSION_REPORT', 'PIP', {
    characterId: 'PIP',
    state: 'RIG_NOT_PRESENT',
    approvedForAnimation: false,
    syntheticCannotApprove: true,
    reportSha256: sha256Canonical({ characterId: 'PIP', state: 'RIG_NOT_PRESENT' }),
  });
  add(refs, 'RIG_ADMISSION_REPORT', 'GOAT', {
    characterId: 'GOAT',
    state: 'RIG_NOT_PRESENT',
    approvedForAnimation: false,
    syntheticCannotApprove: true,
    reportSha256: sha256Canonical({ characterId: 'GOAT', state: 'RIG_NOT_PRESENT' }),
  });
  add(refs, 'RIG_VERSION_IDENTITY', 'PIP', { rigVersion: 'UNRESOLVED_PRODUCTION_RIG' });
  add(refs, 'RIG_VERSION_IDENTITY', 'GOAT', { rigVersion: 'UNRESOLVED_PRODUCTION_RIG' });
  add(refs, 'ANIMATION_BATCH_PLAN', 'horizon-60', {
    blockedRealRigWork: season.shotCount,
    batchPlanSha256: plan.batchPlan.batchPlanSha256,
  });
  commit(refs, 'WORKSPACE_SAVED', 'persist references and graph');
  receipts.push(store.writeStateGraphSnapshot());

  return {
    workspaceId,
    season,
    plan,
    receipts,
    hashes,
    counts: {
      episodes: season.episodeCount,
      shots: season.shotCount,
      jobs: persistEveryJob ? plan.jobs.length : 0,
      packets: plan.packets.length,
      continuityFacts: season.continuityFacts.length,
      qcReceipts: plan.qcReports.length,
      deliveryPackages: plan.deliveries.length,
      events: store.listEvents().length,
      records: store.listRecords().length,
    },
    writeMs: Date.now() - started,
  };
}

export function persistSeasonInMemory(workspaceId = 'ws_season_persist', options: PersistSeasonOptions = {}) {
  const store = createMemoryPersistenceStore(workspaceId);
  return { store, ...persistSeasonToStore(store, options) };
}

let cachedSeasonViewJson: string | null = null;

export function cachedSerializedSeasonView(): string {
  if (!cachedSeasonViewJson) {
    const { store } = persistSeasonInMemory('ws_season_persist');
    cachedSeasonViewJson = JSON.stringify(store.serialize());
  }
  return cachedSeasonViewJson;
}

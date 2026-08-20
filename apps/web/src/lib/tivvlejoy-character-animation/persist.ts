import { eventTypeFor } from '@/lib/tivvlejoy-production-persistence/events';
import type { ProductionPersistenceStore } from '@/lib/tivvlejoy-production-persistence/store';
import type { WriteReceipt } from '@/lib/tivvlejoy-production-persistence/types';
import type { ShotAnimationPlan } from './planner';
import type { AnimationBatchPlan } from './scheduler';
import type { AnimationQcReport } from './qc';
import type { AdmissionReport } from './admission';
import { sha256Canonical } from './hash';

export function persistAnimationArtifacts(input: {
  store: ProductionPersistenceStore;
  plans: ShotAnimationPlan[];
  admissions: AdmissionReport[];
  qcReports: Array<{ id: string; report: AnimationQcReport }>;
  batch: AnimationBatchPlan;
  cacheIdentities?: Array<{ id: string; sha256: string }>;
}): WriteReceipt[] {
  const receipts: WriteReceipt[] = [];
  const write = (entityType: Parameters<ProductionPersistenceStore['writeRecord']>[0]['entityType'], entityId: string, payload: Record<string, unknown>) => {
    receipts.push(
      input.store.writeRecord({
        entityType,
        entityId,
        payload,
        expectedRevision: input.store.getRevision(),
        eventType: eventTypeFor(entityType),
        reason: `persist ${entityType}`,
      }),
    );
  };

  for (const admission of input.admissions) {
    write('RIG_ADMISSION_REPORT', `${admission.characterId}:${admission.state}`, {
      reportSha256: admission.reportSha256,
      state: admission.state,
      approvedForAnimation: admission.approvedForAnimation,
      syntheticCannotApprove: admission.syntheticCannotApprove,
    });
    write('RIG_VERSION_IDENTITY', admission.characterId, {
      characterId: admission.characterId,
      reportSha256: admission.reportSha256,
    });
  }

  for (const plan of input.plans) {
    write('PERFORMANCE_INTENT', `${plan.shotId}:${plan.characterId}:intent`, { sha256: plan.intent.intentSha256 });
    write('DIALOGUE_TIMING_PLAN', `${plan.shotId}:${plan.characterId}:timing`, { sha256: plan.timing.timingSha256 });
    write('VISEME_PLAN', `${plan.shotId}:${plan.characterId}:viseme`, { sha256: plan.viseme.visemePlanSha256 });
    write('SHOT_ANIMATION_MANIFEST', `${plan.shotId}:${plan.characterId}`, {
      shotAnimationDependencySha256: plan.manifest.shotAnimationDependencySha256,
      rigVersion: plan.manifest.rig.rigVersion,
      rigDependencySha256: plan.manifest.rig.rigDependencySha256,
    });
  }

  for (const qc of input.qcReports) {
    write('ANIMATION_QC_RECEIPT', qc.id, {
      hardBlockers: qc.report.hardBlockers.map((item) => item.id),
      claimsVisualDeformationSuccess: qc.report.claimsVisualDeformationSuccess,
      sha256: sha256Canonical(qc.report),
    });
  }

  for (const cache of input.cacheIdentities ?? []) {
    write('ANIMATION_CACHE_IDENTITY', cache.id, { sha256: cache.sha256 });
  }

  write('ANIMATION_BATCH_PLAN', `horizon-${input.batch.episodeHorizon}`, {
    batchPlanSha256: input.batch.batchPlanSha256,
    blockedRealRigWork: input.batch.blockedRealRigWork,
    groupCount: input.batch.groups.length,
  });

  return receipts;
}

export function restoreAnimationDependencyHashes(store: ProductionPersistenceStore): string[] {
  return store
    .listRecords()
    .filter((record) =>
      [
        'RIG_ADMISSION_REPORT',
        'RIG_VERSION_IDENTITY',
        'PERFORMANCE_INTENT',
        'DIALOGUE_TIMING_PLAN',
        'VISEME_PLAN',
        'SHOT_ANIMATION_MANIFEST',
        'ANIMATION_QC_RECEIPT',
        'ANIMATION_CACHE_IDENTITY',
        'ANIMATION_BATCH_PLAN',
      ].includes(record.entityType),
    )
    .map((record) => String(record.payload.shotAnimationDependencySha256 ?? record.payload.sha256 ?? record.payload.reportSha256 ?? record.dependencySha256))
    .sort();
}

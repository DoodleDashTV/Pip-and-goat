import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';

export const EP001_UNBLOCKING_COMBINATION_AUDIT_SCHEMA =
  'TIVVLEJOY_EP001_UNBLOCKING_COMBINATION_AUDIT_V1' as const;

export function compileEp001UnblockingCombinationAudit() {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const triggerIds = matrix.triggers.map((trigger) => trigger.triggerId);
  const combinations = Array.from({ length: 1 << triggerIds.length }, (_, mask) => {
    const observedTriggerIds = triggerIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const controller = compileEp001AutonomousReadinessController({ observedTriggerIds });
    const scheduler = compileEp001CriticalPathScheduler(observedTriggerIds);
    const phaseZeroObserved = scheduler.readyLanes.filter((lane) => lane.phase === 0).length;
    const phaseZeroWaiting = scheduler.waitingLanes.filter((lane) => lane.phase === 0).length;
    return {
      mask,
      observedTriggerIds,
      observedCount: observedTriggerIds.length,
      queuedSafeActionCount: controller.metrics.queuedSafeActions,
      schedulerReadyLaneCount: scheduler.metrics.readyLanes,
      phaseZeroObserved,
      phaseZeroWaiting,
      foundationComplete: phaseZeroWaiting === 0,
      admissionGranted: controller.authority.admissionGranted || scheduler.authority.admissionGranted,
      paidExecutionAuthorized:
        controller.authority.paidProviderExecutionAuthorized ||
        controller.authority.paidGpuExecutionAuthorized ||
        scheduler.authority.paidExecutionAuthorized,
      productionWritesAllowed:
        controller.authority.productionWritesAllowed || scheduler.authority.productionWritesAllowed,
    };
  });

  const authorityLeakCount = combinations.filter(
    (combination) =>
      combination.admissionGranted ||
      combination.paidExecutionAuthorized ||
      combination.productionWritesAllowed,
  ).length;
  const invalidFoundationAccounting = combinations.filter(
    (combination) => combination.phaseZeroObserved + combination.phaseZeroWaiting !== 4,
  ).length;

  const body = {
    schemaVersion: EP001_UNBLOCKING_COMBINATION_AUDIT_SCHEMA,
    episodeId: matrix.episodeId,
    externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    state: 'ALL_EXTERNAL_ARRIVAL_COMBINATIONS_AUDITED' as const,
    combinations,
    metrics: {
      triggerCount: triggerIds.length,
      combinationCount: combinations.length,
      authorityLeakCount,
      invalidFoundationAccounting,
      combinationsWithFoundationComplete: combinations.filter((combination) => combination.foundationComplete).length,
      maxQueuedSafeActions: Math.max(...combinations.map((combination) => combination.queuedSafeActionCount)),
    },
    authority: {
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      auditMayExecuteActions: false as const,
    },
    rules: [
      'Every subset of known external-arrival triggers is simulated exactly once.',
      'Simulation never claims that an arrival occurred in reality.',
      'No combination may leak approval, paid execution, or Production authority.',
      'Phase-zero accounting must always total four foundation lanes.',
    ],
  };

  return { ...body, unblockingCombinationAuditSha256: sha256Canonical(body) };
}

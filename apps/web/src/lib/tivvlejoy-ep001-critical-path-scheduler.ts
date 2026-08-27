import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';

export const EP001_CRITICAL_PATH_SCHEDULER_SCHEMA =
  'TIVVLEJOY_EP001_CRITICAL_PATH_SCHEDULER_V1' as const;

export function compileEp001CriticalPathScheduler(observedTriggerIds: readonly string[] = []) {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const known = new Set<string>(matrix.triggers.map((trigger) => trigger.triggerId));
  const observed = new Set<string>(observedTriggerIds);
  const unknown = [...observed].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`UNKNOWN_EP001_CRITICAL_PATH_TRIGGER:${unknown.join(',')}`);

  const phaseByTrigger = new Map<string, number>([
    ['PIP_RIG_ARRIVES', 0],
    ['GOAT_RIG_ARRIVES', 0],
    ['SCENERY_LICENSE_EVIDENCE_ARRIVES', 0],
    ['VOICE_PAID_AUTHORIZATION_ARRIVES', 0],
    ['HUMAN_DECISION_RECEIPT_ARRIVES', 1],
    ['FINAL_RENDER_AUTHORIZATION_ARRIVES', 2],
  ]);

  const lanes = matrix.triggers.map((trigger) => ({
    triggerId: trigger.triggerId,
    subject: trigger.subject,
    phase: phaseByTrigger.get(trigger.triggerId) ?? 99,
    arrivalObserved: observed.has(trigger.triggerId),
    state: observed.has(trigger.triggerId) ? ('SAFE_INTAKE_CAN_START' as const) : ('WAITING_EXTERNAL_INPUT' as const),
    safeActions: observed.has(trigger.triggerId) ? [...trigger.automaticSafeNextActions] : [],
    blockedActions: [...trigger.blockedUntilHumanOrExplicitAuthority],
  }));

  const readyLanes = lanes.filter((lane) => lane.arrivalObserved).sort((a, b) => a.phase - b.phase);
  const waitingLanes = lanes.filter((lane) => !lane.arrivalObserved).sort((a, b) => a.phase - b.phase);
  const body = {
    schemaVersion: EP001_CRITICAL_PATH_SCHEDULER_SCHEMA,
    episodeId: matrix.episodeId,
    externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    phases: [
      { phase: 0, name: 'PARALLEL_FOUNDATION_INPUTS', triggers: ['PIP_RIG_ARRIVES', 'GOAT_RIG_ARRIVES', 'SCENERY_LICENSE_EVIDENCE_ARRIVES', 'VOICE_PAID_AUTHORIZATION_ARRIVES'] },
      { phase: 1, name: 'SHA_BOUND_HUMAN_DECISIONS', triggers: ['HUMAN_DECISION_RECEIPT_ARRIVES'] },
      { phase: 2, name: 'FINAL_PAID_RENDER_AUTHORIZATION', triggers: ['FINAL_RENDER_AUTHORIZATION_ARRIVES'] },
    ],
    readyLanes,
    waitingLanes,
    state: readyLanes.length > 0 ? ('SAFE_PARALLEL_WORK_AVAILABLE' as const) : ('WAITING_ON_EXTERNAL_FOUNDATION_INPUTS' as const),
    metrics: {
      totalLanes: lanes.length,
      readyLanes: readyLanes.length,
      waitingLanes: waitingLanes.length,
      phaseZeroWaiting: waitingLanes.filter((lane) => lane.phase === 0).length,
    },
    authority: {
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      schedulerMayBypassPhase: false as const,
    },
    rules: [
      'Phase numbers describe dependency order, not approval authority.',
      'Phase-zero inputs may be processed independently and in parallel when actually observed.',
      'Human decisions remain SHA-bound and cannot be synthesized by the scheduler.',
      'Final render authorization remains last and cannot compensate for unresolved upstream gates.',
    ],
  };
  return { ...body, criticalPathSchedulerSha256: sha256Canonical(body) };
}

import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';

export const EP001_AUTONOMOUS_READINESS_CONTROLLER_SCHEMA =
  'TIVVLEJOY_EP001_AUTONOMOUS_READINESS_CONTROLLER_V1' as const;

type ControllerObservations = {
  observedTriggerIds?: readonly string[];
};

export function compileEp001AutonomousReadinessController(
  observations: ControllerObservations = {},
) {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const knownTriggerIds = new Set<string>(matrix.triggers.map((trigger) => trigger.triggerId));
  const observedTriggerIds = [...new Set(observations.observedTriggerIds ?? [])];
  const unknownTriggerIds = observedTriggerIds.filter((triggerId) => !knownTriggerIds.has(triggerId));

  if (unknownTriggerIds.length > 0) {
    throw new Error(`UNKNOWN_EP001_EXTERNAL_TRIGGER:${unknownTriggerIds.join(',')}`);
  }

  const observed = new Set<string>(observedTriggerIds);
  const triggerStates = matrix.triggers.map((trigger) => {
    const arrivalObserved = observed.has(trigger.triggerId);
    return {
      triggerId: trigger.triggerId,
      arrivalClass: trigger.arrivalClass,
      subject: trigger.subject,
      arrivalObserved,
      state: arrivalObserved ? ('SAFE_INTAKE_READY' as const) : ('WAITING_EXTERNAL_INPUT' as const),
      automaticSafeNextActions: arrivalObserved ? [...trigger.automaticSafeNextActions] : [],
      blockedActions: [...trigger.blockedUntilHumanOrExplicitAuthority],
      relatedDecisionIds: [...trigger.relatedDecisionIds],
    };
  });

  const safeAutomaticActionQueue = triggerStates.flatMap((trigger) =>
    trigger.automaticSafeNextActions.map((action, index) => ({
      queueId: `${trigger.triggerId}:${String(index + 1).padStart(2, '0')}`,
      triggerId: trigger.triggerId,
      subject: trigger.subject,
      action,
      authorityLevel: 'ZERO_COST_INTAKE_ONLY' as const,
    })),
  );

  const unresolvedExternalTriggers = triggerStates
    .filter((trigger) => !trigger.arrivalObserved)
    .map((trigger) => trigger.triggerId);

  const body = {
    schemaVersion: EP001_AUTONOMOUS_READINESS_CONTROLLER_SCHEMA,
    episodeId: matrix.episodeId,
    externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    state:
      safeAutomaticActionQueue.length > 0
        ? ('SAFE_INTAKE_ACTIONS_AVAILABLE' as const)
        : ('EXTERNAL_INPUT_BOUNDARY' as const),
    triggerStates,
    safeAutomaticActionQueue,
    unresolvedExternalTriggers,
    operatingRules: [
      'Only explicitly observed trigger IDs may enter the safe intake queue.',
      'Unknown trigger IDs fail closed.',
      'Queued actions are zero-cost intake or validation actions only.',
      'Arrival observation never grants admission, approval, provider authority, GPU authority, or Production write authority.',
      'Every downstream decision remains bound to the exact upstream SHA-256 evidence.',
    ],
    metrics: {
      knownTriggers: triggerStates.length,
      observedTriggers: triggerStates.filter((trigger) => trigger.arrivalObserved).length,
      waitingTriggers: unresolvedExternalTriggers.length,
      queuedSafeActions: safeAutomaticActionQueue.length,
      blockedActionCount: triggerStates.reduce((sum, trigger) => sum + trigger.blockedActions.length, 0),
    },
    authority: {
      admissionGranted: false as const,
      humanApprovalGranted: false as const,
      paidProviderExecutionAuthorized: false as const,
      paidGpuExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, autonomousReadinessControllerSha256: sha256Canonical(body) };
}

export type Ep001AutonomousReadinessController = ReturnType<
  typeof compileEp001AutonomousReadinessController
>;

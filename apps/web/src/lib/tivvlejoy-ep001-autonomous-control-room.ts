import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';
import { compileCurrentEp001ContractSnapshot } from '@/lib/tivvlejoy-ep001-contract-watchdog';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';
import { compileEp001ExternalArrivalSimulationAudit } from '@/lib/tivvlejoy-ep001-external-arrival-simulation-audit';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_AUTONOMOUS_CONTROL_ROOM_SCHEMA =
  'TIVVLEJOY_EP001_AUTONOMOUS_CONTROL_ROOM_V1' as const;

export function compileEp001AutonomousControlRoom() {
  const controller = compileEp001AutonomousReadinessController();
  const humanGates = compileEp001HumanGatePacket();
  const scheduler = compileEp001CriticalPathScheduler();
  const simulation = compileEp001ExternalArrivalSimulationAudit();
  const contractSnapshot = compileCurrentEp001ContractSnapshot();

  const nextRequiredExternalInputs = scheduler.waitingLanes
    .filter((lane) => lane.phase === 0)
    .map((lane) => ({ triggerId: lane.triggerId, subject: lane.subject }));

  const body = {
    schemaVersion: EP001_AUTONOMOUS_CONTROL_ROOM_SCHEMA,
    episodeId: humanGates.episodeId,
    state: 'WAITING_ON_REAL_EXTERNAL_FOUNDATION_INPUTS' as const,
    headline: {
      humanDecisionRows: humanGates.metrics.totalDecisionRows,
      humanApprovalsIssued: humanGates.metrics.approvedRows,
      externalTriggers: controller.metrics.knownTriggers,
      observedExternalTriggers: controller.metrics.observedTriggers,
      safeActionsQueuedNow: controller.metrics.queuedSafeActions,
      foundationInputsWaiting: scheduler.metrics.phaseZeroWaiting,
      syntheticScenariosCovered: simulation.metrics.scenarioCount,
      syntheticAuthorityLeaks: simulation.metrics.authorityLeakCount,
    },
    nextRequiredExternalInputs,
    currentContracts: contractSnapshot,
    links: [
      '/episode-one/human-gates',
      '/episode-one/external-arrivals',
      '/episode-one/autonomous-readiness',
      '/episode-one/arrival-simulation',
      '/episode-one/contract-watchdog',
      '/episode-one/critical-path',
    ],
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

  return { ...body, autonomousControlRoomSha256: sha256Canonical(body) };
}

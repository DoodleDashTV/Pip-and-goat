import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';
import { compileEp001ExternalArrivalSimulationAudit } from '@/lib/tivvlejoy-ep001-external-arrival-simulation-audit';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_CONTRACT_WATCHDOG_SCHEMA = 'TIVVLEJOY_EP001_CONTRACT_WATCHDOG_V1' as const;

export type Ep001ContractSnapshot = {
  humanGatePacketSha256: string;
  externalArrivalTriggerMatrixSha256: string;
  autonomousReadinessControllerSha256: string;
  simulationAuditSha256: string;
};

export function compileCurrentEp001ContractSnapshot(): Ep001ContractSnapshot {
  const humanGates = compileEp001HumanGatePacket();
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const controller = compileEp001AutonomousReadinessController();
  const simulation = compileEp001ExternalArrivalSimulationAudit();
  return {
    humanGatePacketSha256: humanGates.humanGatePacketSha256,
    externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
    autonomousReadinessControllerSha256: controller.autonomousReadinessControllerSha256,
    simulationAuditSha256: simulation.simulationAuditSha256,
  };
}

export function evaluateEp001ContractWatchdog(previous: Ep001ContractSnapshot) {
  const current = compileCurrentEp001ContractSnapshot();
  const changes = (Object.keys(current) as Array<keyof Ep001ContractSnapshot>)
    .filter((key) => previous[key] !== current[key])
    .map((key) => ({ key, previous: previous[key], current: current[key] }));

  const humanGateChanged = changes.some((change) => change.key === 'humanGatePacketSha256');
  const arrivalMatrixChanged = changes.some((change) => change.key === 'externalArrivalTriggerMatrixSha256');

  const body = {
    schemaVersion: EP001_CONTRACT_WATCHDOG_SCHEMA,
    episodeId: 'EP001' as const,
    current,
    changes,
    stale: changes.length > 0,
    invalidations: {
      invalidateStoredHumanDecisionReceipts: humanGateChanged,
      invalidateStoredExternalArrivalReceipts: arrivalMatrixChanged,
      rerunReadinessSimulation: changes.length > 0,
    },
    authority: {
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      autoMigrationAllowed: false as const,
    },
    rules: [
      'Hash drift never auto-migrates a receipt.',
      'Human decision receipts become stale when the human gate packet changes.',
      'External arrival receipts become stale when the arrival trigger matrix changes.',
      'Any contract drift requires a fresh zero-cost simulation audit before downstream use.',
    ],
  };

  return { ...body, watchdogSha256: sha256Canonical(body) };
}

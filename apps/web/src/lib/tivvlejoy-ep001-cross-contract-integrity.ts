import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';
import { compileEp001ExternalArrivalSimulationAudit } from '@/lib/tivvlejoy-ep001-external-arrival-simulation-audit';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_CROSS_CONTRACT_INTEGRITY_SCHEMA =
  'TIVVLEJOY_EP001_CROSS_CONTRACT_INTEGRITY_V1' as const;

export function compileEp001CrossContractIntegrityAudit() {
  const gates = compileEp001HumanGatePacket();
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const scheduler = compileEp001CriticalPathScheduler();
  const simulation = compileEp001ExternalArrivalSimulationAudit();

  const decisionIds = gates.rows.map((row) => row.decisionId);
  const decisionIdSet = new Set<string>(decisionIds);
  const triggerIds = matrix.triggers.map((trigger) => trigger.triggerId);
  const triggerIdSet = new Set<string>(triggerIds);
  const issues: string[] = [];

  if (decisionIdSet.size !== decisionIds.length) issues.push('DUPLICATE_HUMAN_DECISION_ID');
  if (triggerIdSet.size !== triggerIds.length) issues.push('DUPLICATE_EXTERNAL_TRIGGER_ID');

  for (const trigger of matrix.triggers) {
    for (const decisionId of trigger.relatedDecisionIds) {
      if (!decisionIdSet.has(decisionId)) issues.push(`ORPHAN_TRIGGER_DECISION:${trigger.triggerId}:${decisionId}`);
    }
  }

  for (const lane of [...scheduler.readyLanes, ...scheduler.waitingLanes]) {
    if (!triggerIdSet.has(lane.triggerId)) issues.push(`UNKNOWN_SCHEDULER_TRIGGER:${lane.triggerId}`);
  }

  for (const scenario of simulation.results) {
    if (!triggerIdSet.has(scenario.triggerId)) issues.push(`UNKNOWN_SIMULATION_TRIGGER:${scenario.triggerId}`);
  }

  const simulationTriggerIds = new Set(simulation.results.map((result) => result.triggerId));
  for (const triggerId of triggerIds) {
    if (!simulationTriggerIds.has(triggerId)) issues.push(`TRIGGER_WITHOUT_SIMULATION:${triggerId}`);
  }

  if (gates.metrics.totalDecisionRows !== decisionIds.length) issues.push('HUMAN_GATE_METRIC_MISMATCH');
  if (matrix.metrics.triggerCount !== triggerIds.length) issues.push('TRIGGER_METRIC_MISMATCH');
  if (simulation.metrics.uniqueTriggerCount !== triggerIdSet.size) issues.push('SIMULATION_TRIGGER_COVERAGE_MISMATCH');

  const uniqueIssues = [...new Set(issues)];
  const body = {
    schemaVersion: EP001_CROSS_CONTRACT_INTEGRITY_SCHEMA,
    episodeId: gates.episodeId,
    integrityPass: uniqueIssues.length === 0,
    issues: uniqueIssues,
    metrics: {
      decisionIdCount: decisionIds.length,
      uniqueDecisionIdCount: decisionIdSet.size,
      triggerIdCount: triggerIds.length,
      uniqueTriggerIdCount: triggerIdSet.size,
      simulationCoveredTriggerCount: simulationTriggerIds.size,
      issueCount: uniqueIssues.length,
    },
    bindings: {
      humanGatePacketSha256: gates.humanGatePacketSha256,
      externalArrivalTriggerMatrixSha256: matrix.externalArrivalTriggerMatrixSha256,
      criticalPathSchedulerSha256: scheduler.criticalPathSchedulerSha256,
      simulationAuditSha256: simulation.simulationAuditSha256,
    },
    authority: {
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      autoRepairAllowed: false as const,
    },
    rules: [
      'Integrity audit may report drift but never auto-repairs contracts.',
      'Unknown or orphan IDs fail closed.',
      'Every external trigger must have synthetic handler coverage before real intake.',
    ],
  };

  return { ...body, crossContractIntegritySha256: sha256Canonical(body) };
}

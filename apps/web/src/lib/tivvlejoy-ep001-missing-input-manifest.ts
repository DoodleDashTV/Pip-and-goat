import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001CriticalPathScheduler } from '@/lib/tivvlejoy-ep001-critical-path-scheduler';
import { compileEp001ExternalArrivalTriggerMatrix } from '@/lib/tivvlejoy-ep001-external-arrival-trigger-matrix';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_MISSING_INPUT_MANIFEST_SCHEMA =
  'TIVVLEJOY_EP001_MISSING_INPUT_MANIFEST_V1' as const;

export function compileEp001MissingInputManifest() {
  const matrix = compileEp001ExternalArrivalTriggerMatrix();
  const scheduler = compileEp001CriticalPathScheduler();
  const gates = compileEp001HumanGatePacket();
  const phaseMap = new Map(scheduler.waitingLanes.map((lane) => [lane.triggerId, lane.phase]));

  const missingInputs = matrix.triggers.map((trigger) => ({
    triggerId: trigger.triggerId,
    arrivalClass: trigger.arrivalClass,
    subject: trigger.subject,
    dependencyPhase: phaseMap.get(trigger.triggerId) ?? null,
    requiredArrivalEvidence: [...trigger.requiredArrivalEvidence],
    relatedDecisionIds: [...trigger.relatedDecisionIds],
    safeActionsAfterArrival: [...trigger.automaticSafeNextActions],
    stillRequiresHumanOrExplicitAuthority: [...trigger.blockedUntilHumanOrExplicitAuthority],
    present: false as const,
  }));

  const phaseZeroInputs = missingInputs.filter((input) => input.dependencyPhase === 0);
  const body = {
    schemaVersion: EP001_MISSING_INPUT_MANIFEST_SCHEMA,
    episodeId: gates.episodeId,
    state: 'REAL_EXTERNAL_INPUTS_MISSING' as const,
    missingInputs,
    phaseZeroInputs,
    humanDecisionSummary: {
      totalRows: gates.metrics.totalDecisionRows,
      approvedRows: gates.metrics.approvedRows,
      rejectedRows: gates.metrics.rejectedRows,
      pendingRows: gates.metrics.pendingRows,
      humanGatePacketSha256: gates.humanGatePacketSha256,
    },
    metrics: {
      missingInputCount: missingInputs.length,
      phaseZeroMissingInputCount: phaseZeroInputs.length,
      missingRigInputs: missingInputs.filter((input) => input.arrivalClass === 'CHARACTER_RIG').length,
      missingPaidAuthorizationInputs: missingInputs.filter((input) => input.arrivalClass === 'PAID_AUTHORIZATION').length,
      missingHumanDecisionInputs: missingInputs.filter((input) => input.arrivalClass === 'HUMAN_DECISION').length,
      missingLicenseInputs: missingInputs.filter((input) => input.arrivalClass === 'LICENSE_EVIDENCE').length,
    },
    authority: {
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };

  return { ...body, missingInputManifestSha256: sha256Canonical(body) };
}

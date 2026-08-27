import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AutonomousControlRoom } from '@/lib/tivvlejoy-ep001-autonomous-control-room';
import { compileEp001CrossContractIntegrityAudit } from '@/lib/tivvlejoy-ep001-cross-contract-integrity';
import { compileEp001MissingInputManifest } from '@/lib/tivvlejoy-ep001-missing-input-manifest';
import { compileEp001UnblockingCombinationAudit } from '@/lib/tivvlejoy-ep001-unblocking-combination-audit';

export const EP001_EXTERNAL_HANDOFF_PACKAGE_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_HANDOFF_PACKAGE_V1' as const;

export function compileEp001ExternalHandoffPackage() {
  const controlRoom = compileEp001AutonomousControlRoom();
  const missing = compileEp001MissingInputManifest();
  const integrity = compileEp001CrossContractIntegrityAudit();
  const combinations = compileEp001UnblockingCombinationAudit();

  const foundationRequests = missing.phaseZeroInputs.map((input) => ({
    triggerId: input.triggerId,
    subject: input.subject,
    arrivalClass: input.arrivalClass,
    requiredEvidence: [...input.requiredArrivalEvidence],
    safeActionsAfterArrival: [...input.safeActionsAfterArrival],
    stillBlockedAfterArrival: [...input.stillRequiresHumanOrExplicitAuthority],
  }));

  const body = {
    schemaVersion: EP001_EXTERNAL_HANDOFF_PACKAGE_SCHEMA,
    episodeId: 'EP001' as const,
    packageState: 'READY_TO_RECEIVE_EXTERNAL_FOUNDATION_INPUTS' as const,
    foundationRequests,
    downstreamRequests: missing.missingInputs
      .filter((input) => input.dependencyPhase !== 0)
      .map((input) => ({
        triggerId: input.triggerId,
        subject: input.subject,
        dependencyPhase: input.dependencyPhase,
        requiredEvidence: [...input.requiredArrivalEvidence],
      })),
    verification: {
      crossContractIntegrityPass: integrity.integrityPass,
      crossContractIssueCount: integrity.metrics.issueCount,
      simulatedCombinationCount: combinations.metrics.combinationCount,
      simulatedAuthorityLeakCount: combinations.metrics.authorityLeakCount,
      humanDecisionRows: controlRoom.headline.humanDecisionRows,
      humanApprovalsIssued: controlRoom.headline.humanApprovalsIssued,
    },
    bindings: {
      autonomousControlRoomSha256: controlRoom.autonomousControlRoomSha256,
      missingInputManifestSha256: missing.missingInputManifestSha256,
      crossContractIntegritySha256: integrity.crossContractIntegritySha256,
      unblockingCombinationAuditSha256: combinations.unblockingCombinationAuditSha256,
      ...controlRoom.currentContracts,
    },
    reviewerInstructions: [
      'Submit real external evidence only; synthetic fixtures are never evidence.',
      'Preserve exact source bytes and record immutable SHA-256 before inspection.',
      'Do not infer approval from structural validation or a successful intake plan.',
      'Human decisions must bind to the exact current decision SHA-256.',
      'Paid authorization must be explicit, scoped, bounded, and separately validated.',
    ],
    authority: {
      evidenceReceived: false as const,
      admissionGranted: false as const,
      humanApprovalGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
    safety: {
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, externalHandoffPackageSha256: sha256Canonical(body) };
}

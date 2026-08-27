import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalHandoffPackage } from '@/lib/tivvlejoy-ep001-external-handoff-package';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_FOUNDATION_IMPACT_MAP_SCHEMA = 'TIVVLEJOY_EP001_FOUNDATION_IMPACT_MAP_V1' as const;

export function compileEp001FoundationImpactMap() {
  const handoff = compileEp001ExternalHandoffPackage();
  const gates = compileEp001HumanGatePacket();
  const knownDecisions = new Set(gates.rows.map((row) => row.decisionId));

  const inputs = handoff.foundationRequests.map((request) => {
    const unknownDecisionIds = request.relatedDecisionIds.filter((id) => !knownDecisions.has(id));
    return {
      triggerId: request.triggerId,
      subject: request.subject,
      relatedDecisionIds: [...request.relatedDecisionIds],
      impactedDecisionCount: request.relatedDecisionIds.length,
      unknownDecisionIds,
      impactIntegrityPass: unknownDecisionIds.length === 0,
      directAuthorityGrantedByArrival: false as const,
    };
  });

  const uniqueImpactedDecisionIds = [...new Set(inputs.flatMap((input) => input.relatedDecisionIds))];
  const body = {
    schemaVersion: EP001_FOUNDATION_IMPACT_MAP_SCHEMA,
    episodeId: gates.episodeId,
    externalHandoffPackageSha256: handoff.externalHandoffPackageSha256,
    humanGatePacketSha256: gates.humanGatePacketSha256,
    inputs,
    uniqueImpactedDecisionIds,
    unaffectedUntilDownstreamEvidence: gates.rows
      .map((row) => row.decisionId)
      .filter((id) => !uniqueImpactedDecisionIds.includes(id)),
    metrics: {
      foundationInputCount: inputs.length,
      totalDecisionRelationships: inputs.reduce((sum, input) => sum + input.impactedDecisionCount, 0),
      uniqueImpactedDecisionCount: uniqueImpactedDecisionIds.length,
      totalDecisionCount: gates.rows.length,
      impactIntegrityFailureCount: inputs.filter((input) => !input.impactIntegrityPass).length,
    },
    authority: {
      admissionGranted: false as const,
      humanApprovalGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };

  return { ...body, foundationImpactMapSha256: sha256Canonical(body) };
}

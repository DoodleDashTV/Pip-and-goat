import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';
import { validateEp001HumanDecisionReceipt } from '@/lib/tivvlejoy-ep001-human-decision-receipt';

export const EP001_HUMAN_DECISION_PREPARER_SCHEMA = 'TIVVLEJOY_EP001_HUMAN_DECISION_PREPARER_V1' as const;

export function prepareEp001HumanDecisionReceipt(input: {
  decisionId: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string;
  reviewedAt: string;
  evidenceRefs: string[];
}) {
  const packet = compileEp001HumanGatePacket();
  const row = packet.rows.find((item) => item.decisionId === input.decisionId);
  if (!row) throw new Error('UNKNOWN_DECISION_ID');
  const canonicalBody = {
    schemaVersion: 'TIVVLEJOY_EP001_HUMAN_DECISION_RECEIPT_V1',
    episodeId: packet.episodeId,
    decisionId: input.decisionId,
    bindingSha256: row.bindingSha256,
    decision: input.decision,
    reviewerId: input.reviewerId.trim(),
    reviewedAt: input.reviewedAt,
    evidenceRefs: [...input.evidenceRefs],
  };
  const receiptSha256 = sha256Canonical(canonicalBody);
  const receipt = { ...canonicalBody, receiptSha256 };
  const validation = validateEp001HumanDecisionReceipt(receipt);
  return {
    schemaVersion: EP001_HUMAN_DECISION_PREPARER_SCHEMA,
    episodeId: packet.episodeId,
    receipt,
    validation,
    state: validation.structurallyValid ? 'STRUCTURALLY_VALID_RECEIPT_PREPARED' as const : 'RECEIPT_PREPARATION_INVALID' as const,
    authority: {
      approvalRecorded: false as const,
      evidenceAdmissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };
}

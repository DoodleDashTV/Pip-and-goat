import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_HUMAN_DECISION_RECEIPT_SCHEMA = 'TIVVLEJOY_EP001_HUMAN_DECISION_RECEIPT_V1' as const;
const SHA256 = /^[a-f0-9]{64}$/;

export type Ep001HumanDecisionReceiptInput = {
  decisionId: string;
  bindingSha256: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerId: string;
  reviewedAt: string;
  evidenceRefs: string[];
  receiptSha256: string;
};

export function validateEp001HumanDecisionReceipt(input: Ep001HumanDecisionReceiptInput) {
  const packet = compileEp001HumanGatePacket();
  const row = packet.rows.find((candidate) => candidate.decisionId === input.decisionId);
  const issues: string[] = [];

  if (!row) issues.push('UNKNOWN_DECISION_ID');
  if (!SHA256.test(input.bindingSha256)) issues.push('BINDING_SHA256_INVALID');
  if (row && input.bindingSha256 !== row.bindingSha256) issues.push('STALE_OR_WRONG_BINDING_SHA256');
  if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') issues.push('DECISION_INVALID');
  if (!input.reviewerId.trim()) issues.push('REVIEWER_ID_REQUIRED');
  if (!Number.isFinite(Date.parse(input.reviewedAt))) issues.push('REVIEWED_AT_INVALID');
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0) issues.push('EVIDENCE_REFS_REQUIRED');
  if (input.evidenceRefs.some((ref) => !ref.trim())) issues.push('EVIDENCE_REF_EMPTY');
  if (!SHA256.test(input.receiptSha256)) issues.push('RECEIPT_SHA256_INVALID');

  const canonicalReceiptBody = {
    schemaVersion: EP001_HUMAN_DECISION_RECEIPT_SCHEMA,
    episodeId: packet.episodeId,
    decisionId: input.decisionId,
    bindingSha256: input.bindingSha256,
    decision: input.decision,
    reviewerId: input.reviewerId.trim(),
    reviewedAt: input.reviewedAt,
    evidenceRefs: [...input.evidenceRefs],
  };
  const expectedReceiptSha256 = sha256Canonical(canonicalReceiptBody);
  if (SHA256.test(input.receiptSha256) && input.receiptSha256 !== expectedReceiptSha256)
    issues.push('RECEIPT_HASH_MISMATCH');

  return {
    schemaVersion: EP001_HUMAN_DECISION_RECEIPT_SCHEMA,
    episodeId: packet.episodeId,
    decisionId: input.decisionId,
    knownDecisionId: Boolean(row),
    currentBindingSha256: row?.bindingSha256 ?? null,
    expectedReceiptSha256,
    structurallyValid: issues.length === 0,
    issues: [...new Set(issues)],
    authority: {
      approvalRecorded: false as const,
      evidenceAdmissionGranted: false as const,
      paidRenderAuthorized: false as const,
      productionWritesAllowed: false as const,
    },
  };
}

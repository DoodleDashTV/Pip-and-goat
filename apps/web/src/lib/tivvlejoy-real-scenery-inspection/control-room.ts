import { CONTROL_ROOM_SCHEMA, type EvidenceClass } from './types';
import type { DiscoveryReport } from './discovery';
import type { InspectedSourceReport } from './pipeline';
import type { ApprovalReceipt } from './approval';

export type ControlRoomSourceRow = {
  sourceId: string;
  displayName: string;
  format: string;
  storedSize: number | null;
  hashStatus: 'VERIFIED' | 'MISSING' | 'MISMATCH' | 'UNKNOWN';
  inspectionState: string;
  dependencyStatus: string;
  styleState: string;
  childCandidateCount: number;
  blocker: string | null;
  nextSafeAction: string;
};

export type ControlRoomModel = {
  schema: typeof CONTROL_ROOM_SCHEMA;
  evidenceClass: EvidenceClass;
  catalogSources: number;
  storedSources: number;
  verifiedHashes: number;
  inspectionReady: number;
  inspectionComplete: number;
  deepInspectionPending: number;
  logicalChildrenDiscovered: number;
  readyForVisualReview: number;
  approved: number;
  blocked: number;
  archival: number;
  sources: ControlRoomSourceRow[];
  exposedObjectKeys: false;
  exposedSignedUrls: false;
  exposedCredentials: false;
  banner: string;
};

export function buildSceneryInspectionControlRoom(input: {
  discovery: DiscoveryReport;
  inspected?: InspectedSourceReport[];
  approvals?: ApprovalReceipt[];
  evidenceClass?: EvidenceClass;
}): ControlRoomModel {
  const inspected = input.inspected ?? [];
  const byId = new Map(inspected.map((item) => [item.receipt.sourceId, item]));
  const sources: ControlRoomSourceRow[] = input.discovery.catalogSources.map((receipt) => {
    const report = byId.get(receipt.sourceId);
    const hashStatus =
      report?.materialization.state === 'SOURCE_HASH_MISMATCH'
        ? 'MISMATCH'
        : report?.materialization.observedSha256
          ? 'VERIFIED'
          : receipt.sourceSha256
            ? 'UNKNOWN'
            : 'MISSING';
    const blocker = report?.materialization.blocker ?? input.discovery.inspectionBlockedSources.find((item) => item.sourceId === receipt.sourceId)?.blocker ?? null;
    return {
      sourceId: receipt.sourceId,
      displayName: receipt.displayName ?? receipt.sourceId,
      format: receipt.formatHint ?? 'UNKNOWN',
      storedSize: receipt.storedByteSize,
      hashStatus,
      inspectionState: report ? report.evidenceByChild[0]?.sourceState ?? 'INSPECTED' : 'NOT_INSPECTED',
      dependencyStatus: report?.evidenceByChild[0]?.dependencyFindings.approvalReadyBlocked ? 'BLOCKED' : 'OK',
      styleState: report?.evidenceByChild[0]?.styleClassification.state ?? 'UNKNOWN',
      childCandidateCount: report?.children.length ?? 0,
      blocker,
      nextSafeAction: blocker
        ? 'Record the blocker and leave the stored source unchanged.'
        : report?.readyForVisualReview
          ? 'Queue human visual review. Do not auto-approve.'
          : 'Inspect the next catalog source without filename selection.',
    };
  });
  return {
    schema: CONTROL_ROOM_SCHEMA,
    evidenceClass: input.evidenceClass ?? 'SYNTHETIC_FIXTURE',
    catalogSources: input.discovery.counts.catalog,
    storedSources: input.discovery.counts.stored,
    verifiedHashes: input.discovery.counts.hashVerified,
    inspectionReady: input.discovery.counts.candidates,
    inspectionComplete: inspected.length,
    deepInspectionPending: inspected.filter((item) =>
      item.evidenceByChild.some((evidence) => evidence.deepInspection.state === 'DEEP_BLENDER_INSPECTION_PENDING'),
    ).length,
    logicalChildrenDiscovered: inspected.reduce((sum, item) => sum + item.children.length, 0),
    readyForVisualReview: inspected.reduce((sum, item) => sum + item.readyForVisualReview, 0),
    approved: (input.approvals ?? []).filter((item) => item.issued && item.state === 'APPROVED').length,
    blocked: input.discovery.counts.blocked,
    archival: input.discovery.counts.wrappers + input.discovery.counts.historical,
    sources,
    exposedObjectKeys: false,
    exposedSignedUrls: false,
    exposedCredentials: false,
    banner: 'upload != inspected != approved. Synthetic fixture evidence cannot masquerade as real commercial inspection.',
  };
}

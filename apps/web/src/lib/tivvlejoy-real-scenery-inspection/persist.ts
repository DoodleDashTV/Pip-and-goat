import { eventTypeFor } from '@/lib/tivvlejoy-production-persistence/events';
import type { ProductionPersistenceStore } from '@/lib/tivvlejoy-production-persistence/store';
import type { JournalEventType, WriteReceipt } from '@/lib/tivvlejoy-production-persistence/types';
import { containsSecret } from '@/lib/tivvlejoy-production-persistence/sanitizer';
import type { InspectionEvidence } from './evidence';
import type { ApprovalReceipt } from './approval';
import type { DiscoveredLogicalAsset } from './logical';
import type { QuarantineRecord } from './quarantine';

export type PersistedInspectionState = {
  evidences: InspectionEvidence[];
  children: DiscoveredLogicalAsset[];
  approvals: ApprovalReceipt[];
  quarantines: QuarantineRecord[];
  revision: number;
};

function write(
  store: ProductionPersistenceStore,
  entityType: Parameters<ProductionPersistenceStore['writeRecord']>[0]['entityType'],
  entityId: string,
  payload: Record<string, unknown>,
  eventType?: JournalEventType,
): WriteReceipt {
  if (containsSecret(payload)) {
    throw new Error('Refusing to persist secrets or signed URLs.');
  }
  return store.writeRecord({
    entityType,
    entityId,
    payload,
    expectedRevision: store.getRevision(),
    eventType: eventType ?? eventTypeFor(entityType),
    reason: `persist ${entityType}`,
  });
}

export function persistInspectionArtifacts(input: {
  store: ProductionPersistenceStore;
  evidence: InspectionEvidence;
  children: DiscoveredLogicalAsset[];
  approval?: ApprovalReceipt | null;
  quarantine?: QuarantineRecord | null;
}): WriteReceipt[] {
  if (containsSecret(input.evidence) || input.children.some((child) => containsSecret(child))) {
    throw new Error('Refusing to persist secrets or signed URLs.');
  }
  const receipts: WriteReceipt[] = [];
  receipts.push(
    write(input.store, 'SCENERY_SOURCE_RECEIPT', input.evidence.sourceId, {
      sourceId: input.evidence.sourceId,
      sourceReceiptRef: input.evidence.sourceReceiptRef,
      sourceSha256: input.evidence.sourceSha256,
      storedByteSize: input.evidence.storedByteSize,
      sourceState: input.evidence.sourceState,
    }, 'SOURCE_MATERIALIZED'),
  );
  if (input.evidence.sourceSha256) {
    receipts.push(
      write(input.store, 'SCENERY_SOURCE_RECEIPT', `${input.evidence.sourceId}:hash`, {
        sourceSha256: input.evidence.sourceSha256,
      }, 'SOURCE_HASH_VERIFIED'),
    );
  }
  if (input.evidence.containerState && input.evidence.containerState !== 'NOT_AN_ARCHIVE') {
    receipts.push(
      write(input.store, 'SCENERY_INSPECTION_RECEIPT', `${input.evidence.inspectionSha256}:archive`, {
        containerState: input.evidence.containerState,
        inspectionSha256: input.evidence.inspectionSha256,
      }, 'ARCHIVE_INSPECTED'),
    );
  }
  receipts.push(
    write(input.store, 'SCENERY_INSPECTION_RECEIPT', input.evidence.inspectionSha256, {
      inspectionSha256: input.evidence.inspectionSha256,
      inspectionMethod: input.evidence.inspectionMethod,
      blockers: input.evidence.blockers,
      containerState: input.evidence.containerState,
    }, input.evidence.deepInspection.state === 'DEEP_BLENDER_INSPECTED' ? 'DEEP_INSPECTION_COMPLETED' : 'STATIC_FORMAT_INSPECTED'),
  );
  if (input.evidence.quality.tiers.includes('HERO')) {
    receipts.push(
      write(input.store, 'SCENERY_VISUAL_EVIDENCE', `${input.evidence.inspectionSha256}:visual`, {
        inspectionSha256: input.evidence.inspectionSha256,
        visualApprovalAutomatic: false,
      }, 'VISUAL_REVIEW_REQUESTED'),
    );
  }
  for (const child of input.children) {
    receipts.push(
      write(input.store, 'SCENERY_LOGICAL_ASSET', child.assetCandidateId, {
        assetCandidateId: child.assetCandidateId,
        sourceId: child.sourceId,
        candidateDependencySha256: child.candidateDependencySha256,
        assetKind: child.assetKind,
      }, 'LOGICAL_ASSET_DISCOVERED'),
    );
  }
  receipts.push(
    write(input.store, 'SCENERY_INSPECTION_RECEIPT', `${input.evidence.inspectionSha256}:roles`, {
      roles: input.evidence.semanticClassification.roles,
    }, 'SEMANTIC_CLASSIFICATION_RECORDED'),
  );
  if (input.approval) {
    receipts.push(
      write(
        input.store,
        'SCENERY_APPROVAL_RECEIPT',
        input.approval.approvalReceiptId,
        {
          approvalSha256: input.approval.approvalSha256,
          state: input.approval.state,
          issued: input.approval.issued,
          assetCandidateId: input.approval.assetCandidateId,
        },
        input.approval.state === 'REJECTED' ? 'ASSET_REJECTED' : input.approval.state === 'ARCHIVAL_ONLY' ? 'ASSET_ARCHIVED' : 'ASSET_APPROVED',
      ),
    );
    receipts.push(
      write(input.store, 'SCENERY_PRODUCTION_LIBRARY', input.approval.assetCandidateId, {
        approvalSha256: input.approval.approvalSha256,
        inspectionSha256: input.approval.inspectionSha256,
      }, 'REGISTRY_UPDATED'),
    );
  }
  if (input.quarantine) {
    receipts.push(
      write(input.store, 'SCENERY_QUARANTINE', input.quarantine.sourceId, {
        reasons: input.quarantine.reasons,
        storedSourceDeleted: false,
      }, 'ASSET_ARCHIVED'),
    );
  }
  return receipts;
}

export function restoreInspectionState(store: ProductionPersistenceStore): PersistedInspectionState {
  const evidences = store
    .listRecords()
    .filter((record) => record.entityType === 'SCENERY_INSPECTION_RECEIPT' && record.payload.inspectionSha256)
    .map((record) => record.payload as unknown as InspectionEvidence);
  const children = store
    .listRecords()
    .filter((record) => record.entityType === 'SCENERY_LOGICAL_ASSET')
    .map((record) => record.payload as unknown as DiscoveredLogicalAsset);
  const approvals = store
    .listRecords()
    .filter((record) => record.entityType === 'SCENERY_APPROVAL_RECEIPT')
    .map((record) => record.payload as unknown as ApprovalReceipt);
  const quarantines = store
    .listRecords()
    .filter((record) => record.entityType === 'SCENERY_QUARANTINE')
    .map((record) => record.payload as unknown as QuarantineRecord);
  return { evidences, children, approvals, quarantines, revision: store.getRevision() };
}

export function reuseInspectionReceipt(
  store: ProductionPersistenceStore,
  sourceId: string,
  sourceSha256: string,
): Record<string, unknown> | null {
  const source = store.readRecord('SCENERY_SOURCE_RECEIPT', sourceId);
  if (!source || source.payload.sourceSha256 !== sourceSha256) return null;
  return store
    .listRecords()
    .find((record) => record.entityType === 'SCENERY_INSPECTION_RECEIPT' && record.payload.inspectionSha256)
    ?.payload ?? null;
}

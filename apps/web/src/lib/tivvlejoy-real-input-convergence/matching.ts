import type { AbstractSourceReceipt } from '@/lib/tivvlejoy-real-scenery-inspection/types';
import { isValidSha256, sha256Text } from './hash';
import type {
  MatchCounts,
  ObjectReceiptMatch,
  PrivateObjectInventory,
  ReceiptObjectReconciliation,
} from './types';

export function reconcileReceiptsAndObjects(input: {
  inventory: PrivateObjectInventory;
  receipts: readonly AbstractSourceReceipt[];
}): ReceiptObjectReconciliation {
  const matches: ObjectReceiptMatch[] = [];
  const usedIdentities = new Set<string>();
  const sizeByIdentity = new Map<string, number[]>();

  for (const object of input.inventory.objects) {
    const sizes = sizeByIdentity.get(object.objectIdentity) ?? [];
    sizes.push(object.size);
    sizeByIdentity.set(object.objectIdentity, sizes);
  }

  for (const receipt of input.receipts) {
    const byReceipt = input.inventory.objects.find(
      (object) => object.knownUploadReceipt === receipt.sourceReceiptRef || object.receiptRelationship === receipt.sourceReceiptRef,
    );
    const bySourceId = input.inventory.objects.find((object) => object.catalogSourceId === receipt.sourceId);
    const object = byReceipt ?? bySourceId;
    if (!object) {
      matches.push({
        objectIdentity: null,
        sourceId: receipt.sourceId,
        receiptRef: receipt.sourceReceiptRef,
        state: 'RECEIPT_MISSING_OBJECT',
        expectedSize: receipt.storedByteSize,
        observedSize: null,
        expectedSha256: receipt.sourceSha256,
      });
      continue;
    }
    usedIdentities.add(object.objectIdentity);
    if (receipt.storedByteSize != null && receipt.storedByteSize !== object.size) {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: receipt.sourceId,
        receiptRef: receipt.sourceReceiptRef,
        state: 'SIZE_MISMATCH',
        expectedSize: receipt.storedByteSize,
        observedSize: object.size,
        expectedSha256: receipt.sourceSha256,
      });
      continue;
    }
    if (!isValidSha256(receipt.sourceSha256) && !isValidSha256(object.knownSourceSha256)) {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: receipt.sourceId,
        receiptRef: receipt.sourceReceiptRef,
        state: 'HASH_MISSING',
        expectedSize: receipt.storedByteSize,
        observedSize: object.size,
        expectedSha256: receipt.sourceSha256,
      });
      continue;
    }
    if (object.knownPackageRole === 'WRAPPER' || receipt.canonicalSourceRelation === 'WRAPPER') {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: receipt.sourceId,
        receiptRef: receipt.sourceReceiptRef,
        state: 'WRAPPER_OBJECT',
        expectedSize: receipt.storedByteSize,
        observedSize: object.size,
        expectedSha256: receipt.sourceSha256,
      });
      continue;
    }
    if (object.knownPackageRole === 'HISTORICAL_DUPLICATE' || receipt.canonicalSourceRelation === 'HISTORICAL_VERSION') {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: receipt.sourceId,
        receiptRef: receipt.sourceReceiptRef,
        state: 'HISTORICAL_OBJECT',
        expectedSize: receipt.storedByteSize,
        observedSize: object.size,
        expectedSha256: receipt.sourceSha256,
      });
      continue;
    }
    matches.push({
      objectIdentity: object.objectIdentity,
      sourceId: receipt.sourceId,
      receiptRef: receipt.sourceReceiptRef,
      state: 'RECEIPT_OBJECT_MATCHED',
      expectedSize: receipt.storedByteSize,
      observedSize: object.size,
      expectedSha256: receipt.sourceSha256,
    });
  }

  const identityCounts = new Map<string, number>();
  for (const object of input.inventory.objects) {
    identityCounts.set(object.objectIdentity, (identityCounts.get(object.objectIdentity) ?? 0) + 1);
  }

  for (const object of input.inventory.objects) {
    if ((identityCounts.get(object.objectIdentity) ?? 0) > 1) {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: object.catalogSourceId,
        receiptRef: object.knownUploadReceipt,
        state: 'DUPLICATE_STORED_OBJECT',
        expectedSize: null,
        observedSize: object.size,
        expectedSha256: object.knownSourceSha256,
      });
    }
    if (usedIdentities.has(object.objectIdentity)) continue;
    if (object.knownPackageRole === 'WRAPPER') {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: object.catalogSourceId,
        receiptRef: object.knownUploadReceipt,
        state: 'WRAPPER_OBJECT',
        expectedSize: null,
        observedSize: object.size,
        expectedSha256: object.knownSourceSha256,
      });
      continue;
    }
    if (object.knownPackageRole === 'HISTORICAL_DUPLICATE') {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: object.catalogSourceId,
        receiptRef: object.knownUploadReceipt,
        state: 'HISTORICAL_OBJECT',
        expectedSize: null,
        observedSize: object.size,
        expectedSha256: object.knownSourceSha256,
      });
      continue;
    }
    if (!object.knownUploadReceipt && !object.catalogSourceId) {
      matches.push({
        objectIdentity: object.objectIdentity,
        sourceId: null,
        receiptRef: null,
        state: object.knownPackageRole === 'RECEIPT_METADATA' ? 'UNKNOWN_OBJECT' : 'OBJECT_MISSING_RECEIPT',
        expectedSize: null,
        observedSize: object.size,
        expectedSha256: object.knownSourceSha256,
      });
      continue;
    }
    matches.push({
      objectIdentity: object.objectIdentity,
      sourceId: object.catalogSourceId,
      receiptRef: object.knownUploadReceipt,
      state: 'OBJECT_MISSING_RECEIPT',
      expectedSize: null,
      observedSize: object.size,
      expectedSha256: object.knownSourceSha256,
    });
  }

  const counts: MatchCounts = {
    receiptObjectMatched: matches.filter((item) => item.state === 'RECEIPT_OBJECT_MATCHED').length,
    receiptMissingObject: matches.filter((item) => item.state === 'RECEIPT_MISSING_OBJECT').length,
    objectMissingReceipt: matches.filter((item) => item.state === 'OBJECT_MISSING_RECEIPT').length,
    sizeMismatch: matches.filter((item) => item.state === 'SIZE_MISMATCH').length,
    hashMissing: matches.filter((item) => item.state === 'HASH_MISSING').length,
    duplicateStoredObject: matches.filter((item) => item.state === 'DUPLICATE_STORED_OBJECT').length,
    wrapperObject: matches.filter((item) => item.state === 'WRAPPER_OBJECT').length,
    historicalObject: matches.filter((item) => item.state === 'HISTORICAL_OBJECT').length,
    unknownObject: matches.filter((item) => item.state === 'UNKNOWN_OBJECT').length,
  };

  return {
    schemaVersion: 'TIVVLEJOY_RECEIPT_OBJECT_MATCHING_V1',
    matches,
    counts,
  };
}

export function duplicateReceiptFingerprint(receipt: AbstractSourceReceipt): string {
  return sha256Text(`${receipt.sourceId}:${receipt.sourceReceiptRef ?? ''}:${receipt.sourceSha256 ?? ''}`);
}

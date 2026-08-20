import { MATERIALIZATION_SCHEMA, type AbstractSourceReceipt, type CanonicalSourceRelation } from './types';
import { isValidSha256 } from './hash';

export type PurchasedAssetAuditLike = {
  sourceId?: string;
  id?: string;
  sourceReceiptRef?: string | null;
  receiptRef?: string | null;
  storedByteSize?: number | null;
  byteSize?: number | null;
  size?: number | null;
  sourceSha256?: string | null;
  sha256?: string | null;
  storageState?: string | null;
  stored?: boolean;
  catalogPresent?: boolean;
  receiptPresent?: boolean;
  provenanceState?: string | null;
  licenseState?: string | null;
  originalFilename?: string;
  filename?: string;
  displayName?: string;
  formatHint?: string;
  nativeFormat?: string;
  packageFamily?: string;
  packageVersion?: string;
  wrapperOfSourceId?: string | null;
  historicalOfSourceId?: string | null;
  canonicalSourceRelation?: CanonicalSourceRelation;
  duplicateState?: string | null;
  canonicalCandidate?: boolean;
  notes?: string[];
};

function asStorageState(input: PurchasedAssetAuditLike): AbstractSourceReceipt['storageState'] {
  if (input.storageState === 'STORED' || input.stored === true) return 'STORED';
  if (input.storageState === 'MISSING' || input.stored === false) return 'MISSING';
  return 'UNKNOWN';
}

function asProvenance(input: PurchasedAssetAuditLike): AbstractSourceReceipt['provenanceState'] {
  if (input.provenanceState === 'PROVENANCE_RESOLVED' || input.provenanceState === 'RESOLVED') {
    return 'PROVENANCE_RESOLVED';
  }
  if (input.provenanceState === 'PROVENANCE_REVIEW_REQUIRED' || input.provenanceState === 'REVIEW') {
    return 'PROVENANCE_REVIEW_REQUIRED';
  }
  return 'PROVENANCE_UNKNOWN';
}

function asLicense(input: PurchasedAssetAuditLike): AbstractSourceReceipt['licenseState'] {
  if (
    input.licenseState === 'LICENSE_INTERNAL_PRODUCTION_APPROVED' ||
    input.licenseState === 'APPROVED_INTERNAL'
  ) {
    return 'LICENSE_INTERNAL_PRODUCTION_APPROVED';
  }
  if (input.licenseState === 'LICENSE_BLOCKED' || input.licenseState === 'BLOCKED') {
    return 'LICENSE_BLOCKED';
  }
  return 'LICENSE_REVIEW_REQUIRED';
}

function asRelation(input: PurchasedAssetAuditLike): CanonicalSourceRelation {
  if (input.canonicalSourceRelation) return input.canonicalSourceRelation;
  if (input.wrapperOfSourceId) return 'WRAPPER';
  if (input.historicalOfSourceId) return 'HISTORICAL_VERSION';
  if (input.duplicateState && input.duplicateState !== 'NONE') return 'DUPLICATE';
  if (input.canonicalCandidate) return 'DIRECT_ORIGINAL';
  return 'UNKNOWN';
}

export function adaptPurchasedAssetReceipt(input: PurchasedAssetAuditLike): AbstractSourceReceipt {
  const sourceId = String(input.sourceId ?? input.id ?? '').trim();
  if (!sourceId) {
    throw new Error('Source identity requires sourceId. Filename is never a production identity.');
  }
  const storedByteSize = input.storedByteSize ?? input.byteSize ?? input.size ?? null;
  const sourceSha256 = input.sourceSha256 ?? input.sha256 ?? null;
  return {
    sourceId,
    sourceReceiptRef: input.sourceReceiptRef ?? input.receiptRef ?? null,
    storedByteSize: storedByteSize == null ? null : Number(storedByteSize),
    sourceSha256: isValidSha256(sourceSha256) ? sourceSha256 : sourceSha256,
    storageState: asStorageState(input),
    provenanceState: asProvenance(input),
    licenseState: asLicense(input),
    canonicalSourceRelation: asRelation(input),
    originalFilename: input.originalFilename ?? input.filename,
    displayName: input.displayName ?? input.originalFilename ?? input.filename,
    formatHint: input.formatHint ?? input.nativeFormat,
    catalogPresent: input.catalogPresent ?? Boolean(sourceId),
    receiptPresent: input.receiptPresent ?? Boolean(input.sourceReceiptRef ?? input.receiptRef),
    packageFamily: input.packageFamily,
    packageVersion: input.packageVersion,
    wrapperOfSourceId: input.wrapperOfSourceId ?? null,
    historicalOfSourceId: input.historicalOfSourceId ?? null,
    notes: input.notes ?? [],
  };
}

export function adaptPurchasedAssetCatalog(inputs: readonly PurchasedAssetAuditLike[]): AbstractSourceReceipt[] {
  return inputs.map(adaptPurchasedAssetReceipt);
}

export function productionIdentityOf(receipt: AbstractSourceReceipt): {
  schemaVersion: typeof MATERIALIZATION_SCHEMA;
  sourceId: string;
  sourceReceiptRef: string | null;
  storedByteSize: number | null;
  sourceSha256: string | null;
  storageState: AbstractSourceReceipt['storageState'];
  provenanceState: AbstractSourceReceipt['provenanceState'];
  licenseState: AbstractSourceReceipt['licenseState'];
  canonicalSourceRelation: CanonicalSourceRelation;
  filenameUsedForIdentity: false;
} {
  return {
    schemaVersion: MATERIALIZATION_SCHEMA,
    sourceId: receipt.sourceId,
    sourceReceiptRef: receipt.sourceReceiptRef,
    storedByteSize: receipt.storedByteSize,
    sourceSha256: receipt.sourceSha256,
    storageState: receipt.storageState,
    provenanceState: receipt.provenanceState,
    licenseState: receipt.licenseState,
    canonicalSourceRelation: receipt.canonicalSourceRelation,
    filenameUsedForIdentity: false,
  };
}

export function filenameIsProvenanceOnly(receipt: AbstractSourceReceipt): boolean {
  return Boolean(receipt.originalFilename) && receipt.sourceId !== receipt.originalFilename;
}

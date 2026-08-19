import {
  EXECUTION_ASSET_RECEIPT_SCHEMA,
  PURCHASED_TOOL_SOURCE_RECEIPT_SCHEMA,
  UNRESOLVED,
  type ExecutionAssetRequirement,
} from './types';

export type PurchasedToolSourceReceipt = {
  schemaVersion: typeof PURCHASED_TOOL_SOURCE_RECEIPT_SCHEMA;
  sourceId: string;
  displayName: string;
  version: string;
  role: string;
  activation: string;
  originalFilename: string;
  byteSize: number;
  objectKey: string;
  stored: boolean;
  clientSha256: string;
  hashVerification: string;
  rawRedistributionAllowed: boolean;
  sourceImmutable: boolean;
};

export function purchasedToolSourceReceiptAdapter(input: PurchasedToolSourceReceipt): ExecutionAssetRequirement {
  return {
    schemaVersion: EXECUTION_ASSET_RECEIPT_SCHEMA,
    slotId: input.role || input.sourceId,
    required: true,
    sourceId: input.sourceId,
    version: input.version || UNRESOLVED,
    sha256: input.clientSha256 || UNRESOLVED,
    approvalStatus: 'unapproved',
    provenanceStatus: 'UNRESOLVED_PROVENANCE',
    sourceReceiptRef: input.stored ? `UPLOAD_ONLY:${input.sourceId}` : UNRESOLVED,
    derivativeReceiptRef: UNRESOLVED,
    filenameOnlyApproval: false,
  };
}

export function botaniqUploadIsInsufficient(receipt: PurchasedToolSourceReceipt) {
  const adapted = purchasedToolSourceReceiptAdapter(receipt);
  return (
    receipt.role.toLowerCase().includes('botaniq') &&
    receipt.stored &&
    adapted.approvalStatus !== 'approved' &&
    adapted.provenanceStatus !== 'RESOLVED_APPROVED'
  );
}

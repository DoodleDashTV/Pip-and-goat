import { isValidSha256 } from './hash';
import type { AbstractSourceReceipt } from './types';

export type DiscoveryReport = {
  catalogSources: AbstractSourceReceipt[];
  storedSources: AbstractSourceReceipt[];
  missingSources: AbstractSourceReceipt[];
  hashVerifiedSources: AbstractSourceReceipt[];
  inspectionCandidates: AbstractSourceReceipt[];
  inspectionBlockedSources: Array<AbstractSourceReceipt & { blocker: string }>;
  archiveWrappers: AbstractSourceReceipt[];
  duplicates: AbstractSourceReceipt[];
  historicalVersions: AbstractSourceReceipt[];
  counts: {
    catalog: number;
    stored: number;
    missing: number;
    hashVerified: number;
    candidates: number;
    blocked: number;
    wrappers: number;
    duplicates: number;
    historical: number;
  };
  hardcodedAssetTotal: false;
};

function blockerFor(receipt: AbstractSourceReceipt): string | null {
  if (!receipt.receiptPresent || !receipt.sourceReceiptRef) return 'SOURCE_RECEIPT_MISSING';
  if (receipt.storageState !== 'STORED') return 'SOURCE_NOT_AVAILABLE';
  if (receipt.storedByteSize == null || receipt.storedByteSize < 0) return 'SOURCE_SIZE_UNKNOWN';
  if (receipt.licenseState === 'LICENSE_BLOCKED') return 'LICENSE_BLOCKED';
  if (receipt.provenanceState === 'PROVENANCE_UNKNOWN') return 'PROVENANCE_BLOCKED';
  return null;
}

export function discoverInspectionCatalog(catalog: readonly AbstractSourceReceipt[]): DiscoveryReport {
  const catalogSources = [...catalog];
  const storedSources = catalogSources.filter((item) => item.storageState === 'STORED');
  const missingSources = catalogSources.filter((item) => item.storageState !== 'STORED');
  const hashVerifiedSources = storedSources.filter((item) => isValidSha256(item.sourceSha256));
  const archiveWrappers = catalogSources.filter((item) => item.canonicalSourceRelation === 'WRAPPER');
  const duplicates = catalogSources.filter((item) => item.canonicalSourceRelation === 'DUPLICATE');
  const historicalVersions = catalogSources.filter((item) => item.canonicalSourceRelation === 'HISTORICAL_VERSION');

  const inspectionBlockedSources: DiscoveryReport['inspectionBlockedSources'] = [];
  const inspectionCandidates: AbstractSourceReceipt[] = [];
  for (const receipt of catalogSources) {
    const blocker = blockerFor(receipt);
    if (blocker) inspectionBlockedSources.push({ ...receipt, blocker });
    else inspectionCandidates.push(receipt);
  }

  return {
    catalogSources,
    storedSources,
    missingSources,
    hashVerifiedSources,
    inspectionCandidates,
    inspectionBlockedSources,
    archiveWrappers,
    duplicates,
    historicalVersions,
    counts: {
      catalog: catalogSources.length,
      stored: storedSources.length,
      missing: missingSources.length,
      hashVerified: hashVerifiedSources.length,
      candidates: inspectionCandidates.length,
      blocked: inspectionBlockedSources.length,
      wrappers: archiveWrappers.length,
      duplicates: duplicates.length,
      historical: historicalVersions.length,
    },
    hardcodedAssetTotal: false,
  };
}

export function indexSourcesById(catalog: readonly AbstractSourceReceipt[]): Map<string, AbstractSourceReceipt> {
  const index = new Map<string, AbstractSourceReceipt>();
  for (const receipt of catalog) index.set(receipt.sourceId, receipt);
  return index;
}

export function indexSourcesByHash(catalog: readonly AbstractSourceReceipt[]): Map<string, AbstractSourceReceipt[]> {
  const index = new Map<string, AbstractSourceReceipt[]>();
  for (const receipt of catalog) {
    if (!isValidSha256(receipt.sourceSha256)) continue;
    const list = index.get(receipt.sourceSha256) ?? [];
    list.push(receipt);
    index.set(receipt.sourceSha256, list);
  }
  return index;
}

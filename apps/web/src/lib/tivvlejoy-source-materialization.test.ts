import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  adaptPurchasedAssetCatalog,
  adaptPurchasedAssetReceipt,
  cleanupMaterialization,
  createIsolatedWorkspace,
  destroyIsolatedWorkspace,
  discoverInspectionCatalog,
  filenameIsProvenanceOnly,
  indexSourcesByHash,
  indexSourcesById,
  isUnsafeWorkspacePath,
  make29StyleFixture,
  makeCatalog,
  matchingBytes,
  materializeSource,
  productionIdentityOf,
  safetyReport,
  scanCommittedCommercialBinaries,
  withIsolatedWorkspace,
  writeReadOnlySourceCopy,
} from './tivvlejoy-real-scenery-inspection';

describe('TIVVLEJOY_SOURCE_MATERIALIZATION_V1', () => {
  it('adapts audit receipts without using filename as identity', () => {
    const receipt = adaptPurchasedAssetReceipt({
      sourceId: 'SRC_TAVERN',
      filename: 'Super Tavern Pack.zip',
      sourceReceiptRef: 'receipt:tavern',
      storedByteSize: 99,
      sourceSha256: matchingBytes('tavern').sha256,
      stored: true,
    });
    expect(receipt.sourceId).toBe('SRC_TAVERN');
    expect(receipt.originalFilename).toBe('Super Tavern Pack.zip');
    expect(productionIdentityOf(receipt).filenameUsedForIdentity).toBe(false);
    expect(filenameIsProvenanceOnly(receipt)).toBe(true);
  });

  it('refuses filename-only identity', () => {
    expect(() => adaptPurchasedAssetReceipt({ filename: 'Village.zip' })).toThrow(/sourceId/);
  });

  it('enumerates whatever catalog is supplied and never hard-codes 29/14/19', () => {
    expect(discoverInspectionCatalog([]).counts.catalog).toBe(0);
    expect(discoverInspectionCatalog(makeCatalog(1)).counts.catalog).toBe(1);
    expect(discoverInspectionCatalog(make29StyleFixture()).counts.catalog).toBe(29);
    expect(discoverInspectionCatalog(makeCatalog(100)).counts.catalog).toBe(100);
    expect(discoverInspectionCatalog(makeCatalog(500)).hardcodedAssetTotal).toBe(false);
  });

  it('indexes sources by id and hash for large catalogs', () => {
    const catalog = makeCatalog(250);
    expect(indexSourcesById(catalog).size).toBe(250);
    expect(indexSourcesByHash(catalog).size).toBeGreaterThan(0);
  });

  it('classifies stored, missing, wrappers, duplicates and historical versions', () => {
    const catalog = adaptPurchasedAssetCatalog([
      { sourceId: 'A', sourceReceiptRef: 'rA', stored: true, storedByteSize: 10, sourceSha256: matchingBytes('A').sha256, canonicalCandidate: true },
      { sourceId: 'B', stored: false },
      { sourceId: 'C', sourceReceiptRef: 'rC', stored: true, wrapperOfSourceId: 'A' },
      { sourceId: 'D', sourceReceiptRef: 'rD', stored: true, historicalOfSourceId: 'A', packageVersion: '1.0' },
      { sourceId: 'E', sourceReceiptRef: 'rE', stored: true, duplicateState: 'DUPLICATE_SHA' },
    ]);
    const report = discoverInspectionCatalog(catalog);
    expect(report.storedSources.map((item) => item.sourceId)).toContain('A');
    expect(report.missingSources.map((item) => item.sourceId)).toEqual(['B']);
    expect(report.archiveWrappers.map((item) => item.sourceId)).toEqual(['C']);
    expect(report.historicalVersions.map((item) => item.sourceId)).toEqual(['D']);
    expect(report.duplicates.map((item) => item.sourceId)).toEqual(['E']);
    expect(report.inspectionBlockedSources.some((item) => item.sourceId === 'B')).toBe(true);
  });

  it('blocks inspection when the receipt is missing', () => {
    const report = discoverInspectionCatalog([
      adaptPurchasedAssetReceipt({ sourceId: 'X', stored: true, receiptPresent: false }),
    ]);
    expect(report.inspectionBlockedSources[0]?.blocker).toBe('SOURCE_RECEIPT_MISSING');
  });

  it('materializes a ready source, verifies an independent hash, then cleans up', async () => {
    const { bytes, sha256, size } = matchingBytes('ready-source');
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_READY',
        sourceReceiptRef: 'receipt:ready',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
      }),
      bytes,
    });
    expect(result.state).toBe('SOURCE_READY');
    expect(result.observedSha256).toBe(sha256);
    expect(result.r2Mutated).toBe(false);
    expect(result.filenameUsedForIdentity).toBe(false);
    expect(result.workspace && existsSync(result.workspace.root)).toBe(true);
    const cleaned = cleanupMaterialization(result);
    expect(cleaned.workspace).toBeNull();
    expect(result.workspace && existsSync(result.workspace.root)).toBe(false);
  });

  it('returns SOURCE_RECEIPT_MISSING', async () => {
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({ sourceId: 'SRC_NONE', stored: true, receiptPresent: false }),
      bytes: new Uint8Array([1]),
    });
    expect(result.state).toBe('SOURCE_RECEIPT_MISSING');
  });

  it('returns SOURCE_NOT_AVAILABLE when storage is missing or bytes are null', async () => {
    const missingStore = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({ sourceId: 'SRC_MISS', sourceReceiptRef: 'r', stored: false }),
      bytes: new Uint8Array([1]),
    });
    const missingBytes = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({ sourceId: 'SRC_NULL', sourceReceiptRef: 'r', stored: true, storedByteSize: 1 }),
      bytes: null,
    });
    expect(missingStore.state).toBe('SOURCE_NOT_AVAILABLE');
    expect(missingBytes.state).toBe('SOURCE_NOT_AVAILABLE');
  });

  it('returns SOURCE_SIZE_MISMATCH', async () => {
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_SIZE',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: 99,
        sourceSha256: matchingBytes('x').sha256,
      }),
      bytes: matchingBytes('x').bytes,
    });
    expect(result.state).toBe('SOURCE_SIZE_MISMATCH');
  });

  it('returns SOURCE_HASH_MISSING and SOURCE_HASH_MISMATCH', async () => {
    const { bytes, size } = matchingBytes('hash-cases');
    const missing = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_NOHASH',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: 'not-a-hash',
      }),
      bytes,
    });
    const mismatch = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_BADHASH',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: 'ab'.repeat(32),
      }),
      bytes,
    });
    expect(missing.state).toBe('SOURCE_HASH_MISSING');
    expect(mismatch.state).toBe('SOURCE_HASH_MISMATCH');
    if (missing.workspace) cleanupMaterialization(missing);
  });

  it('fails closed on timeout and byte-budget overflow', async () => {
    const { bytes, sha256, size } = matchingBytes('limits');
    const timeout = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_TIME',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
      }),
      bytes,
      limits: { timeoutMs: 0 },
      now: (() => {
        let calls = 0;
        return () => {
          calls += 1;
          return calls === 1 ? 0 : 50;
        };
      })(),
    });
    const budget = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_BUDGET',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
      }),
      bytes,
      limits: { maxByteBudget: 1 },
    });
    expect(timeout.state).toBe('SOURCE_MATERIALIZATION_FAILED');
    expect(timeout.blocker).toBe('TIMEOUT');
    expect(budget.blocker).toBe('BYTE_BUDGET_EXCEEDED');
  });

  it('cleans isolated workspaces on success and failure', async () => {
    await withIsolatedWorkspace((workspace) => {
      expect(workspace.insideGitWorkspace).toBe(false);
      expect(workspace.insideProductionLibrary).toBe(false);
      expect(isUnsafeWorkspacePath(workspace.root)).toBe(false);
      expect(isUnsafeWorkspacePath(path.join(process.cwd(), 'apps/web/tmp-commercial'))).toBe(true);
      expect(isUnsafeWorkspacePath(path.join(process.cwd(), 'production-library/env'))).toBe(true);
      const dest = writeReadOnlySourceCopy(workspace, '../escape.blend', new Uint8Array([1, 2, 3]));
      expect(path.basename(dest)).toBe('escape.blend');
      expect(dest.startsWith(workspace.sourceDir)).toBe(true);
    });
    const leftover = createIsolatedWorkspace();
    destroyIsolatedWorkspace(leftover);
    expect(existsSync(leftover.root)).toBe(false);
  });

  it('keeps commercial extensions out of tracked source directories', () => {
    expect(scanCommittedCommercialBinaries().ok).toBe(true);
    expect(safetyReport().commercialBytesCommitted).toBe(false);
    expect(safetyReport().paidComputeUsd).toBe(0);
  });

  it('uses a provider callback and still never mutates R2', async () => {
    const { bytes, sha256, size } = matchingBytes('provider');
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_PROV',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
      }),
      readBytes: async () => bytes,
    });
    expect(result.state).toBe('SOURCE_READY');
    expect(result.deleted).toBe(false);
    expect(result.renamed).toBe(false);
    expect(result.overwritten).toBe(false);
    cleanupMaterialization(result);
  });

  it('treats license and provenance as inspection blockers, not identity', () => {
    const report = discoverInspectionCatalog([
      adaptPurchasedAssetReceipt({
        sourceId: 'SRC_LIC',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: 1,
        licenseState: 'BLOCKED',
      }),
      adaptPurchasedAssetReceipt({
        sourceId: 'SRC_PROV',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: 1,
        provenanceState: 'UNKNOWN',
      }),
    ]);
    expect(report.inspectionBlockedSources.map((item) => item.blocker).sort()).toEqual(['LICENSE_BLOCKED', 'PROVENANCE_BLOCKED']);
  });

  it('keeps wrapper and historical receipts identifiable without latest', () => {
    const catalog = adaptPurchasedAssetCatalog([
      { sourceId: 'SRC_DIRECT', sourceReceiptRef: 'r', stored: true, storedByteSize: 1, sourceSha256: matchingBytes('d').sha256, canonicalCandidate: true, formatHint: 'BLEND' },
      { sourceId: 'SRC_WRAP', sourceReceiptRef: 'r', stored: true, wrapperOfSourceId: 'SRC_DIRECT' },
      { sourceId: 'SRC_V1', sourceReceiptRef: 'r', stored: true, historicalOfSourceId: 'SRC_DIRECT', packageFamily: 'Botaniq', packageVersion: '7.1' },
      { sourceId: 'SRC_V2', sourceReceiptRef: 'r', stored: true, historicalOfSourceId: 'SRC_DIRECT', packageFamily: 'Botaniq', packageVersion: '7.2.0' },
    ]);
    const report = discoverInspectionCatalog(catalog);
    expect(report.archiveWrappers).toHaveLength(1);
    expect(report.historicalVersions).toHaveLength(2);
    expect(report.historicalVersions.map((item) => item.packageVersion).sort()).toEqual(['7.1', '7.2.0']);
  });

  it('materializes from a delayed provider and still cleans the workspace', async () => {
    const { bytes, sha256, size } = matchingBytes('delayed');
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_DELAY',
        sourceReceiptRef: 'receipt:delay',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
      }),
      readBytes: async () => bytes,
      limits: { timeoutMs: 5_000 },
    });
    expect(result.state).toBe('SOURCE_READY');
    expect(result.timeoutMs).toBe(5_000);
    cleanupMaterialization(result);
  });

  it('records SOURCE_MATERIALIZATION_FAILED when the provider throws', async () => {
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_THROW',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: 1,
        sourceSha256: matchingBytes('z').sha256,
      }),
      readBytes: async () => {
        throw new Error('reader exploded');
      },
    });
    expect(result.state).toBe('SOURCE_MATERIALIZATION_FAILED');
    expect(result.blocker).toMatch(/reader exploded/);
    expect(result.workspace).toBeNull();
  });

  it('never uses originalFilename as the workspace identity', async () => {
    const { bytes, sha256, size } = matchingBytes('name-check');
    const result = await materializeSource({
      receipt: adaptPurchasedAssetReceipt({
        sourceId: 'SRC_ID_ONLY',
        sourceReceiptRef: 'r',
        stored: true,
        storedByteSize: size,
        sourceSha256: sha256,
        filename: 'Popular Village Pack.zip',
      }),
      bytes,
    });
    expect(result.sourceId).toBe('SRC_ID_ONLY');
    expect(result.sourcePath && result.sourcePath.includes('Popular')).toBe(false);
    cleanupMaterialization(result);
  });

  it('does not select production assets by original filename popularity', () => {
    const catalog = makeCatalog(8).map((item, index) => ({
      ...item,
      originalFilename: index === 0 ? 'popular.zip' : item.originalFilename,
    }));
    const identity = catalog.map((item) => productionIdentityOf(item).sourceId);
    expect(identity).not.toContain('popular.zip');
    expect(new Set(identity).size).toBe(8);
  });
});

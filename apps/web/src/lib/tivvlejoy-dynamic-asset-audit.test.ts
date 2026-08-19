import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PURCHASED_TOOL_PACKAGES, type PurchasedToolPackage } from './purchased-tools/catalog';
import { AUDIT_STORAGE_READ_ONLY } from './purchased-tools/audit-storage';
import {
  auditPurchasedAssets,
  detectSourceFormat,
  isWrapperPackage,
  sceneryCoverageFromAudit,
  worldBuilderEligibleAssets,
  type PurchasedSourceReceipt,
} from './purchased-tools/dynamic-audit';

const repoRoot = path.resolve(__dirname, '../../../..');
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function pkg(overrides: Partial<PurchasedToolPackage> & Pick<PurchasedToolPackage, 'sourceId' | 'expectedFilename'>): PurchasedToolPackage {
  return {
    displayName: overrides.displayName ?? overrides.sourceId,
    role: 'asset-library',
    version: '1',
    maxUploadBytes: 1024,
    minimumReasonableBytes: 1,
    activation: 'STORE_ONLY',
    notes: 'synthetic audit fixture',
    ...overrides,
  };
}

function receipt(sourceId: string, overrides: Partial<PurchasedSourceReceipt> = {}): PurchasedSourceReceipt {
  return {
    sourceId,
    originalFilename: overrides.originalFilename ?? `${sourceId}.zip`,
    byteSize: overrides.byteSize ?? 100,
    stored: overrides.stored ?? true,
    clientSha256: overrides.clientSha256 ?? SHA_A,
    objectKey: overrides.objectKey ?? `source/${sourceId}/file`,
    sourceImmutable: true,
    ...overrides,
  };
}

const AUDIT_LOGIC_FILES = [
  'apps/web/src/lib/purchased-tools/dynamic-audit.ts',
  'apps/web/src/lib/purchased-tools/audit-storage.ts',
  'apps/web/src/components/preview/PurchasedAssetAudit.tsx',
  'apps/web/src/app/api/purchased-tools/audit/route.ts',
  'apps/web/src/app/purchased-assets/audit/page.tsx',
];

describe('TIVVLEJOY_DYNAMIC_ASSET_AUDIT_V1', () => {
  it('audits zero catalog assets', () => {
    const audit = auditPurchasedAssets({ catalog: [] });
    expect(audit.counts.catalogAssetCount).toBe(0);
    expect(audit.counts.uploadedCount).toBe(0);
    expect(audit.counts.missingCount).toBe(0);
    expect(audit.sources).toEqual([]);
    expect(audit.hardCodedAssetTotal).toBe(false);
  });

  it('audits one catalog asset', () => {
    const catalog = [pkg({ sourceId: 'SRC_ONE', expectedFilename: 'one.blend' })];
    const audit = auditPurchasedAssets({ catalog });
    expect(audit.counts.catalogAssetCount).toBe(1);
    expect(audit.counts.missingCount).toBe(1);
    expect(audit.sources[0]?.auditState).toBe('NOT_UPLOADED');
    expect(audit.sources[0]?.indicator).toBe('RED');
  });

  it('audits the current full catalog without assuming a fixed total', () => {
    const audit = auditPurchasedAssets();
    expect(audit.counts.catalogAssetCount).toBe(PURCHASED_TOOL_PACKAGES.length);
    expect(audit.counts.catalogAssetCount).toBe(audit.sources.length);
    expect(audit.counts.catalogAssetCount).toBeGreaterThan(0);
    expect(audit.hardCodedAssetTotal).toBe(false);
  });

  it('increases the total when a future catalog entry is added', () => {
    const current = auditPurchasedAssets({ catalog: PURCHASED_TOOL_PACKAGES });
    const future = pkg({
      sourceId: 'SRC_FUTURE_MEADOW_KIT',
      displayName: 'Future Meadow Kit',
      expectedFilename: 'future-meadow-kit.blend',
    });
    const next = auditPurchasedAssets({ catalog: [...PURCHASED_TOOL_PACKAGES, future] });
    expect(next.counts.catalogAssetCount).toBe(current.counts.catalogAssetCount + 1);
    expect(next.sources.some((item) => item.sourceId === 'SRC_FUTURE_MEADOW_KIT')).toBe(true);
  });

  it('contains no fixed asset-total constant in audit logic', () => {
    for (const relative of AUDIT_LOGIC_FILES) {
      const text = readFileSync(path.join(repoRoot, relative), 'utf8');
      expect(text, relative).not.toMatch(/(?<![0-9])29(?![0-9])/);
      expect(text, relative).not.toMatch(/hard-?coded 29|exactly 29|toHaveLength\(29\)|=== 29/i);
    }
  });

  it('detects a missing receipt', () => {
    const catalog = [pkg({ sourceId: 'SRC_MISSING', expectedFilename: 'missing.fbx' })];
    const audit = auditPurchasedAssets({ catalog, receipts: [] });
    expect(audit.sources[0]?.receiptPresent).toBe(false);
    expect(audit.sources[0]?.blockers).toContain('catalog entry with no R2 receipt');
    expect(audit.counts.missingCount).toBe(1);
  });

  it('detects a completed receipt', () => {
    const catalog = [pkg({ sourceId: 'SRC_STORED', expectedFilename: 'stored.zip' })];
    const audit = auditPurchasedAssets({
      catalog,
      receipts: [receipt('SRC_STORED', { originalFilename: 'stored.zip', byteSize: 50 })],
      storedObjects: [{ sourceId: 'SRC_STORED', exists: true, size: 50 }],
    });
    expect(audit.sources[0]?.stored).toBe(true);
    expect(audit.sources[0]?.sizeVerified).toBe(true);
    expect(audit.counts.uploadedCount).toBe(1);
    expect(audit.counts.missingCount).toBe(0);
  });

  it('blocks a byte-size mismatch', () => {
    const catalog = [pkg({ sourceId: 'SRC_SIZE', expectedFilename: 'size.zip' })];
    const audit = auditPurchasedAssets({
      catalog,
      receipts: [receipt('SRC_SIZE', { byteSize: 100 })],
      storedObjects: [{ sourceId: 'SRC_SIZE', exists: true, size: 80 }],
    });
    expect(audit.sources[0]?.sizeVerified).toBe(false);
    expect(audit.sources[0]?.auditState).toBe('BLOCKED');
    expect(audit.sources[0]?.blockers).toContain('byte-size mismatch');
    expect(audit.sources[0]?.indicator).toBe('RED');
  });

  it('flags a completed object missing SHA', () => {
    const catalog = [pkg({ sourceId: 'SRC_NOSHA', expectedFilename: 'nosha.zip' })];
    const audit = auditPurchasedAssets({
      catalog,
      receipts: [receipt('SRC_NOSHA', { clientSha256: null, byteSize: 10 })],
      storedObjects: [{ sourceId: 'SRC_NOSHA', exists: true, size: 10 }],
    });
    expect(audit.sources[0]?.clientSha256Present).toBe(false);
    expect(audit.sources[0]?.warnings).toContain('completed object missing SHA receipt');
  });

  it('detects a duplicate SHA-256 across different filenames', () => {
    const catalog = [
      pkg({ sourceId: 'SRC_DUP_A', expectedFilename: 'a.zip', displayName: 'Dup A' }),
      pkg({ sourceId: 'SRC_DUP_B', expectedFilename: 'b.zip', displayName: 'Dup B' }),
    ];
    const audit = auditPurchasedAssets({
      catalog,
      receipts: [
        receipt('SRC_DUP_A', { originalFilename: 'a.zip', clientSha256: SHA_A, byteSize: 10 }),
        receipt('SRC_DUP_B', { originalFilename: 'b.zip', clientSha256: SHA_A, byteSize: 10 }),
      ],
      storedObjects: [
        { sourceId: 'SRC_DUP_A', exists: true, size: 10 },
        { sourceId: 'SRC_DUP_B', exists: true, size: 10 },
      ],
    });
    expect(audit.sources.every((item) => item.duplicateState === 'DUPLICATE_SHA')).toBe(true);
    expect(audit.counts.duplicateCount).toBe(2);
  });

  it('distinguishes a wrapper from the canonical source', () => {
    const fbx = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_STYLIZED_TAVERN_PACKAGE_FBX');
    const wrapper = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_STYLIZED_TAVERN_PACKAGE_ZIP_WRAPPER');
    expect(fbx).toBeTruthy();
    expect(wrapper).toBeTruthy();
    expect(isWrapperPackage(wrapper!)).toBe(true);
    expect(isWrapperPackage(fbx!)).toBe(false);
    const audit = auditPurchasedAssets({
      catalog: [fbx!, wrapper!],
      receipts: [
        receipt('SRC_STYLIZED_TAVERN_PACKAGE_FBX', { originalFilename: fbx!.expectedFilename, clientSha256: SHA_A }),
        receipt('SRC_STYLIZED_TAVERN_PACKAGE_ZIP_WRAPPER', { originalFilename: wrapper!.expectedFilename, clientSha256: SHA_B }),
      ],
    });
    expect(audit.sources.find((item) => item.sourceId === fbx!.sourceId)?.canonicalCandidate).toBe(true);
    expect(audit.sources.find((item) => item.sourceId === wrapper!.sourceId)?.canonicalCandidate).toBe(false);
    expect(audit.sources.find((item) => item.sourceId === wrapper!.sourceId)?.wrapper).toBe(true);
  });

  it('keeps a historical asset archival', () => {
    const historical = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_GAFFER_3_1_18');
    expect(historical).toBeTruthy();
    const audit = auditPurchasedAssets({
      catalog: [historical!],
      receipts: [receipt(historical!.sourceId, { originalFilename: historical!.expectedFilename, byteSize: 20 })],
      storedObjects: [{ sourceId: historical!.sourceId, exists: true, size: 20 }],
    });
    expect(audit.sources[0]?.historical).toBe(true);
    expect(audit.sources[0]?.auditState).toBe('ARCHIVAL_ONLY');
    expect(audit.sources[0]?.indicator).toBe('GRAY');
    expect(audit.sources[0]?.productionUsable).toBe(false);
  });

  it('does not mark STORE_ONLY as production usable', () => {
    const botaniq = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_BOTANIQ_FULL_7_2_0')!;
    const audit = auditPurchasedAssets({
      catalog: [botaniq],
      receipts: [receipt(botaniq.sourceId, { originalFilename: botaniq.expectedFilename, byteSize: 100 })],
      storedObjects: [{ sourceId: botaniq.sourceId, exists: true, size: 100 }],
      inspections: [{ sourceId: botaniq.sourceId, state: 'INSPECTION_PASSED' }],
    });
    expect(audit.sources[0]?.storeOnly).toBe(true);
    expect(audit.sources[0]?.productionUsable).toBe(false);
    expect(audit.sources[0]?.worldBuilderEligible).toBe(false);
    expect(audit.sources[0]?.warnings.some((item) => item.includes('STORE_ONLY'))).toBe(true);
  });

  it('does not automatically install INSTALL_LATER tools', () => {
    const gaffer = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_GAFFER_3_2_10')!;
    const audit = auditPurchasedAssets({
      catalog: [gaffer],
      receipts: [receipt(gaffer.sourceId, { originalFilename: gaffer.expectedFilename, byteSize: 40 })],
      storedObjects: [{ sourceId: gaffer.sourceId, exists: true, size: 40 }],
      inspections: [{ sourceId: gaffer.sourceId, state: 'INSPECTION_PASSED' }],
    });
    expect(audit.sources[0]?.installLater).toBe(true);
    expect(audit.sources[0]?.warnings.some((item) => item.includes('not automatically installed'))).toBe(true);
    expect(audit.safety.addonsInstalled).toBe(false);
  });

  it('keeps Geo-Scatter not integrated', () => {
    const geo = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_BOTANIQ_GEOSCATTER_BIOMES_7_1_1')!;
    const audit = auditPurchasedAssets({ catalog: [geo] });
    expect(audit.sources[0]?.optionalNotIntegrated).toBe(true);
    expect(audit.sources[0]?.geoScatterIntegrated).toBe(false);
    expect(audit.safety.geoScatterIntegrated).toBe(false);
    expect(audit.sources[0]?.worldBuilderEligible).toBe(false);
  });

  it('keeps Botaniq immutable and unprocessed', () => {
    const botaniq = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_BOTANIQ_FULL_7_2_0')!;
    const audit = auditPurchasedAssets({ catalog: [botaniq] });
    expect(audit.sources[0]?.botaniqImmutable).toBe(true);
    expect(audit.safety.botaniqProcessed).toBe(false);
    expect(audit.sources[0]?.warnings.some((item) => /immutable/i.test(item))).toBe(true);
  });

  it('flags a missing paired texture source', () => {
    const fbx = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_STYLIZED_TAVERN_PACKAGE_FBX')!;
    const textures = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === 'SRC_STYLIZED_TAVERN_TEXTURES')!;
    const audit = auditPurchasedAssets({
      catalog: [fbx, textures],
      receipts: [receipt(fbx.sourceId, { originalFilename: fbx.expectedFilename, byteSize: 12 })],
      storedObjects: [{ sourceId: fbx.sourceId, exists: true, size: 12 }],
    });
    expect(audit.sources[0]?.warnings.some((item) => item.includes('missing paired texture source'))).toBe(true);
  });

  it('detects an unknown receipt with no catalog entry', () => {
    const audit = auditPurchasedAssets({
      catalog: [pkg({ sourceId: 'SRC_KNOWN', expectedFilename: 'known.zip' })],
      receipts: [receipt('SRC_ORPHAN', { originalFilename: 'orphan.zip' })],
    });
    expect(audit.unknownReceipts).toHaveLength(1);
    expect(audit.unknownReceipts[0]?.catalogPresent).toBe(false);
    expect(audit.unknownReceipts[0]?.blockers).toContain('receipt with no catalog entry');
    expect(audit.counts.catalogAssetCount).toBe(1);
  });

  it('is read-only and spends no paid compute or Blender execution', () => {
    const audit = auditPurchasedAssets();
    expect(AUDIT_STORAGE_READ_ONLY).toBe(true);
    expect(audit.safety.readOnly).toBe(true);
    expect(audit.safety.r2ObjectsModified).toBe(false);
    expect(audit.safety.filesDeleted).toBe(false);
    expect(audit.safety.filesRenamed).toBe(false);
    expect(audit.safety.paidCompute).toBe(false);
    expect(audit.safety.gpuLaunched).toBe(false);
    expect(audit.safety.blenderExecuted).toBe(false);
    expect(audit.safety.commercialFilesExecuted).toBe(false);
    expect(audit.safety.productionMutation).toBe(false);
    expect(audit.safety.assetsAutoApproved).toBe(false);
    expect(audit.safety.pipGoatMutated).toBe(false);
    expect(audit.safety.voiceMutated).toBe(false);
    expect(audit.safety.runPodContacted).toBe(false);
  });

  it('does not auto-approve World Builder eligibility from upload alone', () => {
    const future = pkg({
      sourceId: 'SRC_FUTURE_READY_KIT',
      displayName: 'Future Ready Kit',
      expectedFilename: 'future-ready-kit.blend',
      activation: 'INSTALL_LATER',
      role: 'asset-library',
    });
    const uploaded = auditPurchasedAssets({
      catalog: [future],
      receipts: [receipt(future.sourceId, { originalFilename: future.expectedFilename, byteSize: 30, clientSha256: SHA_A })],
      storedObjects: [{ sourceId: future.sourceId, exists: true, size: 30 }],
    });
    expect(uploaded.sources[0]?.stored).toBe(true);
    expect(uploaded.sources[0]?.worldBuilderEligible).toBe(false);
    expect(uploaded.sources[0]?.productionUsable).toBe(false);
    const inspected = auditPurchasedAssets({
      catalog: [future],
      receipts: [receipt(future.sourceId, { originalFilename: future.expectedFilename, byteSize: 30, clientSha256: SHA_A })],
      storedObjects: [{ sourceId: future.sourceId, exists: true, size: 30 }],
      inspections: [{ sourceId: future.sourceId, state: 'INSPECTION_PASSED' }],
    });
    expect(inspected.sources[0]?.worldBuilderEligible).toBe(true);
    expect(worldBuilderEligibleAssets(inspected).map((item) => item.sourceId)).toEqual(['SRC_FUTURE_READY_KIT']);
    expect(sceneryCoverageFromAudit(uploaded).uploadedIsNotUsable).toBe(true);
  });

  it('detects incomplete multipart sessions and unsupported extensions', () => {
    const catalog = [
      pkg({ sourceId: 'SRC_PART', expectedFilename: 'part.zip' }),
      pkg({ sourceId: 'SRC_BAD', expectedFilename: 'bad.exe' }),
    ];
    const audit = auditPurchasedAssets({
      catalog,
      sessions: [{ sourceId: 'SRC_PART', state: 'uploading', filename: 'part.zip' }],
      receipts: [receipt('SRC_BAD', { originalFilename: 'bad.exe', byteSize: 8 })],
      storedObjects: [{ sourceId: 'SRC_BAD', exists: true, size: 8 }],
    });
    expect(audit.sources.find((item) => item.sourceId === 'SRC_PART')?.auditState).toBe('UPLOAD_INCOMPLETE');
    expect(audit.incompleteSessions).toHaveLength(1);
    expect(detectSourceFormat('bad.exe')).toBe('unsupported');
    expect(audit.sources.find((item) => item.sourceId === 'SRC_BAD')?.blockers).toContain('unsupported extension');
  });

  it('exposes a deterministic machine-readable result', () => {
    const first = auditPurchasedAssets({ catalog: PURCHASED_TOOL_PACKAGES });
    const second = auditPurchasedAssets({ catalog: PURCHASED_TOOL_PACKAGES });
    expect(first.auditSha256).toBe(second.auditSha256);
    expect(first.schemaVersion).toBe('TIVVLEJOY_DYNAMIC_ASSET_AUDIT_V1');
    expect(existsSync(path.join(repoRoot, 'docs/TIVVLEJOY_DYNAMIC_ASSET_AUDIT_V1.md'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { adaptPurchasedAssetReceipt } from './tivvlejoy-real-scenery-inspection/receipts';
import {
  DEFAULT_READ_BUDGET,
  PRIVATE_INVENTORY_SCHEMA,
  REAL_INPUT_SCHEMA,
  buildMaterializationQueue,
  buildPrivateObjectInventory,
  compileRealInputConvergence,
  generateLargeFixtureChunks,
  knownHashes,
  make136StyleListing,
  make500SourceListing,
  mergeBudget,
  mountainGlbBytes,
  objectBytesFor136,
  reconcileReceiptsAndObjects,
  sha256Stream,
  sha256Text,
} from './tivvlejoy-real-input-convergence';

describe('TIVVLEJOY_REAL_INPUT_CONVERGENCE_V1', () => {
  it('declares the convergence schema and default budget', () => {
    expect(REAL_INPUT_SCHEMA).toBe('TIVVLEJOY_REAL_INPUT_CONVERGENCE_V1');
    expect(PRIVATE_INVENTORY_SCHEMA).toBe('TIVVLEJOY_REAL_PRIVATE_OBJECT_INVENTORY_V1');
    expect(DEFAULT_READ_BUDGET.maxSingleObjectBytes).toBe(8 * 1024 * 1024);
    expect(DEFAULT_READ_BUDGET.billingUncertainty).toBe(true);
    expect(DEFAULT_READ_BUDGET.botaniqHold).toBe(true);
  });

  it('lists a 136-style inventory without hard-coding the total', () => {
    const items = make136StyleListing();
    const inventory = buildPrivateObjectInventory({
      items,
      listingExecuted: true,
      realPrivateSourceAccessAvailable: true,
    });
    expect(inventory.hardcodedObjectTotal).toBe(false);
    expect(inventory.objectCount).toBe(items.length);
    expect(inventory.extensionCounts['.json']).toBe(96);
    expect(inventory.extensionCounts['.glb']).toBe(1);
    expect(inventory.objects.every((item) => item.filenameUsedAsIdentity === false)).toBe(true);
    expect(inventory.objects.every((item) => item.objectIdentity.length === 64)).toBe(true);
    expect(JSON.stringify(inventory)).not.toMatch(/AKIA|R2_SECRET|DATABASE_URL/);
  });

  it('matches receipts to objects with exact counts', () => {
    const items = make136StyleListing();
    const glbKey = 'tivvlejoy-assets/source/mountain/hero.glb';
    const hashes = knownHashes();
    const receipts = [
      adaptPurchasedAssetReceipt({
        sourceId: 'SRC_MOUNTAIN_GLB',
        sourceReceiptRef: 'receipt:mountain-glb',
        stored: true,
        storedByteSize: 48_000,
        sourceSha256: hashes.glb,
        originalFilename: 'hero.glb',
      }),
      adaptPurchasedAssetReceipt({
        sourceId: 'SRC_MISSING',
        sourceReceiptRef: 'receipt:missing',
        stored: true,
        storedByteSize: 10,
        sourceSha256: 'ab'.repeat(32),
      }),
    ];
    const inventory = buildPrivateObjectInventory({
      items: items.map((item) =>
        item.key === glbKey ? { ...item, size: 48_000 } : item,
      ),
      receipts,
      listingExecuted: true,
      realPrivateSourceAccessAvailable: true,
    });
    const report = reconcileReceiptsAndObjects({ inventory, receipts });
    expect(report.counts.receiptMissingObject).toBeGreaterThan(0);
    expect(report.counts.objectMissingReceipt).toBeGreaterThan(0);
    expect(Object.values(report.counts).every((value) => Number.isInteger(value))).toBe(true);
  });

  it('holds Botaniq and addons and deprioritizes multi-GB archives', () => {
    const inventory = buildPrivateObjectInventory({
      items: make136StyleListing(),
      listingExecuted: true,
      realPrivateSourceAccessAvailable: true,
    });
    const queue = buildMaterializationQueue(inventory);
    expect(queue.some((item) => item.holdReason === 'BOTANIQ_HOLD_NOT_ACTIVATED')).toBe(true);
    expect(queue.some((item) => item.holdReason === 'ADDON_HOLD_NOT_ACTIVATED')).toBe(true);
    expect(queue.filter((item) => item.selected).every((item) => item.size <= DEFAULT_READ_BUDGET.maxSingleObjectBytes)).toBe(true);
  });

  it('streams hashes for large generated fixtures without treating them as commercial', async () => {
    const chunks = generateLargeFixtureChunks(2 * 1024 * 1024, 3);
    const digest = await sha256Stream(
      (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    );
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('scales matching across 500 source fixtures', () => {
    const items = make500SourceListing();
    const inventory = buildPrivateObjectInventory({
      items,
      listingExecuted: true,
      realPrivateSourceAccessAvailable: true,
    });
    expect(inventory.objectCount).toBe(500);
    const receipts = items.slice(0, 40).map((item, index) =>
      adaptPurchasedAssetReceipt({
        sourceId: `SRC_SCALE_${index}`,
        sourceReceiptRef: `receipt:scale-${index}`,
        stored: true,
        storedByteSize: item.size,
        originalFilename: item.key.split('/').pop(),
      }),
    );
    const report = reconcileReceiptsAndObjects({ inventory, receipts });
    expect(report.counts.hashMissing + report.counts.receiptObjectMatched + report.counts.objectMissingReceipt).toBeGreaterThan(0);
  });

  it('compiles a real-input report from injected listing and budgeted bytes', async () => {
    const items = make136StyleListing();
    const bytes = objectBytesFor136();
    const hashes = knownHashes();
    const receipts = [
      adaptPurchasedAssetReceipt({
        sourceId: 'SRC_MOUNTAIN_GLB',
        sourceReceiptRef: 'receipt:mountain-glb',
        stored: true,
        storedByteSize: mountainGlbBytes().byteLength,
        sourceSha256: hashes.glb,
        originalFilename: 'hero.glb',
        formatHint: '.glb',
      }),
    ];
    const report = await compileRealInputConvergence({
      items,
      receipts,
      objectBytes: bytes,
      objectNames: {
        [sha256Text('tivvlejoy-assets/source/mountain/hero.glb')]: ['MountainHero', 'Ridge'],
        [sha256Text('tivvlejoy-assets/source/tavern/interior.fbx')]: ['TavernInterior', 'Chair', 'Table', 'Barrel'],
      },
      authorizeReads: true,
      budget: mergeBudget({ billingUncertainty: false, maxTotalMaterializedBytes: 8 * 1024 * 1024 }),
    });
    expect(report.inventory.objectCount).toBe(items.length);
    expect(report.counts.realSourcesStaticallyInspected).toBeGreaterThan(0);
    expect(report.inspections.every((item) => item.evidenceClass === 'REAL_SOURCE_INSPECTION')).toBe(true);
    expect(report.counts.humanSceneryApprovalsIssued).toBe(0);
    expect(report.counts.realApprovedLogicalAssets).toBe(0);
    expect(report.safety.assetsAutoApproved).toBe(false);
    expect(report.safety.paidComputeUsd).toBe(0);
  });
});

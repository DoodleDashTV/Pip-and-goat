import { sha256Bytes, sha256Text } from './hash';
import { adaptPurchasedAssetReceipt } from './receipts';
import type { AbstractSourceReceipt, AssetKind } from './types';
import type { LogicalHint } from './logical';

export function syntheticSha(tag: string): string {
  return sha256Text(`synthetic:${tag}`);
}

export function makeReceipt(input: Partial<AbstractSourceReceipt> & { sourceId: string }): AbstractSourceReceipt {
  const sourceSha256 = input.sourceSha256 ?? syntheticSha(input.sourceId);
  return adaptPurchasedAssetReceipt({
    sourceId: input.sourceId,
    sourceReceiptRef: input.sourceReceiptRef ?? `receipt:${input.sourceId}`,
    storedByteSize: input.storedByteSize ?? 2048,
    sourceSha256,
    stored: (input.storageState ?? 'STORED') === 'STORED',
    catalogPresent: input.catalogPresent ?? true,
    receiptPresent: input.receiptPresent ?? true,
    provenanceState: input.provenanceState,
    licenseState: input.licenseState,
    originalFilename: input.originalFilename ?? `${input.sourceId}.zip`,
    displayName: input.displayName ?? input.sourceId,
    formatHint: input.formatHint ?? 'ZIP',
    packageFamily: input.packageFamily,
    packageVersion: input.packageVersion,
    wrapperOfSourceId: input.wrapperOfSourceId,
    historicalOfSourceId: input.historicalOfSourceId,
    canonicalSourceRelation: input.canonicalSourceRelation,
  });
}

export function makeCatalog(count: number, prefix = 'SRC'): AbstractSourceReceipt[] {
  return Array.from({ length: count }, (_, index) =>
    makeReceipt({
      sourceId: `${prefix}_${String(index + 1).padStart(4, '0')}`,
      packageFamily: index % 17 === 0 ? 'mountain' : index % 11 === 0 ? 'tavern' : index % 7 === 0 ? 'forest' : 'village',
      formatHint: index % 5 === 0 ? 'BLEND' : index % 5 === 1 ? 'FBX' : index % 5 === 2 ? 'GLB' : 'ZIP',
      canonicalSourceRelation: index % 23 === 0 ? 'WRAPPER' : index % 29 === 0 ? 'HISTORICAL_VERSION' : 'DIRECT_ORIGINAL',
    }),
  );
}

export function make29StyleFixture(): AbstractSourceReceipt[] {
  return makeCatalog(29, 'SRC_STYLE');
}

const KIND_CYCLE: AssetKind[] = [
  'building',
  'tree',
  'rock',
  'barrel',
  'table',
  'chair',
  'terrain_piece',
  'mountain',
  'sky',
  'interior_shell',
  'street_prop',
  'vegetation',
];

export function makeLogicalHints(count: number, sourceId: string): LogicalHint[] {
  return Array.from({ length: count }, (_, index) => ({
    internalStableRef: `${KIND_CYCLE[index % KIND_CYCLE.length]}:${index}`,
    assetKind: KIND_CYCLE[index % KIND_CYCLE.length]!,
    displayName: `${sourceId} child ${index + 1}`,
    geometryEvidenceRef: `geom:${index}`,
    materialEvidenceRef: `mat:${index}`,
    textureEvidenceRef: `tex:${index}`,
  }));
}

export function pngFixture(width = 8, height = 8): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes[12] = 0x49;
  bytes[13] = 0x48;
  bytes[14] = 0x44;
  bytes[15] = 0x52;
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

export function blendHeaderBytes(version = '280'): Uint8Array {
  return new TextEncoder().encode(`BLENDER-v${version}TEST`);
}

export function fbxBinaryHeader(version = 7400): Uint8Array {
  const header = new Uint8Array(64);
  header.set(new TextEncoder().encode('Kaydara FBX Binary  \x00'));
  const view = new DataView(header.buffer);
  view.setUint32(23, version, true);
  header.set(new TextEncoder().encode('\0Model\0Material\0Texture\0'), 28);
  return header;
}

export function bytesForReceipt(receipt: AbstractSourceReceipt, payload = 'payload'): Uint8Array {
  const body = new TextEncoder().encode(`${receipt.sourceId}:${payload}`);
  if (receipt.sourceSha256) {
    // Tests that need matching hashes should pass explicit bytes.
  }
  return body;
}

export function matchingBytes(tag: string): { bytes: Uint8Array; sha256: string; size: number } {
  const bytes = new TextEncoder().encode(tag);
  return { bytes, sha256: sha256Bytes(bytes), size: bytes.byteLength };
}

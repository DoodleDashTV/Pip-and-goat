import { CANONICALIZATION_SCHEMA } from './types';
import type { AbstractSourceReceipt } from './types';
import type { DiscoveredLogicalAsset } from './logical';
import { isValidSha256 } from './hash';

export type DuplicateReport = {
  exactSourceShaGroups: Array<{ sha256: string; sourceIds: string[] }>;
  exactChildGeometryGroups: Array<{ hash: string; candidateIds: string[] }>;
  exactTextureGroups: Array<{ sha256: string; refs: string[] }>;
  logicalCanonicalGroups: Array<{ groupId: string; candidateIds: string[] }>;
  sameSourceDistinctChildrenPreserved: true;
};

export type CanonicalRecommendation = {
  schemaVersion: typeof CANONICALIZATION_SCHEMA;
  groupId: string;
  state: 'PRIMARY' | 'ALTERNATE_APPROVED' | 'DUPLICATE' | 'ARCHIVAL';
  wrapperIsNotAutomaticCanonical: true;
  mutableLatestUsed: false;
  reason: string;
};

export function detectDuplicates(input: {
  sources: readonly AbstractSourceReceipt[];
  children: readonly DiscoveredLogicalAsset[];
  geometryHashes?: Array<{ candidateId: string; hash: string }>;
  textureHashes?: Array<{ ref: string; sha256: string }>;
}): DuplicateReport {
  const bySourceSha = new Map<string, string[]>();
  for (const source of input.sources) {
    if (!isValidSha256(source.sourceSha256)) continue;
    const list = bySourceSha.get(source.sourceSha256) ?? [];
    list.push(source.sourceId);
    bySourceSha.set(source.sourceSha256, list);
  }
  const byGeom = new Map<string, string[]>();
  for (const item of input.geometryHashes ?? []) {
    const list = byGeom.get(item.hash) ?? [];
    list.push(item.candidateId);
    byGeom.set(item.hash, list);
  }
  const byTex = new Map<string, string[]>();
  for (const item of input.textureHashes ?? []) {
    const list = byTex.get(item.sha256) ?? [];
    list.push(item.ref);
    byTex.set(item.sha256, list);
  }
  const byLogical = new Map<string, string[]>();
  for (const child of input.children) {
    const groupId = `${child.assetKind}:${child.internalStableRef}`;
    const list = byLogical.get(groupId) ?? [];
    list.push(child.assetCandidateId);
    byLogical.set(groupId, list);
  }
  return {
    exactSourceShaGroups: [...bySourceSha.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([sha256, sourceIds]) => ({ sha256, sourceIds })),
    exactChildGeometryGroups: [...byGeom.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([hash, candidateIds]) => ({ hash, candidateIds })),
    exactTextureGroups: [...byTex.entries()]
      .filter(([, refs]) => refs.length > 1)
      .map(([sha256, refs]) => ({ sha256, refs })),
    logicalCanonicalGroups: [...byLogical.entries()].map(([groupId, candidateIds]) => ({ groupId, candidateIds })),
    sameSourceDistinctChildrenPreserved: true,
  };
}

export function recommendCanonical(input: {
  receipt: AbstractSourceReceipt;
  child: DiscoveredLogicalAsset;
  siblings?: readonly DiscoveredLogicalAsset[];
}): CanonicalRecommendation {
  const groupId = `${input.child.assetKind}:${input.child.internalStableRef}`;
  if (input.receipt.canonicalSourceRelation === 'HISTORICAL_VERSION') {
    return {
      schemaVersion: CANONICALIZATION_SCHEMA,
      groupId,
      state: 'ARCHIVAL',
      wrapperIsNotAutomaticCanonical: true,
      mutableLatestUsed: false,
      reason: 'Historical package versions stay historical unless explicitly approved.',
    };
  }
  if (input.receipt.canonicalSourceRelation === 'WRAPPER') {
    return {
      schemaVersion: CANONICALIZATION_SCHEMA,
      groupId,
      state: 'ARCHIVAL',
      wrapperIsNotAutomaticCanonical: true,
      mutableLatestUsed: false,
      reason: 'iPhone ZIP wrappers are archival source identities, not automatic canonical replacements.',
    };
  }
  if (input.receipt.canonicalSourceRelation === 'DUPLICATE') {
    return {
      schemaVersion: CANONICALIZATION_SCHEMA,
      groupId,
      state: 'DUPLICATE',
      wrapperIsNotAutomaticCanonical: true,
      mutableLatestUsed: false,
      reason: 'Receipt provenance marks this source as a duplicate.',
    };
  }
  const preferredDirect =
    input.receipt.canonicalSourceRelation === 'DIRECT_ORIGINAL' ||
    ['BLEND', 'FBX', 'GLB'].includes((input.receipt.formatHint ?? '').toUpperCase());
  return {
    schemaVersion: CANONICALIZATION_SCHEMA,
    groupId,
    state: preferredDirect ? 'PRIMARY' : 'ALTERNATE_APPROVED',
    wrapperIsNotAutomaticCanonical: true,
    mutableLatestUsed: false,
    reason: preferredDirect
      ? 'Direct original provenance supports a primary canonical candidate.'
      : 'Canonical state uses receipt/provenance evidence, not filename popularity.',
  };
}

export function versionIdentity(receipt: AbstractSourceReceipt): string {
  return `${receipt.packageFamily ?? receipt.sourceId}::${receipt.packageVersion ?? receipt.sourceId}`;
}

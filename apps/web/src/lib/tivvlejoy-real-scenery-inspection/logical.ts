import { LOGICAL_DISCOVERY_SCHEMA, type AssetKind } from './types';
import { sha256Canonical, stableId } from './hash';

export type LogicalHint = {
  internalStableRef: string;
  assetKind: AssetKind;
  displayName?: string;
  geometryEvidenceRef?: string;
  materialEvidenceRef?: string;
  textureEvidenceRef?: string;
  objectNames?: string[];
  dimensions?: { x: number; y: number; z: number } | null;
  description?: string;
};

export type DiscoveredLogicalAsset = {
  schemaVersion: typeof LOGICAL_DISCOVERY_SCHEMA;
  assetCandidateId: string;
  sourceId: string;
  sourceSha256: string | null;
  internalStableRef: string;
  assetKind: AssetKind;
  displayName: string;
  geometryEvidenceRef: string | null;
  materialEvidenceRef: string | null;
  textureEvidenceRef: string | null;
  candidateDependencySha256: string;
  selectableApprovedAsset: false;
  discoveryIsNotApproval: true;
};

const KIND_HINTS: Array<{ kind: AssetKind; pattern: RegExp }> = [
  { kind: 'interior_shell', pattern: /interior|shell|room|tavern.?int/i },
  { kind: 'building', pattern: /building|house|bakery|shop|tavern|cottage/i },
  { kind: 'mountain', pattern: /mountain|peak|ridge|summit/i },
  { kind: 'tree', pattern: /tree|pine|oak|birch|forest.?hero/i },
  { kind: 'vegetation', pattern: /grass|flower|shrub|bush|plant|leaf/i },
  { kind: 'rock', pattern: /rock|boulder|stone/i },
  { kind: 'barrel', pattern: /barrel|cask/i },
  { kind: 'table', pattern: /table/i },
  { kind: 'chair', pattern: /chair|stool|bench/i },
  { kind: 'terrain_piece', pattern: /terrain|ground|cliff|slope/i },
  { kind: 'hdri', pattern: /\.hdr$|\.exr$|hdri/i },
  { kind: 'sky', pattern: /sky|horizon/i },
  { kind: 'street_prop', pattern: /sign|lantern|cart|fence|prop/i },
  { kind: 'furniture', pattern: /furniture|shelf|cabinet/i },
  { kind: 'water', pattern: /water|river|lake|pond/i },
  { kind: 'path', pattern: /path|road|street|cobble/i },
  { kind: 'signage', pattern: /signage|signboard|poster/i },
  { kind: 'material_library', pattern: /shader|material.?pack|world.?shader/i },
  { kind: 'procedural_material_source', pattern: /procedural.?material|node.?group/i },
];

export function inferAssetKind(input: { name?: string; description?: string; objectNames?: string[] }): AssetKind {
  const haystack = [input.name, input.description, ...(input.objectNames ?? [])].filter(Boolean).join(' ');
  for (const hint of KIND_HINTS) {
    if (hint.pattern.test(haystack)) return hint.kind;
  }
  return 'unknown';
}

export function discoverLogicalAssets(input: {
  sourceId: string;
  sourceSha256: string | null;
  hints: readonly LogicalHint[];
}): DiscoveredLogicalAsset[] {
  return input.hints.map((hint) => {
    const assetCandidateId = `cand:${stableId([input.sourceId, hint.internalStableRef])}`;
    const draft = {
      schemaVersion: LOGICAL_DISCOVERY_SCHEMA,
      assetCandidateId,
      sourceId: input.sourceId,
      sourceSha256: input.sourceSha256,
      internalStableRef: hint.internalStableRef,
      assetKind: hint.assetKind,
      displayName: hint.displayName ?? hint.internalStableRef,
      geometryEvidenceRef: hint.geometryEvidenceRef ?? null,
      materialEvidenceRef: hint.materialEvidenceRef ?? null,
      textureEvidenceRef: hint.textureEvidenceRef ?? null,
      selectableApprovedAsset: false as const,
      discoveryIsNotApproval: true as const,
    };
    return {
      ...draft,
      candidateDependencySha256: sha256Canonical({
        sourceId: draft.sourceId,
        sourceSha256: draft.sourceSha256,
        internalStableRef: draft.internalStableRef,
        assetKind: draft.assetKind,
        geometryEvidenceRef: draft.geometryEvidenceRef,
        materialEvidenceRef: draft.materialEvidenceRef,
        textureEvidenceRef: draft.textureEvidenceRef,
      }),
    };
  });
}

export function discoverLogicalAssetsFromInventory(input: {
  sourceId: string;
  sourceSha256: string | null;
  objectNames?: string[];
  geometryPaths?: string[];
  descriptions?: string[];
}): DiscoveredLogicalAsset[] {
  const names = input.objectNames?.length ? input.objectNames : input.geometryPaths ?? [];
  if (!names.length) {
    return discoverLogicalAssets({
      sourceId: input.sourceId,
      sourceSha256: input.sourceSha256,
      hints: [
        {
          internalStableRef: 'package-root',
          assetKind: inferAssetKind({ name: input.sourceId, description: input.descriptions?.join(' ') }),
        },
      ],
    });
  }
  const groups = new Map<string, LogicalHint>();
  for (const name of names) {
    const kind = inferAssetKind({ name, description: input.descriptions?.join(' ') });
    const internalStableRef = `${kind}:${normalizeInternal(name)}`;
    if (!groups.has(internalStableRef)) {
      groups.set(internalStableRef, {
        internalStableRef,
        assetKind: kind,
        displayName: name,
        geometryEvidenceRef: name,
        objectNames: [name],
      });
    }
  }
  return discoverLogicalAssets({
    sourceId: input.sourceId,
    sourceSha256: input.sourceSha256,
    hints: [...groups.values()],
  });
}

function normalizeInternal(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unnamed';
}

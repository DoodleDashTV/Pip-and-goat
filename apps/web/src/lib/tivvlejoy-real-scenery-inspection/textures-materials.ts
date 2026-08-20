import { TEXTURE_MATERIAL_SCHEMA, type MaterialClass, type TextureMapKind } from './types';
import { sha256Bytes } from './hash';

export type TextureRecord = {
  ref: string;
  format: string;
  width: number | null;
  height: number | null;
  channels: number | null;
  bitDepth: number | null;
  colorSpace: string | null;
  embedded: boolean;
  sha256: string | null;
  mapKind: TextureMapKind;
  mapConfidence: 'LOW' | 'MEDIUM';
  missing: boolean;
};

export type TextureAudit = {
  schemaVersion: typeof TEXTURE_MATERIAL_SCHEMA;
  textureCount: number;
  formats: string[];
  embeddedCount: number;
  externalCount: number;
  duplicateHashes: Array<{ sha256: string; refs: string[] }>;
  missingReferences: string[];
  textures: TextureRecord[];
};

export type MaterialRecord = {
  name: string;
  textureDependencies: string[];
  pbrCompatible: boolean;
  transparency: boolean;
  emission: boolean;
  complexity: 'SIMPLE' | 'PBR' | 'NODE_GRAPH' | 'UNKNOWN';
  classification: MaterialClass;
  modified: false;
};

export type MaterialAudit = {
  schemaVersion: typeof TEXTURE_MATERIAL_SCHEMA;
  materialCount: number;
  materials: MaterialRecord[];
  nodeDependencyKnown: boolean;
};

const MAP_HINTS: Array<{ kind: TextureMapKind; pattern: RegExp }> = [
  { kind: 'BASE_COLOR', pattern: /base.?col|albedo|diffuse|_col\b|color/i },
  { kind: 'NORMAL', pattern: /normal|_nrm|_nor\b/i },
  { kind: 'ROUGHNESS', pattern: /rough|_rgh/i },
  { kind: 'METALLIC', pattern: /metal|_met/i },
  { kind: 'AO', pattern: /(?:^|_|-)ao(?:_|-|\.|$)|ambient.?occlusion/i },
  { kind: 'ORM', pattern: /(?:^|_|-)orm(?:_|-|\.|$)|occlusion.?rough/i },
  { kind: 'EMISSION', pattern: /emiss|_emit/i },
  { kind: 'OPACITY', pattern: /opac|alpha|transparent/i },
  { kind: 'HEIGHT', pattern: /height|displace|_disp/i },
];

export function classifyTextureMapHint(ref: string): { kind: TextureMapKind; confidence: 'LOW' | 'MEDIUM' } {
  for (const hint of MAP_HINTS) {
    if (hint.pattern.test(ref)) return { kind: hint.kind, confidence: 'LOW' };
  }
  return { kind: 'UNKNOWN', confidence: 'LOW' };
}

export function inspectPngHeader(bytes: Uint8Array): { width: number; height: number; bitDepth: number; channels: number } | null {
  if (bytes.byteLength < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24] ?? 0;
  const colorType = bytes[25] ?? 0;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  return { width, height, bitDepth, channels };
}

export function auditTextures(input: {
  refs: Array<{
    ref: string;
    bytes?: Uint8Array;
    embedded?: boolean;
    missing?: boolean;
    format?: string;
    colorSpace?: string | null;
  }>;
}): TextureAudit {
  const textures: TextureRecord[] = input.refs.map((item) => {
    const png = item.bytes ? inspectPngHeader(item.bytes) : null;
    const hint = classifyTextureMapHint(item.ref);
    return {
      ref: item.ref,
      format: item.format ?? extensionOf(item.ref),
      width: png?.width ?? null,
      height: png?.height ?? null,
      channels: png?.channels ?? null,
      bitDepth: png?.bitDepth ?? null,
      colorSpace: item.colorSpace ?? null,
      embedded: item.embedded ?? Boolean(item.bytes),
      sha256: item.bytes ? sha256Bytes(item.bytes) : null,
      mapKind: hint.kind,
      mapConfidence: hint.confidence,
      missing: item.missing === true,
    };
  });
  const byHash = new Map<string, string[]>();
  for (const texture of textures) {
    if (!texture.sha256) continue;
    const list = byHash.get(texture.sha256) ?? [];
    list.push(texture.ref);
    byHash.set(texture.sha256, list);
  }
  return {
    schemaVersion: TEXTURE_MATERIAL_SCHEMA,
    textureCount: textures.length,
    formats: [...new Set(textures.map((item) => item.format))].sort(),
    embeddedCount: textures.filter((item) => item.embedded).length,
    externalCount: textures.filter((item) => !item.embedded).length,
    duplicateHashes: [...byHash.entries()]
      .filter(([, refs]) => refs.length > 1)
      .map(([sha256, refs]) => ({ sha256, refs })),
    missingReferences: textures.filter((item) => item.missing).map((item) => item.ref),
    textures,
  };
}

export function auditMaterials(input: {
  materials: Array<{
    name: string;
    textureDependencies?: string[];
    pbr?: boolean;
    transparency?: boolean;
    emission?: boolean;
    nodeCount?: number;
    nodeDependencyKnown?: boolean;
  }>;
  nodeDependencyKnown?: boolean;
}): MaterialAudit {
  const materials: MaterialRecord[] = input.materials.map((item) => {
    const complexity = item.nodeCount && item.nodeCount > 8 ? 'NODE_GRAPH' : item.pbr ? 'PBR' : item.nodeCount ? 'SIMPLE' : 'UNKNOWN';
    let classification: MaterialClass = 'HARMONIZATION_REQUIRED';
    if (complexity === 'UNKNOWN' && !item.pbr) classification = 'TECHNICAL_REVIEW_REQUIRED';
    if (item.nodeCount && item.nodeCount > 40) classification = 'TECHNICAL_REVIEW_REQUIRED';
    if (item.pbr && !item.emission && (item.nodeCount ?? 0) <= 8) classification = 'STORYBOOK_READY_CANDIDATE';
    if (item.name.toLowerCase().includes('unsupported')) classification = 'UNSUPPORTED';
    return {
      name: item.name,
      textureDependencies: item.textureDependencies ?? [],
      pbrCompatible: Boolean(item.pbr),
      transparency: Boolean(item.transparency),
      emission: Boolean(item.emission),
      complexity,
      classification,
      modified: false,
    };
  });
  return {
    schemaVersion: TEXTURE_MATERIAL_SCHEMA,
    materialCount: materials.length,
    materials,
    nodeDependencyKnown: input.nodeDependencyKnown ?? input.materials.some((item) => item.nodeDependencyKnown),
  };
}

function extensionOf(ref: string): string {
  const idx = ref.lastIndexOf('.');
  return idx >= 0 ? ref.slice(idx).toLowerCase() : '';
}

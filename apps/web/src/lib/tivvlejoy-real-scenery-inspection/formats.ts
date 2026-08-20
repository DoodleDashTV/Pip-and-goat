import { STATIC_3D_SCHEMA, type ParserConfidence } from './types';

export type GlbInspection = {
  schemaVersion: typeof STATIC_3D_SCHEMA;
  format: 'GLB';
  valid: boolean;
  malformed: boolean;
  version: number | null;
  declaredLength: number | null;
  observedLength: number;
  sceneCount: number;
  nodeCount: number;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  textureCount: number;
  imageCount: number;
  animationCount: number;
  skinCount: number;
  cameraCount: number;
  triangleEstimate: number | null;
  extensionsUsed: string[];
  externalDependencyRefs: string[];
  notes: string[];
};

export type GltfInspection = {
  schemaVersion: typeof STATIC_3D_SCHEMA;
  format: 'GLTF';
  validJson: boolean;
  sceneCount: number;
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  imageCount: number;
  animationCount: number;
  skinCount: number;
  cameraCount: number;
  bufferCount: number;
  extensionsUsed: string[];
  externalDependencyRefs: string[];
  blockedExternalNetwork: boolean;
  blocker: 'BLOCKED_EXTERNAL_NETWORK_DEPENDENCY' | null;
  notes: string[];
};

export type FbxInspection = {
  schemaVersion: typeof STATIC_3D_SCHEMA;
  format: 'FBX';
  kind: 'BINARY' | 'ASCII' | 'UNKNOWN';
  validHeader: boolean;
  version: number | null;
  objectNames: string[];
  objectTypes: string[];
  modelRefs: string[];
  materialRefs: string[];
  textureRefs: string[];
  confidence: ParserConfidence;
  notes: string[];
};

export type BlendHeaderInspection = {
  schemaVersion: typeof STATIC_3D_SCHEMA;
  format: 'BLEND';
  state: 'BLEND_HEADER_VALID' | 'BLEND_HEADER_INVALID' | 'BLEND_VERSION_DETECTED';
  pointerSize: 4 | 8 | null;
  endianness: 'little' | 'big' | null;
  version: string | null;
  deepSceneInspected: false;
  notes: string[];
};

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder('ascii').decode(bytes);
}

function countPrimitives(json: Record<string, unknown>): { primitiveCount: number; triangleEstimate: number | null } {
  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  let primitiveCount = 0;
  let triangles = 0;
  let any = false;
  for (const mesh of meshes) {
    const primitives = Array.isArray((mesh as { primitives?: unknown }).primitives)
      ? ((mesh as { primitives: unknown[] }).primitives)
      : [];
    primitiveCount += primitives.length;
    for (const primitive of primitives) {
      const indices = (primitive as { indices?: number }).indices;
      if (typeof indices === 'number' && Array.isArray(json.accessors)) {
        const accessor = json.accessors[indices] as { count?: number } | undefined;
        if (accessor && typeof accessor.count === 'number') {
          triangles += Math.floor(accessor.count / 3);
          any = true;
        }
      }
    }
  }
  return { primitiveCount, triangleEstimate: any ? triangles : null };
}

function collectExternalRefs(json: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const buffers = Array.isArray(json.buffers) ? json.buffers : [];
  const images = Array.isArray(json.images) ? json.images : [];
  for (const item of [...buffers, ...images]) {
    const uri = (item as { uri?: string }).uri;
    if (typeof uri === 'string' && !uri.startsWith('data:')) refs.push(uri);
  }
  return refs;
}

export function inspectGlb(bytes: Uint8Array): GlbInspection {
  const observedLength = bytes.byteLength;
  const base = {
    schemaVersion: STATIC_3D_SCHEMA,
    format: 'GLB' as const,
    valid: false,
    malformed: true,
    version: null as number | null,
    declaredLength: null as number | null,
    observedLength,
    sceneCount: 0,
    nodeCount: 0,
    meshCount: 0,
    primitiveCount: 0,
    materialCount: 0,
    textureCount: 0,
    imageCount: 0,
    animationCount: 0,
    skinCount: 0,
    cameraCount: 0,
    triangleEstimate: null as number | null,
    extensionsUsed: [] as string[],
    externalDependencyRefs: [] as string[],
    notes: [] as string[],
  };
  if (observedLength < 12 || decodeAscii(bytes.subarray(0, 4)) !== 'glTF') {
    return { ...base, notes: ['Missing glTF magic.'] };
  }
  const version = readU32LE(bytes, 4);
  const declaredLength = readU32LE(bytes, 8);
  if (version !== 2) {
    return { ...base, version, declaredLength, notes: [`Unsupported GLB version ${version}.`] };
  }
  if (declaredLength !== observedLength) {
    return { ...base, version, declaredLength, notes: ['Declared length does not match observed bytes.'] };
  }
  if (observedLength < 20) return { ...base, version, declaredLength, notes: ['Truncated after header.'] };
  const jsonLength = readU32LE(bytes, 12);
  const jsonType = decodeAscii(bytes.subarray(16, 20));
  if (jsonType !== 'JSON') return { ...base, version, declaredLength, notes: ['First chunk is not JSON.'] };
  if (20 + jsonLength > observedLength) return { ...base, version, declaredLength, notes: ['JSON chunk overruns file.'] };
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(20, 20 + jsonLength))) as Record<string, unknown>;
  } catch {
    return { ...base, version, declaredLength, notes: ['GLB JSON chunk is malformed.'] };
  }
  const counts = countPrimitives(json);
  const external = collectExternalRefs(json);
  return {
    ...base,
    valid: true,
    malformed: false,
    version,
    declaredLength,
    sceneCount: Array.isArray(json.scenes) ? json.scenes.length : 0,
    nodeCount: Array.isArray(json.nodes) ? json.nodes.length : 0,
    meshCount: Array.isArray(json.meshes) ? json.meshes.length : 0,
    primitiveCount: counts.primitiveCount,
    materialCount: Array.isArray(json.materials) ? json.materials.length : 0,
    textureCount: Array.isArray(json.textures) ? json.textures.length : 0,
    imageCount: Array.isArray(json.images) ? json.images.length : 0,
    animationCount: Array.isArray(json.animations) ? json.animations.length : 0,
    skinCount: Array.isArray(json.skins) ? json.skins.length : 0,
    cameraCount: Array.isArray(json.cameras) ? json.cameras.length : 0,
    triangleEstimate: counts.triangleEstimate,
    extensionsUsed: Array.isArray(json.extensionsUsed) ? json.extensionsUsed.map(String) : [],
    externalDependencyRefs: external,
    notes: [],
  };
}

export function buildMinimalGlb(json: Record<string, unknown>, bin = new Uint8Array(0)): Uint8Array {
  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBytes.byteLength + jsonPad;
  const binChunkLen = bin.byteLength + binPad;
  const total = 12 + 8 + jsonChunkLen + (bin.byteLength ? 8 + binChunkLen : 0);
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode('glTF'), 0);
  out[4] = 2;
  const view = new DataView(out.buffer);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunkLen, true);
  out.set(new TextEncoder().encode('JSON'), 16);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i += 1) out[20 + jsonBytes.byteLength + i] = 0x20;
  if (bin.byteLength) {
    const binStart = 20 + jsonChunkLen;
    view.setUint32(binStart, binChunkLen, true);
    out.set(new TextEncoder().encode('BIN\0'), binStart + 4);
    out.set(bin, binStart + 8);
  }
  return out;
}

export function inspectGltfJson(text: string): GltfInspection {
  const base = {
    schemaVersion: STATIC_3D_SCHEMA,
    format: 'GLTF' as const,
    validJson: false,
    sceneCount: 0,
    nodeCount: 0,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0,
    imageCount: 0,
    animationCount: 0,
    skinCount: 0,
    cameraCount: 0,
    bufferCount: 0,
    extensionsUsed: [] as string[],
    externalDependencyRefs: [] as string[],
    blockedExternalNetwork: false,
    blocker: null as 'BLOCKED_EXTERNAL_NETWORK_DEPENDENCY' | null,
    notes: [] as string[],
  };
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ...base, notes: ['GLTF JSON is invalid.'] };
  }
  const external = collectExternalRefs(json);
  const network = external.filter(
    (uri) => /^https?:\/\//i.test(uri) || /^ftp:\/\//i.test(uri) || uri.startsWith('//'),
  );
  return {
    ...base,
    validJson: true,
    sceneCount: Array.isArray(json.scenes) ? json.scenes.length : 0,
    nodeCount: Array.isArray(json.nodes) ? json.nodes.length : 0,
    meshCount: Array.isArray(json.meshes) ? json.meshes.length : 0,
    materialCount: Array.isArray(json.materials) ? json.materials.length : 0,
    textureCount: Array.isArray(json.textures) ? json.textures.length : 0,
    imageCount: Array.isArray(json.images) ? json.images.length : 0,
    animationCount: Array.isArray(json.animations) ? json.animations.length : 0,
    skinCount: Array.isArray(json.skins) ? json.skins.length : 0,
    cameraCount: Array.isArray(json.cameras) ? json.cameras.length : 0,
    bufferCount: Array.isArray(json.buffers) ? json.buffers.length : 0,
    extensionsUsed: Array.isArray(json.extensionsUsed) ? json.extensionsUsed.map(String) : [],
    externalDependencyRefs: external,
    blockedExternalNetwork: network.length > 0,
    blocker: network.length ? 'BLOCKED_EXTERNAL_NETWORK_DEPENDENCY' : null,
    notes: network.length ? ['External HTTP dependencies were not fetched.'] : [],
  };
}

export function inspectFbx(bytes: Uint8Array): FbxInspection {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 64 * 1024)));
  const binaryMagic = 'Kaydara FBX Binary  ';
  const header = decodeAscii(bytes.subarray(0, Math.min(23, bytes.byteLength)));
  if (header.startsWith(binaryMagic)) {
    const version = bytes.byteLength >= 27 ? readU32LE(bytes, 23) : null;
    const names = [...text.matchAll(/[\x00]([A-Za-z][A-Za-z0-9_ .-]{2,80})[\x00]/g)].map((m) => m[1]!);
    const types = names.filter((name) => /Model|Material|Texture|Geometry|Video|Deformer/i.test(name));
    return {
      schemaVersion: STATIC_3D_SCHEMA,
      format: 'FBX',
      kind: 'BINARY',
      validHeader: true,
      version,
      objectNames: [...new Set(names)].slice(0, 64),
      objectTypes: [...new Set(types)].slice(0, 32),
      modelRefs: names.filter((name) => /model/i.test(name)).slice(0, 32),
      materialRefs: names.filter((name) => /material/i.test(name)).slice(0, 32),
      textureRefs: names.filter((name) => /texture|video/i.test(name)).slice(0, 32),
      confidence: names.length > 4 ? 'MEDIUM' : 'LOW',
      notes: ['Conservative binary FBX header inspection only. Full geometry was not validated.'],
    };
  }
  if (/;\s*FBX|FBXHeaderExtension/i.test(text)) {
    const versionMatch = text.match(/FBXVersion:\s*(\d+)/);
    const objects = [...text.matchAll(/ObjectType:\s*"([^"]+)"/g)].map((m) => m[1]!);
    const models = [...text.matchAll(/Model::([A-Za-z0-9_ .-]+)/g)].map((m) => m[1]!);
    const materials = [...text.matchAll(/Material::([A-Za-z0-9_ .-]+)/g)].map((m) => m[1]!);
    const textures = [...text.matchAll(/Texture::([A-Za-z0-9_ .-]+)/g)].map((m) => m[1]!);
    return {
      schemaVersion: STATIC_3D_SCHEMA,
      format: 'FBX',
      kind: 'ASCII',
      validHeader: true,
      version: versionMatch ? Number(versionMatch[1]) : null,
      objectNames: [...new Set([...models, ...materials, ...textures])].slice(0, 64),
      objectTypes: [...new Set(objects)].slice(0, 32),
      modelRefs: [...new Set(models)].slice(0, 32),
      materialRefs: [...new Set(materials)].slice(0, 32),
      textureRefs: [...new Set(textures)].slice(0, 32),
      confidence: 'MEDIUM',
      notes: ['ASCII FBX structure scanned without executing content.'],
    };
  }
  return {
    schemaVersion: STATIC_3D_SCHEMA,
    format: 'FBX',
    kind: 'UNKNOWN',
    validHeader: false,
    version: null,
    objectNames: [],
    objectTypes: [],
    modelRefs: [],
    materialRefs: [],
    textureRefs: [],
    confidence: 'LOW',
    notes: ['Unrecognized FBX header. No geometry validation was claimed.'],
  };
}

export function inspectBlendHeader(bytes: Uint8Array): BlendHeaderInspection {
  const magic = decodeAscii(bytes.subarray(0, Math.min(12, bytes.byteLength)));
  if (!magic.startsWith('BLENDER') || bytes.byteLength < 12) {
    return {
      schemaVersion: STATIC_3D_SCHEMA,
      format: 'BLEND',
      state: 'BLEND_HEADER_INVALID',
      pointerSize: null,
      endianness: null,
      version: null,
      deepSceneInspected: false,
      notes: ['Missing Blender magic. Deep scene inspection was not claimed.'],
    };
  }
  const pointerSize = magic[7] === '-' ? 8 : magic[7] === '_' ? 4 : null;
  const endianness = magic[8] === 'v' ? 'little' : magic[8] === 'V' ? 'big' : null;
  const version = magic.slice(9, 12);
  if (!pointerSize || !endianness || !/^\d{3}$/.test(version)) {
    return {
      schemaVersion: STATIC_3D_SCHEMA,
      format: 'BLEND',
      state: 'BLEND_HEADER_INVALID',
      pointerSize,
      endianness,
      version: /^\d{3}$/.test(version) ? version : null,
      deepSceneInspected: false,
      notes: ['Blender header fields are incomplete.'],
    };
  }
  return {
    schemaVersion: STATIC_3D_SCHEMA,
    format: 'BLEND',
    state: 'BLEND_VERSION_DETECTED',
    pointerSize,
    endianness,
    version,
    deepSceneInspected: false,
    notes: [`Blender ${version[0]}.${version.slice(1)} header detected. Header-only; no deep scene claim.`],
  };
}

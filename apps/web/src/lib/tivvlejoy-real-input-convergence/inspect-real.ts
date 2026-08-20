import { inspectZipArchive } from '@/lib/tivvlejoy-real-scenery-inspection/archive';
import { detectLocalBlender, inspectWithIsolatedBlender } from '@/lib/tivvlejoy-real-scenery-inspection/blender';
import { inspectBlendHeader, inspectFbx, inspectGlb, inspectGltfJson } from '@/lib/tivvlejoy-real-scenery-inspection/formats';
import { discoverLogicalAssetsFromInventory } from '@/lib/tivvlejoy-real-scenery-inspection/logical';
import type { HashVerification, RealStaticInspection } from './types';

export function inspectRealSourceBytes(input: {
  sourceId: string;
  objectIdentity: string | null;
  formatHint?: string;
  bytes: Uint8Array;
  hash: HashVerification;
  objectNames?: string[];
}): RealStaticInspection {
  const format = (input.formatHint ?? '').toLowerCase();
  const isZip = format.endsWith('.zip') || (input.bytes[0] === 0x50 && input.bytes[1] === 0x4b);
  const isGlb = format.endsWith('.glb') || (input.bytes[0] === 0x67 && input.bytes[1] === 0x6c);
  const isGltf = format.endsWith('.gltf');
  const isFbx = format.endsWith('.fbx');
  const isBlend = format.endsWith('.blend') || (input.bytes[0] === 0x42 && input.bytes[1] === 0x4c);
  const archive = isZip ? inspectZipArchive(input.bytes) : null;
  const glb = isGlb ? inspectGlb(input.bytes) : null;
  const gltf = isGltf ? inspectGltfJson(new TextDecoder().decode(input.bytes)) : null;
  const fbx = isFbx ? inspectFbx(input.bytes) : null;
  const blend = isBlend ? inspectBlendHeader(input.bytes.subarray(0, 64)) : null;
  const blender = detectLocalBlender();
  const deep = inspectWithIsolatedBlender({});
  const children = discoverLogicalAssetsFromInventory({
    sourceId: input.sourceId,
    sourceSha256: input.hash.observedSha256,
    objectNames: input.objectNames ?? archive?.geometryPaths ?? fbx?.objectNames ?? [],
    geometryPaths: archive?.geometryPaths,
  });
  const quarantined = Boolean(
    (glb && glb.malformed) ||
      (archive && archive.refused) ||
      (blend && blend.state === 'BLEND_HEADER_INVALID'),
  );
  return {
    evidenceClass: 'REAL_SOURCE_INSPECTION',
    sourceId: input.sourceId,
    objectIdentity: input.objectIdentity,
    format: isGlb ? 'GLB' : isGltf ? 'GLTF' : isFbx ? 'FBX' : isBlend ? 'BLEND' : isZip ? 'ZIP' : format.endsWith('.json') ? 'JSON' : 'OTHER',
    hash: input.hash,
    archiveSafe: archive ? !archive.refused && archive.state === 'ARCHIVE_SAFE' : null,
    glb: glb
      ? {
          sceneCount: glb.sceneCount,
          meshCount: glb.meshCount,
          nodeCount: glb.nodeCount,
          materialCount: glb.materialCount,
          textureCount: glb.textureCount,
          imageCount: glb.imageCount,
          animationCount: glb.animationCount,
          skinCount: glb.skinCount,
          primitiveCount: glb.primitiveCount,
          approximateTriangles: glb.triangleEstimate,
          extensions: glb.extensionsUsed,
          externalDependencies: glb.externalDependencyRefs,
          malformed: glb.malformed,
        }
      : gltf
        ? {
            sceneCount: gltf.sceneCount,
            meshCount: gltf.meshCount,
            nodeCount: gltf.nodeCount,
            materialCount: gltf.materialCount,
            externalDependencies: gltf.externalDependencyRefs,
          }
        : null,
    fbx: fbx
      ? {
          kind: fbx.kind,
          validHeader: fbx.validHeader,
          version: fbx.version,
          confidence: fbx.confidence,
          modelRefs: fbx.modelRefs,
          materialRefs: fbx.materialRefs,
        }
      : null,
    blendHeader: blend
      ? {
          headerValid: blend.state !== 'BLEND_HEADER_INVALID',
          blenderVersion: blend.version,
          pointerSize: blend.pointerSize,
          endianness: blend.endianness,
          deepInspectionPending: true,
        }
      : null,
    logicalChildren: children.length,
    deepBlenderInspectionPending: !blender.available || deep.state !== 'DEEP_BLENDER_INSPECTED',
    quarantined,
    notes: [
      'Evidence class is REAL_SOURCE_INSPECTION, not SYNTHETIC_FIXTURE.',
      'Static inspection is not human approval.',
      archive?.state ? `archive=${archive.state}` : '',
    ].filter(Boolean),
  };
}

export function deepBlenderInspectionGate(): {
  required: string[];
  satisfied: false;
  state: 'DEEP_BLENDER_INSPECTION_PENDING';
} {
  return {
    required: [
      'hash verified',
      'source immutable',
      'temporary copy',
      'auto-exec disabled',
      'factory startup',
      'network blocked',
      'timeout',
      'no save',
      'script inventory',
      'driver inventory',
    ],
    satisfied: false,
    state: 'DEEP_BLENDER_INSPECTION_PENDING',
  };
}

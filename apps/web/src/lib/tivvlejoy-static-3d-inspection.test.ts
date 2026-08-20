import { describe, expect, it } from 'vitest';
import {
  blendHeaderBytes,
  buildMinimalGlb,
  fbxBinaryHeader,
  inspectBlendHeader,
  inspectFbx,
  inspectGlb,
  inspectGltfJson,
  inspectWithIsolatedBlender,
} from './tivvlejoy-real-scenery-inspection';

const tavernGltf = {
  scenes: [{}],
  nodes: [{}, {}],
  meshes: [{ primitives: [{ indices: 0 }] }],
  accessors: [{ count: 9 }],
  materials: [{}],
  textures: [{}],
  images: [{ uri: 'wood.png' }],
  animations: [{}],
  skins: [{}],
  cameras: [{}],
  extensionsUsed: ['KHR_materials_unlit'],
};

describe('TIVVLEJOY_STATIC_3D_FORMAT_INSPECTION_V1', () => {
  it('inspects a valid GLB header, JSON chunk and counts', () => {
    const glb = buildMinimalGlb(tavernGltf);
    const report = inspectGlb(glb);
    expect(report.valid).toBe(true);
    expect(report.malformed).toBe(false);
    expect(report.version).toBe(2);
    expect(report.declaredLength).toBe(glb.byteLength);
    expect(report.sceneCount).toBe(1);
    expect(report.nodeCount).toBe(2);
    expect(report.meshCount).toBe(1);
    expect(report.primitiveCount).toBe(1);
    expect(report.materialCount).toBe(1);
    expect(report.textureCount).toBe(1);
    expect(report.imageCount).toBe(1);
    expect(report.animationCount).toBe(1);
    expect(report.skinCount).toBe(1);
    expect(report.cameraCount).toBe(1);
    expect(report.triangleEstimate).toBe(3);
    expect(report.extensionsUsed).toEqual(['KHR_materials_unlit']);
    expect(report.externalDependencyRefs).toEqual(['wood.png']);
  });

  it('detects malformed GLB magic, length and JSON', () => {
    expect(inspectGlb(new Uint8Array([1, 2, 3])).malformed).toBe(true);
    const badLen = buildMinimalGlb({ scenes: [] });
    badLen[8] = 1;
    expect(inspectGlb(badLen).malformed).toBe(true);
    const broken = buildMinimalGlb({ scenes: [] });
    broken[22] = 0x7b;
    expect(inspectGlb(new TextEncoder().encode('glTF')).malformed).toBe(true);
  });

  it('inspects GLTF JSON and blocks external HTTP dependencies', () => {
    const local = inspectGltfJson(JSON.stringify({ buffers: [{ uri: 'data.bin' }], images: [{ uri: 'a.png' }], meshes: [{}] }));
    expect(local.validJson).toBe(true);
    expect(local.blocker).toBeNull();
    const remote = inspectGltfJson(JSON.stringify({ buffers: [{ uri: 'https://evil.example/buf.bin' }] }));
    expect(remote.blockedExternalNetwork).toBe(true);
    expect(remote.blocker).toBe('BLOCKED_EXTERNAL_NETWORK_DEPENDENCY');
    expect(inspectGltfJson('{not json').validJson).toBe(false);
  });

  it('inspects binary and ASCII FBX conservatively', () => {
    const binary = inspectFbx(fbxBinaryHeader(7400));
    expect(binary.validHeader).toBe(true);
    expect(binary.kind).toBe('BINARY');
    expect(binary.version).toBe(7400);
    expect(binary.confidence === 'LOW' || binary.confidence === 'MEDIUM').toBe(true);
    const ascii = inspectFbx(new TextEncoder().encode('; FBX 7.4\nFBXHeaderExtension: {\nFBXVersion: 7400\n}\nObjectType: "Model"\nModel::Tavern\nMaterial::Wood\nTexture::WoodCol\n'));
    expect(ascii.kind).toBe('ASCII');
    expect(ascii.modelRefs).toContain('Tavern');
    expect(ascii.materialRefs).toContain('Wood');
    expect(inspectFbx(new Uint8Array([0, 1, 2])).kind).toBe('UNKNOWN');
  });

  it('reads Blender headers without claiming deep inspection', () => {
    const valid = inspectBlendHeader(blendHeaderBytes('402'));
    expect(valid.state).toBe('BLEND_VERSION_DETECTED');
    expect(valid.pointerSize).toBe(8);
    expect(valid.endianness).toBe('little');
    expect(valid.version).toBe('402');
    expect(valid.deepSceneInspected).toBe(false);
    expect(inspectBlendHeader(new Uint8Array([1, 2, 3])).state).toBe('BLEND_HEADER_INVALID');
  });

  it('returns DEEP_BLENDER_INSPECTION_PENDING when Blender is unavailable', () => {
    const deep = inspectWithIsolatedBlender({});
    expect(deep.state).toBe('DEEP_BLENDER_INSPECTION_PENDING');
    expect(deep.autoExecutionDisabled).toBe(true);
    expect(deep.networkDisabled).toBe(true);
    expect(deep.sourceSaved).toBe(false);
    expect(deep.addonsActivated).toBe(false);
  });
});

describe('static format matrix', () => {
  for (const count of [0, 1, 3, 8]) {
    it(`counts ${count} GLB meshes`, () => {
      const json = { meshes: Array.from({ length: count }, () => ({ primitives: [{}] })) };
      expect(inspectGlb(buildMinimalGlb(json)).meshCount).toBe(count);
    });
  }
  for (const version of ['280', '300', '402']) {
    it(`detects Blender header ${version}`, () => {
      expect(inspectBlendHeader(blendHeaderBytes(version)).version).toBe(version);
    });
  }
  for (const version of [7100, 7300, 7400, 7700]) {
    it(`reads FBX binary version ${version}`, () => {
      expect(inspectFbx(fbxBinaryHeader(version)).version).toBe(version);
    });
  }
  it('counts GLTF buffers, images and extensions', () => {
    const report = inspectGltfJson(
      JSON.stringify({
        scenes: [{}, {}],
        nodes: [{}],
        meshes: [{}, {}],
        materials: [{}, {}, {}],
        textures: [{}],
        images: [{ uri: 'local.png' }],
        animations: [{}, {}],
        skins: [{}],
        buffers: [{ uri: 'a.bin' }, { uri: 'b.bin' }],
        extensionsUsed: ['KHR_lights_punctual'],
      }),
    );
    expect(report.sceneCount).toBe(2);
    expect(report.meshCount).toBe(2);
    expect(report.materialCount).toBe(3);
    expect(report.animationCount).toBe(2);
    expect(report.bufferCount).toBe(2);
    expect(report.extensionsUsed).toEqual(['KHR_lights_punctual']);
  });

  it('does not fetch GLTF network URLs', () => {
    const report = inspectGltfJson(JSON.stringify({ images: [{ uri: 'http://127.0.0.1/tex.png' }] }));
    expect(report.notes.join(' ')).toMatch(/not fetched/i);
  });
  it('treats data URIs as embedded, not network', () => {
    const report = inspectGltfJson(JSON.stringify({ images: [{ uri: 'data:image/png;base64,xx' }] }));
    expect(report.blockedExternalNetwork).toBe(false);
  });
});

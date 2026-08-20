import { describe, expect, it } from 'vitest';
import {
  auditDependencies,
  auditMaterials,
  auditTextures,
  classifyTextureMapHint,
  inspectAddonDependencies,
  inspectPngHeader,
  inspectScriptEvidence,
  pngFixture,
} from './tivvlejoy-real-scenery-inspection';

describe('texture, material and dependency audits', () => {
  it('records texture formats, resolution, channels and duplicate hashes', () => {
    const png = pngFixture(16, 8);
    const audit = auditTextures({
      refs: [
        { ref: 'wood_basecolor.png', bytes: png, embedded: true },
        { ref: 'wood_basecolor_copy.png', bytes: png, embedded: true },
        { ref: 'missing_normal.png', missing: true, format: '.png' },
      ],
    });
    expect(audit.textureCount).toBe(3);
    expect(audit.duplicateHashes[0]?.refs).toHaveLength(2);
    expect(audit.missingReferences).toEqual(['missing_normal.png']);
    expect(audit.textures[0]?.width).toBe(16);
    expect(audit.textures[0]?.height).toBe(8);
    expect(audit.textures[0]?.channels).toBe(4);
    expect(audit.textures[0]?.bitDepth).toBe(8);
    expect(audit.textures[0]?.mapKind).toBe('BASE_COLOR');
    expect(audit.textures[0]?.mapConfidence).toBe('LOW');
  });

  it('uses filename hints only as low-confidence map metadata', () => {
    expect(classifyTextureMapHint('hero_nrm.png').kind).toBe('NORMAL');
    expect(classifyTextureMapHint('floor_rough.png').kind).toBe('ROUGHNESS');
    expect(classifyTextureMapHint('gate_met.tif').kind).toBe('METALLIC');
    expect(classifyTextureMapHint('wall_ao.jpg').kind).toBe('AO');
    expect(classifyTextureMapHint('pack_orm.png').kind).toBe('ORM');
    expect(classifyTextureMapHint('lamp_emit.png').kind).toBe('EMISSION');
    expect(classifyTextureMapHint('leaf_opac.png').kind).toBe('OPACITY');
    expect(classifyTextureMapHint('rock_height.png').kind).toBe('HEIGHT');
    expect(classifyTextureMapHint('random.png').kind).toBe('UNKNOWN');
    expect(classifyTextureMapHint('hero_nrm.png').confidence).toBe('LOW');
  });

  it('classifies materials without modifying them', () => {
    const audit = auditMaterials({
      materials: [
        { name: 'StorybookWood', pbr: true, nodeCount: 4 },
        { name: 'HeavyGraph', pbr: true, nodeCount: 50, transparency: true },
        { name: 'unknown_mat' },
        { name: 'unsupported_shader' },
      ],
    });
    expect(audit.materials[0]?.classification).toBe('STORYBOOK_READY_CANDIDATE');
    expect(audit.materials[1]?.classification).toBe('TECHNICAL_REVIEW_REQUIRED');
    expect(audit.materials[2]?.classification).toBe('TECHNICAL_REVIEW_REQUIRED');
    expect(audit.materials[3]?.classification).toBe('UNSUPPORTED');
    expect(audit.materials.every((item) => item.modified === false)).toBe(true);
  });

  it('blocks approval-ready when required dependencies are missing', () => {
    const audit = auditDependencies({
      missingTextures: ['a.png'],
      missingLinkedLibraries: ['lib.blend'],
      missingExternalGeometry: ['extra.fbx'],
      missingHdris: ['sky.hdr'],
      missingMaterialResources: ['wood.mtl'],
    });
    expect(audit.approvalReadyBlocked).toBe(true);
    expect(audit.blockers).toHaveLength(5);
    expect(auditDependencies({}).approvalReadyBlocked).toBe(false);
  });

  it('reports scripts without executing them', () => {
    expect(inspectScriptEvidence(['mesh only']).state).toBe('NO_SCRIPT_EVIDENCE');
    expect(inspectScriptEvidence(['import bpy']).state).toBe('SCRIPT_CONTENT_PRESENT_NOT_EXECUTED');
    expect(inspectScriptEvidence(['load_post handler']).state).toBe('SCRIPT_REVIEW_REQUIRED');
    expect(inspectScriptEvidence(['os.system("rm")']).state).toBe('UNSAFE_EXECUTION_DEPENDENCY');
    expect(inspectScriptEvidence(['https://evil.example', 'import bpy']).state).toBe('UNSAFE_EXECUTION_DEPENDENCY');
    expect(inspectScriptEvidence(['driver']).executed).toBe(false);
  });

  it('detects addon packages without activating them', () => {
    const botaniq = inspectAddonDependencies(['Botaniq Full 7.2.0']);
    expect(botaniq.state).toBe('REQUIRED_ADDON');
    expect(botaniq.botaniq).toBe('NOT_ACTIVATED');
    expect(botaniq.activated).toBe(false);
    const scatter = inspectAddonDependencies(['Geo-Scatter companion.scatpack']);
    expect(scatter.state).toBe('OPTIONAL_ADDON');
    expect(scatter.geoScatter).toBe('NOT_INTEGRATED');
    const lights = inspectAddonDependencies(['Gaffer 4', 'Physical Starlight']);
    expect(lights.optional).toEqual(expect.arrayContaining(['Gaffer', 'Physical Starlight']));
    expect(lights.gaffer).toBe('OPTIONAL');
    expect(inspectAddonDependencies(['mystery addon pack']).state).toBe('UNKNOWN_ADDON_DEPENDENCY');
    expect(inspectAddonDependencies([]).state).toBe('NO_ADDON_DEPENDENCY');
  });

  it('rejects non-PNG bytes in the PNG header helper', () => {
    expect(inspectPngHeader(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('map and material matrix', () => {
  const maps = ['basecolor', 'normal', 'rough', 'metal', 'ao', 'orm', 'emit', 'alpha', 'height', 'unknownmap'];
  for (const name of maps) {
    it(`classifies ${name} as a map hint only`, () => {
      expect(classifyTextureMapHint(`${name}.png`).confidence).toBe('LOW');
    });
  }
  for (const missing of ['textures', 'linked_libraries', 'geometry', 'hdri', 'materials'] as const) {
    it(`blocks on missing ${missing}`, () => {
      const audit = auditDependencies({
        missingTextures: missing === 'textures' ? ['x'] : [],
        missingLinkedLibraries: missing === 'linked_libraries' ? ['x'] : [],
        missingExternalGeometry: missing === 'geometry' ? ['x'] : [],
        missingHdris: missing === 'hdri' ? ['x'] : [],
        missingMaterialResources: missing === 'materials' ? ['x'] : [],
      });
      expect(audit.approvalReadyBlocked).toBe(true);
    });
  }
});

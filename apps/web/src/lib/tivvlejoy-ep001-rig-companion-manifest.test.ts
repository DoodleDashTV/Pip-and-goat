import { describe, expect, it } from 'vitest';
import { compileEp001RigCompanionManifest } from './tivvlejoy-ep001-rig-companion-manifest';

describe('EP001 rig companion manifest', () => {
  it('keeps Blender canonical and all companion files subordinate', () => {
    const manifest = compileEp001RigCompanionManifest();
    expect(manifest.canonicalArtifact.extension).toBe('.blend');
    expect(manifest.canonicalArtifact.required).toBe(true);
    expect(manifest.companionArtifacts.map((item) => item.extension)).toEqual(['.fbx','.glb','.zip']);
    expect(manifest.companionArtifacts.every((item) => item.required === false)).toBe(true);
    expect(manifest.authority.canonicalRigChanged).toBe(false);
    expect(manifest.authority.humanApprovalGranted).toBe(false);
    expect(manifest.rigCompanionManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

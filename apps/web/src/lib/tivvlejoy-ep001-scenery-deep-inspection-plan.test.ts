import { describe, expect, it } from 'vitest';
import { compileEp001SceneryDeepInspectionPlan, EP001_SCENERY_DEEP_INSPECTION_PLAN_SCHEMA } from './tivvlejoy-ep001-scenery-deep-inspection-plan';

describe('EP001 scenery deep inspection plan', () => {
  it('covers every provenance source deterministically', () => {
    const first = compileEp001SceneryDeepInspectionPlan();
    const second = compileEp001SceneryDeepInspectionPlan();
    expect(first.schemaVersion).toBe(EP001_SCENERY_DEEP_INSPECTION_PLAN_SCHEMA);
    expect(first.sceneryDeepInspectionPlanSha256).toBe(second.sceneryDeepInspectionPlanSha256);
    expect(first.sceneryDeepInspectionPlanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.sourceCount).toBe(8);
    expect(first.items).toHaveLength(8);
    expect(new Set(first.items.map((item) => item.sourceId)).size).toBe(8);
    expect(first.items.every((item) => item.expectedEvidence.length > 0 && item.checks.length > 0)).toBe(true);
  });

  it('keeps inspection separate from license and visual approval', () => {
    const compiled = compileEp001SceneryDeepInspectionPlan();
    expect(compiled.items.every((item) => item.currentState === 'NOT_EXECUTED' && !item.admitted)).toBe(true);
    expect(compiled.authority.blenderExecutionPerformed).toBe(false);
    expect(compiled.authority.licenseApprovalIssued).toBe(false);
    expect(compiled.authority.humanVisualApprovalIssued).toBe(false);
    expect(compiled.authority.sceneryAdmissionGranted).toBe(false);
    expect(compiled.authority.paidComputeAllowed).toBe(false);
    expect(compiled.authority.productionWritesAllowed).toBe(false);
    expect(compiled.safety.blenderLaunched).toBe(false);
    expect(compiled.safety.embeddedScriptsExecuted).toBe(false);
    expect(compiled.safety.paidRequests).toBe(0);
  });

  it('assigns appropriate isolated inspection modes', () => {
    const compiled = compileEp001SceneryDeepInspectionPlan();
    const byId = new Map(compiled.items.map((item) => [item.sourceId, item]));
    expect(byId.get('VILLAGE_FBX_V1')?.inspectionMode).toBe('FBX_IMPORT_ISOLATED');
    expect(byId.get('VILLAGE_TEXTURES_V1')?.inspectionMode).toBe('TEXTURE_STATIC_INSPECTION');
    expect(byId.get('FOREST_TEXTURES_4096_V1')?.inspectionMode).toBe('TEXTURE_STATIC_INSPECTION');
    expect(byId.get('WORLD_SHADER_SKY_V1')?.inspectionMode).toBe('BLENDER_OPEN_READONLY');
    expect(byId.get('PROCEDURAL_ASSET_LIBRARY_V1')?.inspectionMode).toBe('BLENDER_ASSET_LIBRARY_READONLY');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembleEp012,
  assembleShot,
  buildDependencyGraph,
  collectionPlan,
  continuityAffectedShots,
  ep012AssemblyInputs,
  environmentSlot,
  hashAssemblyManifest,
  MAP_PROP_CONTINUITY,
  resolveAssetSlot,
} from './tivvlejoy-shot-assembly-manifest';

const repoRoot = path.resolve(__dirname, '../../../..');

function hashOf(input: ReturnType<typeof ep012AssemblyInputs>[number]) {
  const manifest = assembleShot(input);
  return manifest.assemblyDependencySha256;
}

describe('deterministic assembly manifests', () => {
  it('builds 11 deterministic EP012 manifests', () => {
    const first = assembleEp012();
    const second = assembleEp012();
    expect(first.manifests).toHaveLength(11);
    expect(first.manifests.map((item) => item.assemblyDependencySha256)).toEqual(
      second.manifests.map((item) => item.assemblyDependencySha256),
    );
  });

  it('keeps assembly dependency hashes deterministic', () => {
    const input = ep012AssemblyInputs()[1]!;
    expect(hashOf(input)).toBe(hashOf(input));
  });

  it('produces identical hashes for identical inputs', () => {
    const [input] = ep012AssemblyInputs();
    expect(assembleShot(input!).assemblyDependencySha256).toBe(assembleShot(input!).assemblyDependencySha256);
  });

  it('does not change the hash when notes change', () => {
    const input = ep012AssemblyInputs()[1]!;
    expect(hashOf({ ...input, notes: 'one' })).toBe(hashOf({ ...input, notes: 'two' }));
  });

  it('changes dependent shots when a location version changes', () => {
    const inputs = ep012AssemblyInputs();
    const bakery = inputs.filter((item) => item.locationPresetId === 'bakery');
    const changed = bakery.map((item) => assembleShot({ ...item, environmentVersion: 'bakery-env-v2' }));
    const baseline = bakery.map((item) => assembleShot(item));
    expect(changed[0]?.assemblyDependencySha256).not.toBe(baseline[0]?.assemblyDependencySha256);
    const forest = assembleShot(inputs.find((item) => item.locationPresetId === 'forest_exit')!);
    const forestChanged = assembleShot({
      ...inputs.find((item) => item.locationPresetId === 'forest_exit')!,
      environmentVersion: 'bakery-env-v2',
    });
    expect(forest.location.presetId).toBe('forest_exit');
    expect(changed.every((item) => item.location.presetId === 'bakery')).toBe(true);
    expect(forestChanged.shotId).toBe(forest.shotId);
  });

  it('changes the affected shot when the camera changes', () => {
    const input = ep012AssemblyInputs()[1]!;
    expect(hashOf({ ...input, cameraTemplateId: 'TJ_CAM_REVEAL' })).not.toBe(hashOf(input));
  });

  it('changes the affected shot when lighting changes', () => {
    const input = ep012AssemblyInputs()[1]!;
    expect(hashOf({ ...input, lightingPresetId: 'TJ_GOLDEN_HOUR' })).not.toBe(hashOf(input));
  });
});

describe('dependency graph and blockers', () => {
  it('limits a Pip rig change to Pip shots', () => {
    const graph = assembleEp012().graph;
    const affected = graph.shotsAffectedByCharacter('PIP');
    expect(affected).toContain('SH003');
    expect(affected).not.toContain('SH005');
    expect(affected).not.toContain('SH001');
  });

  it('limits a Goat rig change to Goat shots', () => {
    const affected = assembleEp012().graph.shotsAffectedByCharacter('GOAT');
    expect(affected).toContain('SH005');
    expect(affected).not.toContain('SH003');
    expect(affected).not.toContain('SH004');
  });

  it('does not let an unrelated location change affect bakery', () => {
    const bakery = assembleEp012().graph.shotsAffectedByLocation('bakery-env-v1');
    const forest = assembleEp012().graph.shotsAffectedByLocation('forest-exit-env-v1');
    expect(bakery.every((id) => ['SH001', 'SH002', 'SH003', 'SH004', 'SH005', 'SH006', 'SH007'].includes(id))).toBe(true);
    expect(forest.every((id) => ['SH008', 'SH009', 'SH010', 'SH011'].includes(id))).toBe(true);
    expect(bakery).not.toContain('SH008');
  });

  it('limits a story-prop change to continuity-dependent shots', () => {
    expect(continuityAffectedShots(MAP_PROP_CONTINUITY, 'SH003')).toEqual(['SH003', 'SH004', 'SH007', 'SH010']);
    expect(assembleEp012().graph.shotsAffectedByProp('MAP_PROP_001')).toEqual(['SH003', 'SH004', 'SH007', 'SH010']);
  });

  it('blocks a missing required source', () => {
    expect(resolveAssetSlot({ slotId: 'x', semanticRole: 'BUILDING_HERO', qualityTier: 'HERO', required: true, visibilityClass: 'HERO', approvalStatus: 'missing' }).blocker).toBe(
      'MISSING_ENVIRONMENT_SOURCE',
    );
    const blocked = assembleShot({
      ...ep012AssemblyInputs()[0]!,
      environmentSlots: [
        { slotId: 'MISSING', semanticRole: 'BUILDING_HERO', qualityTier: 'HERO', required: true, visibilityClass: 'HERO', approvalStatus: 'missing' },
      ],
    });
    expect(blocked.assemblyStatus).toBe('ASSEMBLY_BLOCKED');
  });

  it('blocks an unapproved source', () => {
    expect(environmentSlot({ slotId: 'u', semanticRole: 'PATH', qualityTier: 'SUPPORTING', required: true, visibilityClass: 'SUPPORTING', sourceReceiptRef: 'r', sourceVersion: 'v', sourceSha256: 'aa'.repeat(32), approvalStatus: 'unapproved' }).blocker).toBe('UNAPPROVED_ASSET');
  });

  it('blocks a quarantined source', () => {
    expect(resolveAssetSlot({ slotId: 'q', semanticRole: 'PATH', qualityTier: 'SUPPORTING', required: true, visibilityClass: 'SUPPORTING', sourceReceiptRef: 'r', approvalStatus: 'quarantined' }).blocker).toBe('QUARANTINED_ASSET');
  });

  it('blocks a version mismatch', () => {
    expect(
      resolveAssetSlot({
        slotId: 'v',
        semanticRole: 'PATH',
        qualityTier: 'SUPPORTING',
        required: true,
        visibilityClass: 'SUPPORTING',
        sourceReceiptRef: 'r',
        sourceVersion: 'v1',
        expectedVersion: 'v2',
        sourceSha256: 'aa'.repeat(32),
        approvalStatus: 'approved',
      }).blocker,
    ).toBe('VERSION_MISMATCH');
  });

  it('reports missing environment version and hash without pretending the source is missing', () => {
    expect(
      resolveAssetSlot({
        slotId: 'ver',
        semanticRole: 'PATH',
        qualityTier: 'SUPPORTING',
        required: true,
        visibilityClass: 'SUPPORTING',
        sourceReceiptRef: 'r',
        sourceSha256: 'aa'.repeat(32),
        approvalStatus: 'approved',
      }).blocker,
    ).toBe('MISSING_ENVIRONMENT_VERSION');
    expect(
      resolveAssetSlot({
        slotId: 'hash',
        semanticRole: 'PATH',
        qualityTier: 'SUPPORTING',
        required: true,
        visibilityClass: 'SUPPORTING',
        sourceReceiptRef: 'r',
        sourceVersion: 'v',
        approvalStatus: 'approved',
      }).blocker,
    ).toBe('MISSING_ENVIRONMENT_HASH');
  });

  it('blocks a hash mismatch', () => {
    expect(
      resolveAssetSlot({
        slotId: 'h',
        semanticRole: 'PATH',
        qualityTier: 'SUPPORTING',
        required: true,
        visibilityClass: 'SUPPORTING',
        sourceReceiptRef: 'r',
        sourceVersion: 'v',
        sourceSha256: 'aa'.repeat(32),
        expectedSha256: 'bb'.repeat(32),
        approvalStatus: 'approved',
      }).blocker,
    ).toBe('HASH_MISMATCH');
  });

  it('blocks real assembly when the character rig is unresolved', () => {
    const manifest = assembleShot(ep012AssemblyInputs()[1]!);
    expect(manifest.characters.slots.every((slot) => slot.rigVersion === 'UNRESOLVED_PRODUCTION_RIG')).toBe(true);
    expect(manifest.realAssemblyStatus).toBe('WAITING_FOR_CHARACTER_RIGS');
    expect(manifest.hardBlockers).toContain('MISSING_CHARACTER_RIG');
  });

  it('does not block a planning-only manifest for unresolved rigs', () => {
    const manifest = assembleShot(ep012AssemblyInputs()[1]!);
    expect(manifest.assemblyStatus).toBe('READY_FOR_SYNTHETIC_ASSEMBLY');
  });

  it('cannot mark a synthetic fixture READY_FOR_REAL_ASSEMBLY', () => {
    const report = assembleEp012();
    expect(report.metrics.readyRealAssemblyShotCount).toBe(0);
    expect(report.manifests.every((item) => item.realAssemblyStatus !== 'READY_FOR_REAL_ASSEMBLY')).toBe(true);
  });
});

describe('reuse, lighting, and isolation', () => {
  it('reuses environment bases without duplicating the source', () => {
    const report = assembleEp012();
    expect(report.instances).toHaveLength(2);
    expect(report.instances.every((item) => item.sourceImmutable)).toBe(true);
    expect(report.metrics.reusedEnvironmentInstances).toBe(9);
    expect(report.metrics.baseEnvironmentLoads).toBe(2);
  });

  it('applies a location delta without mutating the base', () => {
    const bakery = assembleEp012().instances.find((item) => item.locationPresetId === 'bakery');
    expect(bakery?.baseEnvironmentVersion).toBe('bakery-env-v1');
    expect(bakery?.appliedDeltaSha256).toBeTruthy();
    expect(bakery?.sourceImmutable).toBe(true);
  });

  it('uses a native lighting path with no commercial plugin', () => {
    expect(assembleEp012().manifests.every((item) => item.lighting.pluginDependency === 'NONE')).toBe(true);
  });

  it('keeps Botaniq optional and unresolved', () => {
    const trees = assembleEp012().manifests[0]?.environmentAssets.slots.find((slot) => slot.slotId === 'BAKERY_TREES');
    expect(trees?.providerPreference).toBe('BOTANIQ_IF_APPROVED');
    expect(trees?.botaniqBound).toBe(false);
    expect(trees?.dependencyStatus).toBe('UNRESOLVED_SOURCE');
  });

  it('keeps Geo-Scatter not integrated', () => {
    expect(assembleEp012().manifests.every((item) => item.environmentAssets.slots.every((slot) => slot.geoScatterIntegrated === false))).toBe(true);
  });

  it('makes no provider API call and does not launch a GPU', () => {
    const report = assembleEp012();
    expect(report.safety.providerContacted).toBe(false);
    expect(report.safety.gpuLaunched).toBe(false);
    expect(report.manifests.every((item) => item.blenderRequest.executionAuthorized === false)).toBe(true);
    expect(report.manifests.every((item) => item.renderBridge.gpuLaunched === false)).toBe(true);
  });

  it('does not modify the purchased-assets workstream', () => {
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/purchased-assets'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/api/purchased-tools'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/lib/purchased-tools'))).toBe(false);
  });

  it('documents the milestone and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_DETERMINISTIC_SHOT_ASSEMBLY_MANIFEST_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/ShotAssemblyPlanner.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_SHOT_ASSEMBLY_MANIFEST_V1');
    expect(docs).toContain('READY_FOR_REAL_ASSEMBLY');
    expect(ui).toContain('Shot Assembly Planner');
    expect(ui).toContain('NO BOTANIQ PROCESSING');
    expect(ui).not.toMatch(/DoodleDash/i);
  });

  it('plans a deterministic collection tree without creating a blend file', () => {
    const plan = collectionPlan('SH002');
    expect(plan.shotRoot).toBe('TJ_SHOT_SH002');
    expect(plan.children.PIP).toBe('TJ_SHOT_SH002/CHARACTERS/PIP');
    expect(plan.blendFileCreated).toBe(false);
  });

  it('keeps the Blender request dry-run and unauthorized', () => {
    const request = assembleEp012().manifests[0]!.blenderRequest;
    expect(request.dryRun).toBe(true);
    expect(request.allowCommercialSources).toBe(false);
    expect(request.allowCharacterAssets).toBe(false);
    expect(request.executionAuthorized).toBe(false);
    expect(request.subprocessStarted).toBe(false);
  });

  it('keeps the render bridge unpaid and unlaunched', () => {
    const bridge = assembleEp012().manifests[0]!.renderBridge;
    expect(bridge.paidAuthorizationRequired).toBe(true);
    expect(bridge.providerContacted).toBe(false);
    expect(bridge.gpuLaunched).toBe(false);
    expect(bridge.paidCompute).toBe(false);
    expect(bridge.launchAuthorized).toBe(false);
  });

  it('exposes hashAssemblyManifest for identical canonical input', () => {
    const input = {
      shotId: 'SH002',
      episodeId: 'EP012',
      episodeVersion: 'ep012-plan-v1',
      shotDependencySha256: 'aa'.repeat(32),
      locationVersion: 'bakery-env-v1',
      locationDeltaSha256: null,
      cameraTemplateId: 'TJ_CAM_TWO_SHOT_MEDIUM',
      lightingPresetId: 'TJ_MORNING_WARM',
      characterSlots: [{ characterId: 'PIP', rigVersion: 'UNRESOLVED_PRODUCTION_RIG', visible: true }],
      environmentSlots: [{ slotId: 'BAKERY_HERO', sourceVersion: 'bakery-env-v1', sourceSha256: 'ab'.repeat(32) }],
      storyPropIds: [],
      renderProfile: 'PLANNING' as const,
    };
    expect(hashAssemblyManifest(input)).toBe(hashAssemblyManifest(input));
    expect(buildDependencyGraph(assembleEp012().manifests).schemaVersion).toBe('TIVVLEJOY_SHOT_DEPENDENCY_GRAPH_V1');
  });
});

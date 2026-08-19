import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleShot, ep012AssemblyInputs } from './tivvlejoy-shot-assembly-manifest';
import {
  COLLECTION_ORDER,
  auditBlenderScript,
  botaniqProviderBoundary,
  buildBlenderAssemblyPlan,
  diffBlenderPlans,
  dryRunEp012,
  sha256Text,
  unsafeScriptFixture,
} from './tivvlejoy-blender-assembly-driver';

const repoRoot = path.resolve(__dirname, '../../../..');

function planFor(index = 1, extras?: Parameters<typeof buildBlenderAssemblyPlan>[1]) {
  return buildBlenderAssemblyPlan(assembleShot(ep012AssemblyInputs()[index]!), extras);
}

describe('deterministic blender assembly plans', () => {
  it('builds a deterministic assembly plan', () => {
    const first = planFor();
    const second = planFor();
    expect(first.planDependencySha256).toBe(second.planDependencySha256);
    expect(first.orderedOperations.map((item) => item.operationId)).toEqual(
      second.orderedOperations.map((item) => item.operationId),
    );
  });

  it('keeps operation IDs deterministic', () => {
    expect(planFor().operationGraph.operationIds).toEqual(planFor().operationGraph.operationIds);
  });

  it('keeps the plan hash deterministic', () => {
    expect(planFor().planDependencySha256).toBe(planFor().planDependencySha256);
  });

  it('keeps generated script output deterministic', () => {
    expect(planFor().script.source).toBe(planFor().script.source);
  });

  it('keeps the script SHA deterministic', () => {
    const plan = planFor();
    expect(plan.script.scriptSha256).toBe(sha256Text(plan.script.source));
    expect(plan.script.scriptSha256).toBe(planFor().script.scriptSha256);
  });

  it('does not change the plan when notes change', () => {
    const input = ep012AssemblyInputs()[1]!;
    const left = buildBlenderAssemblyPlan(assembleShot({ ...input, notes: 'one' }), { notes: 'one' });
    const right = buildBlenderAssemblyPlan(assembleShot({ ...input, notes: 'two' }), { notes: 'two', displayLabel: 'label' });
    expect(left.planDependencySha256).toBe(right.planDependencySha256);
  });

  it('produces a byte-identical script for the same input', () => {
    const source = planFor().script.source;
    expect(Buffer.from(source).equals(Buffer.from(planFor().script.source))).toBe(true);
  });

  it('uses deterministic collection ordering and names', () => {
    const plan = planFor();
    expect(plan.collectionPlan.root).toBe('TJ_SHOT_SH002');
    expect(plan.collectionPlan.ordered.map((item) => item.name)).toEqual([...COLLECTION_ORDER]);
  });

  it('uses deterministic object names', () => {
    const plan = planFor();
    expect(plan.cameraPlan[0]?.target).toBe('TJ_SH002_CAM_MAIN');
    expect(plan.lightingPlan.some((item) => item.target === 'TJ_SH002_LIGHT_KEY')).toBe(true);
    expect(plan.characterPlan.map((item) => item.target)).toEqual(['TJ_SH002_CHAR_PIP', 'TJ_SH002_CHAR_GOAT']);
  });
});

describe('bindings, boundaries, and audit', () => {
  it('maps camera bindings without inventing rig measurements', () => {
    const camera = planFor().cameraPlan.find((item) => item.operationId.endsWith('CONFIGURE_CAM'));
    expect(camera?.parameters.cameraTemplateId).toBe('TJ_CAM_TWO_SHOT_MEDIUM');
    expect(camera?.parameters.aspectRatio).toBe('9:16');
    expect(camera?.parameters.pipGoatPixelMeasurements).toBe('UNRESOLVED');
    expect(camera?.parameters.plannedTransform).toBe('UNRESOLVED');
  });

  it('maps lighting bindings on the native path', () => {
    const lights = planFor().lightingPlan;
    expect(lights.map((item) => item.parameters.role).filter(Boolean)).toEqual(['KEY', 'KEY', 'FILL', 'FILL', 'RIM', 'RIM', 'ENVIRONMENT', 'ENVIRONMENT']);
    expect(lights.every((item) => item.parameters.pluginDependency === 'NONE')).toBe(true);
    expect(lights.every((item) => item.parameters.gaffer !== 'ACTIVATED')).toBe(true);
  });

  it('preserves unresolved Pip and Goat production rigs', () => {
    const plan = planFor();
    expect(plan.characterPlan.every((item) => item.parameters.rigVersion === 'UNRESOLVED_PRODUCTION_RIG')).toBe(true);
    expect(plan.characterPlan.filter((item) => item.status === 'BLOCKED_UNRESOLVED_PRODUCTION_RIG')).toHaveLength(2);
  });

  it('keeps Botaniq not activated and Geo-Scatter false', () => {
    expect(botaniqProviderBoundary().status).toBe('NOT_ACTIVATED');
    expect(botaniqProviderBoundary().geoScatterIntegrated).toBe(false);
    const trees = planFor(0).environmentPlan.find((item) => item.parameters.slotId === 'BAKERY_TREES');
    expect(trees?.parameters.botaniqProvider).toMatchObject({ status: 'NOT_ACTIVATED', geoScatterIntegrated: false });
  });

  it('never emits a commercial file path, secret, or signed URL', () => {
    const scripts = dryRunEp012().plans.map((item) => item.script.source).join('\n');
    expect(scripts).not.toMatch(/botaniq_full|\.blend|r2\.|amazonaws|X-Amz-Signature|AKIA|INTAKE_TOKEN|RUNPOD/i);
    expect(scripts).not.toContain('https://');
    expect(scripts).not.toContain('http://');
  });

  it('rejects subprocess, os.system, network, and source overwrite', () => {
    expect(auditBlenderScript(unsafeScriptFixture('subprocess'), 'SH000').forbiddenTokensFound).toContain('subprocess');
    expect(auditBlenderScript(unsafeScriptFixture('os.system'), 'SH000').shellRisk).toBe(true);
    expect(auditBlenderScript(unsafeScriptFixture('network'), 'SH000').networkRisk).toBe(true);
    expect(auditBlenderScript(unsafeScriptFixture('overwrite'), 'SH000').sourceOverwriteRisk).toBe(true);
    expect(auditBlenderScript(unsafeScriptFixture('signed-url'), 'SH000').safe).toBe(false);
    expect(auditBlenderScript(unsafeScriptFixture('secret'), 'SH000').secretPatternsFound.length).toBeGreaterThan(0);
  });

  it('passes audit for a static safe generated script', () => {
    const audit = planFor().audit;
    expect(audit.safe).toBe(true);
    expect(audit.executionAuthorized).toBe(false);
    expect(audit.forbiddenTokensFound).toEqual([]);
  });

  it('fails audit for an unsafe synthetic script', () => {
    expect(auditBlenderScript(unsafeScriptFixture('subprocess'), 'SH000').safe).toBe(false);
  });

  it('does not create duplicate names on a second simulated pass', () => {
    expect(planFor().simulation.secondPassDuplicates).toBe(0);
  });

  it('runs the dry-run simulator without Blender', () => {
    const receipt = planFor().simulation;
    expect(receipt.collectionCount).toBeGreaterThan(0);
    expect(receipt.plannedObjectCount).toBeGreaterThan(0);
    expect(receipt.blenderExecuted).toBe(false);
    expect(receipt.simulationResult).toBe('DRY_RUN_VALID_WITH_UNRESOLVED_ASSETS');
  });
});

describe('EP012 fixture, diffs, and isolation', () => {
  it('creates 11 plans and 11 script audit receipts', () => {
    const report = dryRunEp012();
    expect(report.plans).toHaveLength(11);
    expect(report.plans.every((item) => item.audit.schemaVersion === 'TIVVLEJOY_BLENDER_SCRIPT_AUDIT_V1')).toBe(true);
    expect(report.metrics.auditCount).toBe(11);
    expect(report.metrics.dryRunValidWithUnresolved).toBe(11);
  });

  it('does not require reassembly for a notes-only diff', () => {
    const input = ep012AssemblyInputs()[1]!;
    const diff = diffBlenderPlans(
      buildBlenderAssemblyPlan(assembleShot({ ...input, notes: 'a' }), { notes: 'a' }),
      buildBlenderAssemblyPlan(assembleShot({ ...input, notes: 'b' }), { notes: 'b' }),
    );
    expect(diff.requiresPreviewReassembly).toBe(false);
    expect(diff.changedOperations).toEqual([]);
  });

  it('requires reassembly when the camera changes', () => {
    const input = ep012AssemblyInputs()[1]!;
    const diff = diffBlenderPlans(
      buildBlenderAssemblyPlan(assembleShot(input)),
      buildBlenderAssemblyPlan(assembleShot({ ...input, cameraTemplateId: 'TJ_CAM_REVEAL' })),
    );
    expect(diff.requiresPreviewReassembly).toBe(true);
    expect(diff.changedOperations.some((id) => id.includes('CAM'))).toBe(true);
  });

  it('requires reassembly when lighting changes', () => {
    const input = ep012AssemblyInputs()[1]!;
    const diff = diffBlenderPlans(
      buildBlenderAssemblyPlan(assembleShot(input)),
      buildBlenderAssemblyPlan(assembleShot({ ...input, lightingPresetId: 'TJ_GOLDEN_HOUR' })),
    );
    expect(diff.requiresPreviewReassembly).toBe(true);
    expect(diff.changedOperations.some((id) => id.includes('KEY') || id.includes('FILL'))).toBe(true);
  });

  it('requires reassembly when a story prop state changes', () => {
    const manifest = assembleShot(ep012AssemblyInputs()[2]!);
    const diff = diffBlenderPlans(
      buildBlenderAssemblyPlan(manifest, { storyPropStates: { MAP_PROP_001: 'discovered' } }),
      buildBlenderAssemblyPlan(manifest, { storyPropStates: { MAP_PROP_001: 'carried' } }),
    );
    expect(diff.requiresPreviewReassembly).toBe(true);
    expect(diff.changedOperations.some((id) => id.includes('PROP'))).toBe(true);
  });

  it('requires reassembly when the base environment changes', () => {
    const input = ep012AssemblyInputs()[1]!;
    const diff = diffBlenderPlans(
      buildBlenderAssemblyPlan(assembleShot(input)),
      buildBlenderAssemblyPlan(assembleShot({ ...input, environmentVersion: 'bakery-env-v2' })),
    );
    expect(diff.requiresPreviewReassembly).toBe(true);
    expect(diff.changedOperations.some((id) => id.includes('BASE_ENV') || id.includes('ENV_'))).toBe(true);
  });

  it('keeps executionAuthorized and blenderExecuted false', () => {
    const report = dryRunEp012();
    expect(report.plans.every((item) => item.executionAuthorized === false)).toBe(true);
    expect(report.plans.every((item) => item.blenderExecuted === false)).toBe(true);
    expect(report.plans.every((item) => item.authorization.issued === false)).toBe(true);
    expect(report.plans.every((item) => item.executionRequest.dryRun === true)).toBe(true);
    expect(report.safety.runpodContacted).toBe(false);
  });

  it('does not modify the purchased-assets workstream', () => {
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/purchased-assets'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/app/api/purchased-tools'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'apps/web/src/lib/purchased-tools'))).toBe(false);
  });

  it('documents the milestone and keeps Preview copy free of legacy branding', () => {
    const docs = readFileSync(path.join(repoRoot, 'docs/TIVVLEJOY_BLENDER_ASSEMBLY_DRIVER_DRYRUN_V1.md'), 'utf8');
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/BlenderAssemblyDryRun.tsx'), 'utf8');
    expect(docs).toContain('TIVVLEJOY_BLENDER_ASSEMBLY_PLAN_V1');
    expect(docs).toContain('DO NOT EXECUTE WITHOUT A VALID EXECUTION AUTHORIZATION RECEIPT');
    expect(ui).toContain('Blender Assembly Dry Run');
    expect(ui).toContain('BLENDER NOT EXECUTED');
    expect(ui).toContain('EXECUTION AUTHORIZED = FALSE');
    expect(ui).not.toMatch(/DoodleDash/i);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_RIG_INSPECTION_PROTOCOL_SCHEMA,
  EP001_RIG_INSPECTION_STAGES,
  compileEp001RigInspectionProtocol,
} from './tivvlejoy-ep001-rig-inspection-protocol';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_RIG_INSPECTION_PROTOCOL_V1', () => {
  it('compiles deterministically and binds to the exact rig delivery contract', () => {
    const first = compileEp001RigInspectionProtocol();
    const second = compileEp001RigInspectionProtocol();

    expect(first.schemaVersion).toBe(EP001_RIG_INSPECTION_PROTOCOL_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.protocolSha256).toBe(second.protocolSha256);
    expect(first.protocolSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.deliveryContractSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('maps all 18 inherited rig-arrival checks exactly once across five inspection stages', () => {
    const protocol = compileEp001RigInspectionProtocol();
    expect(protocol.checks).toHaveLength(18);
    expect(protocol.stages.map((stage) => stage.stage)).toEqual(EP001_RIG_INSPECTION_STAGES);
    expect(protocol.stages.map((stage) => stage.checks.length)).toEqual([4, 2, 10, 1, 1]);
    expect(protocol.stages.flatMap((stage) => stage.checks)).toEqual(
      protocol.checks.map((check) => check.checkId),
    );
    expect(new Set(protocol.checks.map((check) => check.checkId)).size).toBe(18);
  });

  it('applies Pip-only and Goat-only deformation checks without weakening shared gates', () => {
    const protocol = compileEp001RigInspectionProtocol();
    const pip = protocol.characters.find((character) => character.characterId === 'PIP')!;
    const goat = protocol.characters.find((character) => character.characterId === 'GOAT')!;

    expect(pip.requiredControlCount).toBe(25);
    expect(pip.requiredTestPoseCount).toBe(13);
    expect(pip.inspectionCheckCount).toBe(17);
    expect(pip.checkIds).toContain('RIG_CHECK_11');
    expect(pip.checkIds).toContain('RIG_CHECK_13');
    expect(pip.checkIds).not.toContain('RIG_CHECK_15');

    expect(goat.requiredControlCount).toBe(18);
    expect(goat.requiredTestPoseCount).toBe(11);
    expect(goat.inspectionCheckCount).toBe(16);
    expect(goat.checkIds).not.toContain('RIG_CHECK_11');
    expect(goat.checkIds).not.toContain('RIG_CHECK_13');
    expect(goat.checkIds).toContain('RIG_CHECK_15');
  });

  it('forces the final human approval gate to remain manual and fail-closed', () => {
    const protocol = compileEp001RigInspectionProtocol();
    const humanStage = protocol.stages.at(-1)!;
    const humanCheck = protocol.checks.find((check) => check.checkId === 'RIG_CHECK_18')!;

    expect(humanStage.stage).toBe('HUMAN_APPROVAL');
    expect(humanStage.mayAutoAdvance).toBe(false);
    expect(humanCheck.evidenceKind).toBe('HUMAN_VISUAL_APPROVAL_RECEIPT');
    expect(humanCheck.complete).toBe(false);
    expect(humanCheck.autoApproval).toBe(false);
    expect(protocol.authority.autoApprovalAllowed).toBe(false);
    expect(protocol.authority.animationExecutionAllowed).toBe(false);
    expect(protocol.authority.paidComputeAllowed).toBe(false);
  });

  it('keeps the inspection Studio route read-only before real rig arrival', () => {
    const page = readRepo('apps/web/src/app/episode-one/rig-inspection/page.tsx');
    expect(page).toContain('Rig inspection protocol');
    expect(page).toContain('compileEp001RigInspectionProtocol()');
    expect(page).toContain('18 blocking checks');
    expect(page).toContain('Human approval');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_ANIMATION_RELEASE_GATE_SCHEMA,
  compileEp001AnimationReleaseGate,
} from './tivvlejoy-ep001-animation-release-gate';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_ANIMATION_RELEASE_GATE_V1', () => {
  it('compiles deterministically and binds the rig review and blocking artifacts', () => {
    const first = compileEp001AnimationReleaseGate();
    const second = compileEp001AnimationReleaseGate();
    expect(first.schemaVersion).toBe(EP001_ANIMATION_RELEASE_GATE_SCHEMA);
    expect(first.releaseGateSha256).toBe(second.releaseGateSha256);
    expect(first.releaseGateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rigReviewWorksheetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.animationBlockingBoardSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the locked EP001 format and both character review depths', () => {
    const gate = compileEp001AnimationReleaseGate();
    expect(gate.format.totalFrames).toBe(1800);
    expect(gate.format.fps).toBe(30);
    expect(gate.rigRequirements).toHaveLength(2);
    expect(gate.rigRequirements.find((item) => item.characterId === 'PIP')).toMatchObject({ requiredCheckCount: 17, requiredPoseCount: 13 });
    expect(gate.rigRequirements.find((item) => item.characterId === 'GOAT')).toMatchObject({ requiredCheckCount: 16, requiredPoseCount: 11 });
  });

  it('defines eight release gates and keeps execution fail-closed', () => {
    const gate = compileEp001AnimationReleaseGate();
    expect(gate.gates).toHaveLength(8);
    expect(gate.gates.filter((item) => item.state === 'BLOCKED')).toHaveLength(7);
    expect(gate.gates.find((item) => item.gateId === 'ANIM_RELEASE_07')?.state).toBe('PLAN_READY');
    expect(gate.authority.exactRigsAdmitted).toBe(false);
    expect(gate.authority.blockingExecutionAllowed).toBe(false);
    expect(gate.authority.animationBakeAllowed).toBe(false);
    expect(gate.authority.playblastExecutionAllowed).toBe(false);
    expect(gate.authority.paidComputeAllowed).toBe(false);
    expect(gate.authority.productionWritesAllowed).toBe(false);
    expect(gate.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/animation-release/page.tsx');
    expect(page).toContain('Animation release gate');
    expect(page).toContain('compileEp001AnimationReleaseGate()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

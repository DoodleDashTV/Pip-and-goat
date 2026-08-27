import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_FINAL_RENDER_RELEASE_GATE_SCHEMA,
  compileEp001FinalRenderReleaseGate,
} from './tivvlejoy-ep001-final-render-release-gate';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_FINAL_RENDER_RELEASE_GATE_V1', () => {
  it('compiles deterministically and binds animation release plus evidence admission', () => {
    const first = compileEp001FinalRenderReleaseGate();
    const second = compileEp001FinalRenderReleaseGate();
    expect(first.schemaVersion).toBe(EP001_FINAL_RENDER_RELEASE_GATE_SCHEMA);
    expect(first.finalRenderGateSha256).toBe(second.finalRenderGateSha256);
    expect(first.finalRenderGateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.animationReleaseGateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.evidenceAdmissionBoardSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('locks the final format and exact launch requirements', () => {
    const gate = compileEp001FinalRenderReleaseGate();
    expect(gate.gates).toHaveLength(9);
    expect(gate.requiredEvidenceClasses).toHaveLength(7);
    expect(gate.renderContract.targetResolution).toBe('1080x1920');
    expect(gate.renderContract.aspectRatio).toBe('9:16');
    expect(gate.renderContract.fps).toBe(30);
    expect(gate.renderContract.totalFrames).toBe(1800);
    expect(gate.renderContract.exactWorkerImageDigestRequired).toBe(true);
    expect(gate.renderContract.costCeilingRequired).toBe(true);
    expect(gate.renderContract.authorizationExpiryRequired).toBe(true);
  });

  it('keeps paid execution, production, and publishing fail-closed', () => {
    const gate = compileEp001FinalRenderReleaseGate();
    expect(gate.gates.every((item) => item.state === 'BLOCKED')).toBe(true);
    expect(gate.authority.finalRenderLaunchAllowed).toBe(false);
    expect(gate.authority.paidFinalRenderAuthorizationPresent).toBe(false);
    expect(gate.authority.productionWritesAllowed).toBe(false);
    expect(gate.authority.publishingAllowed).toBe(false);
    expect(gate.authority.autoApprovalAllowed).toBe(false);
    expect(gate.safety.renderLaunched).toBe(false);
    expect(gate.safety.paidComputeStarted).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/final-render-release/page.tsx');
    expect(page).toContain('Final render release gate');
    expect(page).toContain('compileEp001FinalRenderReleaseGate()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

import { describe, expect, it } from 'vitest';
import { compileEp001AnimationWorkerPayload } from './tivvlejoy-ep001-animation-worker-payload';
import { compileEp001DialogueAnimationManifest } from './tivvlejoy-ep001-dialogue-animation-manifest';

const H = (char: string) => char.repeat(64);
function validInput() {
  const lines = compileEp001DialogueAnimationManifest().lines;
  return {
    pip: { characterId: 'CHAR_PIP_001' as const, packageSha256: H('a'), canonicalBlendSha256: H('b'), adapterSha256: H('c'), humanApprovalReceiptSha256: H('d') },
    goat: { characterId: 'CHAR_GOAT_001' as const, packageSha256: H('e'), canonicalBlendSha256: H('f'), adapterSha256: H('1'), humanApprovalReceiptSha256: H('2') },
    sceneryPackageSha256: H('3'),
    sceneryAdmissionReceiptSha256: H('4'),
    voiceBindings: lines.map((line, index) => ({
      lineId: line.lineId,
      audioSourceSha256: String((index + 5) % 10).repeat(64),
      voiceReceiptSha256: 'a'.repeat(64),
      lineTimingReceiptSha256: 'b'.repeat(64),
      wordTimingReceiptSha256: 'c'.repeat(64),
    })),
  };
}

describe('EP001 animation worker payload', () => {
  it('compiles exact shot jobs while keeping launch and spend disabled', () => {
    const plan = compileEp001AnimationWorkerPayload(validInput());
    expect(plan.structurallyReady).toBe(true);
    expect(plan.shotJobs.length).toBeGreaterThan(0);
    expect(plan.shotJobs.every((job) => job.execution.maxGpuSpendUsd === 0)).toBe(true);
    expect(plan.shotJobs.every((job) => !job.execution.paidExecutionAuthorized && !job.execution.workerLaunchAllowed)).toBe(true);
    expect(plan.metrics.workerLaunchCount).toBe(0);
    expect(plan.authority.executionAuthorized).toBe(false);
    expect(plan.animationWorkerPlanSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed when even one voice binding is absent', () => {
    const input = validInput();
    input.voiceBindings.pop();
    const plan = compileEp001AnimationWorkerPayload(input);
    expect(plan.structurallyReady).toBe(false);
    expect(plan.errors).toContain('EP001_ANIM_VOICE_BINDING_SET_MISMATCH');
    expect(plan.authority.workerLaunchAllowed).toBe(false);
  });

  it('requires exact approved character and scenery identities', () => {
    const input = validInput();
    input.pip.packageSha256 = 'bad';
    const plan = compileEp001AnimationWorkerPayload(input);
    expect(plan.structurallyReady).toBe(false);
    expect(plan.errors).toContain('EP001_ANIM_HASH_INVALID:pipPackageSha256');
    expect(plan.metrics.paidRequestCount).toBe(0);
  });
});

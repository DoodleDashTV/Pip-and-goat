import { describe, expect, it } from 'vitest';
import { compileEp001ShotAnimationEvidence } from './tivvlejoy-ep001-shot-animation-evidence';

describe('EP001 shot animation evidence', () => {
  it('requires one playblast and evidence manifest per shot without claiming receipt', () => {
    const plan = compileEp001ShotAnimationEvidence();
    expect(plan.metrics.playblastCountRequired).toBe(plan.metrics.shotCount);
    expect(plan.metrics.evidenceManifestCountRequired).toBe(plan.metrics.shotCount);
    expect(plan.metrics.receivedEvidenceManifestCount).toBe(0);
    expect(plan.metrics.humanApprovedShotCount).toBe(0);
    expect(plan.authority.animationRendered).toBe(false);
    expect(plan.shotAnimationEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes map switch continuity frames around every explicit transition', () => {
    const plan = compileEp001ShotAnimationEvidence();
    const withMap = plan.shots.filter((shot) => shot.mapTransitionIds.length > 0);
    expect(withMap.length).toBeGreaterThan(0);
    expect(withMap.every((shot) => shot.outputs.stills.length >= 3)).toBe(true);
  });

  it('requires source-rig immutability and human quality review for every shot', () => {
    const plan = compileEp001ShotAnimationEvidence();
    expect(plan.shots.every((shot) => shot.machineChecks.some((check) => check.includes('source rig library remains unmodified')))).toBe(true);
    expect(plan.shots.every((shot) => shot.humanChecks.some((check) => check.includes('likeness')))).toBe(true);
    expect(plan.shots.every((shot) => !shot.approved)).toBe(true);
  });
});

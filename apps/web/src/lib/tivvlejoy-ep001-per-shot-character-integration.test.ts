import { describe, expect, it } from 'vitest';
import { compileEp001PerShotCharacterIntegration } from './tivvlejoy-ep001-per-shot-character-integration';

describe('EP001 per-shot character integration', () => {
  it('covers the full 1800-frame episode without executing animation', () => {
    const plan = compileEp001PerShotCharacterIntegration();
    expect(plan.totalFrames).toBe(1800);
    expect(plan.metrics.shotCount).toBeGreaterThan(0);
    expect(plan.metrics.dialogueLineCount).toBe(8);
    expect(plan.metrics.executedShotCount).toBe(0);
    expect(plan.metrics.approvedShotCount).toBe(0);
    expect(plan.authority.blenderLaunched).toBe(false);
    expect(plan.authority.animationExecutionAllowed).toBe(false);
    expect(plan.perShotCharacterIntegrationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds dialogue controls only to the speaking character while preserving unknown picture presence', () => {
    const plan = compileEp001PerShotCharacterIntegration();
    const pipDialoguePlan = plan.shots.flatMap((shot) => shot.characterPlans).find((item) => item.dialogueLineIds.includes('EP001_DL_01'));
    expect(pipDialoguePlan?.characterId).toBe('CHAR_PIP_001');
    expect(pipDialoguePlan?.requiredCanonicalControls).toContain('BEAK_LOWER');
    expect(pipDialoguePlan?.requiredCanonicalControls).toContain('EYE_AIM');
    expect(plan.shots.every((shot) => typeof shot.scenePresenceRule === 'string')).toBe(true);
  });

  it('derives locomotion and prop control requirements from canonical performance markers', () => {
    const plan = compileEp001PerShotCharacterIntegration();
    const pipWithPickup = plan.shots.flatMap((shot) => shot.characterPlans).find((item) => item.performanceMarkers.some((marker) => marker.semanticType === 'OBJECT_PICKUP'));
    expect(pipWithPickup?.requiredCanonicalControls).toContain('PROP_ATTACH');
    expect(pipWithPickup?.requiredCanonicalControls).toContain('WING_L');
    const goatWithHoof = plan.shots.flatMap((shot) => shot.characterPlans).find((item) => item.performanceMarkers.some((marker) => marker.semanticType === 'HOOF_SOFT'));
    expect(goatWithHoof?.requiredCanonicalControls).toContain('HOOF_L');
    expect(goatWithHoof?.requiredCanonicalControls).toContain('LEG_IK_L');
  });

  it('predeclares cache invalidation bindings for every shot', () => {
    const plan = compileEp001PerShotCharacterIntegration();
    expect(plan.shots.every((shot) => shot.cacheBindingRequired.includes('realVoiceReceiptHashes'))).toBe(true);
    expect(plan.shots.every((shot) => shot.cacheBindingRequired.includes('sceneryPackageSha256'))).toBe(true);
  });
});

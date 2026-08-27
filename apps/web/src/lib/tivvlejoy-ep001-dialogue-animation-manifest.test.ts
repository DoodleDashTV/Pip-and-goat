import { describe, expect, it } from 'vitest';
import { compileEp001DialogueAnimationManifest } from './tivvlejoy-ep001-dialogue-animation-manifest';

describe('EP001 dialogue animation manifest', () => {
  it('locks all eight canonical lines without binding real audio', () => {
    const manifest = compileEp001DialogueAnimationManifest();
    expect(manifest.metrics.lineCount).toBe(8);
    expect(manifest.metrics.realAudioBoundCount).toBe(0);
    expect(manifest.metrics.animatedCount).toBe(0);
    expect(manifest.authority.dialogueAnimationExecutionAllowed).toBe(false);
    expect(manifest.dialogueAnimationManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses Pip beak/wing acting controls and Goat jaw/mouth controls', () => {
    const manifest = compileEp001DialogueAnimationManifest();
    const pip = manifest.lines.find((line) => line.speaker === 'PIP')!;
    const goat = manifest.lines.find((line) => line.speaker === 'GOAT')!;
    expect(pip.faceControls).toContain('BEAK_LOWER');
    expect(pip.gestureControls).toContain('WING_L');
    expect(goat.faceControls).toContain('JAW');
    expect(goat.faceControls).toContain('MOUTH');
    expect(goat.applicationLanes.wingGestureLane).toBe('NOT_APPLICABLE');
  });

  it('forbids text rewrite, duplication and time stretching on every line', () => {
    const manifest = compileEp001DialogueAnimationManifest();
    expect(manifest.lines.every((line) => !line.timingRequirements.timeStretchAllowed)).toBe(true);
    expect(manifest.lines.every((line) => !line.timingRequirements.rewriteAllowed)).toBe(true);
    expect(manifest.lines.every((line) => !line.timingRequirements.duplicateLineAllowed)).toBe(true);
  });
});

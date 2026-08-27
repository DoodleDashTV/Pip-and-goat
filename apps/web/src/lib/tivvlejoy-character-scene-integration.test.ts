import { describe, expect, it } from 'vitest';
import { compileCharacterSceneIntegration, compileEp001CharacterSceneIntegration } from './tivvlejoy-character-scene-integration';

describe('character scene integration contract', () => {
  it('locks Pip and Goat to non-destructive library-linked scene integration', () => {
    const pip = compileCharacterSceneIntegration('CHAR_PIP_001');
    const goat = compileCharacterSceneIntegration('CHAR_GOAT_001');
    expect(pip.sourcePolicy.sourceBlendMountedReadOnly).toBe(true);
    expect(goat.sourcePolicy.createSceneLibraryOverrideForAnimation).toBe(true);
    expect(pip.requiredCanonicalControls).toHaveLength(25);
    expect(goat.requiredCanonicalControls).toHaveLength(18);
    expect(pip.authority.sceneInstantiationPerformed).toBe(false);
    expect(goat.authority.animationWritten).toBe(false);
  });

  it('locks pair scale, eyeline and prop-handoff checks', () => {
    const pair = compileEp001CharacterSceneIntegration();
    expect(pair.pairPolicy.goatToPipRelativeScale).toBe(1.5);
    expect(pair.pairPolicy.eyeLineCompatibilityCheckRequired).toBe(true);
    expect(pair.pairPolicy.propHandoffContinuityCheckRequired).toBe(true);
    expect(pair.ep001CharacterSceneIntegrationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects stale caches by policy whenever rig or adapter identity changes', () => {
    const pip = compileCharacterSceneIntegration('CHAR_PIP_001');
    expect(pip.cachePolicy.staleCacheRejectedOnRigOrAdapterHashChange).toBe(true);
    expect(pip.sourcePolicy.noAnimationWrittenIntoSourceLibrary).toBe(true);
  });
});

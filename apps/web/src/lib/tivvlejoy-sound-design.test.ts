import { describe, expect, it } from 'vitest';
import {
  AMBIENCE_LAYERS,
  MUSIC_ROLES,
  SFX_TYPES,
  ambienceForLocation,
  ambienceLayers,
  duckStates,
  evaluateAudioMixPlan,
  musicRoleForBeat,
  musicRoles,
  planDucking,
  planMusicCue,
  planSfxEvent,
  sfxFromContacts,
  sfxTypes,
} from './tivvlejoy-nightshift-production';

describe('sound design and music cues', () => {
  for (const type of SFX_TYPES) {
    it(`plans ${type} as metadata only`, () => {
      const event = planSfxEvent({
        sfxEventId: type,
        semanticType: type,
        frame: 12,
        duration: 6,
        intensity: 0.4,
        spatialRole: 'CENTER',
        characterId: null,
        propId: null,
        locationId: 'village',
        priority: 'BACKGROUND',
      });
      expect(event.audioBinaryIncluded).toBe(false);
      expect(event.sfxDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('derives footsteps and hooves from contacts', () => {
    const events = sfxFromContacts({ shotId: 'SH01', frame: 10, locationId: 'forest_path', pipFoot: true, goatHoof: true, prop: 'MAP_UNFOLD' });
    expect(events.map((item) => item.semanticType)).toEqual(expect.arrayContaining(['FOOTSTEP_DIRT', 'HOOF_SOFT', 'MAP_UNFOLD']));
  });

  it('maps locations to ambience layers', () => {
    expect(ambienceForLocation('tavern', 'CLEAR', 'MORNING_WARM')).toBe('TAVERN_INTERIOR');
    expect(ambienceForLocation('forest', 'RAIN', 'MORNING_WARM')).toBe('FOREST_RAIN');
    expect(ambienceForLocation('village', 'CLEAR', 'NIGHT_COZY')).toBe('VILLAGE_NIGHT');
    expect(ambienceLayers()).toEqual([...AMBIENCE_LAYERS]);
  });

  it('plans music roles without copyrighted audio', () => {
    const cue = planMusicCue({ cueId: 'C1', role: 'OPENING_HOOK', startFrame: 0, endFrame: 90, storyBeatRefs: ['B1'], dialoguePresent: true });
    expect(cue.copyrightedAudioIncluded).toBe(false);
    expect(cue.duckUnderDialogue).toBe('MEDIUM_DUCK');
    expect(musicRoleForBeat('BUTTON')).toBe('ENDING_BUTTON');
    expect(musicRoles()).toEqual([...MUSIC_ROLES]);
  });

  it('keeps dialogue priority in ducking and mix QC', () => {
    expect(planDucking({ dialogue: true })).toBe('MEDIUM_DUCK');
    expect(planDucking({ dialogue: true, sfxPriority: 'STORY' })).toBe('STRONG_DUCK');
    const crowded = evaluateAudioMixPlan({
      dialogueClips: 4,
      duplicateDialogue: false,
      musicDuringDialogueUnDuck: true,
      sfxPerSecond: 9,
      ambienceGaps: 0,
      sfxDesync: false,
      pictureEnd: 100,
      audioEnd: 100,
      accidentalSilence: false,
    });
    expect(crowded.findings.find((item) => item.code === 'SFX_NOT_OVERDENSE')?.passed).toBe(false);
    expect(crowded.findings.find((item) => item.code === 'MUSIC_UNDER_DIALOGUE')?.passed).toBe(false);
    expect(crowded.measuredLoudness).toBe(false);
    expect(sfxTypes()).toHaveLength(27);
    expect(duckStates()).toHaveLength(4);
  });
});

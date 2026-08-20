import { describe, expect, it } from 'vitest';
import {
  BEAT_TYPES,
  SHOT_INTENTS,
  allShotIntents,
  beatTypes,
  buildEpisodeCreativeIntent,
  buildStoryBeats,
  cameraTemplateForIntent,
  intentForBeat,
  paceForEpisode,
  shotLanguage,
} from './tivvlejoy-nightshift-production';

describe('showrunner and story-beat director', () => {
  it('builds deterministic creative intent hashes', () => {
    const a = buildEpisodeCreativeIntent({ episodeId: 'EP001', episodeNumber: 1, primaryLocation: 'bakery' });
    const b = buildEpisodeCreativeIntent({ episodeId: 'EP001', episodeNumber: 1, primaryLocation: 'bakery' });
    expect(a.episodeCreativeIntentSha256).toBe(b.episodeCreativeIntentSha256);
    expect(a.synthetic).toBe(true);
  });

  it('does not change the semantic hash when only display order of identical fields is rebuilt', () => {
    const first = buildEpisodeCreativeIntent({ episodeNumber: 4, episodeId: 'EP004' });
    const second = buildEpisodeCreativeIntent({ episodeId: 'EP004', episodeNumber: 4 });
    expect(first.episodeCreativeIntentSha256).toBe(second.episodeCreativeIntentSha256);
  });

  it('varies pace across the 60-episode horizon', () => {
    const paces = Array.from({ length: 7 }, (_, index) => paceForEpisode(index + 1));
    expect(new Set(paces).size).toBe(7);
  });

  it('keeps call-forward and callback from inventing a final script', () => {
    const intent = buildEpisodeCreativeIntent({ episodeId: 'EP012', episodeNumber: 12 });
    expect(intent.episodeGoal).toMatch(/map|scarf|bells|delivery|river/i);
    expect(intent.callForward).toContain('EP013');
    expect(intent.callback).toContain('EP011');
  });

  for (const beatType of BEAT_TYPES) {
    it(`assigns a ${beatType} beat with a hashed dependency`, () => {
      const intent = buildEpisodeCreativeIntent({ episodeId: 'EP002', episodeNumber: 2 });
      const beats = buildStoryBeats({ intent, shotCount: 13, locations: ['bakery', 'forest'] });
      expect(beats.some((beat) => beat.beatType === beatType)).toBe(true);
      expect(beats[0]?.beatDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('does not hash director notes into beat identity', () => {
    const intent = buildEpisodeCreativeIntent({ episodeId: 'EP003', episodeNumber: 3 });
    const [beat] = buildStoryBeats({ intent, shotCount: 4 });
    expect(beat?.directorNotes).toBeTruthy();
    expect(beat?.beatDependencySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('covers every declared beat type in the vocabulary export', () => {
    expect(beatTypes()).toEqual([...BEAT_TYPES]);
  });
});

describe('directorial shot language', () => {
  for (const intent of SHOT_INTENTS) {
    it(`describes ${intent} without exact camera transforms`, () => {
      const language = shotLanguage(intent);
      expect(language.storyPurpose.length).toBeGreaterThan(8);
      expect(language.recommendedDurationRange.min).toBeLessThan(language.recommendedDurationRange.max);
      expect(language.verticalVideoNotes.length).toBeGreaterThan(8);
      expect(cameraTemplateForIntent(intent).pipGoatPixelMeasurements).toBe('UNRESOLVED');
    });
  }

  it('maps hook beats to establishing language', () => {
    const intent = buildEpisodeCreativeIntent({ episodeId: 'EP005', episodeNumber: 5 });
    const beats = buildStoryBeats({ intent, shotCount: 12 });
    expect(intentForBeat(beats[0]!, 0, 12)).toBe('ESTABLISHING');
    expect(intentForBeat(beats[beats.length - 1]!, 11, 12)).toBe('REACTION');
  });

  it('exports the full shot-intent vocabulary', () => {
    expect(allShotIntents()).toHaveLength(21);
  });
});

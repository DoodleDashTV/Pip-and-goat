import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_DEFECTS,
  SHOT_INTENTS,
  cameraMotions,
  compositionChecks,
  defaultSubjectsFor,
  evaluateShotCompositionQc,
  evaluateVerticalComposition,
  planCameraMotion,
  planCinematography,
  shotLanguage,
  DEFAULT_VERTICAL_PROFILE,
} from './tivvlejoy-nightshift-production';
import { buildEpisodeCreativeIntent, buildStoryBeats } from './tivvlejoy-nightshift-production';

describe('cinematography and vertical composition', () => {
  for (const intent of SHOT_INTENTS) {
    it(`plans ${intent} with unresolved exact transforms`, () => {
      const plan = planCinematography({ shotId: `SH_${intent}`, intent, speaker: 'PIP' });
      expect(plan.exactCameraTransforms).toBe('UNRESOLVED');
      expect(plan.verticalSafeArea.top).toBeGreaterThan(0);
      expect(plan.cinematographySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(plan.cameraTemplateId).toBe(shotLanguage(intent).cameraTemplateId);
    });
  }

  it('keeps hashes stable when input field order changes', () => {
    const a = planCinematography({ shotId: 'SH01', intent: 'CLOSE_UP', speaker: 'GOAT', travel: 'NONE' });
    const b = planCinematography({ travel: 'NONE', speaker: 'GOAT', intent: 'CLOSE_UP', shotId: 'SH01' });
    expect(a.cinematographySha256).toBe(b.cinematographySha256);
  });

  it('uses the 1080x1920 profile instead of platform magic numbers in core checks', () => {
    expect(DEFAULT_VERTICAL_PROFILE.width).toBe(1080);
    expect(DEFAULT_VERTICAL_PROFILE.height).toBe(1920);
    expect(DEFAULT_VERTICAL_PROFILE.aspect).toBe('9:16');
    expect(compositionChecks()).toHaveLength(8);
  });

  it('flags faces that leave the safe band', () => {
    const plan = planCinematography({ shotId: 'SH_FACE', intent: 'CLOSE_UP', speaker: 'PIP' });
    const composition = evaluateVerticalComposition({
      subjects: [{ id: 'pip', kind: 'FACE', important: true, box: { x: 0.2, y: 0.02, w: 0.2, h: 0.1 } }],
    });
    const qc = evaluateShotCompositionQc({ plan, composition, subjects: [{ id: 'pip', kind: 'FACE', important: true, box: { x: 0.2, y: 0.02, w: 0.2, h: 0.1 } }] });
    expect(qc.defects).toContain('FACE_OUT_OF_SAFE_REGION');
    expect(qc.passed).toBe(false);
  });

  it('flags caption collisions against the configured caption band', () => {
    const plan = planCinematography({ shotId: 'SH_CAP', intent: 'PROP_INSERT', prop: 'map' });
    const subjects = [{ id: 'map', kind: 'PROP' as const, important: true, box: { x: 0.2, y: 0.86, w: 0.5, h: 0.12 } }];
    const composition = evaluateVerticalComposition({ subjects, captionsEnabled: true });
    const qc = evaluateShotCompositionQc({ plan, composition, subjects });
    expect(qc.defects).toEqual(expect.arrayContaining(['CAPTION_COLLISION', 'PROP_NOT_READABLE']));
  });

  it('requires footroom only when locomotion matters', () => {
    const walking = evaluateVerticalComposition({
      subjects: [{ id: 'feet', kind: 'FEET', important: true, box: { x: 0.2, y: 0.95, w: 0.3, h: 0.04 } }],
      locomotionImportant: true,
    });
    expect(walking.checks.FOOTROOM_SAFE).toBe(false);
    const still = evaluateVerticalComposition({
      subjects: [{ id: 'feet', kind: 'FEET', important: true, box: { x: 0.2, y: 0.95, w: 0.3, h: 0.04 } }],
      locomotionImportant: false,
    });
    expect(still.checks.FOOTROOM_SAFE).toBe(true);
  });

  it('covers every composition defect code in the vocabulary', () => {
    expect(COMPOSITION_DEFECTS).toHaveLength(12);
  });

  it('builds default subjects inside the face band', () => {
    const plan = planCinematography({ shotId: 'SH_DEF', intent: 'MEDIUM_TWO_SHOT' });
    const subjects = defaultSubjectsFor(plan);
    const composition = evaluateVerticalComposition({ subjects });
    expect(composition.checks.FACE_SAFE).toBe(true);
  });

  it('refuses random motion and applies fatigue after a moving streak', () => {
    const intent = buildEpisodeCreativeIntent({ episodeId: 'EP006', episodeNumber: 6 });
    const beats = buildStoryBeats({ intent, shotCount: 4 });
    const moving = planCameraMotion({ intent: 'FOLLOW', beat: beats[6] ?? beats[0]!, movingStreak: 3 });
    expect(moving.motion).toBe('STATIC');
    expect(moving.fatigueRisk).toBe('HIGH');
    expect(cameraMotions()).toHaveLength(10);
  });
});

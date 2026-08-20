import { describe, expect, it } from 'vitest';
import {
  buildBlinkPlan,
  buildDialogueTiming,
  buildGazePlan,
  buildVisemePlan,
  dialogueTimingFromVoiceReceipt,
  missingVoiceBlocksExactMouthTiming,
  visemeFromVoiceReceipt,
} from './tivvlejoy-character-animation';

describe('dialogue timing viseme blink and gaze', () => {
  it('returns TIMING_UNAVAILABLE without a receipt', () => {
    const timing = buildDialogueTiming({ lineId: 'L1', characterId: 'PIP' });
    expect(timing.fallbackTimingSource).toBe('TIMING_UNAVAILABLE');
    expect(timing.speechStart).toBeNull();
  });

  it('uses line-level timing when only duration and hashes exist', () => {
    const timing = buildDialogueTiming({
      lineId: 'L1',
      characterId: 'PIP',
      audioReceiptRef: 'VR1',
      audioSha256: 'aa'.repeat(32),
      durationMs: 2000,
    });
    expect(timing.fallbackTimingSource).toBe('TIMING_LINE_LEVEL');
    expect(timing.speechStart).toBe(80);
    expect(timing.speechEnd).toBe(1940);
  });

  it('uses word-level timing when words exist', () => {
    const timing = buildDialogueTiming({
      lineId: 'L1',
      characterId: 'GOAT',
      wordTimings: [{ word: 'hey', startMs: 100, endMs: 280 }],
    });
    expect(timing.fallbackTimingSource).toBe('TIMING_WORD_LEVEL');
  });

  it('uses exact timing when phonemes exist', () => {
    const timing = buildDialogueTiming({
      lineId: 'L1',
      characterId: 'PIP',
      phonemeTimings: [{ phoneme: 'AH', startMs: 90, endMs: 160 }],
    });
    expect(timing.fallbackTimingSource).toBe('TIMING_EXACT');
  });

  it('does not pretend lip sync from line-level timing', () => {
    const viseme = buildVisemePlan(
      buildDialogueTiming({
        lineId: 'L1',
        characterId: 'PIP',
        audioReceiptRef: 'VR1',
        audioSha256: 'aa'.repeat(32),
        durationMs: 1800,
      }),
    );
    expect(viseme.confidence).toBe('LOW');
    expect(viseme.pretendsAccurateLipSync).toBe(false);
    expect(viseme.adapter).toBe('PIP_BEAK');
  });

  it('maps phonemes onto generic buckets for Goat jaw', () => {
    const viseme = buildVisemePlan(
      buildDialogueTiming({
        lineId: 'L1',
        characterId: 'GOAT',
        phonemeTimings: [
          { phoneme: 'M', startMs: 0, endMs: 40 },
          { phoneme: 'O', startMs: 40, endMs: 90 },
          { phoneme: 'AH', startMs: 90, endMs: 140 },
        ],
      }),
    );
    expect(viseme.adapter).toBe('GOAT_JAW');
    expect(viseme.confidence).toBe('HIGH');
    expect(viseme.keys.map((key) => key.bucket)).toEqual(['CLOSED', 'ROUND', 'WIDE_OPEN']);
  });

  it('uses medium-confidence word rhythm when words exist', () => {
    const viseme = buildVisemePlan(
      buildDialogueTiming({
        lineId: 'L1',
        characterId: 'PIP',
        wordTimings: [
          { word: 'look', startMs: 0, endMs: 200 },
          { word: 'there', startMs: 220, endMs: 400 },
        ],
      }),
    );
    expect(viseme.confidence).toBe('MEDIUM');
    expect(viseme.keys.some((key) => key.bucket === 'CLOSED')).toBe(true);
  });

  it('connects a voice receipt to timing without changing voice IDs', () => {
    const timing = dialogueTimingFromVoiceReceipt(
      { dialogueRef: 'DL1', receiptRef: 'VR1', receiptSha256: 'bb'.repeat(32), characterId: 'PIP' },
      'PIP',
      'DL1',
      { durationMs: 1500 },
    );
    expect(timing.audioReceiptRef).toBe('VR1');
    expect(timing.fallbackTimingSource).toBe('TIMING_LINE_LEVEL');
    expect(JSON.stringify(timing)).not.toMatch(/93w5H37WdqeS6HoyL5cV|SbxjwBKw2PefbSupcoXV/);
  });

  it('blocks exact mouth timing when the receipt is missing', () => {
    const timing = dialogueTimingFromVoiceReceipt(null, 'GOAT', 'DL2');
    expect(missingVoiceBlocksExactMouthTiming(timing)).toBe(true);
    expect(visemeFromVoiceReceipt(null, 'GOAT', 'DL2').confidence).toBe('LOW');
  });

  it('plans blinks deterministically from the same seed', () => {
    const input = {
      shotId: 'S1',
      characterId: 'PIP' as const,
      durationMs: 4000,
      emotion: 'curious',
      speaking: true,
      attentionShifts: [1200],
      seed: 9,
    };
    expect(buildBlinkPlan(input).blinkPlanSha256).toBe(buildBlinkPlan(input).blinkPlanSha256);
  });

  it('does not use the same blink times for different seeds', () => {
    const base = { shotId: 'S1', characterId: 'PIP' as const, durationMs: 5000, emotion: 'happy', speaking: false, attentionShifts: [] as number[] };
    expect(buildBlinkPlan({ ...base, seed: 1 }).events.map((item) => item.atMs)).not.toEqual(
      buildBlinkPlan({ ...base, seed: 2 }).events.map((item) => item.atMs),
    );
  });

  it('delays the first blink during surprise', () => {
    const surprise = buildBlinkPlan({
      shotId: 'S1',
      characterId: 'PIP',
      durationMs: 3000,
      emotion: 'surprised',
      speaking: false,
      attentionShifts: [],
      seed: 3,
    });
    expect(surprise.events[0]?.atMs).toBeGreaterThanOrEqual(700);
  });

  it('places a blink near an attention shift', () => {
    const plan = buildBlinkPlan({
      shotId: 'S1',
      characterId: 'GOAT',
      durationMs: 3000,
      emotion: 'thinking',
      speaking: false,
      attentionShifts: [900],
      seed: 4,
    });
    expect(plan.events.some((event) => event.reason === 'attention change')).toBe(true);
  });

  it('holds story-critical gaze on a prop', () => {
    const gaze = buildGazePlan({
      shotId: 'S1',
      characterId: 'PIP',
      speaking: false,
      partnerVisible: true,
      propId: 'STORY_MAP',
      storyCritical: true,
    });
    expect(gaze.primary).toBe('STORY_PROP');
    expect(gaze.holdMs).toBe(900);
    expect(gaze.storyCritical).toBe(true);
  });

  it('looks at the partner while speaking or listening', () => {
    expect(buildGazePlan({ shotId: 'S1', characterId: 'PIP', speaking: true, partnerVisible: true }).primary).toBe('OTHER_CHARACTER');
    expect(buildGazePlan({ shotId: 'S1', characterId: 'GOAT', speaking: false, partnerVisible: true }).primary).toBe('OTHER_CHARACTER');
  });

  it('looks toward the destination while moving', () => {
    expect(buildGazePlan({ shotId: 'S1', characterId: 'PIP', speaking: false, partnerVisible: false, moving: true }).primary).toBe('DESTINATION');
  });

  const emotions = ['curious', 'happy', 'surprised', 'thinking', 'concerned', 'confused'];
  for (const emotion of emotions) {
    it(`builds a blink plan for ${emotion}`, () => {
      const plan = buildBlinkPlan({
        shotId: `S_${emotion}`,
        characterId: 'PIP',
        durationMs: 2800,
        emotion,
        speaking: emotion !== 'surprised',
        attentionShifts: [700],
        seed: emotion.length,
      });
      expect(plan.events.length).toBeGreaterThan(0);
    });
  }

  const phonemes = ['M', 'B', 'P', 'A', 'AH', 'E', 'I', 'O', 'U', 'F', 'S', 'X'];
  for (const phoneme of phonemes) {
    it(`maps phoneme ${phoneme} into a generic viseme bucket`, () => {
      const viseme = buildVisemePlan(
        buildDialogueTiming({
          lineId: phoneme,
          characterId: phoneme === 'O' ? 'GOAT' : 'PIP',
          phonemeTimings: [{ phoneme, startMs: 0, endMs: 40 }],
        }),
      );
      expect(['REST', 'CLOSED', 'SMALL_OPEN', 'MEDIUM_OPEN', 'WIDE_OPEN', 'ROUND', 'EMPHASIS']).toContain(viseme.keys[0]?.bucket);
    });
  }

  it('keeps gaze hashes stable', () => {
    const input = { shotId: 'S1', characterId: 'GOAT' as const, speaking: false, partnerVisible: true };
    expect(buildGazePlan(input).gazePlanSha256).toBe(buildGazePlan(input).gazePlanSha256);
  });

  const gazeCases = [
    { speaking: false, partnerVisible: false, moving: false, expected: 'CAMERA_NEAR' },
    { speaking: false, partnerVisible: false, moving: true, expected: 'DESTINATION' },
    { speaking: true, partnerVisible: false, moving: false, expected: 'CAMERA_NEAR' },
  ] as const;
  for (const gazeCase of gazeCases) {
    it(`selects ${gazeCase.expected} when speaking=${gazeCase.speaking} moving=${gazeCase.moving}`, () => {
      expect(buildGazePlan({ shotId: 'G', characterId: 'PIP', ...gazeCase }).primary).toBe(gazeCase.expected);
    });
  }

  it('does not stare away from a story-critical object just because a partner is visible', () => {
    expect(
      buildGazePlan({
        shotId: 'MAP',
        characterId: 'PIP',
        speaking: true,
        partnerVisible: true,
        propId: 'STORY_MAP',
        storyCritical: true,
      }).primary,
    ).toBe('STORY_PROP');
  });

  it('includes pre-roll and reaction windows on every timing plan', () => {
    const timing = buildDialogueTiming({ lineId: 'L', characterId: 'PIP', audioReceiptRef: 'R', audioSha256: '11'.repeat(32), durationMs: 1000 });
    expect(timing.preRollMs).toBe(80);
    expect(timing.postRollMs).toBe(120);
    expect(timing.reactionLeadInMs).toBe(160);
    expect(timing.reactionTailMs).toBe(220);
  });

  it('keeps unavailable timing from claiming speech bounds', () => {
    const timing = buildDialogueTiming({ lineId: 'L', characterId: 'GOAT' });
    expect(timing.speechEnd).toBeNull();
    expect(timing.audioReceiptRef).toBeNull();
  });

  const seeds = [1, 7, 19, 41, 99];
  for (const seed of seeds) {
    it(`keeps blink planning deterministic for seed ${seed}`, () => {
      const input = {
        shotId: 'SEED',
        characterId: 'GOAT' as const,
        durationMs: 3600,
        emotion: 'warm',
        speaking: true,
        attentionShifts: [500, 1800],
        seed,
      };
      expect(buildBlinkPlan(input).blinkPlanSha256).toBe(buildBlinkPlan(input).blinkPlanSha256);
    });
  }

  it('does not emit a blink after the shot ends', () => {
    const plan = buildBlinkPlan({
      shotId: 'END',
      characterId: 'PIP',
      durationMs: 900,
      emotion: 'curious',
      speaking: false,
      attentionShifts: [2000],
      seed: 8,
    });
    expect(plan.events.every((event) => event.atMs < 900)).toBe(true);
  });

  it('uses a rhythmic six-key viseme plan for line-level timing', () => {
    const viseme = buildVisemePlan(
      buildDialogueTiming({
        lineId: 'RHYTHM',
        characterId: 'PIP',
        audioReceiptRef: 'VR',
        audioSha256: '22'.repeat(32),
        durationMs: 1800,
      }),
    );
    expect(viseme.keys).toHaveLength(6);
    expect(viseme.keys.at(-1)?.bucket).toBe('REST');
  });
});

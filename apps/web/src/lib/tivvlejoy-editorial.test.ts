import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACE_THRESHOLDS,
  PACE_PROFILES,
  TRANSITIONS,
  buildEditorialTimeline,
  chooseTransition,
  durationForShot,
  evaluateEditRhythm,
  paceProfiles,
  transitionTypes,
  buildEpisodeCreativeIntent,
  buildStoryBeats,
} from './tivvlejoy-nightshift-production';

describe('editorial timeline and pacing', () => {
  it('compiles a deterministic timeline', () => {
    const a = buildEditorialTimeline({
      episodeId: 'EP010',
      shots: [
        { shotId: 'A', durationFrames: 90, intent: 'ESTABLISHING', locationId: 'bakery' },
        { shotId: 'B', durationFrames: 120, intent: 'MEDIUM_TWO_SHOT', locationId: 'bakery', dialogueRef: 'DL1' },
      ],
    });
    const b = buildEditorialTimeline({
      episodeId: 'EP010',
      shots: [
        { shotId: 'A', durationFrames: 90, intent: 'ESTABLISHING', locationId: 'bakery' },
        { shotId: 'B', durationFrames: 120, intent: 'MEDIUM_TWO_SHOT', locationId: 'bakery', dialogueRef: 'DL1' },
      ],
    });
    expect(a.timelineSha256).toBe(b.timelineSha256);
    expect(a.totalFrames).toBe(210);
    expect(a.tracks.find((track) => track.kind === 'DIALOGUE')?.clips).toHaveLength(1);
  });

  for (const pace of PACE_PROFILES) {
    it(`applies ${pace} thresholds instead of one global cut rate`, () => {
      expect(DEFAULT_PACE_THRESHOLDS[pace].minCut).toBeGreaterThan(0);
      expect(DEFAULT_PACE_THRESHOLDS[pace].maxHold).toBeGreaterThan(DEFAULT_PACE_THRESHOLDS[pace].minCut);
    });
  }

  it('flags identical 3-second cuts as a rhythm warning', () => {
    const shots = Array.from({ length: 12 }, (_, index) => ({
      shotId: `S${index}`,
      durationFrames: 90,
      intent: 'MEDIUM_TWO_SHOT' as const,
    }));
    const rhythm = evaluateEditRhythm({ pace: 'NORMAL_ADVENTURE', shots });
    expect(rhythm.findings.some((item) => item.code === 'TOO_MANY_LONG_HOLDS' || item.code === 'TOO_MANY_RAPID_CUTS')).toBe(false);
    const rapid = evaluateEditRhythm({
      pace: 'CALM_DISCOVERY',
      shots: shots.map((shot) => ({ ...shot, durationFrames: 12 })),
    });
    expect(rapid.findings.some((item) => item.code === 'TOO_MANY_RAPID_CUTS')).toBe(true);
  });

  it('flags a short reaction, insert, establish, button, and clipped dialogue', () => {
    const rhythm = evaluateEditRhythm({
      pace: 'NORMAL_ADVENTURE',
      shots: [
        { shotId: 'E', durationFrames: 20, intent: 'ESTABLISHING' },
        { shotId: 'R', durationFrames: 10, intent: 'REACTION' },
        { shotId: 'I', durationFrames: 8, intent: 'PROP_INSERT' },
        { shotId: 'D', durationFrames: 20, intent: 'MEDIUM_SINGLE', dialogueFrames: 48 },
        { shotId: 'B', durationFrames: 10, intent: 'REACTION', beatType: 'BUTTON' },
        { shotId: 'A', durationFrames: 40, intent: 'FOLLOW', actionCutMidContact: true },
      ],
    });
    expect(rhythm.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'ESTABLISHING_SHOT_TOO_SHORT',
        'REACTION_CUT_TOO_SHORT',
        'PROP_INSERT_TOO_SHORT',
        'DIALOGUE_CLIPPED',
        'ENDING_BUTTON_TOO_SHORT',
        'ACTION_CUT_MID_CONTACT',
      ]),
    );
  });

  it('chooses transitions for a reason and avoids extra dissolves', () => {
    expect(chooseTransition({ fromIntent: 'REACTION', toIntent: 'CLOSE_UP', locationChanged: false }).type).toBe('REACTION_CUT');
    expect(chooseTransition({ fromIntent: 'FOLLOW', toIntent: 'MEDIUM_TWO_SHOT', locationChanged: false }).type).toBe('ACTION_CUT');
    expect(chooseTransition({ fromIntent: 'MEDIUM_TWO_SHOT', toIntent: 'ESTABLISHING', locationChanged: true }).type).toBe('LOCATION_CUT');
    expect(chooseTransition({ fromIntent: 'PROP_INSERT', toIntent: 'CLOSE_UP', locationChanged: false }).type).toBe('MATCH_CUT');
    expect(chooseTransition({ fromIntent: 'MEDIUM_TWO_SHOT', toIntent: 'LOCATION_TRANSITION', locationChanged: false, fromBeat: 'BUTTON', dissolveBudgetUsed: 1 }).type).toBe('HARD_CUT');
  });

  it('lengthens establishing shots for calm discovery', () => {
    const intent = buildEpisodeCreativeIntent({ episodeId: 'EP011', episodeNumber: 1 });
    const [beat] = buildStoryBeats({ intent, shotCount: 3 });
    const timing = durationForShot({ beat: beat!, intent: 'ESTABLISHING', pace: 'CALM_DISCOVERY' });
    expect(timing.durationFrames).toBeGreaterThanOrEqual(90);
  });

  it('exports pace and transition vocabularies', () => {
    expect(paceProfiles()).toEqual([...PACE_PROFILES]);
    expect(transitionTypes()).toEqual([...TRANSITIONS]);
  });

  for (const [fromIntent, toIntent] of [
    ['ESTABLISHING', 'MEDIUM_TWO_SHOT'],
    ['CLOSE_UP', 'REACTION'],
    ['FOLLOW', 'LOCATION_TRANSITION'],
    ['PROP_INSERT', 'REACTION'],
    ['STATIC_COMEDY', 'MEDIUM_SINGLE'],
    ['WIDE_TWO_SHOT', 'PUSH_IN'],
    ['OVER_SHOULDER', 'CLOSE_UP'],
    ['PAN_REVEAL', 'REACTION'],
    ['TRACKING', 'ESTABLISHING'],
    ['ENVIRONMENT_HERO', 'WIDE_TWO_SHOT'],
  ] as const) {
    it(`gives ${fromIntent} -> ${toIntent} a written transition reason`, () => {
      const transition = chooseTransition({ fromIntent, toIntent, locationChanged: fromIntent === 'FOLLOW' });
      expect(transition.reason.length).toBeGreaterThan(8);
      expect(TRANSITIONS).toContain(transition.type);
    });
  }

  it('keeps J-cut style picture order when dialogue is absent on the outgoing shot', () => {
    const timeline = buildEditorialTimeline({
      episodeId: 'EP020',
      shots: [
        { shotId: 'A', durationFrames: 60, intent: 'ESTABLISHING', locationId: 'village' },
        { shotId: 'B', durationFrames: 90, intent: 'MEDIUM_TWO_SHOT', locationId: 'village', dialogueRef: 'DLX' },
        { shotId: 'C', durationFrames: 70, intent: 'REACTION', locationId: 'forest' },
      ],
    });
    expect(timeline.markers).toHaveLength(3);
    expect(timeline.transitions[0]?.atFrame).toBe(60);
    expect(timeline.transitions[1]?.type).toBe('REACTION_CUT');
  });

  it('does not force every 60-second episode onto one cut rate', () => {
    const calm = DEFAULT_PACE_THRESHOLDS.CALM_DISCOVERY.minCut;
    const burst = DEFAULT_PACE_THRESHOLDS.ACTION_BURST.minCut;
    expect(calm).toBeGreaterThan(burst);
  });
});

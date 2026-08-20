import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_MODES,
  SCREEN_DIRECTION_STATES,
  conversationModeFor,
  conversationModes,
  evaluateScreenDirection,
  planCharacterStaging,
  planCinematography,
  preventForwardStare,
  screenDirectionStates,
} from './tivvlejoy-nightshift-production';

describe('staging and screen direction', () => {
  for (const mode of CONVERSATION_MODES) {
    it(`stages ${mode} without overlapping Pip and Goat`, () => {
      const staging = planCharacterStaging({ shotId: `SH_${mode}`, mode, travel: mode.includes('TRAVEL') || mode.includes('WALK') ? 'RIGHT' : 'NONE' });
      expect(staging.overlap).toBe(false);
      expect(staging.cameraAware).toBe(true);
      expect(staging.stagingSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it('prevents both characters from staring straight forward', () => {
    for (const mode of conversationModes()) {
      const gaze = preventForwardStare(mode);
      expect(gaze.pipYaw === 0 && gaze.goatYaw === 0).toBe(false);
    }
  });

  it('avoids robotic symmetry on a still two-shot', () => {
    const staging = planCharacterStaging({ shotId: 'SH_SYM', mode: 'PIP_SPEAKING' });
    expect(staging.roboticSymmetry).toBe(false);
    expect(Math.abs(staging.pipZone.x - staging.goatZone.x)).toBeGreaterThan(0.1);
  });

  it('tracks a valid axis and flags an unjustified flip', () => {
    const first = planCharacterStaging({ shotId: 'A', mode: 'WALKING_CONVERSATION', travel: 'RIGHT' });
    const second = planCharacterStaging({ shotId: 'B', mode: 'WALKING_CONVERSATION', travel: 'LEFT' });
    const cameraA = planCinematography({ shotId: 'A', intent: 'FOLLOW', travel: 'RIGHT' });
    const cameraB = planCinematography({ shotId: 'B', intent: 'FOLLOW', travel: 'LEFT' });
    const ledger = evaluateScreenDirection({
      episodeId: 'EP007',
      shots: [
        { shotId: 'A', staging: first, camera: cameraA, establishing: true },
        { shotId: 'B', staging: second, camera: cameraB },
      ],
    });
    expect(ledger.facts[1]?.state).toBe('AXIS_BREAK_REQUIRES_ESTABLISHING_SHOT');
  });

  it('allows an intentional axis break and an establishing reset', () => {
    const first = planCharacterStaging({ shotId: 'A', mode: 'SIDE_BY_SIDE_TRAVEL', travel: 'RIGHT' });
    const second = planCharacterStaging({ shotId: 'B', mode: 'SIDE_BY_SIDE_TRAVEL', travel: 'LEFT' });
    const camera = planCinematography({ shotId: 'A', intent: 'TRACKING', travel: 'RIGHT' });
    const camera2 = planCinematography({ shotId: 'B', intent: 'ESTABLISHING', travel: 'LEFT' });
    const intentional = evaluateScreenDirection({
      episodeId: 'EP008',
      shots: [
        { shotId: 'A', staging: first, camera, establishing: true },
        { shotId: 'B', staging: second, camera: camera2, intentionalBreak: true },
      ],
    });
    expect(intentional.facts[1]?.state).toBe('INTENTIONAL_AXIS_BREAK');
    const reset = evaluateScreenDirection({
      episodeId: 'EP008',
      shots: [
        { shotId: 'A', staging: first, camera, establishing: true },
        { shotId: 'B', staging: second, camera: camera2, establishing: true },
      ],
    });
    expect(reset.facts[1]?.state).toBe('VALID');
  });

  it('marks contradictory camera/staging travel as invalid', () => {
    const staging = planCharacterStaging({ shotId: 'X', mode: 'ONE_LEADING', travel: 'RIGHT', leading: 'PIP' });
    const camera = planCinematography({ shotId: 'X', intent: 'FOLLOW', travel: 'LEFT' });
    const ledger = evaluateScreenDirection({
      episodeId: 'EP009',
      shots: [{ shotId: 'X', staging, camera }],
    });
    expect(ledger.facts[0]?.state).toBe('INVALID_SCREEN_DIRECTION');
  });

  it('does not randomly flip screen sides on a still conversation', () => {
    const a = planCharacterStaging({ shotId: 'STILL_A', mode: 'PIP_SPEAKING' });
    const b = planCharacterStaging({ shotId: 'STILL_B', mode: 'GOAT_SPEAKING' });
    expect(a.screenDirection).toBe('NEUTRAL');
    expect(b.screenDirection).toBe('NEUTRAL');
    expect(a.pipZone.x).toBeLessThan(a.goatZone.x);
    expect(b.pipZone.x).toBeLessThan(b.goatZone.x);
  });

  it('chooses conversation modes from story situation', () => {
    expect(conversationModeFor({ map: true })).toBe('MAP_READING');
    expect(conversationModeFor({ speaker: 'GOAT' })).toBe('GOAT_SPEAKING');
    expect(conversationModeFor({ walking: true })).toBe('WALKING_CONVERSATION');
    expect(screenDirectionStates()).toEqual([...SCREEN_DIRECTION_STATES]);
  });
});

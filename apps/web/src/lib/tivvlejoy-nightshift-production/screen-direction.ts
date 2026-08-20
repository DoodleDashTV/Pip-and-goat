import { sha256Canonical } from './hash';
import { SCREEN_DIRECTION_SCHEMA, SCREEN_DIRECTION_STATES, type ScreenDirectionState } from './types';
import type { CharacterStagingPlan } from './staging';
import type { CinematographyPlan } from './cinematography';

export type ScreenDirectionLedger = {
  schemaVersion: typeof SCREEN_DIRECTION_SCHEMA;
  episodeId: string;
  establishedAxis: 'LEFT' | 'RIGHT';
  cameraSide: 'LEFT' | 'RIGHT';
  facts: Array<{ shotId: string; state: ScreenDirectionState; reason: string }>;
  ledgerSha256: string;
};

export function evaluateScreenDirection(input: {
  episodeId: string;
  shots: Array<{ shotId: string; staging: CharacterStagingPlan; camera: CinematographyPlan; establishing?: boolean; intentionalBreak?: boolean }>;
}): ScreenDirectionLedger {
  let axis: 'LEFT' | 'RIGHT' = input.shots[0]?.staging.screenDirection === 'LEFT' ? 'LEFT' : 'RIGHT';
  let cameraSide: 'LEFT' | 'RIGHT' = input.shots[0]?.camera.eyeLine === 'LEFT' ? 'LEFT' : 'RIGHT';
  const facts: ScreenDirectionLedger['facts'] = [];
  for (const shot of input.shots) {
    const travel = shot.staging.screenDirection;
    const crossed = travel !== 'NEUTRAL' && travel !== axis;
    let state: ScreenDirectionState = 'VALID';
    let reason = 'Axis and eyeline remain consistent.';
    if (shot.establishing) {
      axis = travel === 'NEUTRAL' ? axis : travel;
      cameraSide = shot.camera.eyeLine === 'LEFT' ? 'LEFT' : 'RIGHT';
      reason = 'Establishing shot may reset the axis.';
    } else if (crossed && shot.intentionalBreak) {
      state = 'INTENTIONAL_AXIS_BREAK';
      reason = 'Director marked an intentional axis break.';
    } else if (crossed) {
      state = 'AXIS_BREAK_REQUIRES_ESTABLISHING_SHOT';
      reason = 'Travel flipped without a new establishing shot.';
    }
    if (shot.camera.screenDirection !== 'NEUTRAL' && shot.staging.screenDirection !== 'NEUTRAL' && shot.camera.screenDirection !== shot.staging.screenDirection && !shot.establishing) {
      state = 'INVALID_SCREEN_DIRECTION';
      reason = 'Camera screen direction contradicts staging travel.';
    }
    facts.push({ shotId: shot.shotId, state, reason });
  }
  const body = {
    schemaVersion: SCREEN_DIRECTION_SCHEMA,
    episodeId: input.episodeId,
    establishedAxis: axis,
    cameraSide,
    facts,
  };
  return { ...body, ledgerSha256: sha256Canonical(body) };
}

export function screenDirectionStates(): readonly ScreenDirectionState[] {
  return SCREEN_DIRECTION_STATES;
}

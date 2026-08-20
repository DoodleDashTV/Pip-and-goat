import { sha256Canonical } from './hash';
import { GAZE_SCHEMA, type GazeTarget } from './types';

export type GazePlan = {
  schemaVersion: typeof GAZE_SCHEMA;
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  primary: GazeTarget;
  secondary: GazeTarget | null;
  gazeTransition: string;
  headFollow: boolean;
  eyeLeadMs: number;
  holdMs: number;
  storyCritical: boolean;
  gazePlanSha256: string;
};

export function buildGazePlan(input: {
  shotId: string;
  characterId: 'PIP' | 'GOAT';
  speaking: boolean;
  partnerVisible: boolean;
  propId?: string | null;
  moving?: boolean;
  storyCritical?: boolean;
}): GazePlan {
  let primary: GazeTarget = 'CAMERA_NEAR';
  if (input.propId && input.storyCritical) primary = 'STORY_PROP';
  else if (input.speaking && input.partnerVisible) primary = 'OTHER_CHARACTER';
  else if (!input.speaking && input.partnerVisible) primary = 'OTHER_CHARACTER';
  else if (input.moving) primary = 'DESTINATION';
  const secondary: GazeTarget | null =
    input.propId && primary !== 'STORY_PROP' ? 'STORY_PROP' : input.speaking ? 'CAMERA_OFF_AXIS' : null;
  const body: Omit<GazePlan, 'gazePlanSha256'> = {
    schemaVersion: GAZE_SCHEMA,
    shotId: input.shotId,
    characterId: input.characterId,
    primary,
    secondary,
    gazeTransition: primary === 'STORY_PROP' ? 'hold-on-object' : 'ease-to-partner',
    headFollow: true,
    eyeLeadMs: 70,
    holdMs: input.storyCritical ? 900 : 480,
    storyCritical: input.storyCritical === true,
  };
  return { ...body, gazePlanSha256: sha256Canonical(body) };
}

import { sha256Canonical } from './hash';
import { CAMERA_MOTIONS, type CameraMotion, type ShotIntent } from './types';
import type { StoryBeat } from './beats';

export type CameraMotionPlan = {
  motion: CameraMotion;
  storyReason: string;
  fatigueRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  motionSha256: string;
};

const REASONS: Record<CameraMotion, string> = {
  STATIC: 'Hold still so acting or comedy can land.',
  SLOW_PUSH: 'Increase tension or attention on a face.',
  FAST_PUSH: 'Rare emphasis; only for a sudden discovery.',
  SLOW_PULL: 'Re-open geography after intimacy.',
  PAN: 'Reveal a hidden part of the location.',
  TILT: 'Disclose vertical story information.',
  TRACK: 'Travel beside locomotion.',
  FOLLOW: 'Follow the pair without losing the path.',
  ARC: 'Orbit only when the axis must stay readable.',
  REVEAL: 'Disclose the destination or clue.',
};

export function planCameraMotion(input: {
  intent: ShotIntent;
  beat: StoryBeat;
  previousMotion?: CameraMotion;
  movingStreak?: number;
}): CameraMotionPlan {
  let motion: CameraMotion = 'STATIC';
  if (input.intent === 'PUSH_IN' || input.beat.beatType === 'TENSION') motion = 'SLOW_PUSH';
  else if (input.intent === 'PULL_OUT') motion = 'SLOW_PULL';
  else if (input.intent === 'PAN_REVEAL') motion = 'PAN';
  else if (input.intent === 'TILT_REVEAL') motion = 'TILT';
  else if (input.intent === 'FOLLOW') motion = 'FOLLOW';
  else if (input.intent === 'TRACKING') motion = 'TRACK';
  else if (input.intent === 'ESTABLISHING' || input.intent === 'ENVIRONMENT_HERO') motion = input.beat.beatType === 'REVEAL' ? 'REVEAL' : 'PAN';
  else if (input.intent === 'STATIC_COMEDY' || input.intent === 'REACTION' || input.intent === 'CLOSE_UP') motion = 'STATIC';
  if ((input.movingStreak ?? 0) >= 3 && motion !== 'STATIC') motion = 'STATIC';
  const fatigueRisk = (input.movingStreak ?? 0) >= 3 ? 'HIGH' : (input.movingStreak ?? 0) === 2 && motion !== 'STATIC' ? 'MEDIUM' : 'LOW';
  return {
    motion,
    storyReason: REASONS[motion],
    fatigueRisk,
    motionSha256: sha256Canonical({ motion, reason: REASONS[motion], intent: input.intent, beat: input.beat.beatType }),
  };
}

export function cameraMotions(): readonly CameraMotion[] {
  return CAMERA_MOTIONS;
}

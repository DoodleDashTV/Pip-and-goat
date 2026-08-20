import { CAMERA_TEMPLATES, type CameraTemplate } from '@/lib/tivvlejoy-episode-scene-planner/cameras';
import type { CameraTemplateId } from '@/lib/tivvlejoy-episode-scene-planner/types';
import { SHOT_INTENTS, SHOT_LANGUAGE_SCHEMA, type ShotIntent } from './types';
import type { StoryBeat } from './beats';

export type ShotLanguage = {
  schemaVersion: typeof SHOT_LANGUAGE_SCHEMA;
  intent: ShotIntent;
  storyPurpose: string;
  recommendedDurationRange: { min: number; max: number };
  framingPriority: 'LOCATION' | 'TWO_SHOT' | 'FACE' | 'PROP' | 'MOTION';
  characterPriority: 'NONE' | 'PIP' | 'GOAT' | 'BOTH';
  propPriority: 'NONE' | 'STORY' | 'ENVIRONMENT';
  cameraMotionClass: CameraTemplate['movementClass'] | 'motivated';
  cutCompatibility: ShotIntent[];
  verticalVideoNotes: string;
  cameraTemplateId: CameraTemplateId;
};

const LANGUAGE: Record<ShotIntent, Omit<ShotLanguage, 'schemaVersion'>> = {
  ESTABLISHING: lang('ESTABLISHING', 'Open geography before faces', { min: 90, max: 180 }, 'LOCATION', 'NONE', 'NONE', 'gentle-pan', ['WIDE_TWO_SHOT', 'MEDIUM_TWO_SHOT', 'LOCATION_TRANSITION'], 'Keep horizon low enough for captions', 'TJ_CAM_ESTABLISHING_VERTICAL'),
  WIDE_TWO_SHOT: lang('WIDE_TWO_SHOT', 'Place Pip and Goat in the world', { min: 75, max: 180 }, 'TWO_SHOT', 'BOTH', 'NONE', 'static', ['MEDIUM_TWO_SHOT', 'FOLLOW', 'ENVIRONMENT_HERO'], 'Stack characters vertically if needed', 'TJ_CAM_TWO_SHOT_MEDIUM'),
  MEDIUM_TWO_SHOT: lang('MEDIUM_TWO_SHOT', 'Hold a conversation without isolating either character', { min: 90, max: 240 }, 'TWO_SHOT', 'BOTH', 'NONE', 'static', ['MEDIUM_SINGLE', 'REACTION', 'OVER_SHOULDER'], 'Faces stay in the middle third', 'TJ_CAM_TWO_SHOT_MEDIUM'),
  MEDIUM_SINGLE: lang('MEDIUM_SINGLE', 'Give one character the line', { min: 60, max: 180 }, 'FACE', 'PIP', 'NONE', 'static', ['REACTION', 'CLOSE_UP', 'OVER_SHOULDER'], 'Leave look-room toward the partner', 'TJ_CAM_PIP_MEDIUM'),
  CLOSE_UP: lang('CLOSE_UP', 'Make a reaction or discovery readable', { min: 45, max: 120 }, 'FACE', 'PIP', 'NONE', 'static', ['REACTION', 'MEDIUM_SINGLE', 'INSERT'], 'Protect top UI and caption band', 'TJ_CAM_PIP_CLOSE'),
  EXTREME_CLOSE_UP: lang('EXTREME_CLOSE_UP', 'A rare emphasis, never a default', { min: 24, max: 60 }, 'FACE', 'PIP', 'NONE', 'static', ['CLOSE_UP', 'REACTION'], 'Do not crop the story eye-line', 'TJ_CAM_PIP_CLOSE'),
  REACTION: lang('REACTION', 'Let the listener answer without words', { min: 36, max: 90 }, 'FACE', 'GOAT', 'NONE', 'static', ['MEDIUM_TWO_SHOT', 'CLOSE_UP', 'PAYOFF' as ShotIntent], 'Hold long enough to read', 'TJ_CAM_GOAT_CLOSE'),
  INSERT: lang('INSERT', 'Show a necessary detail', { min: 36, max: 90 }, 'PROP', 'NONE', 'STORY', 'static', ['PROP_INSERT', 'MEDIUM_SINGLE', 'REACTION'], 'Center the readable object', 'TJ_CAM_STORY_PROP_INSERT'),
  PROP_INSERT: lang('PROP_INSERT', 'Make the hero prop unmistakable', { min: 36, max: 90 }, 'PROP', 'NONE', 'STORY', 'static', ['INSERT', 'REVEAL' as ShotIntent, 'REACTION'], 'Keep the prop above the caption band', 'TJ_CAM_STORY_PROP_INSERT'),
  OVER_SHOULDER: lang('OVER_SHOULDER', 'Preserve the conversation axis', { min: 60, max: 150 }, 'TWO_SHOT', 'BOTH', 'NONE', 'static', ['MEDIUM_SINGLE', 'REACTION', 'MEDIUM_TWO_SHOT'], 'Do not flatten depth', 'TJ_CAM_OVER_SHOULDER_PIP'),
  POV: lang('POV', 'Show what a character just noticed', { min: 36, max: 90 }, 'PROP', 'NONE', 'STORY', 'static', ['REACTION', 'INSERT'], 'Return to a face after the look', 'TJ_CAM_STORY_PROP_INSERT'),
  FOLLOW: lang('FOLLOW', 'Travel with locomotion', { min: 90, max: 210 }, 'MOTION', 'BOTH', 'NONE', 'walk-follow', ['TRACKING', 'WIDE_TWO_SHOT', 'LOCATION_TRANSITION'], 'Keep feet when walking matters', 'TJ_CAM_FOLLOW_ADVENTURE'),
  PUSH_IN: lang('PUSH_IN', 'Increase attention for a reason', { min: 60, max: 150 }, 'FACE', 'BOTH', 'NONE', 'motivated', ['CLOSE_UP', 'REVEAL' as ShotIntent], 'Stop before faces leave safe area', 'TJ_CAM_REVEAL'),
  PULL_OUT: lang('PULL_OUT', 'Re-establish after intimacy', { min: 60, max: 150 }, 'LOCATION', 'BOTH', 'NONE', 'motivated', ['WIDE_TWO_SHOT', 'ESTABLISHING'], 'Reveal usable geography', 'TJ_CAM_ESTABLISHING_VERTICAL'),
  PAN_REVEAL: lang('PAN_REVEAL', 'Disclose a hidden part of the location', { min: 75, max: 180 }, 'LOCATION', 'NONE', 'ENVIRONMENT', 'gentle-pan', ['ENVIRONMENT_HERO', 'REACTION'], 'End on a readable subject', 'TJ_CAM_REVEAL'),
  TILT_REVEAL: lang('TILT_REVEAL', 'Disclose vertical story information', { min: 60, max: 150 }, 'LOCATION', 'NONE', 'ENVIRONMENT', 'motivated', ['ENVIRONMENT_HERO', 'INSERT'], 'Account for 9:16 height', 'TJ_CAM_REVEAL'),
  TRACKING: lang('TRACKING', 'Move beside travel without losing faces', { min: 90, max: 240 }, 'MOTION', 'BOTH', 'NONE', 'walk-follow', ['FOLLOW', 'MEDIUM_TWO_SHOT'], 'Screen direction must stay consistent', 'TJ_CAM_WALK_AND_TALK'),
  STATIC_COMEDY: lang('STATIC_COMEDY', 'Hold still so the joke can land', { min: 60, max: 150 }, 'TWO_SHOT', 'BOTH', 'NONE', 'static', ['REACTION', 'MEDIUM_TWO_SHOT'], 'Do not add motion without a reason', 'TJ_CAM_REACTION_TWO_SHOT'),
  SILHOUETTE: lang('SILHOUETTE', 'A rare graphic beat, never default lighting', { min: 45, max: 120 }, 'LOCATION', 'BOTH', 'NONE', 'static', ['ENVIRONMENT_HERO', 'TRANSITION' as ShotIntent], 'Faces must still read if dialogue exists', 'TJ_CAM_ESTABLISHING_VERTICAL'),
  ENVIRONMENT_HERO: lang('ENVIRONMENT_HERO', 'Let scenery carry story scale', { min: 75, max: 180 }, 'LOCATION', 'NONE', 'ENVIRONMENT', 'gentle-pan', ['ESTABLISHING', 'WIDE_TWO_SHOT'], 'Characters may be small but placed', 'TJ_CAM_ESTABLISHING_VERTICAL'),
  LOCATION_TRANSITION: lang('LOCATION_TRANSITION', 'Clear the geography change', { min: 48, max: 120 }, 'LOCATION', 'NONE', 'NONE', 'gentle-pan', ['ESTABLISHING', 'FOLLOW'], 'Do not skip the new place', 'TJ_CAM_ESTABLISHING_VERTICAL'),
};

function lang(
  intent: ShotIntent,
  storyPurpose: string,
  recommendedDurationRange: { min: number; max: number },
  framingPriority: ShotLanguage['framingPriority'],
  characterPriority: ShotLanguage['characterPriority'],
  propPriority: ShotLanguage['propPriority'],
  cameraMotionClass: ShotLanguage['cameraMotionClass'],
  cutCompatibility: ShotIntent[],
  verticalVideoNotes: string,
  cameraTemplateId: CameraTemplateId,
): Omit<ShotLanguage, 'schemaVersion'> {
  return {
    intent,
    storyPurpose,
    recommendedDurationRange,
    framingPriority,
    characterPriority,
    propPriority,
    cameraMotionClass,
    cutCompatibility,
    verticalVideoNotes,
    cameraTemplateId,
  };
}

export function shotLanguage(intent: ShotIntent): ShotLanguage {
  return { schemaVersion: SHOT_LANGUAGE_SCHEMA, ...LANGUAGE[intent] };
}

export function allShotIntents(): readonly ShotIntent[] {
  return SHOT_INTENTS;
}

export function cameraTemplateForIntent(intent: ShotIntent): CameraTemplate {
  return CAMERA_TEMPLATES[shotLanguage(intent).cameraTemplateId];
}

export function intentForBeat(beat: StoryBeat, shotIndex: number, totalShots: number): ShotIntent {
  if (beat.beatType === 'HOOK' || shotIndex === 0) return 'ESTABLISHING';
  if (beat.beatType === 'BUTTON' || shotIndex === totalShots - 1) return 'REACTION';
  if (beat.beatType === 'TRANSITION') return 'LOCATION_TRANSITION';
  if (beat.beatType === 'REVEAL') return shotIndex % 2 === 0 ? 'PAN_REVEAL' : 'ENVIRONMENT_HERO';
  if (beat.beatType === 'DISCOVERY') return beat.prop ? 'PROP_INSERT' : 'POV';
  if (beat.beatType === 'REACTION') return 'REACTION';
  if (beat.beatType === 'COMEDY') return 'STATIC_COMEDY';
  if (beat.beatType === 'MOVEMENT') return shotIndex % 2 === 0 ? 'FOLLOW' : 'TRACKING';
  if (beat.beatType === 'TENSION') return 'PUSH_IN';
  if (beat.beatType === 'QUESTION') return 'OVER_SHOULDER';
  if (beat.beatType === 'PAYOFF') return 'CLOSE_UP';
  if (beat.beatType === 'DECISION') return 'MEDIUM_SINGLE';
  return shotIndex % 3 === 0 ? 'WIDE_TWO_SHOT' : 'MEDIUM_TWO_SHOT';
}

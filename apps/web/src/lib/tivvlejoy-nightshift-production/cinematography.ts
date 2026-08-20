import { sha256Canonical } from './hash';
import { CINEMATOGRAPHY_SCHEMA, type CameraMotion, type ShotIntent } from './types';
import { shotLanguage } from './shot-language';

export type CinematographyPlan = {
  schemaVersion: typeof CINEMATOGRAPHY_SCHEMA;
  shotId: string;
  cameraIntent: ShotIntent;
  shotSize: 'ESTABLISHING' | 'WIDE' | 'MEDIUM' | 'CLOSE' | 'INSERT';
  subjectPriority: 'LOCATION' | 'PIP' | 'GOAT' | 'BOTH' | 'PROP';
  eyeLine: 'LEFT' | 'RIGHT' | 'CENTER' | 'OFFSCREEN';
  lookRoom: number;
  leadRoom: number;
  headRoom: number;
  verticalSafeArea: { top: number; bottom: number; left: number; right: number };
  foregroundLayer: string;
  midgroundLayer: string;
  backgroundLayer: string;
  depthReadability: 'FLAT_RISK' | 'READABLE' | 'DEEP';
  motionDirection: 'NONE' | 'LEFT' | 'RIGHT' | 'IN' | 'OUT';
  screenDirection: 'LEFT' | 'RIGHT' | 'NEUTRAL';
  cameraHeightClass: 'LOW' | 'EYE' | 'HIGH';
  lensClass: 'WIDE' | 'NORMAL' | 'CLOSE';
  cameraMotion: CameraMotion;
  focusTarget: string;
  secondaryFocusTarget: string | null;
  storyPropVisibility: 'HIDDEN' | 'PRESENT' | 'HERO';
  facialReadability: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';
  gestureReadability: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';
  cameraTemplateId: string;
  exactCameraTransforms: 'UNRESOLVED';
  cinematographySha256: string;
};

export function planCinematography(input: {
  shotId: string;
  intent: ShotIntent;
  speaker?: 'PIP' | 'GOAT' | null;
  travel?: 'LEFT' | 'RIGHT' | 'NONE';
  prop?: string | null;
  cameraMotion?: CameraMotion;
}): CinematographyPlan {
  const language = shotLanguage(input.intent);
  const shotSize: CinematographyPlan['shotSize'] =
    input.intent === 'ESTABLISHING' || input.intent === 'ENVIRONMENT_HERO' || input.intent === 'LOCATION_TRANSITION'
      ? 'ESTABLISHING'
      : input.intent === 'WIDE_TWO_SHOT' || input.intent === 'SILHOUETTE'
        ? 'WIDE'
        : input.intent === 'CLOSE_UP' || input.intent === 'EXTREME_CLOSE_UP' || input.intent === 'REACTION'
          ? 'CLOSE'
          : input.intent === 'INSERT' || input.intent === 'PROP_INSERT' || input.intent === 'POV'
            ? 'INSERT'
            : 'MEDIUM';
  const subjectPriority: CinematographyPlan['subjectPriority'] =
    language.characterPriority === 'BOTH'
      ? 'BOTH'
      : language.characterPriority === 'NONE'
        ? language.propPriority === 'STORY'
          ? 'PROP'
          : 'LOCATION'
        : language.characterPriority;
  const eyeLine: CinematographyPlan['eyeLine'] =
    input.speaker === 'PIP' ? 'RIGHT' : input.speaker === 'GOAT' ? 'LEFT' : shotSize === 'ESTABLISHING' ? 'CENTER' : 'RIGHT';
  const cameraMotion: CameraMotion =
    input.cameraMotion ??
    (language.cameraMotionClass === 'static'
      ? 'STATIC'
      : language.cameraMotionClass === 'walk-follow'
        ? 'FOLLOW'
        : language.cameraMotionClass === 'reveal-push'
          ? 'REVEAL'
          : 'PAN');
  const body = {
    schemaVersion: CINEMATOGRAPHY_SCHEMA,
    shotId: input.shotId,
    cameraIntent: input.intent,
    shotSize,
    subjectPriority,
    eyeLine,
    lookRoom: shotSize === 'CLOSE' ? 0.18 : 0.12,
    leadRoom: input.travel === 'NONE' || !input.travel ? 0.08 : 0.2,
    headRoom: shotSize === 'CLOSE' ? 0.1 : 0.16,
    verticalSafeArea: { top: 0.12, bottom: 0.22, left: 0.08, right: 0.08 },
    foregroundLayer: shotSize === 'INSERT' ? 'story-prop' : 'near-set-dressing',
    midgroundLayer: subjectPriority === 'LOCATION' ? 'architecture' : 'characters',
    backgroundLayer: 'environment-depth',
    depthReadability: (input.intent === 'OVER_SHOULDER' ? 'DEEP' : shotSize === 'CLOSE' ? 'FLAT_RISK' : 'READABLE') as CinematographyPlan['depthReadability'],
    motionDirection: (cameraMotion === 'STATIC'
      ? 'NONE'
      : cameraMotion === 'SLOW_PULL'
        ? 'OUT'
        : cameraMotion === 'SLOW_PUSH' || cameraMotion === 'FAST_PUSH'
          ? 'IN'
          : input.travel === 'LEFT'
            ? 'LEFT'
            : input.travel === 'RIGHT'
              ? 'RIGHT'
              : 'IN') as CinematographyPlan['motionDirection'],
    screenDirection: (input.travel === 'LEFT' ? 'LEFT' : input.travel === 'RIGHT' ? 'RIGHT' : 'NEUTRAL') as CinematographyPlan['screenDirection'],
    cameraHeightClass: (shotSize === 'ESTABLISHING' ? 'HIGH' : shotSize === 'INSERT' ? 'LOW' : 'EYE') as CinematographyPlan['cameraHeightClass'],
    lensClass: (shotSize === 'CLOSE' ? 'CLOSE' : shotSize === 'ESTABLISHING' || shotSize === 'WIDE' ? 'WIDE' : 'NORMAL') as CinematographyPlan['lensClass'],
    cameraMotion,
    focusTarget: subjectPriority === 'PROP' ? input.prop ?? 'story-prop' : subjectPriority === 'GOAT' ? 'GOAT' : subjectPriority === 'PIP' ? 'PIP' : subjectPriority === 'BOTH' ? 'PIP_AND_GOAT' : 'ENVIRONMENT',
    secondaryFocusTarget: subjectPriority === 'BOTH' ? 'environment-depth' : input.speaker && subjectPriority !== input.speaker ? input.speaker : null,
    storyPropVisibility: (input.prop ? (shotSize === 'INSERT' ? 'HERO' : 'PRESENT') : 'HIDDEN') as CinematographyPlan['storyPropVisibility'],
    facialReadability: (shotSize === 'INSERT' || shotSize === 'ESTABLISHING' ? 'OPTIONAL' : 'REQUIRED') as CinematographyPlan['facialReadability'],
    gestureReadability: (input.intent === 'FOLLOW' || input.intent === 'TRACKING' || input.intent === 'STATIC_COMEDY' ? 'REQUIRED' : 'OPTIONAL') as CinematographyPlan['gestureReadability'],
    cameraTemplateId: language.cameraTemplateId,
    exactCameraTransforms: 'UNRESOLVED' as const,
  };
  return { ...body, cinematographySha256: sha256Canonical(body) };
}

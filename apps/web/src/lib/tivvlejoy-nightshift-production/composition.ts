import { sha256Canonical } from './hash';
import {
  COMPOSITION_CHECKS,
  COMPOSITION_DEFECTS,
  VERTICAL_COMPOSITION_SCHEMA,
  SHOT_COMPOSITION_QC_SCHEMA,
  type CompositionCheck,
  type CompositionDefect,
} from './types';
import type { CinematographyPlan } from './cinematography';

export type VerticalCompositionProfile = {
  profileId: string;
  width: number;
  height: number;
  aspect: '9:16';
  topOverlay: number;
  bottomOverlay: number;
  captionBand: number;
  faceBand: { min: number; max: number };
  footroomWhenLocomotion: number;
  twoCharacterStackGap: number;
};

export const DEFAULT_VERTICAL_PROFILE: VerticalCompositionProfile = {
  profileId: 'TJ_VERTICAL_1080x1920_V1',
  width: 1080,
  height: 1920,
  aspect: '9:16',
  topOverlay: 0.1,
  bottomOverlay: 0.14,
  captionBand: 0.18,
  faceBand: { min: 0.28, max: 0.62 },
  footroomWhenLocomotion: 0.12,
  twoCharacterStackGap: 0.08,
};

export type NormalizedBox = { x: number; y: number; w: number; h: number };

export type CompositionSubject = {
  id: string;
  kind: 'FACE' | 'PROP' | 'GESTURE' | 'FEET' | 'SIGN' | 'ACTION_EXIT';
  box: NormalizedBox;
  important: boolean;
};

export type VerticalCompositionResult = {
  schemaVersion: typeof VERTICAL_COMPOSITION_SCHEMA;
  profileId: string;
  checks: Record<CompositionCheck, boolean>;
  compositionSha256: string;
};

export function evaluateVerticalComposition(input: {
  profile?: VerticalCompositionProfile;
  subjects: CompositionSubject[];
  locomotionImportant?: boolean;
  captionsEnabled?: boolean;
}): VerticalCompositionResult {
  const profile = input.profile ?? DEFAULT_VERTICAL_PROFILE;
  const faces = input.subjects.filter((item) => item.kind === 'FACE');
  const props = input.subjects.filter((item) => item.kind === 'PROP' && item.important);
  const gestures = input.subjects.filter((item) => item.kind === 'GESTURE' && item.important);
  const feet = input.subjects.filter((item) => item.kind === 'FEET');
  const signs = input.subjects.filter((item) => item.kind === 'SIGN' && item.important);
  const exits = input.subjects.filter((item) => item.kind === 'ACTION_EXIT' && item.important);
  const checks: Record<CompositionCheck, boolean> = {
    FACE_SAFE: faces.every((face) => face.box.y >= profile.faceBand.min && face.box.y + face.box.h <= profile.faceBand.max && face.box.y > profile.topOverlay),
    PROP_SAFE: props.every((prop) => prop.box.y + prop.box.h < 1 - profile.captionBand && prop.box.w * prop.box.h >= 0.02),
    CAPTION_SAFE: input.captionsEnabled === false || input.subjects.every((item) => item.kind === 'FACE' || item.box.y + item.box.h < 1 - profile.captionBand || !item.important),
    GESTURE_SAFE: gestures.every((item) => inFrame(item.box)),
    ACTION_SAFE: exits.every((item) => inFrame(item.box)),
    HEADROOM_SAFE: faces.every((face) => face.box.y >= profile.topOverlay + 0.02),
    FOOTROOM_SAFE: input.locomotionImportant !== true || feet.every((item) => item.box.y + item.box.h <= 1 - profile.bottomOverlay + 0.02),
    SIGNAGE_SAFE: signs.every((item) => inFrame(item.box) && item.box.y > profile.topOverlay),
  };
  return {
    schemaVersion: VERTICAL_COMPOSITION_SCHEMA,
    profileId: profile.profileId,
    checks,
    compositionSha256: sha256Canonical({ profileId: profile.profileId, checks, subjects: input.subjects }),
  };
}

function inFrame(box: NormalizedBox): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.w <= 1 && box.y + box.h <= 1;
}

export type ShotCompositionQc = {
  schemaVersion: typeof SHOT_COMPOSITION_QC_SCHEMA;
  defects: CompositionDefect[];
  passed: boolean;
  qcSha256: string;
};

export function evaluateShotCompositionQc(input: {
  plan: CinematographyPlan;
  composition: VerticalCompositionResult;
  subjects: CompositionSubject[];
  emptySpaceRatio?: number;
  subjectsOverlap?: boolean;
  backgroundCompetes?: boolean;
  screenDirectionAmbiguous?: boolean;
  depthFlattened?: boolean;
}): ShotCompositionQc {
  const defects: CompositionDefect[] = [];
  const faces = input.subjects.filter((item) => item.kind === 'FACE' && item.important);
  if (faces.some((face) => face.box.w * face.box.h < 0.03) && input.plan.facialReadability === 'REQUIRED') defects.push('FACE_TOO_SMALL');
  if (!input.composition.checks.FACE_SAFE && input.plan.facialReadability === 'REQUIRED') defects.push('FACE_OUT_OF_SAFE_REGION');
  if (!input.composition.checks.PROP_SAFE && input.plan.storyPropVisibility === 'HERO') defects.push('PROP_NOT_READABLE');
  if (!input.composition.checks.GESTURE_SAFE && input.plan.gestureReadability === 'REQUIRED') defects.push('GESTURE_OUT_OF_FRAME');
  if ((input.emptySpaceRatio ?? 0) > 0.72 && input.plan.shotSize !== 'ESTABLISHING') defects.push('TOO_MUCH_EMPTY_SPACE');
  if (input.screenDirectionAmbiguous) defects.push('SCREEN_DIRECTION_AMBIGUOUS');
  if (input.subjectsOverlap) defects.push('SUBJECT_OVERLAP');
  if (input.backgroundCompetes) defects.push('BACKGROUND_COMPETES_WITH_FACE');
  if (!input.composition.checks.SIGNAGE_SAFE) defects.push('SIGNAGE_OCCLUDED');
  if (!input.composition.checks.ACTION_SAFE) defects.push('ACTION_EXIT_NOT_VISIBLE');
  if (!input.composition.checks.CAPTION_SAFE) defects.push('CAPTION_COLLISION');
  if (input.depthFlattened || input.plan.depthReadability === 'FLAT_RISK' && input.plan.cameraIntent === 'OVER_SHOULDER') defects.push('DEPTH_FLATTENED');
  return {
    schemaVersion: SHOT_COMPOSITION_QC_SCHEMA,
    defects,
    passed: defects.length === 0,
    qcSha256: sha256Canonical({ defects, plan: input.plan.cinematographySha256, composition: input.composition.compositionSha256 }),
  };
}

export function defaultSubjectsFor(plan: CinematographyPlan, locomotion = false): CompositionSubject[] {
  const subjects: CompositionSubject[] = [];
  if (plan.facialReadability !== 'NOT_APPLICABLE' && plan.subjectPriority !== 'LOCATION' && plan.subjectPriority !== 'PROP') {
    subjects.push({ id: 'pip-face', kind: 'FACE', important: true, box: { x: 0.32, y: 0.34, w: 0.16, h: 0.12 } });
    if (plan.subjectPriority === 'BOTH' || plan.subjectPriority === 'GOAT') {
      subjects.push({ id: 'goat-face', kind: 'FACE', important: true, box: { x: 0.52, y: 0.36, w: 0.16, h: 0.12 } });
    }
  }
  if (plan.storyPropVisibility === 'HERO') {
    subjects.push({ id: 'hero-prop', kind: 'PROP', important: true, box: { x: 0.35, y: 0.42, w: 0.3, h: 0.18 } });
  }
  if (locomotion) {
    subjects.push({ id: 'feet', kind: 'FEET', important: true, box: { x: 0.3, y: 0.78, w: 0.4, h: 0.08 } });
  }
  return subjects;
}

export function compositionChecks(): readonly CompositionCheck[] {
  return COMPOSITION_CHECKS;
}

export function compositionDefects(): readonly CompositionDefect[] {
  return COMPOSITION_DEFECTS;
}

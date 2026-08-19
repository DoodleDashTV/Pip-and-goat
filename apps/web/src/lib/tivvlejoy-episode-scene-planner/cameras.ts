import type { FocalTarget } from '@/lib/tivvlejoy-storybook-environment';
import { CAMERA_TEMPLATE_IDS, type CameraTemplateId } from './types';

export type CameraTemplate = {
  id: CameraTemplateId;
  intendedUse: string;
  focalTarget: FocalTarget;
  shotScale: 'establishing' | 'medium' | 'close' | 'insert' | 'follow' | 'reveal';
  movementClass: 'static' | 'gentle-pan' | 'walk-follow' | 'reveal-push';
  safeHeadroomPolicy: 'preferred-6-12';
  dialogueSafe: boolean;
  storyPropSafe: boolean;
  verticalCompositionPolicy: '9:16-dialogue-center';
  preferredDurationRangeFrames: { min: number; max: number };
  requiresRigDependentMeasurement: true;
  pipGoatPixelMeasurements: 'UNRESOLVED';
};

const template = (
  id: CameraTemplateId,
  intendedUse: string,
  focalTarget: FocalTarget,
  shotScale: CameraTemplate['shotScale'],
  movementClass: CameraTemplate['movementClass'],
  dialogueSafe: boolean,
  storyPropSafe: boolean,
  frames: { min: number; max: number },
): CameraTemplate => ({
  id,
  intendedUse,
  focalTarget,
  shotScale,
  movementClass,
  safeHeadroomPolicy: 'preferred-6-12',
  dialogueSafe,
  storyPropSafe,
  verticalCompositionPolicy: '9:16-dialogue-center',
  preferredDurationRangeFrames: frames,
  requiresRigDependentMeasurement: true,
  pipGoatPixelMeasurements: 'UNRESOLVED',
});

export const CAMERA_TEMPLATES: Record<CameraTemplateId, CameraTemplate> = {
  TJ_CAM_ESTABLISHING_VERTICAL: template(
    'TJ_CAM_ESTABLISHING_VERTICAL',
    'Open a location in 9:16 without starting on faces',
    'HERO_SCENERY',
    'establishing',
    'gentle-pan',
    false,
    false,
    { min: 90, max: 180 },
  ),
  TJ_CAM_TWO_SHOT_MEDIUM: template(
    'TJ_CAM_TWO_SHOT_MEDIUM',
    'Hold Pip and Goat together for dialogue',
    'PIP_AND_GOAT',
    'medium',
    'static',
    true,
    false,
    { min: 90, max: 240 },
  ),
  TJ_CAM_PIP_MEDIUM: template(
    'TJ_CAM_PIP_MEDIUM',
    'Pip-led story beat at readable scale',
    'PIP',
    'medium',
    'static',
    true,
    false,
    { min: 60, max: 180 },
  ),
  TJ_CAM_GOAT_MEDIUM: template(
    'TJ_CAM_GOAT_MEDIUM',
    'Goat-led story beat at readable scale',
    'GOAT',
    'medium',
    'static',
    true,
    false,
    { min: 60, max: 180 },
  ),
  TJ_CAM_PIP_CLOSE: template(
    'TJ_CAM_PIP_CLOSE',
    'Pip reaction or discovery close',
    'PIP',
    'close',
    'static',
    true,
    false,
    { min: 45, max: 120 },
  ),
  TJ_CAM_GOAT_CLOSE: template(
    'TJ_CAM_GOAT_CLOSE',
    'Goat reaction or discovery close',
    'GOAT',
    'close',
    'static',
    true,
    false,
    { min: 45, max: 120 },
  ),
  TJ_CAM_STORY_PROP_INSERT: template(
    'TJ_CAM_STORY_PROP_INSERT',
    'Readable story-prop insert',
    'STORY_PROP',
    'insert',
    'static',
    false,
    true,
    { min: 36, max: 90 },
  ),
  TJ_CAM_SIGN_INSERT: template(
    'TJ_CAM_SIGN_INSERT',
    'Critical sign readability insert',
    'SIGN',
    'insert',
    'static',
    false,
    true,
    { min: 36, max: 90 },
  ),
  TJ_CAM_REACTION_TWO_SHOT: template(
    'TJ_CAM_REACTION_TWO_SHOT',
    'Shared reaction after a reveal',
    'PIP_AND_GOAT',
    'medium',
    'static',
    true,
    false,
    { min: 45, max: 120 },
  ),
  TJ_CAM_WALK_AND_TALK: template(
    'TJ_CAM_WALK_AND_TALK',
    'Travel dialogue along a clear path',
    'PIP_AND_GOAT',
    'medium',
    'walk-follow',
    true,
    false,
    { min: 90, max: 240 },
  ),
  TJ_CAM_FOLLOW_ADVENTURE: template(
    'TJ_CAM_FOLLOW_ADVENTURE',
    'Follow the pair into the next location',
    'PIP_AND_GOAT',
    'follow',
    'walk-follow',
    false,
    false,
    { min: 90, max: 210 },
  ),
  TJ_CAM_REVEAL: template(
    'TJ_CAM_REVEAL',
    'Reveal the story destination',
    'HERO_SCENERY',
    'reveal',
    'reveal-push',
    false,
    true,
    { min: 75, max: 180 },
  ),
  TJ_CAM_OVER_SHOULDER_PIP: template(
    'TJ_CAM_OVER_SHOULDER_PIP',
    'Pip over-shoulder toward Goat or a prop',
    'GOAT',
    'medium',
    'static',
    true,
    true,
    { min: 60, max: 150 },
  ),
  TJ_CAM_OVER_SHOULDER_GOAT: template(
    'TJ_CAM_OVER_SHOULDER_GOAT',
    'Goat over-shoulder toward Pip or a prop',
    'PIP',
    'medium',
    'static',
    true,
    true,
    { min: 60, max: 150 },
  ),
};

export function cameraTemplate(id: CameraTemplateId): CameraTemplate {
  return CAMERA_TEMPLATES[id];
}

export function allCameraTemplatesResolved(): boolean {
  return CAMERA_TEMPLATE_IDS.every((id) => CAMERA_TEMPLATES[id]?.pipGoatPixelMeasurements === 'UNRESOLVED');
}

import { DEFORMATION_POSES, VALIDATION_CLIPS, type DeformationPoseId, type ValidationClipId } from './types';

export type ValidationClipPlan = {
  clipId: ValidationClipId;
  purpose: string;
  finalEpisodeAnimation: false;
};

export const VALIDATION_CLIP_PLANS: readonly ValidationClipPlan[] = VALIDATION_CLIPS.map((clipId) => ({
  clipId,
  purpose: `Validation clip ${clipId.replaceAll('_', ' ')}`,
  finalEpisodeAnimation: false as const,
}));

export const NINE_SIXTEEN = {
  width: 1080,
  height: 1920,
  fps: 30,
  checks: ['face_readable_on_phone', 'eyes_visible', 'gestures_inside_frame', 'feet_hands_not_cropped', 'vertical_camera_tolerance'],
} as const;

export const ANIMATION_QUALITY_PRIORITIES = [
  'appealing poses',
  'readable silhouette',
  'strong eye direction',
  'facial clarity',
  'believable weight',
  'anticipations',
  'overshoot and settle',
  'clean arcs',
  'overlap',
  'secondary motion',
  'emotionally readable timing',
  'no robotic interpolation',
  'no foot sliding',
  'no dead eyes',
  'no lip-sync chatter',
  'no clipping',
  'no broken accessories',
  'no unexplained body penetrations',
] as const;

export function deformationPoseCatalog(): readonly DeformationPoseId[] {
  return DEFORMATION_POSES;
}

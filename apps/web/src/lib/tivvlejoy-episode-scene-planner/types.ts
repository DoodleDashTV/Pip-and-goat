export const EPISODE_PLAN_SCHEMA = 'TIVVLEJOY_EPISODE_SCENE_PLAN_V1' as const;
export const SHOT_PACKAGE_SCHEMA = 'TIVVLEJOY_SHOT_PACKAGE_V1' as const;
export const LOCATION_BLOCK_SCHEMA = 'TIVVLEJOY_LOCATION_BLOCK_V1' as const;
export const LOCATION_DELTA_SCHEMA = 'TIVVLEJOY_LOCATION_DELTA_V1' as const;
export const BATCH_EPISODE_PLAN_SCHEMA = 'TIVVLEJOY_BATCH_EPISODE_PLAN_V1' as const;
export const PLANNING_RECEIPT_SCHEMA = 'TIVVLEJOY_EPISODE_PLANNING_RECEIPT_V1' as const;
export const RENDER_HANDOFF_SCHEMA = 'TIVVLEJOY_RENDER_READINESS_HANDOFF_V1' as const;

export const STORY_BEATS = [
  'HOOK',
  'DISCOVERY',
  'DECISION',
  'ACTION',
  'COMPLICATION',
  'PAYOFF',
  'BUTTON',
] as const;
export type StoryBeatKind = (typeof STORY_BEATS)[number];

export const CAMERA_TEMPLATE_IDS = [
  'TJ_CAM_ESTABLISHING_VERTICAL',
  'TJ_CAM_TWO_SHOT_MEDIUM',
  'TJ_CAM_PIP_MEDIUM',
  'TJ_CAM_GOAT_MEDIUM',
  'TJ_CAM_PIP_CLOSE',
  'TJ_CAM_GOAT_CLOSE',
  'TJ_CAM_STORY_PROP_INSERT',
  'TJ_CAM_SIGN_INSERT',
  'TJ_CAM_REACTION_TWO_SHOT',
  'TJ_CAM_WALK_AND_TALK',
  'TJ_CAM_FOLLOW_ADVENTURE',
  'TJ_CAM_REVEAL',
  'TJ_CAM_OVER_SHOULDER_PIP',
  'TJ_CAM_OVER_SHOULDER_GOAT',
] as const;
export type CameraTemplateId = (typeof CAMERA_TEMPLATE_IDS)[number];

export const RERENDER_STATUSES = [
  'NO_RERENDER_REQUIRED',
  'PREVIEW_RERENDER_REQUIRED',
  'FINAL_RERENDER_REQUIRED',
  'BLOCKED_APPROVAL_STALE',
  'BLOCKED_DEPENDENCY_UNKNOWN',
] as const;
export type RerenderStatus = (typeof RERENDER_STATUSES)[number];

export const TRANSITION_KINDS = [
  'establishing transition',
  'travel montage',
  'map transition',
  'time jump',
  'magical transition',
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const UNRESOLVED = 'UNRESOLVED' as const;

export const PRIMARY_OUTPUT = Object.freeze({
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  fps: 30,
});

export const LOCATION_WORLD_NODES = Object.freeze({
  home_village: 'HOME_NEIGHBORHOOD',
  main_street: 'HOME_NEIGHBORHOOD',
  bakery: 'HOME_NEIGHBORHOOD',
  map_shop: 'HOME_NEIGHBORHOOD',
  forest_exit: 'ENCHANTED_OUTSKIRTS',
  river_road: 'WATERFRONT_DISTRICT',
  amusement_entrance: 'AMUSEMENT_PARK',
} as const);

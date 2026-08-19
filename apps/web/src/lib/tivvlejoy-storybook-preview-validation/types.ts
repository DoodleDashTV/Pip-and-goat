export const PREVIEW_VALIDATION_SCHEMA = 'TIVVLEJOY_STORYBOOK_PREVIEW_VALIDATION_V1' as const;
export const PREVIEW_VALIDATION_SEED = 4170179;
export const PREVIEW_THUMBNAIL = { width: 270, height: 480 } as const;
export const PREVIEW_REVIEW = { width: 540, height: 960 } as const;
export const PREVIEW_FINAL_FORBIDDEN = { width: 1080, height: 1920 } as const;

export const LADDER_STEPS = [
  'SCHEMA',
  'SCENE_PLAN',
  'VIEWPORT_SYNTHETIC',
  'THUMBNAIL_QC',
  'REVIEW_FRAME',
  'VISUAL_SCORING',
  'APPROVAL_RECEIPT',
] as const;
export type LadderStep = (typeof LADDER_STEPS)[number];

export const CONTACT_SHEET_SLOTS = [
  'clean-thumbnail',
  'validation-overlay',
  'day-lighting',
  'evening-lighting',
  'hero',
  'supporting',
  'background',
  'signage-pass',
  'signage-fail',
  'dressing-pass',
  'dressing-fail',
] as const;
export type ContactSheetSlot = (typeof CONTACT_SHEET_SLOTS)[number];

export const RUNPOD_VISUAL_RECEIPT_FIELDS = [
  'schemaVersion',
  'visualApprovalVersion',
  'shotId',
  'shotDependencySha256',
  'score',
  'result',
  'hardBlockers',
] as const;

export const READINESS_COMPAT_BOUNDARY = 'TIVVLEJOY_RENDER_BACKEND_READINESS_V1' as const;

export const ACCEPTED_VISUAL_RESULTS = ['VISUALLY_APPROVED', 'VISUALLY_EXCELLENT'] as const;

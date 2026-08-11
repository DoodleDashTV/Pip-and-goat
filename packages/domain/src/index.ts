import { z } from 'zod';

export const FOUNDING_CODES = {
  PIP: 'CHAR_PIP_001',
  GOAT: 'CHAR_GOAT_001',
} as const;

export const DEFAULT_UNIVERSE_NAME = 'Doodle Dash Universe';
export const DEFAULT_BRAND_NAME = 'Doodle Dash Production';
export const PRODUCT_DISPLAY_NAME = 'Doodle Dash Production';

/** Permanent production philosophy: Blender-first, EEVEE-first, 1080×1920 finals. */
export const ProductionRenderProfiles = [
  'DRAFT_FAST',
  'DRAFT_HD',
  'FINAL_1080P',
  'PREMIUM',
] as const;
export type ProductionRenderProfileCode = (typeof ProductionRenderProfiles)[number];

export const DEFAULT_FINAL_RENDER_PROFILE = 'FINAL_1080P' as const;
export const DEFAULT_DRAFT_RENDER_PROFILE = 'DRAFT_FAST' as const;
export const DEFAULT_FINAL_ENGINE = 'EEVEE' as const;
export const DEFAULT_FINAL_RESOLUTION = '1080x1920' as const;
export const DEFAULT_FINAL_FPS = 30 as const;
export const DEFAULT_AI_VIDEO_ENABLED = false;

export const SEMANTIC_ANIMATION_CODES = [
  'IDLE',
  'WALK',
  'RUN',
  'JUMP',
  'LAND',
  'TURN',
  'WAVE',
  'POINT',
  'NOD',
  'SHAKE_HEAD',
  'LOOK',
  'TALK',
  'LISTEN',
  'THINK',
  'LAUGH',
  'CRY',
  'SURPRISED',
  'SCARED',
  'HAPPY',
  'SAD',
  'EXCITED',
  'PICK_UP',
  'PUT_DOWN',
  'HOLD',
  'PUSH',
  'PULL',
  'SIT',
  'STAND',
  'CELEBRATE',
] as const;

export const PROCEDURAL_CAMERA_CODES = [
  'ESTABLISHING',
  'WIDE',
  'MEDIUM',
  'CLOSE_UP',
  'EXTREME_CLOSE_UP',
  'TWO_SHOT',
  'OVER_SHOULDER',
  'FOLLOW',
  'TRACK',
  'PUSH_IN',
  'PULL_OUT',
  'PAN',
  'TILT',
  'REVEAL',
  'REACTION',
  'LOW_ANGLE',
  'HIGH_ANGLE',
] as const;

export const MODEL_STATUS_FLOW = [
  'MISSING',
  'MODELING',
  'TEXTURING',
  'RIGGING',
  'FACIAL_RIGGING',
  'REVIEW',
  'APPROVED',
  'PRODUCTION_READY',
] as const;

export const REQUIRED_EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'afraid',
  'confused',
  'curious',
  'determined',
  'angry',
  'laughing',
  'worried',
] as const;

export const REQUIRED_VISEMES = [
  'A',
  'E',
  'I',
  'O',
  'U',
  'M_B_P',
  'F_V',
  'L',
  'TH',
  'REST',
] as const;

export const CanonLevelSchema = z.enum(['IMMUTABLE', 'CURRENT', 'HISTORICAL']);
export const CanonSubjectTypeSchema = z.enum([
  'UNIVERSE',
  'CHARACTER',
  'LOCATION',
  'PROP',
  'EPISODE',
  'SEASON',
  'GENERAL',
]);

export const CreateCanonFactSchema = z.object({
  universeId: z.string().uuid(),
  subjectType: CanonSubjectTypeSchema,
  subjectId: z.string().uuid().nullable().optional(),
  category: z.string().min(1),
  statement: z.string().min(1),
  canonLevel: CanonLevelSchema.default('CURRENT'),
  importance: z.number().int().min(0).max(100).default(50),
  locked: z.boolean().default(false),
});

export const CreateAssetSchema = z.object({
  universeId: z.string().uuid().nullable().optional(),
  type: z.string().min(1),
  entityType: z.string().nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  storageLocation: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  hash: z.string().nullable().optional(),
  approved: z.boolean().default(false),
  missing: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

export const PersonalityScoresSchema = z.object({
  friendliness: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  bravery: z.number().int().min(0).max(100),
  curiosity: z.number().int().min(0).max(100),
  patience: z.number().int().min(0).max(100),
  energy: z.number().int().min(0).max(100),
  empathy: z.number().int().min(0).max(100),
  leadership: z.number().int().min(0).max(100),
  independence: z.number().int().min(0).max(100),
  impulsiveness: z.number().int().min(0).max(100),
  humor: z.number().int().min(0).max(100),
});

export type CreateCanonFactInput = z.infer<typeof CreateCanonFactSchema>;
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

export const ProductionModes = [
  'ECONOMY',
  'BALANCED_CINEMATIC',
  'STUDIO',
  'HERO',
] as const;

export const DEFAULT_PRODUCTION_MODE = 'BALANCED_CINEMATIC' as const;

export const RenderModes = [
  'REUSE_EXISTING_RENDER',
  'REUSE_ANIMATION',
  'NATIVE_3D',
  'NATIVE_3D_HIGH',
  'STILL_IMAGE_MOTION',
  'AI_VIDEO_OPTIONAL',
  'COMPOSITE',
] as const;

export const RenderJobStatuses = [
  'QUEUED',
  'PLANNING',
  'PRELIGHT',
  'RENDERING',
  'COMPOSITING',
  'QC',
  'APPROVED',
  'FAILED',
  'CANCELLED',
] as const;

export const AssetRequestStatuses = [
  'REQUESTED',
  'IN_REVIEW',
  'APPROVED',
  'IN_PROGRESS',
  'READY',
  'REJECTED',
  'BLOCKED',
] as const;

export const PublishingStatuses = [
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED',
  'RETRACTED',
] as const;

export const ContinuityReviewStatuses = [
  'PASS',
  'WARN',
  'BLOCK',
] as const;

export const VISUAL_QC_THRESHOLD = 90;
export const DOODLE_GUARDIAN_THRESHOLD = 92;

export const ProductionModeSchema = z.enum(ProductionModes).default(DEFAULT_PRODUCTION_MODE);
export const RenderModeSchema = z.enum(RenderModes);
export const RenderJobStatusSchema = z.enum(RenderJobStatuses);
export const AssetRequestStatusSchema = z.enum(AssetRequestStatuses);
export const PublishingStatusSchema = z.enum(PublishingStatuses);
export const ContinuityReviewStatusSchema = z.enum(ContinuityReviewStatuses);

export type ProductionMode = z.infer<typeof ProductionModeSchema>;
export type RenderMode = z.infer<typeof RenderModeSchema>;
export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;
export type AssetRequestStatus = z.infer<typeof AssetRequestStatusSchema>;
export type PublishingStatus = z.infer<typeof PublishingStatusSchema>;
export type ContinuityReviewStatus = z.infer<typeof ContinuityReviewStatusSchema>;

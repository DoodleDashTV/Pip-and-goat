import { z } from 'zod';

export const FOUNDING_CODES = {
  PIP: 'CHAR_PIP_001',
  GOAT: 'CHAR_GOAT_001',
} as const;

export const DEFAULT_UNIVERSE_NAME = 'Doodle Dash Universe';
export const DEFAULT_BRAND_NAME = 'Doodle Dash TV';

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

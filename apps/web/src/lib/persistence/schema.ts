import { z } from 'zod';
import {
  PREVIEW_CLASSIFICATION,
  PREVIEW_DRAFT_STAGES,
  PREVIEW_WORKSPACE_KIND,
  type PreviewWorkspace,
} from '../preview-workspace/types';
import {
  TIVVLEJOY_BACKUP_KIND,
  TIVVLEJOY_BACKUP_MAX_BYTES,
  TIVVLEJOY_BACKUP_VERSION,
} from './types';

const draftStage = z.enum(PREVIEW_DRAFT_STAGES);

export const previewWorkspaceSchema: z.ZodType<PreviewWorkspace> = z.object({
  kind: z.literal(PREVIEW_WORKSPACE_KIND),
  durable: z.literal(false),
  label: z.literal('Preview workspace — this browser only'),
  settings: z.object({
    projectName: z.string().min(1).max(120),
    format: z.literal('1080x1920'),
    fps: z.literal(30),
    paidResourcesAuthorized: z.literal(false),
    theatricalBindingCompleted: z.literal(false),
  }),
  settingsSaved: z.boolean(),
  episodes: z.array(
    z.object({
      id: z.string().min(1).max(80),
      title: z.string().min(1).max(160),
      episodeNumber: z.number().int().min(1).max(9999),
      durationSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
      premise: z.string().min(1).max(2000),
      classification: z.literal(PREVIEW_CLASSIFICATION),
      createdAt: z.string().min(1).max(80),
      currentStage: draftStage,
      completedStages: z.array(draftStage).max(PREVIEW_DRAFT_STAGES.length),
      submitFingerprint: z.string().min(1).max(400),
    }),
  ).max(20),
  assets: z.array(
    z.object({
      id: z.string().min(1).max(80),
      name: z.string().min(1).max(160),
      type: z.enum(['CHARACTER', 'PROP', 'ENVIRONMENT', 'OTHER']),
      version: z.string().min(1).max(40),
      status: z.literal('REGISTERED_METADATA_ONLY'),
      classification: z.literal(PREVIEW_CLASSIFICATION),
      canonical: z.literal(false),
      notes: z.string().max(2000),
      createdAt: z.string().min(1).max(80),
    }),
  ).max(50),
  voices: z.array(
    z.object({
      id: z.string().min(1).max(80),
      characterLabel: z.string().min(1).max(120),
      displayName: z.string().min(1).max(120),
      notes: z.string().max(2000),
      providerVoiceId: z.null(),
      auditionAvailable: z.literal(false),
      savedAt: z.string().min(1).max(80),
    }),
  ).max(20),
  renderRequests: z.array(
    z.object({
      id: z.string().min(1).max(80),
      episodeId: z.string().min(1).max(80),
      label: z.literal('Draft request — not rendered'),
      status: z.literal('NOT_RENDERED'),
      contactedProvider: z.literal(false),
      outputFile: z.null(),
      progress: z.null(),
      createdAt: z.string().min(1).max(80),
    }),
  ).max(20),
  lastResetAt: z.string().min(1).max(80).nullable(),
});

export const previewBackupSchema = z.object({
  kind: z.literal(TIVVLEJOY_BACKUP_KIND),
  version: z.literal(TIVVLEJOY_BACKUP_VERSION),
  exportedAt: z.string().min(1).max(80),
  workspace: previewWorkspaceSchema,
});

export type PreviewBackup = z.infer<typeof previewBackupSchema>;

export function assertBackupSize(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new Error('Backup file is empty.');
  }
  if (bytes > TIVVLEJOY_BACKUP_MAX_BYTES) {
    throw new Error(`Backup file is too large. Maximum is ${TIVVLEJOY_BACKUP_MAX_BYTES} bytes.`);
  }
}

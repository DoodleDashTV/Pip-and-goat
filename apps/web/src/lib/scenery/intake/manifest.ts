import { z } from 'zod';
import { SceneryError } from '../types';
import { SCENERY_INTAKE_SCHEMA_VERSION } from './config';
import type { ManifestCollectionId, SceneryCollectionId } from './inventory';
import { INSPECTION_STATES } from './pipeline-states';

export const UPLOAD_STATES = [
  'not_started',
  'created',
  'uploading',
  'paused',
  'completed',
  'aborted',
  'failed',
  'already_present',
] as const;

export const VERIFICATION_STATES = [
  'not_verified',
  'awaiting_verification',
  'size_verified',
  'checksum_recorded',
  'independently_verified',
  'failed',
] as const;

export const QUARANTINE_STATES = ['not_quarantined', 'quarantined', 'cleared'] as const;
export { INSPECTION_STATES };
export const BLENDER_COMPAT_STATES = [
  'unknown',
  'compatible',
  'needs_relink',
  'unsupported',
  'incompatible',
] as const;

export const SourceObjectManifestSchema = z.object({
  schemaVersion: z.literal(SCENERY_INTAKE_SCHEMA_VERSION),
  sourceId: z.string().regex(/^SRC_[A-Z0-9_]+$/),
  collectionId: z.enum(['village', 'sky-hdri', 'stylized-forest', 'world-shaders', 'procedural-nature']),
  originalFilename: z.string().min(1),
  normalizedFilename: z.string().min(1),
  storageObjectKey: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string(),
  mimeType: z.string().min(1),
  extension: z.string().min(1),
  uploadState: z.enum(UPLOAD_STATES),
  verificationState: z.enum(VERIFICATION_STATES),
  quarantineState: z.enum(QUARANTINE_STATES),
  inspectionState: z.enum(INSPECTION_STATES),
  blenderCompatibilityState: z.enum(BLENDER_COMPAT_STATES),
  uploaderSession: z.object({
    sessionId: z.string().nullable(),
    createdAt: z.string().datetime(),
    publicPreview: z.boolean(),
  }),
  createdAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable(),
  provenanceLicenseRef: z.string().min(1),
  immutableSourceVersion: z.number().int().positive(),
  signedUrlStored: z.literal(false),
  independentServerSha256: z.enum(['not_attempted', 'unavailable_in_this_environment', 'verified', 'failed']),
  notes: z.array(z.string()),
});

export type SourceObjectManifest = z.infer<typeof SourceObjectManifestSchema>;

export function validateSourceObjectManifest(input: unknown): SourceObjectManifest {
  const parsed = SourceObjectManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid scenery intake manifest. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_MANIFEST',
    );
  }
  if (parsed.data.storageObjectKey.includes('X-Amz-Signature') || parsed.data.notes.some((note) => note.includes('X-Amz-Signature'))) {
    throw new SceneryError('Signed URLs must not be stored on the intake manifest.', 'SIGNED_URL_REFUSED');
  }
  return parsed.data;
}

export function createEmptyManifestRecord(input: {
  sourceId: string;
  collectionId: ManifestCollectionId | SceneryCollectionId;
  originalFilename: string;
  normalizedFilename: string;
  objectKey: string;
  byteSize: number;
  sha256: string;
  mimeType: string;
  extension: string;
  now: string;
  sessionId?: string | null;
}): SourceObjectManifest {
  return validateSourceObjectManifest({
    schemaVersion: SCENERY_INTAKE_SCHEMA_VERSION,
    sourceId: input.sourceId,
    collectionId: input.collectionId,
    originalFilename: input.originalFilename,
    normalizedFilename: input.normalizedFilename,
    storageObjectKey: input.objectKey,
    byteSize: input.byteSize,
    sha256: input.sha256,
    mimeType: input.mimeType,
    extension: input.extension,
    uploadState: 'not_started',
    verificationState: input.sha256 ? 'checksum_recorded' : 'not_verified',
    quarantineState: 'not_quarantined',
    inspectionState: 'not_eligible',
    blenderCompatibilityState: 'unknown',
    uploaderSession: {
      sessionId: input.sessionId ?? null,
      createdAt: input.now,
      publicPreview: false,
    },
    createdAt: input.now,
    verifiedAt: null,
    provenanceLicenseRef: 'LICENSE_PENDING — attach the purchased license before approval',
    immutableSourceVersion: 1,
    signedUrlStored: false,
    independentServerSha256: 'unavailable_in_this_environment',
    notes: [
      'Independent server-side SHA-256 of stored R2 bytes was not completed in this environment.',
      'The record stays awaiting_verification until size and checksum are proven against stored bytes.',
      'Upload does not mean asset approval.',
    ],
  });
}

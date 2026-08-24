import { sha256Canonical } from '@/lib/tivvlejoy-character-rigging-department/hash';
import {
  GOAT_AUTHORED_BLENDER_HINT,
  GOAT_CHARACTER_ID,
  GOAT_SOURCE_FILENAME,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  GOAT_SOURCE_VERSION,
  GOAT_STUDIO_BLENDER,
} from './goat-spec';
import { GOAT_SOURCE_OBJECT_KEY, ZERO_INTAKE_SIDE_EFFECTS } from './types';

export type GoatSourceReceipt = {
  schema: 'TIVVLEJOY_GOAT_SOURCE_RECEIPT_V1';
  characterId: typeof GOAT_CHARACTER_ID;
  sourceFilename: typeof GOAT_SOURCE_FILENAME;
  sourceSha256: string | null;
  sourceSize: number | null;
  storageProvider: 'cloudflare-r2';
  bucketIdentifier: 'configured' | 'unavailable';
  objectKey: typeof GOAT_SOURCE_OBJECT_KEY;
  uploadCompletedAt: string | null;
  hashVerified: boolean;
  zipIntegrityVerified: boolean;
  sourceLocked: boolean;
  sourceVersion: typeof GOAT_SOURCE_VERSION;
  originalBlenderVersion: typeof GOAT_AUTHORED_BLENDER_HINT | null;
  studioBlenderVersion: typeof GOAT_STUDIO_BLENDER;
  workingCopyStatus: 'WORKING_COPY_PENDING' | 'WORKING_COPY_READY' | 'BLOCKED';
  productionStatus: 'LOCKED';
  goatProductionReady: false;
  credentialsIncluded: false;
  receiptSha256: string;
};

export function buildGoatSourceReceipt(input: {
  sourceSha256?: string | null;
  sourceSize?: number | null;
  uploadCompletedAt?: string | null;
  hashVerified: boolean;
  zipIntegrityVerified: boolean;
  sourceLocked: boolean;
  bucketConfigured: boolean;
  workingCopyStatus?: GoatSourceReceipt['workingCopyStatus'];
  originalBlenderVersion?: GoatSourceReceipt['originalBlenderVersion'];
}): GoatSourceReceipt {
  const body = {
    schema: 'TIVVLEJOY_GOAT_SOURCE_RECEIPT_V1' as const,
    characterId: GOAT_CHARACTER_ID,
    sourceFilename: GOAT_SOURCE_FILENAME,
    sourceSha256: input.sourceSha256 ?? null,
    sourceSize: input.sourceSize ?? null,
    storageProvider: 'cloudflare-r2' as const,
    bucketIdentifier: input.bucketConfigured ? ('configured' as const) : ('unavailable' as const),
    objectKey: GOAT_SOURCE_OBJECT_KEY,
    uploadCompletedAt: input.uploadCompletedAt ?? null,
    hashVerified: input.hashVerified,
    zipIntegrityVerified: input.zipIntegrityVerified,
    sourceLocked: input.sourceLocked,
    sourceVersion: GOAT_SOURCE_VERSION,
    originalBlenderVersion: input.originalBlenderVersion ?? GOAT_AUTHORED_BLENDER_HINT,
    studioBlenderVersion: GOAT_STUDIO_BLENDER,
    workingCopyStatus: input.workingCopyStatus ?? ('WORKING_COPY_PENDING' as const),
    productionStatus: 'LOCKED' as const,
    goatProductionReady: false as const,
    credentialsIncluded: false as const,
  };
  return { ...body, receiptSha256: sha256Canonical(body) };
}

export function emptyGoatSourceReceipt(bucketConfigured = false) {
  return buildGoatSourceReceipt({
    sourceSha256: GOAT_SOURCE_SHA256,
    sourceSize: GOAT_SOURCE_SIZE_BYTES,
    hashVerified: false,
    zipIntegrityVerified: false,
    sourceLocked: false,
    bucketConfigured,
    workingCopyStatus: 'WORKING_COPY_PENDING',
  });
}

export function receiptContainsSecrets(receipt: GoatSourceReceipt): boolean {
  const text = JSON.stringify(receipt);
  return /R2_SECRET|OBJECT_STORAGE_SECRET|AKIA|sk-|X-Amz-Signature|Bearer /i.test(text);
}

export { ZERO_INTAKE_SIDE_EFFECTS };

import { planGoatCharacterExecution } from '@/lib/tivvlejoy-character-rigging-department/execution';
import {
  GOAT_CHARACTER_ID,
  GOAT_LOCAL_SOURCE_EXTRACT_DIR,
  GOAT_LOCAL_SOURCE_PATH,
  GOAT_SOURCE_SHA256,
  GOAT_WORKING_CONVERSION_PATH,
} from './goat-spec';
import { goatSourceObjectKey } from './keys';
import { ZERO_INTAKE_SIDE_EFFECTS } from './types';

export type MaterializationPlan = {
  jobKind: 'CHARACTER_SOURCE_MATERIALIZE';
  characterId: typeof GOAT_CHARACTER_ID;
  objectKey: ReturnType<typeof goatSourceObjectKey>;
  expectedSha256: typeof GOAT_SOURCE_SHA256;
  localSourcePath: typeof GOAT_LOCAL_SOURCE_PATH;
  extractDir: typeof GOAT_LOCAL_SOURCE_EXTRACT_DIR;
  workingBlendPath: typeof GOAT_WORKING_CONVERSION_PATH;
  verifyHashAfterDownload: true;
  overwriteSourceForbidden: true;
  modifyOriginalBlendForbidden: true;
  fbxIsEquivalentToBlend: false;
  blenderConversionClaimed: false;
  launched: false;
  paid: false;
  paidAuthorizationRequired: true;
  secureGpuPolicy: 'SECURE_GPU_PRESERVED';
  steps: readonly string[];
  failClosedIf: readonly string[];
  cleanup: readonly string[];
};

export function planGoatSourceMaterialization(): MaterializationPlan {
  return {
    jobKind: 'CHARACTER_SOURCE_MATERIALIZE',
    characterId: GOAT_CHARACTER_ID,
    objectKey: goatSourceObjectKey(),
    expectedSha256: GOAT_SOURCE_SHA256,
    localSourcePath: GOAT_LOCAL_SOURCE_PATH,
    extractDir: GOAT_LOCAL_SOURCE_EXTRACT_DIR,
    workingBlendPath: GOAT_WORKING_CONVERSION_PATH,
    verifyHashAfterDownload: true,
    overwriteSourceForbidden: true,
    modifyOriginalBlendForbidden: true,
    fbxIsEquivalentToBlend: false,
    blenderConversionClaimed: false,
    launched: false,
    paid: false,
    paidAuthorizationRequired: true,
    secureGpuPolicy: 'SECURE_GPU_PRESERVED',
    steps: [
      'Read CHAR_GOAT_001 source receipt',
      'Retrieve private Goat_FINN.zip from R2 server-side',
      'Verify SHA-256 after download',
      'Materialize production-library/characters/goat/SOURCE/Goat_FINN.zip',
      'Extract to an immutable SOURCE directory',
      'Preserve original files',
      'Never modify Goat_FINN.blend',
      'Create WORKING conversion copy only if 4.2.2 can safely open the 4.3 source',
      'Hand off to TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1',
    ],
    failClosedIf: [
      'object missing',
      'authentication unavailable',
      'hash mismatch',
      'ZIP corrupt',
      'required source missing',
      'extraction unsafe',
    ],
    cleanup: ['/tmp/tivvlejoy-character-source', '/tmp/tivvlejoy-character-build'],
  };
}

export function dryRunGoatSourceMaterialization(input?: {
  objectExists?: boolean;
  authAvailable?: boolean;
  downloadedSha256?: string | null;
  zipOk?: boolean;
  requiredFilesPresent?: boolean;
  extractionSafe?: boolean;
  blender42CanOpen43?: boolean | null;
}) {
  const blockers: string[] = [];
  if (input?.objectExists === false) blockers.push('R2_OBJECT_MISSING');
  if (input?.authAvailable === false) blockers.push('R2_AUTH_UNAVAILABLE');
  if (input?.downloadedSha256 && input.downloadedSha256 !== GOAT_SOURCE_SHA256) {
    blockers.push('WORKER_DOWNLOAD_HASH_MISMATCH');
  }
  if (input?.zipOk === false) blockers.push('ZIP_CORRUPT');
  if (input?.requiredFilesPresent === false) blockers.push('MISSING_REQUIRED_FILE');
  if (input?.extractionSafe === false) blockers.push('UNSAFE_EXTRACTION');
  if (input?.blender42CanOpen43 === false) {
    blockers.push('BLENDER_CONVERSION_NOT_VALIDATED');
  }
  if (input?.blender42CanOpen43 == null) {
    blockers.push('BLENDER_CONVERSION_NOT_VALIDATED');
  }
  return {
    ...planGoatSourceMaterialization(),
    ...ZERO_INTAKE_SIDE_EFFECTS,
    status: blockers.length ? ('BLOCKED' as const) : ('PLANNED' as const),
    workingCopyStatus: 'WORKING_COPY_PENDING' as const,
    goatProductionReady: false as const,
    blockers,
    characterBuild: planGoatCharacterExecution({
      workingBlend: GOAT_WORKING_CONVERSION_PATH,
    }),
    nextSafeAction:
      blockers.includes('R2_OBJECT_MISSING') || blockers.includes('R2_AUTH_UNAVAILABLE')
        ? 'Select Goat_FINN.zip and tap Upload Goat Source.'
        : 'Keep SOURCE locked. Do not launch paid GPU. Conversion remains unclaimed until 4.2.2 is validated.',
  };
}

export function refuseSourceOverwrite(existingSha256: string | null, incomingSha256: string) {
  if (existingSha256 && existingSha256 === incomingSha256) {
    return { allowed: false, reused: true, code: 'SOURCE_REUSED' as const };
  }
  if (existingSha256 && existingSha256 !== incomingSha256) {
    return { allowed: false, reused: false, code: 'SOURCE_OVERWRITE_REFUSED' as const };
  }
  return { allowed: true, reused: false, code: 'SOURCE_WRITE_ALLOWED' as const };
}

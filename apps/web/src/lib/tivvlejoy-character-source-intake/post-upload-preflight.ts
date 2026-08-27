import {
  BUILD_STAGES,
  evaluateBlenderCompatibility,
  planGoatCharacterExecution,
  runGoatCharacterBuildPipeline,
} from '@/lib/tivvlejoy-character-rigging-department';
import { GOAT_WORKING_DEPARTMENT_PATH } from '@/lib/tivvlejoy-character-rigging-department/source-intake';
import {
  GOAT_AUTHORED_BLENDER_HINT,
  GOAT_LOCAL_SOURCE_EXTRACT_DIR,
  GOAT_LOCAL_SOURCE_PATH,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  GOAT_STUDIO_BLENDER,
  GOAT_WORKING_CONVERSION_PATH,
} from './goat-spec';
import { goatSourceObjectKey } from './keys';
import { connectReceiptToCharacterPipeline } from './pipeline-bridge';
import type { GoatSourceReceipt } from './receipt';
import { ZERO_INTAKE_SIDE_EFFECTS } from './types';

export const POST_UPLOAD_PREFLIGHT_SCHEMA =
  'TIVVLEJOY_GOAT_POST_UPLOAD_VERIFICATION_AND_REAL_EXECUTION_PREFLIGHT_V1' as const;

export const READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION =
  'READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION' as const;

export const GOAT_FIRST_PAID_EXECUTION = {
  proposedGpu: 'NVIDIA GeForce RTX 4090',
  cloudType: 'SECURE' as const,
  secureGpuPolicy: 'SECURE_GPU_PRESERVED' as const,
  hourlyCapUsd: 0.8,
  historicalSecureHourlyUsd: 0.74,
  estimatedDurationMinutes: { likely: 90, conservativeMax: 180 },
  conservativeMaxCostUsd: 2.4,
  recommendedAuthorizationCeilingUsd: 3,
  defaultStudioSingleJobCapUsd: 2,
  defaultStudioMaxRuntimeMinutes: 180,
  authorizationMustLiftSingleJobCap: true,
  singleLaunch: true,
  startupWatchdogRequired: true,
  cleanupDeleteGuaranteed: true,
  paidMutationTripwire: true,
  launched: false,
  paid: false,
} as const;

export type LiveGoatSourceFacts = {
  objectExists: boolean;
  storedSize: number | null;
  storedSha256?: string | null;
  zipOk?: boolean | null;
  zipMembers?: readonly string[];
  blendHeader?: string | null;
  incompleteMultipartCount?: number;
  orphanGoatMultipartAborted?: number;
};

export function goatSourceIdentityMatches(input: {
  objectExists: boolean;
  storedSize: number | null;
  storedSha256?: string | null;
}): boolean {
  return (
    input.objectExists &&
    input.storedSize === GOAT_SOURCE_SIZE_BYTES &&
    (input.storedSha256 == null || input.storedSha256 === GOAT_SOURCE_SHA256)
  );
}

export function compileGoatWorkingCopyPlan() {
  return {
    sourceZip: GOAT_LOCAL_SOURCE_PATH,
    extractDir: GOAT_LOCAL_SOURCE_EXTRACT_DIR,
    conversionCopy: GOAT_WORKING_CONVERSION_PATH,
    departmentWorkingCopy: GOAT_WORKING_DEPARTMENT_PATH,
    originalBlendOverwriteForbidden: true,
    fbxIsEquivalentToBlend: false,
    blenderConversionClaimed: false,
    productionMasterLocked: true,
    steps: [
      'Materialize the locked R2 ZIP to production-library/characters/goat/SOURCE/Goat_FINN.zip',
      'Verify SHA-256 after download before extraction',
      'Extract immutably into production-library/characters/goat/SOURCE/extracted',
      'Discover Goat_FINN.blend; treat Goat_FINN.fbx as interchange only',
      'Open a WORKING conversion copy in Blender 4.2.2 if the 4.3 source can be opened safely',
      'Save that conversion only as goat_working_4_2_2.blend',
      'Copy the validated conversion to CHAR_GOAT_001_working.blend for the existing department builder',
      'Never overwrite Goat_FINN.blend or the locked ZIP',
    ],
  };
}

export function compileGoatPaidExecutionPreflight() {
  const execution = planGoatCharacterExecution({
    workingBlend: GOAT_WORKING_CONVERSION_PATH,
  });
  return {
    ...GOAT_FIRST_PAID_EXECUTION,
    workerImageConfigured: Boolean(String(process.env.RUNPOD_WORKER_IMAGE ?? '').trim()),
    allowPaidGpuLaunch: false,
    cloudRenderEnabled: false,
    command: execution.blenderCommand.argv,
    workerCommand: execution.workerCommand,
    expectedArtifacts: execution.expectedArtifacts,
    cleanup: execution.payload.cleanup,
    runpodContacted: false,
    gpuLaunched: false,
  };
}

export function compileGoatPostUploadPreflight(input: {
  receipt: GoatSourceReceipt;
  live?: LiveGoatSourceFacts;
}) {
  const live = input.live;
  const identityOk = goatSourceIdentityMatches({
    objectExists: live?.objectExists ?? input.receipt.sourceLocked,
    storedSize: live?.storedSize ?? input.receipt.sourceSize,
    storedSha256: live?.storedSha256 ?? input.receipt.sourceSha256,
  });
  const hashOk =
    input.receipt.hashVerified &&
    input.receipt.sourceSha256 === GOAT_SOURCE_SHA256 &&
    (live?.storedSha256 == null || live.storedSha256 === GOAT_SOURCE_SHA256);
  const zipFailed = live?.zipOk === false;
  const zipOk = live?.zipOk ?? input.receipt.zipIntegrityVerified;
  const blender = evaluateBlenderCompatibility(GOAT_AUTHORED_BLENDER_HINT);
  const pipeline = connectReceiptToCharacterPipeline(input.receipt, { remoteHashLocked: identityOk && hashOk });
  const department = runGoatCharacterBuildPipeline({ remoteHashLocked: identityOk && hashOk });
  const working = compileGoatWorkingCopyPlan();
  const paid = compileGoatPaidExecutionPreflight();
  const blockers: string[] = [];
  if (!identityOk) blockers.push('R2_SOURCE_IDENTITY_MISMATCH');
  if (!input.receipt.sourceLocked) blockers.push('SOURCE_NOT_LOCKED');
  if (!hashOk) blockers.push('SOURCE_HASH_NOT_VERIFIED');
  if (zipFailed) blockers.push('ZIP_INSPECTION_FAILED');
  if ((live?.incompleteMultipartCount ?? 0) > 0) blockers.push('ORPHAN_MULTIPART_REMAINS');
  const status =
    blockers.length === 0
      ? READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION
      : ('FAIL_CLOSED' as const);
  return {
    schema: POST_UPLOAD_PREFLIGHT_SCHEMA,
    status,
    objectKey: goatSourceObjectKey(),
    storedSize: live?.storedSize ?? input.receipt.sourceSize,
    expectedSize: GOAT_SOURCE_SIZE_BYTES,
    expectedSha256: GOAT_SOURCE_SHA256,
    hashVerified: hashOk,
    zipIntegrityVerified: Boolean(zipOk),
    sourceLocked: input.receipt.sourceLocked,
    sourceImmutable: identityOk && input.receipt.sourceLocked,
    receipt: {
      present: true,
      productionStatus: input.receipt.productionStatus,
      workingCopyStatus: input.receipt.workingCopyStatus,
      goatProductionReady: false as const,
    },
    multipart: {
      completed: identityOk,
      incompleteCount: live?.incompleteMultipartCount ?? 0,
      abortedOrphans: live?.orphanGoatMultipartAborted ?? 0,
    },
    blender: {
      authoredHint: GOAT_AUTHORED_BLENDER_HINT,
      studioPin: GOAT_STUDIO_BLENDER,
      headerPeek: live?.blendHeader ?? null,
      compatibility: blender.status,
      conversionClaimed: false,
      silentDowngradeForbidden: true,
    },
    working,
    pipeline,
    departmentStages: department.stages.map((stage) => ({
      stage: stage.stage,
      disposition: stage.disposition,
      status: stage.status,
    })),
    stageCount: BUILD_STAGES.length,
    duplicatePipelineCreated: false,
    paidExecution: paid,
    remainingBlockers: blockers,
    nextAuthorizationAction:
      status === READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION
        ? 'Do not re-upload. Explicitly authorize one SECURE RTX 4090 Goat materialization + department execution with a $3 ceiling.'
        : 'Stay fail-closed. Do not launch a paid GPU.',
    goatProductionReady: false as const,
    productionMutationCount: 0,
    paidGpuLaunchCount: 0,
    ...ZERO_INTAKE_SIDE_EFFECTS,
  };
}

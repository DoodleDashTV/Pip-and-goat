import {
  DEFAULT_CLOUD_COST_LIMITS,
  resolveRunpodWorkerImage,
  validateRunpodWorkerImageRef,
  type WorkerImageValidation,
} from '@doodle-dash/production';
import { BUILD_STAGES, runGoatCharacterBuildPipeline } from '../tivvlejoy-character-rigging-department';
import {
  GOAT_AUTHORED_BLENDER_HINT,
  GOAT_CHARACTER_ID,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  GOAT_STUDIO_BLENDER,
} from './goat-spec';
import { GOAT_FIRST_PAID_EXECUTION } from './post-upload-preflight';
import { GOAT_SOURCE_OBJECT_KEY, ZERO_INTAKE_SIDE_EFFECTS } from './types';

export const GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA =
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1' as const;

export const GOAT_PAID_EXECUTION_LIMITS = {
  characterId: GOAT_CHARACTER_ID,
  sourceObjectKey: GOAT_SOURCE_OBJECT_KEY,
  expectedSha256: GOAT_SOURCE_SHA256,
  expectedSizeBytes: GOAT_SOURCE_SIZE_BYTES,
  gpuTypeId: 'NVIDIA GeForce RTX 4090',
  cloudType: 'SECURE' as const,
  maxRuntimeMinutes: 180,
  maxTotalCostUsd: 3,
  maxLaunches: 1,
  reuploadForbidden: true,
  secondLaunchForbidden: true,
  productionUntouched: true,
  pr99MustRemainDraft: true,
  pr100MustRemainDraft: true,
  elevenLabsContactForbidden: true,
  theatricalGateForbidden: true,
  qualityGatesMustNotBeLowered: true,
} as const;

export const CHECKOUT_STALE_WORKER_DIGEST =
  'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830' as const;

export const KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST =
  'sha256:b53fcbf5fc973ad8e1e5f1e240f58d12885143e11494a3871f579c6fb351faed' as const;

export const KNOWN_CURRENT_TIVVLEJOY_WORKER_SOURCE_COMMIT =
  '1ea2cf58c9cfc015929d0a4ca63446898d59ba79' as const;

export const REQUIRED_GOAT_WORKER_JOB_KINDS = [
  'CHARACTER_SOURCE_MATERIALIZE',
  'CHARACTER_BUILD',
] as const;

export type GoatPaidExecutionBlocker =
  | 'WORKER_IMAGE_MISSING'
  | 'WORKER_IMAGE_NOT_PINNED'
  | 'WORKER_IMAGE_WRONG_JOB_KIND'
  | 'WORKER_IMAGE_CHARACTER_DEPARTMENT_NOT_BAKED'
  | 'WORKER_RENDER_CODE_MISMATCH'
  | 'SECURE_4090_QUOTE_MISSING'
  | 'PREDICTED_COST_EXCEEDS_AUTHORIZATION'
  | 'HOURLY_RATE_EXCEEDS_STUDIO_CAP'
  | 'SOURCE_NOT_LOCKED'
  | 'SOURCE_HASH_NOT_VERIFIED'
  | 'ZIP_INSPECTION_FAILED'
  | 'ORPHAN_MULTIPART_REMAINS'
  | 'PRIOR_LAUNCH_ALREADY_CONSUMED'
  | 'COMMUNITY_CLOUD_REFUSED'
  | 'WRONG_GPU'
  | 'BLENDER_CONVERSION_UNSAFE';

export type GoatWorkerImageResolution = {
  envConfigured: boolean;
  envValidation: WorkerImageValidation;
  checkoutStaleDigest: typeof CHECKOUT_STALE_WORKER_DIGEST;
  checkoutStalePinUsable: false;
  knownCurrentTivvleJoyDigest: typeof KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST;
  knownCurrentSourceCommit: typeof KNOWN_CURRENT_TIVVLEJOY_WORKER_SOURCE_COMMIT;
  knownCurrentReachable: boolean | null;
  knownCurrentJobKind: string;
  knownCurrentHasCharacterDepartment: boolean;
  knownCurrentHasGoatMaterialize: boolean;
  requiredJobKinds: typeof REQUIRED_GOAT_WORKER_JOB_KINDS;
  positivelyResolved: boolean;
  digestUsed: string | null;
  reason: string;
};

export type GoatPaidQuote = {
  gpuTypeId: string;
  cloudType: 'SECURE';
  uninterruptablePriceUsdPerHr: number | null;
  stockStatus: string | null;
  predictedRuntimeMinutes: number;
  predictedTotalUsd: number | null;
  studioHourlyCapUsd: number;
  authorizationCeilingUsd: number;
  withinAuthorization: boolean;
};

export type GoatPaidLiveFacts = {
  sourceLocked?: boolean;
  objectExists?: boolean;
  storedSize?: number | null;
  storedSha256?: string | null;
  hashVerified?: boolean;
  zipOk?: boolean | null;
  zipMembers?: readonly string[];
  incompleteMultipartCount?: number;
  blender42CanOpen43?: boolean | null;
  knownCurrentDigestReachable?: boolean | null;
  knownCurrentImageJobKind?: string | null;
  knownCurrentImageHasCharacterDepartment?: boolean | null;
  knownCurrentImageHasGoatMaterialize?: boolean | null;
  secure4090PriceUsdPerHr?: number | null;
  secure4090StockStatus?: string | null;
  existingBillablePodCount?: number;
  priorAuthorizedLaunchCount?: number;
  requestedGpu?: string;
  requestedCloudType?: 'SECURE' | 'COMMUNITY';
};

function predictedCostUsd(hourlyRate: number, minutes: number): number {
  return Number(((hourlyRate * minutes) / 60).toFixed(4));
}

export function resolveGoatWorkerImageForPaidExecution(
  env: Record<string, string | undefined> = process.env,
  live: GoatPaidLiveFacts = {},
): GoatWorkerImageResolution {
  const envRef = resolveRunpodWorkerImage(env);
  const envValidation = validateRunpodWorkerImageRef(envRef);
  const knownCurrentHasCharacterDepartment = live.knownCurrentImageHasCharacterDepartment === true;
  const knownCurrentHasGoatMaterialize = live.knownCurrentImageHasGoatMaterialize === true;
  const knownCurrentJobKind = live.knownCurrentImageJobKind ?? 'FINAL_1080P_RENDER';
  const characterCapable =
    envValidation.ok &&
    knownCurrentHasCharacterDepartment &&
    knownCurrentHasGoatMaterialize &&
    REQUIRED_GOAT_WORKER_JOB_KINDS.every((kind) => knownCurrentJobKind.includes(kind));
  let reason = envValidation.reason;
  if (!envValidation.ok) {
    reason =
      'RUNPOD_WORKER_IMAGE is not a positively resolved immutable ghcr.io @sha256 pin in this environment. The checkout 1080p pin is stale and must not be substituted. Do not launch.';
  } else if (!characterCapable) {
    reason =
      'The digest-pinned worker is a FINAL_1080P render image. It does not bake CHARACTER_SOURCE_MATERIALIZE or the 26-stage character department. Rebuilding or inventing an image is not authorized. Do not launch.';
  }
  return {
    envConfigured: Boolean(envRef),
    envValidation,
    checkoutStaleDigest: CHECKOUT_STALE_WORKER_DIGEST,
    checkoutStalePinUsable: false,
    knownCurrentTivvleJoyDigest: KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST,
    knownCurrentSourceCommit: KNOWN_CURRENT_TIVVLEJOY_WORKER_SOURCE_COMMIT,
    knownCurrentReachable: live.knownCurrentDigestReachable ?? null,
    knownCurrentJobKind,
    knownCurrentHasCharacterDepartment,
    knownCurrentHasGoatMaterialize,
    requiredJobKinds: REQUIRED_GOAT_WORKER_JOB_KINDS,
    positivelyResolved: characterCapable,
    digestUsed: characterCapable ? envValidation.digest : null,
    reason,
  };
}

export function evaluateGoatPaidQuote(live: GoatPaidLiveFacts = {}): GoatPaidQuote {
  const rate = live.secure4090PriceUsdPerHr ?? null;
  const predicted =
    rate == null ? null : predictedCostUsd(rate, GOAT_PAID_EXECUTION_LIMITS.maxRuntimeMinutes);
  const withinAuthorization =
    rate != null &&
    rate > 0 &&
    rate <= DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice &&
    predicted != null &&
    predicted <= GOAT_PAID_EXECUTION_LIMITS.maxTotalCostUsd;
  return {
    gpuTypeId: GOAT_PAID_EXECUTION_LIMITS.gpuTypeId,
    cloudType: 'SECURE',
    uninterruptablePriceUsdPerHr: rate,
    stockStatus: live.secure4090StockStatus ?? null,
    predictedRuntimeMinutes: GOAT_PAID_EXECUTION_LIMITS.maxRuntimeMinutes,
    predictedTotalUsd: predicted,
    studioHourlyCapUsd: DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice,
    authorizationCeilingUsd: GOAT_PAID_EXECUTION_LIMITS.maxTotalCostUsd,
    withinAuthorization,
  };
}

export function evaluateGoatPaidExecutionAuthorization(input?: {
  env?: Record<string, string | undefined>;
  live?: GoatPaidLiveFacts;
  authorizationPresent?: boolean;
}) {
  const env = input?.env ?? process.env;
  const live = input?.live ?? {};
  const authorizationPresent = input?.authorizationPresent !== false;
  const worker = resolveGoatWorkerImageForPaidExecution(env, live);
  const quote = evaluateGoatPaidQuote(live);
  const launchCount = live.priorAuthorizedLaunchCount ?? 0;
  const requestedGpu = live.requestedGpu ?? GOAT_PAID_EXECUTION_LIMITS.gpuTypeId;
  const requestedCloud = live.requestedCloudType ?? GOAT_PAID_EXECUTION_LIMITS.cloudType;
  const sourceLocked = live.sourceLocked === true && live.objectExists === true;
  const hashOk =
    live.hashVerified === true &&
    (live.storedSha256 == null || live.storedSha256 === GOAT_SOURCE_SHA256) &&
    (live.storedSize == null || live.storedSize === GOAT_SOURCE_SIZE_BYTES);
  const department = runGoatCharacterBuildPipeline({
    remoteHashLocked: sourceLocked && hashOk,
  });
  const blockers: GoatPaidExecutionBlocker[] = [];
  if (!worker.positivelyResolved) {
    if (!worker.envValidation.ok) {
      blockers.push(
        worker.envValidation.code === 'WORKER_IMAGE_MISSING'
          ? 'WORKER_IMAGE_MISSING'
          : 'WORKER_IMAGE_NOT_PINNED',
      );
    }
    if (worker.envValidation.ok || worker.knownCurrentReachable) {
      blockers.push('WORKER_IMAGE_WRONG_JOB_KIND');
      blockers.push('WORKER_IMAGE_CHARACTER_DEPARTMENT_NOT_BAKED');
    }
    if (worker.envValidation.digest === CHECKOUT_STALE_WORKER_DIGEST) {
      blockers.push('WORKER_RENDER_CODE_MISMATCH');
    }
  }
  if (quote.uninterruptablePriceUsdPerHr == null) blockers.push('SECURE_4090_QUOTE_MISSING');
  if (
    quote.uninterruptablePriceUsdPerHr != null &&
    quote.uninterruptablePriceUsdPerHr > quote.studioHourlyCapUsd
  ) {
    blockers.push('HOURLY_RATE_EXCEEDS_STUDIO_CAP');
  }
  if (
    quote.predictedTotalUsd != null &&
    quote.predictedTotalUsd > GOAT_PAID_EXECUTION_LIMITS.maxTotalCostUsd
  ) {
    blockers.push('PREDICTED_COST_EXCEEDS_AUTHORIZATION');
  }
  if (!sourceLocked) blockers.push('SOURCE_NOT_LOCKED');
  if (!hashOk) blockers.push('SOURCE_HASH_NOT_VERIFIED');
  if (live.zipOk === false) blockers.push('ZIP_INSPECTION_FAILED');
  if ((live.incompleteMultipartCount ?? 0) > 0) blockers.push('ORPHAN_MULTIPART_REMAINS');
  if (launchCount >= GOAT_PAID_EXECUTION_LIMITS.maxLaunches) {
    blockers.push('PRIOR_LAUNCH_ALREADY_CONSUMED');
  }
  if (requestedCloud !== 'SECURE') blockers.push('COMMUNITY_CLOUD_REFUSED');
  if (requestedGpu !== GOAT_PAID_EXECUTION_LIMITS.gpuTypeId) blockers.push('WRONG_GPU');
  if (live.blender42CanOpen43 === false) blockers.push('BLENDER_CONVERSION_UNSAFE');

  const uniqueBlockers = [...new Set(blockers)];
  const launchAllowed = authorizationPresent && uniqueBlockers.length === 0 && worker.positivelyResolved;
  return {
    schema: GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA,
    status: launchAllowed ? ('LAUNCH_AUTHORIZED' as const) : ('FAIL_CLOSED_DO_NOT_LAUNCH' as const),
    authorizationPresent,
    limits: GOAT_PAID_EXECUTION_LIMITS,
    protections: {
      singleLaunch: true,
      startupWatchdogRequired: true,
      cleanupDeleteGuaranteed: true,
      paidMutationTripwire: true,
      allowPaidGpuLaunchEnv: env.ALLOW_PAID_GPU_LAUNCH === 'true',
      cloudRenderEnabledEnv: env.CLOUD_RENDER_ENABLED === 'true',
      inProcessFlagLiftOnlyIfLaunchAllowed: true,
    },
    worker,
    quote,
    source: {
      objectKey: GOAT_SOURCE_OBJECT_KEY,
      locked: sourceLocked,
      hashVerified: hashOk,
      storedSize: live.storedSize ?? null,
      storedSha256: live.storedSha256 ?? null,
      zipOk: live.zipOk ?? null,
      zipMembers: live.zipMembers ?? [],
      incompleteMultipartCount: live.incompleteMultipartCount ?? 0,
    },
    blender: {
      authoredHint: GOAT_AUTHORED_BLENDER_HINT,
      studioPin: GOAT_STUDIO_BLENDER,
      conversionClaimed: false,
      safeOpenValidated: live.blender42CanOpen43 === true,
      status:
        live.blender42CanOpen43 === false
          ? ('UNSAFE' as const)
          : live.blender42CanOpen43 === true
            ? ('SAFE' as const)
            : ('UNTESTED_NO_WORKER' as const),
    },
    department: {
      schema: 'TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1',
      stageCount: BUILD_STAGES.length,
      duplicatePipelineCreated: false,
      stages: department.stages.map((stage) => ({
        stage: stage.stage,
        disposition: stage.disposition,
        status: stage.status,
      })),
    },
    launch: {
      allowed: launchAllowed,
      launched: false,
      paid: false,
      launchCount: 0,
      gpuLaunched: false,
      podId: null,
      existingBillablePodCount: live.existingBillablePodCount ?? 0,
    },
    remainingBlockers: uniqueBlockers,
    goatProductionReady: false as const,
    productionMutationCount: 0,
    nextStep: launchAllowed
      ? 'Launch exactly one SECURE RTX 4090 pod on the positively resolved character-capable worker.'
      : 'Do not launch. Rebuild and digest-pin a TivvleJoy worker that bakes Goat materialize plus the existing 26-stage department, then issue a new explicit authorization.',
    ...ZERO_INTAKE_SIDE_EFFECTS,
    ...GOAT_FIRST_PAID_EXECUTION,
    launched: false,
    paid: false,
  };
}

export function compileGoatPaidExecutionFinalReport(input: {
  startingBranch: string;
  startingSha: string;
  authorization: ReturnType<typeof evaluateGoatPaidExecutionAuthorization>;
  live?: GoatPaidLiveFacts & {
    zipCode?: string | null;
    workingCopyCreated?: boolean;
    visualArtifacts?: readonly string[];
    actualRuntimeMinutes?: number;
    actualCostUsd?: number;
    podsRemaining?: number;
    remainingDefects?: readonly string[];
  };
}) {
  const auth = input.authorization;
  const live = input.live ?? {};
  const untested = 'NOT_EXECUTED — paid launch refused by fail-closed preflight';
  return {
    schema: GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA,
    startingBranch: input.startingBranch,
    startingSha: input.startingSha,
    workerImageDigestUsed: auth.worker.digestUsed,
    workerImageResolution: auth.worker,
    gpuActuallyUsed: null,
    secureStatus: 'NOT_LAUNCHED',
    exactLaunchCount: 0,
    materializationResult: 'NOT_STARTED',
    postDownloadShaResult: live.storedSha256
      ? live.storedSha256 === GOAT_SOURCE_SHA256
        ? 'R2_PREFLIGHT_HASH_MATCH'
        : 'R2_PREFLIGHT_HASH_MISMATCH'
      : 'NOT_DOWNLOADED_NO_WORKER',
    zipValidationResult: live.zipCode ?? (live.zipOk === true ? 'ZIP_SAFE' : 'NOT_REVALIDATED_ON_WORKER'),
    blenderCompatibilityResult: auth.blender.status,
    workingCopyResult: live.workingCopyCreated ? 'CREATED' : 'NOT_CREATED',
    sourceTopologyUvMaterialAudit: untested,
    skeletonResult: untested,
    controlRigResult: untested,
    ikFkResult: untested,
    skinningResult: untested,
    weightRefinementResult: untested,
    facialRigResult: untested,
    visemeResult: untested,
    secondaryControlResult: untested,
    correctiveDeformationResult: untested,
    deformationTestResult: untested,
    animationValidationResult: untested,
    performanceResult: untested,
    renderQaResult: untested,
    exportQaResult: untested,
    characterMasterGateResult: 'BLOCKED',
    goatProductionReady: false,
    visualArtifactsProduced: live.visualArtifacts ?? [],
    actualRuntimeMinutes: live.actualRuntimeMinutes ?? 0,
    actualCostUsd: live.actualCostUsd ?? 0,
    podCleanupVerification: {
      launched: false,
      podsRemaining: live.podsRemaining ?? live.existingBillablePodCount ?? 0,
      orphanPod: (live.podsRemaining ?? live.existingBillablePodCount ?? 0) > 0,
    },
    remainingDefects: live.remainingDefects ?? auth.remainingBlockers,
    exactNextStep: auth.nextStep,
    authorizationStatus: auth.status,
  };
}

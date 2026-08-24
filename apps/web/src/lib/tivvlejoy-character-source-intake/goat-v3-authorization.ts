import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateRunpodWorkerImageRef } from '@doodle-dash/production';
import { BUILD_STAGES } from '../tivvlejoy-character-rigging-department';
import { GOAT_CHARACTER_ID, GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { GOAT_SOURCE_OBJECT_KEY } from './types';
import {
  REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS,
  REQUIRED_LIVE_CAPABILITY_SCHEMA,
  readCharacterWorkerPin,
} from './character-worker-pin-record';
import { resolveLiveCharacterWorkerImage } from './character-worker-pin';
import {
  GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
  GOAT_PAID_EXECUTION_LIMITS,
  INVALID_GOAT_PAID_AUTHORIZATIONS,
  REJECTED_GOAT_LIVE_WORKER_DIGEST,
  evaluateGoatPaidQuote,
  resolveGoatWorkerImageForPaidExecution,
  type GoatPaidLiveFacts,
} from './paid-execution-authorization';

export const GOAT_V3_REQUIRED_DIGEST =
  'sha256:1e29b0bac9a1af63137ca1c12d60c1819267d9990c029b1cc6867bc0639fe5f9' as const;
export const GOAT_V3_REQUIRED_SOURCE_COMMIT = '08d6fa5e664fcfb620ad219bf0b3271ebc3bbcd4' as const;
export const GOAT_V3_REQUIRED_RENDER_CODE_SHA256 =
  '541aa82ab6dbd929be28b99e2e99b7914370b3c7cfde3b748452365cf22845a9' as const;
export const GOAT_V3_REQUIRED_RENDER_ASSET_SHA256 =
  '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7' as const;
export const GOAT_V3_HARD_COST_USD = 5 as const;
export const GOAT_V3_MAX_CREATE_REQUESTS = 1 as const;
export const GOAT_V3_MAX_PODS = 1 as const;
export const GOAT_V3_PLANNED_POD_NAME = 'tivvlejoy-goat-v3-1e29b0ba' as const;
export const GOAT_V3_CONSUMPTION_LEDGER_REL =
  'artifacts/tivvlejoy-goat-paid-execution-v3/consumption-ledger.json' as const;

const IMAGE_MASTER_REL = 'workers/runpod-blender/src/character-master.js';
const IMAGE_MATERIALIZE_REL = 'workers/runpod-blender/src/character-source-materialize.js';

export const GOAT_V3_PAID_EXECUTION_LIMITS = {
  ...GOAT_PAID_EXECUTION_LIMITS,
  maxTotalCostUsd: GOAT_V3_HARD_COST_USD,
  maxLaunches: GOAT_V3_MAX_CREATE_REQUESTS,
  authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
  requiredDigest: GOAT_V3_REQUIRED_DIGEST,
  requiredSourceCommit: GOAT_V3_REQUIRED_SOURCE_COMMIT,
  requiredCapabilitySchema: REQUIRED_LIVE_CAPABILITY_SCHEMA,
  humanVisualApprovalRequired: true,
  productionPromotionForbidden: true,
  noCreateRetry: true,
  mandatoryCleanup: true,
  secureCloudOnly: true,
} as const;

export type GoatV3Blocker =
  | 'V3_DIGEST_MISMATCH'
  | 'V3_SOURCE_COMMIT_MISMATCH'
  | 'V3_PIN_MISSING'
  | 'V3_MUTABLE_IMAGE_REF'
  | 'REJECTED_LIVE_EXECUTION_DIGEST'
  | 'WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE'
  | 'WORKER_NOT_LIVE_CHARACTER_CAPABLE'
  | 'AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD'
  | 'INVALID_SUPERSEDED_AUTHORIZATION'
  | 'LIVE_AUTHORIZATION_V3_REQUIRED'
  | 'SOURCE_NOT_LOCKED'
  | 'SOURCE_HASH_NOT_VERIFIED'
  | 'ZIP_INSPECTION_FAILED'
  | 'SECURE_4090_QUOTE_MISSING'
  | 'PREDICTED_COST_EXCEEDS_AUTHORIZATION'
  | 'HOURLY_RATE_EXCEEDS_STUDIO_CAP'
  | 'COMMUNITY_CLOUD_REFUSED'
  | 'WRONG_GPU'
  | 'PRIOR_LAUNCH_ALREADY_CONSUMED'
  | 'V3_ALREADY_CONSUMED'
  | 'WORKER_IMAGE_MISSING'
  | 'WORKER_IMAGE_NOT_PINNED'
  | 'WORKER_IMAGE_WRONG_JOB_KIND'
  | 'WORKER_IMAGE_CHARACTER_DEPARTMENT_NOT_BAKED';

export function resolveGoatV3RepoRoot(start = process.cwd()): string {
  const candidates = [
    start,
    path.resolve(start, '..'),
    path.resolve(start, '../..'),
    path.resolve(__dirname, '../../../..'),
    path.resolve(__dirname, '../../../../../'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, IMAGE_MASTER_REL))) return candidate;
  }
  return start;
}

export function redactGoatV3ImageRef(ref: string): string {
  return ref.replace(/^ghcr\.io\/[^/]+\//, 'ghcr.io/<org>/');
}

function readWorkerFile(repoRoot: string, relativePath: string): string {
  const file = path.join(repoRoot, relativePath);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function readWorkerFileAtCommit(repoRoot: string, commit: string, relativePath: string): string {
  try {
    return execFileSync('git', ['show', `${commit}:${relativePath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 4_000_000,
    });
  } catch {
    return '';
  }
}

function downloadInvocationFacts(source: string): {
  downloadFunctionBaked: boolean;
  invokesDownload: boolean;
  materializeAlwaysForbidsNetwork: boolean;
} {
  return {
    downloadFunctionBaked: source.includes('async function downloadAuthorizedGoatSource'),
    invokesDownload: /downloadAuthorizedGoatSource\s*\(/.test(source),
    materializeAlwaysForbidsNetwork:
      source.includes('This repair task forbids performing the real Goat network download') &&
      source.includes('Authorization gate passed in evaluation only'),
  };
}

export function resolvePinnedV3ImageRef(repoRoot = process.cwd()): {
  ok: boolean;
  ref: string;
  digest: string | null;
  sourceCommit: string | null;
  containsLiteralOrgPlaceholder: boolean;
  validation: ReturnType<typeof validateRunpodWorkerImageRef>;
  forbidden: boolean;
} {
  const root = resolveGoatV3RepoRoot(repoRoot);
  const pin = readCharacterWorkerPin(root);
  const ref = pin.ref || '';
  const validation = validateRunpodWorkerImageRef(ref);
  const digest = validation.digest || pin.digest;
  return {
    ok:
      validation.ok &&
      digest === GOAT_V3_REQUIRED_DIGEST &&
      pin.sourceCommit === GOAT_V3_REQUIRED_SOURCE_COMMIT &&
      !ref.includes('<org>') &&
      !ref.includes('<ghcr-owner>'),
    ref,
    digest,
    sourceCommit: pin.sourceCommit,
    containsLiteralOrgPlaceholder: ref.includes('<org>') || ref.includes('<ghcr-owner>'),
    validation,
    forbidden: Boolean(digest && (REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS as readonly string[]).includes(digest)),
  };
}

export function provePinnedImageCannotInvokeRealDownload(repoRoot = process.cwd()): {
  ok: false;
  code: 'AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD';
  reason: string;
  downloadFunctionBaked: boolean;
  characterMasterInvokesDownload: boolean;
  workingTreeInvokesDownload: boolean;
  materializeAlwaysForbidsNetwork: boolean;
  imageSourceCommit: typeof GOAT_V3_REQUIRED_SOURCE_COMMIT;
  imageSourceCommitProven: boolean;
} {
  const root = resolveGoatV3RepoRoot(repoRoot);
  const imageMaster = readWorkerFileAtCommit(root, GOAT_V3_REQUIRED_SOURCE_COMMIT, IMAGE_MASTER_REL);
  const imageMaterialize = readWorkerFileAtCommit(root, GOAT_V3_REQUIRED_SOURCE_COMMIT, IMAGE_MATERIALIZE_REL);
  const workingMaster = readWorkerFile(root, IMAGE_MASTER_REL);
  const workingMaterialize = readWorkerFile(root, IMAGE_MATERIALIZE_REL);
  const imageFacts = {
    master: downloadInvocationFacts(imageMaster),
    materialize: downloadInvocationFacts(imageMaterialize),
  };
  const workingFacts = {
    master: downloadInvocationFacts(workingMaster),
    materialize: downloadInvocationFacts(workingMaterialize),
  };
  const imageSourceCommitProven = Boolean(imageMaster && imageMaterialize);
  const imageCannotInvoke =
    imageSourceCommitProven &&
    (imageFacts.materialize.materializeAlwaysForbidsNetwork || !imageFacts.master.invokesDownload);
  const workingCannotInvoke =
    workingFacts.materialize.materializeAlwaysForbidsNetwork || !workingFacts.master.invokesDownload;
  return {
    ok: false,
    code: 'AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD',
    reason:
      'The authorized 08d6fa5 / 1e29b0ba image bakes downloadAuthorizedGoatSource, but CHARACTER_MASTER_BUILD calls materializeGoatSource, which never performs the network download. Rebuilding is forbidden for this authorization. Stop before CREATE.',
    downloadFunctionBaked:
      imageFacts.materialize.downloadFunctionBaked || workingFacts.materialize.downloadFunctionBaked,
    characterMasterInvokesDownload: imageFacts.master.invokesDownload,
    workingTreeInvokesDownload: workingFacts.master.invokesDownload,
    materializeAlwaysForbidsNetwork:
      imageCannotInvoke || imageFacts.materialize.materializeAlwaysForbidsNetwork,
    imageSourceCommit: GOAT_V3_REQUIRED_SOURCE_COMMIT,
    imageSourceCommitProven,
  };
}

export class GoatV3PaidMutationTripwire {
  private createRequests = 0;

  get createRequestCount(): number {
    return this.createRequests;
  }

  authorizeSingleCreate(input: { launchAllowed: boolean; consumed: boolean }): {
    allowed: true;
    createRequestOrdinal: number;
  } {
    if (!input.launchAllowed) {
      throw new Error('CREATE_REFUSED_PREFLIGHT');
    }
    if (!input.consumed) {
      throw new Error('CREATE_REFUSED_UNCONSUMED');
    }
    if (this.createRequests >= GOAT_V3_MAX_CREATE_REQUESTS) {
      throw new Error('CREATE_RETRY_FORBIDDEN');
    }
    this.createRequests += 1;
    return { allowed: true, createRequestOrdinal: this.createRequests };
  }
}

export type GoatV3ConsumptionLedger = {
  schema: typeof GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3;
  consumed: boolean;
  createAttempted: boolean;
  plannedPodName: string;
  digest: typeof GOAT_V3_REQUIRED_DIGEST;
  consumedAt: string | null;
};

export function readGoatV3ConsumptionLedger(repoRoot = process.cwd()): GoatV3ConsumptionLedger {
  const root = resolveGoatV3RepoRoot(repoRoot);
  const file = path.join(root, GOAT_V3_CONSUMPTION_LEDGER_REL);
  if (!existsSync(file)) {
    return {
      schema: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
      consumed: false,
      createAttempted: false,
      plannedPodName: GOAT_V3_PLANNED_POD_NAME,
      digest: GOAT_V3_REQUIRED_DIGEST,
      consumedAt: null,
    };
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as GoatV3ConsumptionLedger;
  } catch {
    return {
      schema: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
      consumed: false,
      createAttempted: false,
      plannedPodName: GOAT_V3_PLANNED_POD_NAME,
      digest: GOAT_V3_REQUIRED_DIGEST,
      consumedAt: null,
    };
  }
}

export function consumeGoatV3Authorization(
  ledgerDir: string,
  plannedPodName = GOAT_V3_PLANNED_POD_NAME,
): { ok: boolean; code: 'CONSUMED' | 'V3_ALREADY_CONSUMED'; ledger: GoatV3ConsumptionLedger } {
  mkdirSync(ledgerDir, { recursive: true });
  const file = path.join(ledgerDir, 'consumption-ledger.json');
  if (existsSync(file)) {
    try {
      const existing = JSON.parse(readFileSync(file, 'utf8')) as GoatV3ConsumptionLedger;
      if (existing.consumed) {
        return { ok: false, code: 'V3_ALREADY_CONSUMED', ledger: existing };
      }
    } catch {
      /* rewrite a durable record below */
    }
  }
  const ledger: GoatV3ConsumptionLedger = {
    schema: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
    consumed: true,
    createAttempted: true,
    plannedPodName,
    digest: GOAT_V3_REQUIRED_DIGEST,
    consumedAt: new Date().toISOString(),
  };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, file);
  return { ok: true, code: 'CONSUMED', ledger };
}

export function evaluateGoatV3PaidExecutionAuthorization(input?: {
  env?: Record<string, string | undefined>;
  live?: GoatPaidLiveFacts;
  repoRoot?: string;
  consumed?: boolean;
}) {
  const env = input?.env ?? process.env;
  const live = input?.live ?? {};
  const repoRoot = resolveGoatV3RepoRoot(input?.repoRoot ?? process.cwd());
  const pin = resolvePinnedV3ImageRef(repoRoot);
  const envWithPin = {
    ...env,
    RUNPOD_WORKER_IMAGE: env.RUNPOD_WORKER_IMAGE || pin.ref,
  };
  const worker = resolveGoatWorkerImageForPaidExecution(envWithPin, {
    ...live,
    knownCurrentImageJobKind:
      live.knownCurrentImageJobKind ?? 'CHARACTER_MASTER_BUILD CHARACTER_SOURCE_MATERIALIZE CHARACTER_BUILD',
    knownCurrentImageHasCharacterDepartment: live.knownCurrentImageHasCharacterDepartment ?? true,
    knownCurrentImageHasGoatMaterialize: live.knownCurrentImageHasGoatMaterialize ?? true,
  });
  const quote = evaluateGoatPaidQuote({
    ...live,
  });
  const v3QuoteWithin = quote.predictedTotalUsd != null && quote.predictedTotalUsd <= GOAT_V3_HARD_COST_USD;
  const liveResolved = resolveLiveCharacterWorkerImage(envWithPin, {
    schema: live.capabilitySchema ?? REQUIRED_LIVE_CAPABILITY_SCHEMA,
    liveCharacterDepartmentCapable: live.liveCharacterDepartmentCapable === true,
    mandatoryDryRun: live.mandatoryDryRun === true,
  });
  const downloadProof = provePinnedImageCannotInvokeRealDownload(repoRoot);
  const blockers: GoatV3Blocker[] = [];
  if (!pin.ok || pin.containsLiteralOrgPlaceholder) blockers.push('V3_PIN_MISSING');
  if (pin.digest !== GOAT_V3_REQUIRED_DIGEST) blockers.push('V3_DIGEST_MISMATCH');
  if (pin.sourceCommit !== GOAT_V3_REQUIRED_SOURCE_COMMIT) blockers.push('V3_SOURCE_COMMIT_MISMATCH');
  if (pin.forbidden || pin.digest === REJECTED_GOAT_LIVE_WORKER_DIGEST) {
    blockers.push('REJECTED_LIVE_EXECUTION_DIGEST');
  }
  if (!pin.validation.ok) {
    blockers.push(pin.validation.code === 'WORKER_IMAGE_MISSING' ? 'WORKER_IMAGE_MISSING' : 'WORKER_IMAGE_NOT_PINNED');
  }
  if (pin.ref.includes(':latest') || /:[0-9a-f]{7,40}$/.test(pin.ref.split('@')[0] || '')) {
    blockers.push('V3_MUTABLE_IMAGE_REF');
  }
  if (!worker.positivelyResolved) {
    if (!worker.envValidation.ok) {
      blockers.push(
        worker.envValidation.code === 'WORKER_IMAGE_MISSING' ? 'WORKER_IMAGE_MISSING' : 'WORKER_IMAGE_NOT_PINNED',
      );
    } else {
      blockers.push('WORKER_IMAGE_WRONG_JOB_KIND');
      blockers.push('WORKER_IMAGE_CHARACTER_DEPARTMENT_NOT_BAKED');
    }
  }
  if (!liveResolved.ok) {
    blockers.push(
      liveResolved.code === 'REJECTED_LIVE_EXECUTION_DIGEST'
        ? 'REJECTED_LIVE_EXECUTION_DIGEST'
        : 'WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE',
    );
  }
  if (live.liveCharacterDepartmentCapable !== true || live.mandatoryDryRun === true) {
    blockers.push('WORKER_NOT_LIVE_CHARACTER_CAPABLE');
  }
  if (
    !downloadProof.characterMasterInvokesDownload ||
    downloadProof.materializeAlwaysForbidsNetwork ||
    downloadProof.code === 'AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD'
  ) {
    blockers.push('AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD');
  }
  const authorizationName = live.authorizationName ?? GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3;
  if ((INVALID_GOAT_PAID_AUTHORIZATIONS as readonly string[]).includes(authorizationName)) {
    blockers.push('INVALID_SUPERSEDED_AUTHORIZATION');
  }
  if (authorizationName !== GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3) {
    blockers.push('LIVE_AUTHORIZATION_V3_REQUIRED');
  }
  if (live.sourceLocked !== true || live.objectExists !== true) blockers.push('SOURCE_NOT_LOCKED');
  if (live.hashVerified !== true) blockers.push('SOURCE_HASH_NOT_VERIFIED');
  if (live.zipOk === false) blockers.push('ZIP_INSPECTION_FAILED');
  if (quote.uninterruptablePriceUsdPerHr == null) blockers.push('SECURE_4090_QUOTE_MISSING');
  if (quote.uninterruptablePriceUsdPerHr != null && quote.uninterruptablePriceUsdPerHr > quote.studioHourlyCapUsd) {
    blockers.push('HOURLY_RATE_EXCEEDS_STUDIO_CAP');
  }
  if (quote.predictedTotalUsd != null && !v3QuoteWithin) blockers.push('PREDICTED_COST_EXCEEDS_AUTHORIZATION');
  if ((live.requestedCloudType ?? 'SECURE') !== 'SECURE') blockers.push('COMMUNITY_CLOUD_REFUSED');
  if ((live.requestedGpu ?? GOAT_PAID_EXECUTION_LIMITS.gpuTypeId) !== GOAT_PAID_EXECUTION_LIMITS.gpuTypeId) {
    blockers.push('WRONG_GPU');
  }
  if ((live.priorAuthorizedLaunchCount ?? 0) >= GOAT_V3_MAX_CREATE_REQUESTS) {
    blockers.push('PRIOR_LAUNCH_ALREADY_CONSUMED');
  }
  if (input?.consumed === true) blockers.push('V3_ALREADY_CONSUMED');

  const unique = [...new Set(blockers)];
  return {
    schema: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
    status: unique.length === 0 ? ('LAUNCH_AUTHORIZED' as const) : ('FAIL_CLOSED_DO_NOT_LAUNCH' as const),
    bindings: {
      authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
      characterId: GOAT_CHARACTER_ID,
      sourceKey: GOAT_SOURCE_OBJECT_KEY,
      expectedSha256: GOAT_SOURCE_SHA256,
      expectedSizeBytes: GOAT_SOURCE_SIZE_BYTES,
      digest: GOAT_V3_REQUIRED_DIGEST,
      sourceCommit: GOAT_V3_REQUIRED_SOURCE_COMMIT,
      capabilitySchema: REQUIRED_LIVE_CAPABILITY_SCHEMA,
      renderCodeSha256: GOAT_V3_REQUIRED_RENDER_CODE_SHA256,
      renderAssetSha256: GOAT_V3_REQUIRED_RENDER_ASSET_SHA256,
      maxCreateRequests: GOAT_V3_MAX_CREATE_REQUESTS,
      maxPods: GOAT_V3_MAX_PODS,
      hardCostUsd: GOAT_V3_HARD_COST_USD,
      cloudType: 'SECURE' as const,
      plannedPodName: GOAT_V3_PLANNED_POD_NAME,
      noRetry: true,
      mandatoryCleanup: true,
      humanVisualApprovalRequired: true,
      productionPromotionForbidden: true,
    },
    limits: GOAT_V3_PAID_EXECUTION_LIMITS,
    pin: {
      ...pin,
      refRedacted: redactGoatV3ImageRef(pin.ref),
    },
    worker,
    liveResolved,
    quote: {
      ...quote,
      authorizationCeilingUsd: GOAT_V3_HARD_COST_USD,
      withinAuthorization: v3QuoteWithin,
    },
    downloadProof,
    launch: {
      allowed: unique.length === 0,
      launched: false,
      createRequestCount: 0,
      podCount: 0,
    },
    remainingBlockers: unique,
    goatProductionReady: false as const,
    consumed: input?.consumed === true,
  };
}

export function compileGoatV3StoppedReport(input: {
  startingBranch: string;
  startingSha: string;
  finalBranch: string;
  finalSha: string;
  authorization: ReturnType<typeof evaluateGoatV3PaidExecutionAuthorization>;
  consumptionPoint: 'UNCONSUMED_PREFLIGHT_BLOCKER';
}) {
  return {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V3',
    status: 'STOPPED_BEFORE_PAID_CREATE' as const,
    authorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
    authorizationConsumed: false,
    consumptionPoint: input.consumptionPoint,
    podCreateRequestCount: 0,
    confirmedPodCount: 0,
    realGoatDownloadCount: 0,
    startingBranch: input.startingBranch,
    startingSha: input.startingSha,
    finalBranch: input.finalBranch,
    finalSha: input.finalSha,
    bindings: input.authorization.bindings,
    resolvedImageRefRedacted: input.authorization.pin.refRedacted,
    remainingBlockers: input.authorization.remainingBlockers,
    stages: BUILD_STAGES.map((stage) => ({
      stage,
      executed: false,
      simulated: null,
      status: stage === 'CHARACTER_MASTER_GATE' ? 'BLOCKED_PENDING_HUMAN_VISUAL_APPROVAL' : 'NOT_EXECUTED',
    })),
    goatProductionReady: false as const,
    characterMasterGate: 'BLOCKED_PENDING_HUMAN_VISUAL_APPROVAL' as const,
    actualRuntimeMinutes: 0,
    actualCostUsd: 0,
  };
}

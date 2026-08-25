import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DEFAULT_CLOUD_COST_LIMITS, validateRunpodWorkerImageRef } from '@doodle-dash/production';
import { GOAT_CHARACTER_ID, GOAT_SOURCE_SHA256, GOAT_SOURCE_SIZE_BYTES } from './goat-spec';
import { GOAT_SOURCE_OBJECT_KEY } from './types';
import {
  REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS,
  REQUIRED_LIVE_CAPABILITY_SCHEMA,
  readCharacterWorkerPin,
} from './character-worker-pin-record';

export const GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6 =
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V6' as const;

export const GOAT_V6_REQUIRED_DIGEST =
  'sha256:78f1b16286b0ffc331a787d74297593fa98c455fb24fcecf48d5be5bdeec48b6' as const;
export const GOAT_V6_REQUIRED_SOURCE_COMMIT = 'db8658c835ccb0e5a3adc3201d7ba90e9aaeaa46' as const;
export const GOAT_V6_REQUIRED_RENDER_CODE_SHA256 =
  '860c12ac626f3c0c6a310e35f48e9354c7bddb9f89edb8ccd11613b19ea920d1' as const;
export const GOAT_V6_REQUIRED_RENDER_ASSET_SHA256 =
  '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7' as const;
export const GOAT_V6_EXECUTION_ID = 'goat-v6-78f1b162-20260825' as const;
export const GOAT_V6_PLANNED_POD_NAME = 'tivvlejoy-goat-v6-78f1b162' as const;
export const GOAT_V6_MAX_CREATE_REQUESTS = 1 as const;
export const GOAT_V6_MAX_PODS = 1 as const;
export const GOAT_V6_HARD_COST_USD = 3 as const;
export const GOAT_V6_MAX_RUNTIME_MINUTES = 180 as const;
export const GOAT_V6_STOP_NEW_STAGES_MINUTES = 165 as const;
export const GOAT_V6_STARTUP_WATCHDOG_MINUTES = 20 as const;
export const GOAT_V6_CONSUMPTION_LEDGER_REL =
  'artifacts/tivvlejoy-goat-paid-execution-v6/consumption-ledger.json' as const;

const INVALID_AUTHORIZATIONS = new Set([
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1',
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V2',
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V3',
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4',
  'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V5',
]);

export type GoatV6AuthorizationReceipt = {
  schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V6_RECEIPT_V1';
  authorizationName: typeof GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6;
  issuedAt: string;
  expiresAt: string;
  consumed: false;
  executionId: typeof GOAT_V6_EXECUTION_ID;
  characterId: typeof GOAT_CHARACTER_ID;
  sourceKey: typeof GOAT_SOURCE_OBJECT_KEY;
  expectedSha256: typeof GOAT_SOURCE_SHA256;
  expectedSizeBytes: typeof GOAT_SOURCE_SIZE_BYTES;
  authorizedImageDigest: typeof GOAT_V6_REQUIRED_DIGEST;
  authorizedImageSourceCommit: typeof GOAT_V6_REQUIRED_SOURCE_COMMIT;
  capabilitySchema: typeof REQUIRED_LIVE_CAPABILITY_SCHEMA;
  liveDepartmentUsesBlenderRuntime: true;
  permitsRealSourceDownload: true;
  cloudType: 'SECURE';
  gpuTypeId: 'NVIDIA GeForce RTX 4090';
  maxCreateRequests: typeof GOAT_V6_MAX_CREATE_REQUESTS;
  maxPods: typeof GOAT_V6_MAX_PODS;
  maxRuntimeMinutes: typeof GOAT_V6_MAX_RUNTIME_MINUTES;
  hardCostUsd: typeof GOAT_V6_HARD_COST_USD;
  noRetry: true;
  productionPromotionForbidden: true;
  humanVisualApprovalRequired: true;
};

export function createGoatV6AuthorizationReceipt(input: {
  issuedAt: string;
  expiresAt: string;
}): GoatV6AuthorizationReceipt {
  return {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V6_RECEIPT_V1',
    authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    consumed: false,
    executionId: GOAT_V6_EXECUTION_ID,
    characterId: GOAT_CHARACTER_ID,
    sourceKey: GOAT_SOURCE_OBJECT_KEY,
    expectedSha256: GOAT_SOURCE_SHA256,
    expectedSizeBytes: GOAT_SOURCE_SIZE_BYTES,
    authorizedImageDigest: GOAT_V6_REQUIRED_DIGEST,
    authorizedImageSourceCommit: GOAT_V6_REQUIRED_SOURCE_COMMIT,
    capabilitySchema: REQUIRED_LIVE_CAPABILITY_SCHEMA,
    liveDepartmentUsesBlenderRuntime: true,
    permitsRealSourceDownload: true,
    cloudType: 'SECURE',
    gpuTypeId: 'NVIDIA GeForce RTX 4090',
    maxCreateRequests: GOAT_V6_MAX_CREATE_REQUESTS,
    maxPods: GOAT_V6_MAX_PODS,
    maxRuntimeMinutes: GOAT_V6_MAX_RUNTIME_MINUTES,
    hardCostUsd: GOAT_V6_HARD_COST_USD,
    noRetry: true,
    productionPromotionForbidden: true,
    humanVisualApprovalRequired: true,
  };
}

export type GoatV6ConsumptionLedger = {
  schema: 'TIVVLEJOY_GOAT_V6_CONSUMPTION_LEDGER_V1';
  authorizationName: typeof GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6;
  executionId: typeof GOAT_V6_EXECUTION_ID;
  digest: typeof GOAT_V6_REQUIRED_DIGEST;
  plannedPodName: typeof GOAT_V6_PLANNED_POD_NAME;
  consumed: true;
  createAttempted: true;
  createRequestOrdinal: 1;
  consumedAt: string;
};

function emptyLedger(): null {
  return null;
}

export function readGoatV6ConsumptionLedger(repoRoot = process.cwd()): GoatV6ConsumptionLedger | null {
  const file = path.join(repoRoot, GOAT_V6_CONSUMPTION_LEDGER_REL);
  if (!existsSync(file)) return emptyLedger();
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as GoatV6ConsumptionLedger;
  } catch {
    // A malformed or partial ledger is treated as consumed. This avoids a
    // second CREATE after a crash between durable consumption and mutation.
    return {
      schema: 'TIVVLEJOY_GOAT_V6_CONSUMPTION_LEDGER_V1',
      authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
      executionId: GOAT_V6_EXECUTION_ID,
      digest: GOAT_V6_REQUIRED_DIGEST,
      plannedPodName: GOAT_V6_PLANNED_POD_NAME,
      consumed: true,
      createAttempted: true,
      createRequestOrdinal: 1,
      consumedAt: 'UNKNOWN_FAIL_CLOSED',
    };
  }
}

export function consumeGoatV6Authorization(
  repoRoot = process.cwd(),
  now = new Date(),
): { ok: true; ledger: GoatV6ConsumptionLedger } | { ok: false; code: 'V6_ALREADY_CONSUMED'; ledger: GoatV6ConsumptionLedger } {
  const file = path.join(repoRoot, GOAT_V6_CONSUMPTION_LEDGER_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  const ledger: GoatV6ConsumptionLedger = {
    schema: 'TIVVLEJOY_GOAT_V6_CONSUMPTION_LEDGER_V1',
    authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
    executionId: GOAT_V6_EXECUTION_ID,
    digest: GOAT_V6_REQUIRED_DIGEST,
    plannedPodName: GOAT_V6_PLANNED_POD_NAME,
    consumed: true,
    createAttempted: true,
    createRequestOrdinal: 1,
    consumedAt: now.toISOString(),
  };
  let fd: number | null = null;
  try {
    fd = openSync(file, 'wx', 0o600);
    writeFileSync(fd, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    return { ok: true, ledger };
  } catch {
    if (fd != null) closeSync(fd);
    return {
      ok: false,
      code: 'V6_ALREADY_CONSUMED',
      ledger: readGoatV6ConsumptionLedger(repoRoot) ?? ledger,
    };
  }
}

export class GoatV6PaidMutationTripwire {
  private createRequests = 0;

  get createRequestCount(): number {
    return this.createRequests;
  }

  authorizeSingleCreate(input: {
    launchAllowed: boolean;
    ledgerConsumed: boolean;
    existingPodCount: number;
  }): { allowed: true; createRequestOrdinal: 1 } {
    if (!input.launchAllowed) throw new Error('CREATE_REFUSED_PREFLIGHT');
    if (!input.ledgerConsumed) throw new Error('CREATE_REFUSED_UNCONSUMED');
    if (input.existingPodCount !== 0) throw new Error('CREATE_REFUSED_POD_ALREADY_PRESENT');
    if (this.createRequests >= GOAT_V6_MAX_CREATE_REQUESTS) throw new Error('CREATE_RETRY_FORBIDDEN');
    this.createRequests += 1;
    return { allowed: true, createRequestOrdinal: 1 };
  }
}

export type GoatV6LiveFacts = {
  receipt?: GoatV6AuthorizationReceipt | null;
  sourceLocked?: boolean;
  objectExists?: boolean;
  storedSize?: number | null;
  storedSha256?: string | null;
  hashVerified?: boolean;
  zipOk?: boolean | null;
  incompleteMultipartCount?: number;
  registryOk?: boolean;
  registryDigest?: string | null;
  registrySourceCommit?: string | null;
  registryRenderCodeSha256?: string | null;
  registryRenderAssetSha256?: string | null;
  registryCapabilitySchema?: string | null;
  registryEntrypoint?: string | null;
  registryRequiredAuthorization?: string | null;
  registryBlenderVersion?: string | null;
  registryStageCount?: string | null;
  liveDepartmentUsesBlenderRuntime?: boolean;
  liveCharacterDepartmentCapable?: boolean;
  authorizedRealSourceDownloadCapable?: boolean;
  durableArtifactPersistenceCapable?: boolean;
  requiresPaidAuthorization?: boolean;
  sourceWritesForbidden?: boolean;
  mandatoryDryRun?: boolean;
  secure4090PriceUsdPerHr?: number | null;
  secure4090StockStatus?: string | null;
  existingBillablePodCount?: number;
  exactPlannedNamePodCount?: number;
  evidenceKeysAlreadyExist?: boolean;
};

export type GoatV6Blocker =
  | 'V6_PIN_MISSING'
  | 'V6_DIGEST_MISMATCH'
  | 'V6_SOURCE_COMMIT_MISMATCH'
  | 'V6_IMAGE_PROVENANCE_MISMATCH'
  | 'V6_AUTHORIZATION_MISSING'
  | 'V6_AUTHORIZATION_EXPIRED'
  | 'V6_RECEIPT_MISMATCH'
  | 'INVALID_SUPERSEDED_AUTHORIZATION'
  | 'REJECTED_LIVE_EXECUTION_DIGEST'
  | 'WORKER_NOT_LIVE_CHARACTER_CAPABLE'
  | 'LIVE_BLENDER_RUNTIME_PROOF_MISSING'
  | 'AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD'
  | 'DURABLE_OUTPUT_NOT_CAPABLE'
  | 'SOURCE_WRITE_PROTECTION_MISSING'
  | 'SOURCE_NOT_LOCKED'
  | 'SOURCE_HASH_NOT_VERIFIED'
  | 'ZIP_INSPECTION_FAILED'
  | 'ORPHAN_MULTIPART_REMAINS'
  | 'SECURE_4090_QUOTE_MISSING'
  | 'HOURLY_RATE_EXCEEDS_STUDIO_CAP'
  | 'PREDICTED_COST_EXCEEDS_AUTHORIZATION'
  | 'POD_ALREADY_PRESENT'
  | 'V6_ALREADY_CONSUMED'
  | 'EXECUTION_EVIDENCE_ALREADY_EXISTS';

function receiptMatches(receipt: GoatV6AuthorizationReceipt | null | undefined): boolean {
  if (!receipt) return false;
  return (
    receipt.authorizationName === GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6 &&
    receipt.consumed === false &&
    receipt.executionId === GOAT_V6_EXECUTION_ID &&
    receipt.characterId === GOAT_CHARACTER_ID &&
    receipt.sourceKey === GOAT_SOURCE_OBJECT_KEY &&
    receipt.expectedSha256 === GOAT_SOURCE_SHA256 &&
    receipt.expectedSizeBytes === GOAT_SOURCE_SIZE_BYTES &&
    receipt.authorizedImageDigest === GOAT_V6_REQUIRED_DIGEST &&
    receipt.authorizedImageSourceCommit === GOAT_V6_REQUIRED_SOURCE_COMMIT &&
    receipt.capabilitySchema === REQUIRED_LIVE_CAPABILITY_SCHEMA &&
    receipt.liveDepartmentUsesBlenderRuntime === true &&
    receipt.permitsRealSourceDownload === true &&
    receipt.cloudType === 'SECURE' &&
    receipt.gpuTypeId === 'NVIDIA GeForce RTX 4090' &&
    receipt.maxCreateRequests === 1 &&
    receipt.maxPods === 1 &&
    receipt.maxRuntimeMinutes === 180 &&
    receipt.hardCostUsd === 3 &&
    receipt.noRetry === true &&
    receipt.productionPromotionForbidden === true &&
    receipt.humanVisualApprovalRequired === true
  );
}

export function evaluateGoatV6PaidExecutionAuthorization(input: {
  repoRoot?: string;
  live?: GoatV6LiveFacts;
  consumed?: boolean;
  nowMs?: number;
}) {
  const repoRoot = input.repoRoot ?? process.cwd();
  const live = input.live ?? {};
  const pin = readCharacterWorkerPin(repoRoot);
  const ref = pin.ref || '';
  const validation = validateRunpodWorkerImageRef(ref);
  const digest = validation.digest || pin.digest;
  const receipt = live.receipt ?? null;
  const blockers: GoatV6Blocker[] = [];

  if (!validation.ok || !pin.ref || !pin.digest) blockers.push('V6_PIN_MISSING');
  if (digest !== GOAT_V6_REQUIRED_DIGEST) blockers.push('V6_DIGEST_MISMATCH');
  if (pin.sourceCommit !== GOAT_V6_REQUIRED_SOURCE_COMMIT) blockers.push('V6_SOURCE_COMMIT_MISMATCH');
  if (digest && (REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS as readonly string[]).includes(digest)) {
    blockers.push('REJECTED_LIVE_EXECUTION_DIGEST');
  }
  if (!receipt) {
    blockers.push('V6_AUTHORIZATION_MISSING');
  } else {
    const authName = String(receipt.authorizationName || '');
    if (INVALID_AUTHORIZATIONS.has(authName)) blockers.push('INVALID_SUPERSEDED_AUTHORIZATION');
    if (!receiptMatches(receipt)) blockers.push('V6_RECEIPT_MISMATCH');
    const expiry = Date.parse(receipt.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= (input.nowMs ?? Date.now())) blockers.push('V6_AUTHORIZATION_EXPIRED');
  }

  const registryIdentityOk =
    live.registryOk === true &&
    live.registryDigest === GOAT_V6_REQUIRED_DIGEST &&
    live.registrySourceCommit === GOAT_V6_REQUIRED_SOURCE_COMMIT &&
    live.registryRenderCodeSha256 === GOAT_V6_REQUIRED_RENDER_CODE_SHA256 &&
    live.registryRenderAssetSha256 === GOAT_V6_REQUIRED_RENDER_ASSET_SHA256 &&
    live.registryCapabilitySchema === REQUIRED_LIVE_CAPABILITY_SCHEMA &&
    live.registryEntrypoint === 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V6' &&
    live.registryRequiredAuthorization === GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6 &&
    live.registryBlenderVersion === '4.2.2' &&
    live.registryStageCount === '26' &&
    live.liveDepartmentUsesBlenderRuntime === true;
  if (!registryIdentityOk) blockers.push('V6_IMAGE_PROVENANCE_MISMATCH');
  if (live.liveDepartmentUsesBlenderRuntime !== true) blockers.push('LIVE_BLENDER_RUNTIME_PROOF_MISSING');
  if (live.liveCharacterDepartmentCapable !== true || live.mandatoryDryRun === true) {
    blockers.push('WORKER_NOT_LIVE_CHARACTER_CAPABLE');
  }
  if (live.authorizedRealSourceDownloadCapable !== true || live.requiresPaidAuthorization !== true) {
    blockers.push('AUTHORIZED_IMAGE_CANNOT_INVOKE_REAL_DOWNLOAD');
  }
  if (live.durableArtifactPersistenceCapable !== true) blockers.push('DURABLE_OUTPUT_NOT_CAPABLE');
  if (live.sourceWritesForbidden !== true) blockers.push('SOURCE_WRITE_PROTECTION_MISSING');

  if (live.sourceLocked !== true || live.objectExists !== true) blockers.push('SOURCE_NOT_LOCKED');
  if (
    live.hashVerified !== true ||
    live.storedSha256 !== GOAT_SOURCE_SHA256 ||
    live.storedSize !== GOAT_SOURCE_SIZE_BYTES
  ) {
    blockers.push('SOURCE_HASH_NOT_VERIFIED');
  }
  if (live.zipOk !== true) blockers.push('ZIP_INSPECTION_FAILED');
  if ((live.incompleteMultipartCount ?? 0) !== 0) blockers.push('ORPHAN_MULTIPART_REMAINS');

  const rate = live.secure4090PriceUsdPerHr ?? null;
  const predictedCostUsd = rate == null ? null : Number(((rate * GOAT_V6_MAX_RUNTIME_MINUTES) / 60).toFixed(4));
  if (rate == null || rate <= 0) blockers.push('SECURE_4090_QUOTE_MISSING');
  if (rate != null && rate > DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice) {
    blockers.push('HOURLY_RATE_EXCEEDS_STUDIO_CAP');
  }
  if (predictedCostUsd != null && predictedCostUsd > GOAT_V6_HARD_COST_USD) {
    blockers.push('PREDICTED_COST_EXCEEDS_AUTHORIZATION');
  }
  if ((live.existingBillablePodCount ?? 0) !== 0 || (live.exactPlannedNamePodCount ?? 0) !== 0) {
    blockers.push('POD_ALREADY_PRESENT');
  }
  if (input.consumed === true) blockers.push('V6_ALREADY_CONSUMED');
  if (live.evidenceKeysAlreadyExist === true) blockers.push('EXECUTION_EVIDENCE_ALREADY_EXISTS');

  const unique = [...new Set(blockers)];
  return {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V6_PREFLIGHT_V1' as const,
    status: unique.length === 0 ? ('LAUNCH_AUTHORIZED' as const) : ('FAIL_CLOSED_DO_NOT_LAUNCH' as const),
    launchAllowed: unique.length === 0,
    authorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
    executionId: GOAT_V6_EXECUTION_ID,
    plannedPodName: GOAT_V6_PLANNED_POD_NAME,
    image: {
      ref,
      digest,
      sourceCommit: pin.sourceCommit,
      validationOk: validation.ok,
      registryIdentityOk,
      liveDepartmentUsesBlenderRuntime: live.liveDepartmentUsesBlenderRuntime === true,
    },
    source: {
      characterId: GOAT_CHARACTER_ID,
      objectKey: GOAT_SOURCE_OBJECT_KEY,
      expectedSha256: GOAT_SOURCE_SHA256,
      expectedSizeBytes: GOAT_SOURCE_SIZE_BYTES,
      locked: live.sourceLocked === true,
      hashVerified: live.hashVerified === true,
      zipOk: live.zipOk === true,
    },
    quote: {
      gpuTypeId: 'NVIDIA GeForce RTX 4090' as const,
      cloudType: 'SECURE' as const,
      secureUsdPerHr: rate,
      stockStatus: live.secure4090StockStatus ?? null,
      predicted180MinUsd: predictedCostUsd,
      studioHourlyCapUsd: DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice,
      authorizationCeilingUsd: GOAT_V6_HARD_COST_USD,
    },
    limits: {
      maxCreateRequests: GOAT_V6_MAX_CREATE_REQUESTS,
      maxPods: GOAT_V6_MAX_PODS,
      maxRuntimeMinutes: GOAT_V6_MAX_RUNTIME_MINUTES,
      stopNewStagesAtMinutes: GOAT_V6_STOP_NEW_STAGES_MINUTES,
      startupWatchdogMinutes: GOAT_V6_STARTUP_WATCHDOG_MINUTES,
      hardCostUsd: GOAT_V6_HARD_COST_USD,
      noRetry: true,
      mandatoryCleanup: true,
      secureCloudOnly: true,
      humanVisualApprovalRequired: true,
      productionPromotionForbidden: true,
    },
    receipt,
    remainingBlockers: unique,
    goatProductionReady: false as const,
    characterMasterGate: 'BLOCKED_PENDING_HUMAN_VISUAL_APPROVAL' as const,
  };
}

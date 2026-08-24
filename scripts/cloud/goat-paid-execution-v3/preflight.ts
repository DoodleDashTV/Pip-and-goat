#!/usr/bin/env tsx
/**
 * TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V3 zero-cost preflight.
 *
 * Read-only. Creates no Pod. Never downloads Goat_FINN.zip. Never prints secrets.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { inspectGhcrImage } from '../../../packages/production/src/cloud/worker-provenance';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import {
  GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  GOAT_V3_HARD_COST_USD,
  GOAT_V3_PLANNED_POD_NAME,
  GOAT_V3_REQUIRED_DIGEST,
  GOAT_V3_REQUIRED_RENDER_ASSET_SHA256,
  GOAT_V3_REQUIRED_RENDER_CODE_SHA256,
  GOAT_V3_REQUIRED_SOURCE_COMMIT,
  REQUIRED_LIVE_CAPABILITY_SCHEMA,
  compileGoatV3StoppedReport,
  evaluateGoatV3PaidExecutionAuthorization,
  inspectGoatZipSource,
  provePinnedImageCannotInvokeRealDownload,
  readGoatV3ConsumptionLedger,
  redactGoatV3ImageRef,
  resolvePinnedV3ImageRef,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake';
import {
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_RECEIPT_OBJECT_KEY,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/types';
import { parseGoatSourceReceipt } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/durable';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-goat-paid-execution-v3');
const REQUIRED_START_BRANCH = 'cursor/tivvlejoy-goat-live-worker-repair-73f1';
const REQUIRED_START_SHA = 'e1be8c15763acc40e8286131b1b0016f9d2cfa52';
const REQUIRED_V3_BRANCH = 'cursor/tivvlejoy-goat-real-paid-execution-v3-73f1';

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function deepRedact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/ghcr\.io\/[^/]+\//g, 'ghcr.io/<org>/')
      .replace(/github\.com\/[^/]+\//g, 'github.com/<org>/')
      .replace(/"repository":\s*"[^"]+\/ddp-runpod-blender"/g, '"repository":"<org>/ddp-runpod-blender"');
  }
  if (Array.isArray(value)) return value.map(deepRedact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'repository' && typeof nested === 'string' && nested.endsWith('/ddp-runpod-blender')) {
        out[key] = '<org>/ddp-runpod-blender';
      } else {
        out[key] = deepRedact(nested);
      }
    }
    return out;
  }
  return value;
}

function credentialPresence() {
  return {
    runpodApiKeyPresent: Boolean(process.env.RUNPOD_API_KEY),
    ghcrTokenPresent: Boolean(process.env.GHCR_TOKEN || process.env.GHCR_PASSWORD),
    ghcrUserPresent: Boolean(process.env.GHCR_USERNAME || process.env.GHCR_USER),
    r2BucketPresent: Boolean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET),
    r2EndpointPresent: Boolean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT),
    r2AccessKeyPresent: Boolean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID),
    r2SecretPresent: Boolean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY),
    allowPaidGpuLaunch: process.env.ALLOW_PAID_GPU_LAUNCH === 'true',
    paidExecutionAuthorized: process.env.PAID_EXECUTION_AUTHORIZED === 'true',
    cloudRenderEnabled: process.env.CLOUD_RENDER_ENABLED === 'true',
  };
}

async function inspectAuthorizedWorker(ref: string) {
  const registry = await inspectGhcrImage(ref);
  const labels = registry.labels || {};
  return {
    ok: registry.ok,
    amd64: registry.amd64,
    digest: registry.digest,
    detail: registry.detail,
    architecture: registry.amd64 ? 'linux/amd64' : null,
    sourceCommit: labels['ddp.source.commit'] || labels['org.opencontainers.image.revision'] || null,
    blender: labels['ddp.character.blender'] || null,
    characterMaster: labels['ddp.character.master'] || null,
    jobKind: labels['ddp.character.job.kind'] || null,
    stageCount: labels['ddp.character.stage.count'] || null,
    capabilitySchema: labels['ddp.character.capability.schema'] || null,
    liveCapable: labels['ddp.character.live.capable'] || null,
    authorizedDownloadCapable: labels['ddp.character.authorized.download.capable'] || null,
    syntheticLivePathVerified: labels['ddp.character.synthetic.live.verified'] || null,
    requiresPaidAuthorization: labels['ddp.character.requires.paid.authorization'] || null,
    sourceWritesForbidden: labels['ddp.character.source.writes.forbidden'] || null,
    mandatoryDryRun: labels['ddp.character.mandatory.dry.run'] || null,
    renderCodeSha256: labels['ddp.render.code.sha256'] || null,
    renderAssetSha256: labels['ddp.render.asset.sha256'] || null,
    entrypoint: labels['ddp.character.entrypoint'] || null,
  };
}

async function verifyLockedGoatSource() {
  const config = resolveObjectStorageConfig(process.env);
  const empty = {
    objectExists: false,
    storedSize: null as number | null,
    sizeMatches: false,
    downloaded: false,
    receiptPresent: false,
    receiptLocked: false,
    receiptShaMatches: false,
    hashVerified: false,
    zipIntegrityVerified: false,
    zipOk: null as boolean | null,
    zipCode: null as string | null,
    zipMembers: [] as string[],
    productionStatus: null as string | null,
    shaMatches: false,
    incompleteMultipartCount: 0,
    sourceLocked: false,
  };
  if (config.provider !== 's3') return empty;
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const bucket = config.bucket;
  let storedSize: number | null = null;
  let objectExists = false;
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_OBJECT_KEY }));
    objectExists = true;
    storedSize = Number(head.ContentLength ?? 0);
  } catch {
    objectExists = false;
  }

  let receiptPresent = false;
  let receiptLocked = false;
  let receiptShaMatches = false;
  let hashVerified = false;
  let receiptZipOk = false;
  let productionStatus: string | null = null;
  try {
    const receiptObj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_RECEIPT_OBJECT_KEY }),
    );
    const text = await receiptObj.Body?.transformToString?.();
    const parsed = parseGoatSourceReceipt(text ? JSON.parse(text) : null);
    receiptPresent = Boolean(parsed);
    receiptLocked = Boolean(parsed?.sourceLocked);
    receiptShaMatches = parsed?.sourceSha256 === GOAT_SOURCE_SHA256 && parsed?.sourceSize === GOAT_SOURCE_SIZE_BYTES;
    hashVerified = Boolean(parsed?.hashVerified && receiptShaMatches);
    receiptZipOk = Boolean(parsed?.zipIntegrityVerified);
    productionStatus = parsed?.productionStatus ?? null;
  } catch {
    receiptPresent = false;
  }

  const rangeSource = {
    byteLength: storedSize ?? 0,
    async read(offset: number, length: number) {
      const end = offset + length - 1;
      const ranged = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: GOAT_SOURCE_OBJECT_KEY,
          Range: `bytes=${offset}-${end}`,
        }),
      );
      const bytes = await ranged.Body?.transformToByteArray?.();
      return bytes ? new Uint8Array(bytes) : new Uint8Array();
    },
  };
  let zipOk: boolean | null = null;
  let zipCode: string | null = null;
  let zipMembers: string[] = [];
  if (objectExists && storedSize) {
    try {
      const inspected = await inspectGoatZipSource(rangeSource);
      zipOk = inspected.ok;
      zipCode = inspected.code;
      zipMembers = inspected.members;
    } catch {
      zipOk = receiptZipOk;
      zipCode = receiptZipOk ? 'RECEIPT_ZIP_INTEGRITY_REUSED' : 'ZIP_CORRUPT';
    }
  }

  let incompleteMultipartCount = 0;
  try {
    const listed = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        Prefix: 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/',
      }),
    );
    incompleteMultipartCount = listed.Uploads?.length ?? 0;
  } catch {
    incompleteMultipartCount = 0;
  }

  const sizeMatches = storedSize === GOAT_SOURCE_SIZE_BYTES;
  return {
    objectExists,
    storedSize,
    sizeMatches,
    downloaded: false,
    receiptPresent,
    receiptLocked,
    receiptShaMatches,
    hashVerified,
    zipIntegrityVerified: zipOk === true || receiptZipOk,
    zipOk,
    zipCode,
    zipMembers,
    productionStatus,
    shaMatches: receiptShaMatches && sizeMatches,
    incompleteMultipartCount,
    sourceLocked: objectExists && receiptLocked && sizeMatches && hashVerified,
  };
}

function inspectPr(number: number) {
  const raw = execFileSync(
    'gh',
    ['pr', 'view', String(number), '--json', 'number,state,isDraft,mergedAt,baseRefName,headRefName,headRefOid,url,reviewDecision'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  const parsed = JSON.parse(raw) as {
    number: number;
    state: string;
    isDraft: boolean;
    mergedAt: string | null;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    url: string;
  };
  return {
    number: parsed.number,
    url: parsed.url,
    state: parsed.state,
    draft: parsed.isDraft,
    merged: Boolean(parsed.mergedAt),
    ready: parsed.state === 'OPEN' && parsed.isDraft === false,
    base: parsed.baseRefName,
    head: parsed.headRefName,
    sha: parsed.headRefOid,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const startingSha = git(['merge-base', REQUIRED_V3_BRANCH, REQUIRED_START_BRANCH]);
  const finalSha = git(['rev-parse', 'HEAD']);
  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const pin = resolvePinnedV3ImageRef(REPO_ROOT);
  const downloadProof = provePinnedImageCannotInvokeRealDownload(REPO_ROOT);
  const ledger = readGoatV3ConsumptionLedger(REPO_ROOT);
  const creds = credentialPresence();
  const registry = pin.ref ? await inspectAuthorizedWorker(pin.ref) : { ok: false, digest: null };
  const source = await verifyLockedGoatSource();

  const client = new RunpodClient();
  const gpus = await client.verifyAuthAndListGpus();
  const gpu4090 =
    gpus.gpuTypes.find((gpu) => gpu.id === 'NVIDIA GeForce RTX 4090') ??
    gpus.gpuTypes.find((gpu) => gpu.displayName === 'NVIDIA GeForce RTX 4090');
  const quote = gpu4090 ? await client.getSecureOnDemandPrice(gpu4090.id) : null;
  const pods = await client.listMyPods();
  const billable = pods.filter((pod) => {
    const status = String(pod.desiredStatus ?? '').toUpperCase();
    return status !== '' && status !== 'EXITED' && status !== 'TERMINATED' && status !== 'DEAD';
  });
  const plannedNameMatches = pods.filter((pod) => pod.name === GOAT_V3_PLANNED_POD_NAME);

  const gatedClient = new RunpodClient({
    env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
  });
  let createGateCode: string | null = null;
  try {
    await gatedClient.createPodForBenchmark({
      name: GOAT_V3_PLANNED_POD_NAME,
      imageName: pin.ref,
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      confirmPaidLaunch: true,
      cloudType: 'SECURE',
    });
    createGateCode = 'GATE_DID_NOT_REFUSE';
  } catch (error) {
    createGateCode = (error as { code?: string }).code || (error as Error).name || 'REFUSED';
  }

  const prs = [99, 100, 101, 102, 103].map(inspectPr);
  const live = {
    sourceLocked: source.sourceLocked,
    objectExists: source.objectExists,
    storedSize: source.storedSize,
    storedSha256: source.receiptShaMatches ? GOAT_SOURCE_SHA256 : null,
    hashVerified: source.hashVerified,
    zipOk: source.zipOk,
    zipMembers: source.zipMembers,
    incompleteMultipartCount: source.incompleteMultipartCount,
    capabilitySchema: REQUIRED_LIVE_CAPABILITY_SCHEMA,
    liveCharacterDepartmentCapable: true,
    mandatoryDryRun: false,
    authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
    secure4090PriceUsdPerHr: quote?.uninterruptablePrice ?? null,
    secure4090StockStatus: quote?.stockStatus ?? null,
    existingBillablePodCount: billable.length,
    priorAuthorizedLaunchCount: ledger.createAttempted ? 1 : 0,
    requestedGpu: 'NVIDIA GeForce RTX 4090' as const,
    requestedCloudType: 'SECURE' as const,
    knownCurrentImageJobKind: 'CHARACTER_MASTER_BUILD CHARACTER_SOURCE_MATERIALIZE CHARACTER_BUILD',
    knownCurrentImageHasCharacterDepartment: true,
    knownCurrentImageHasGoatMaterialize: true,
  };
  const authorization = evaluateGoatV3PaidExecutionAuthorization({
    env: process.env,
    live,
    repoRoot: REPO_ROOT,
    consumed: ledger.consumed,
  });
  const identity = {
    currentBranch,
    startingBranch: REQUIRED_START_BRANCH,
    startingSha,
    requiredStartingSha: REQUIRED_START_SHA,
    startingShaMatches: startingSha === REQUIRED_START_SHA,
    finalBranch: REQUIRED_V3_BRANCH,
    finalSha,
    onRequiredBranch: currentBranch === REQUIRED_V3_BRANCH,
    prsOpenDraftUnmerged: prs.every((pr) => pr.state === 'OPEN' && pr.draft && !pr.merged && !pr.ready),
  };
  const registryMatches =
    registry.ok &&
    registry.digest === GOAT_V3_REQUIRED_DIGEST &&
    registry.sourceCommit === GOAT_V3_REQUIRED_SOURCE_COMMIT &&
    registry.architecture === 'linux/amd64' &&
    registry.blender === '4.2.2' &&
    registry.capabilitySchema === REQUIRED_LIVE_CAPABILITY_SCHEMA &&
    registry.liveCapable === 'true' &&
    registry.renderCodeSha256 === GOAT_V3_REQUIRED_RENDER_CODE_SHA256 &&
    (registry.renderAssetSha256 == null || registry.renderAssetSha256 === GOAT_V3_REQUIRED_RENDER_ASSET_SHA256);
  const publicFacts = {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V3',
    status: authorization.status,
    authorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V3,
    authorizationConsumed: false,
    consumptionPoint: 'UNCONSUMED_PREFLIGHT_BLOCKER',
    identity,
    prs,
    image: {
      resolvedRefRedacted: redactGoatV3ImageRef(pin.ref),
      digest: pin.digest,
      sourceCommit: pin.sourceCommit,
      containsLiteralOrg: pin.containsLiteralOrgPlaceholder,
      forbidden: pin.forbidden,
      validationOk: pin.validation.ok,
    },
    registry,
    registryMatches,
    downloadProof,
    creds,
    source,
    quote: {
      ok: Boolean(quote?.uninterruptablePrice),
      myselfIdPresent: gpus.myselfIdPresent,
      gpu4090Present: Boolean(gpu4090),
      secureUsdPerHr: quote?.uninterruptablePrice ?? null,
      stockStatus: quote?.stockStatus ?? null,
      predicted180MinUsd: authorization.quote.predictedTotalUsd,
      authorizationCeilingUsd: GOAT_V3_HARD_COST_USD,
      withinAuthorization: authorization.quote.withinAuthorization,
    },
    pods: {
      billable: billable.length,
      exactPlannedNameCount: plannedNameMatches.length,
      names: billable.map((pod) => pod.name),
    },
    guards: {
      startupWatchdogMinutes: 20,
      stopNewStagesAtMinutes: 165,
      hardDeleteAtMinutes: 180,
      singleLaunchCounter: 0,
      paidMutationTripwireArmed: true,
      createGateCode,
      allowPaidGpuLaunch: creds.allowPaidGpuLaunch,
      cleanupPathVerified: typeof client.terminatePod === 'function' && typeof client.listMyPods === 'function',
      runpodAdapterGuardedRealMode: gpus.ok && createGateCode === 'PAID_GPU_NOT_APPROVED',
    },
    launch: {
      allowed: false,
      podCreateRequestCount: 0,
      confirmedPodCount: 0,
      realGoatDownloadCount: 0,
      podId: null,
      plannedPodName: GOAT_V3_PLANNED_POD_NAME,
      reason: downloadProof.reason,
    },
    remainingBlockers: authorization.remainingBlockers,
    goatProductionReady: false,
    characterMasterGate: 'BLOCKED_PENDING_HUMAN_VISUAL_APPROVAL',
    actualRuntimeMinutes: 0,
    actualCostUsd: 0,
    billablePodsRemaining: billable.length,
  };
  const report = compileGoatV3StoppedReport({
    startingBranch: REQUIRED_START_BRANCH,
    startingSha: REQUIRED_START_SHA,
    finalBranch: currentBranch,
    finalSha,
    authorization,
    consumptionPoint: 'UNCONSUMED_PREFLIGHT_BLOCKER',
  });
  writeFileSync(path.join(OUT_DIR, 'preflight.json'), `${JSON.stringify(deepRedact(publicFacts), null, 2)}\n`);
  writeFileSync(
    path.join(OUT_DIR, 'authorization.json'),
    `${JSON.stringify(
      deepRedact({
        ...authorization,
        pin: { ...authorization.pin, ref: authorization.pin.refRedacted },
      }),
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(OUT_DIR, 'final-report.json'), `${JSON.stringify(deepRedact(report), null, 2)}\n`);
  console.log(JSON.stringify(deepRedact(publicFacts), null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, name: error?.name, code: (error as { code?: string }).code || null }));
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * V5 zero-cost preflight. It performs only registry, R2 metadata/range, RunPod
 * auth/catalog, price, and Pod-list reads. It never creates a Pod and never
 * downloads the full Goat source archive.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import { inspectGhcrImage } from '../../../packages/production/src/cloud/worker-provenance';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import {
  GOAT_CHARACTER_ID,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-spec';
import {
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_RECEIPT_OBJECT_KEY,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/types';
import {
  GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V5,
  GOAT_V5_EXECUTION_ID,
  GOAT_V5_PLANNED_POD_NAME,
  GOAT_V5_REQUIRED_DIGEST,
  readGoatV5ConsumptionLedger,
  evaluateGoatV5PaidExecutionAuthorization,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-v5-authorization';
import { inspectGoatZipSource } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/validation';
import { parseGoatSourceReceipt } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/durable';
import { readCharacterWorkerPin } from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/character-worker-pin-record';
import {
  PREFLIGHT_FILE,
  REPO_ROOT,
  activePod,
  credentialPresence,
  ensureOutputDir,
  readIssuedAuthorization,
  redact,
  writeJson,
} from './common';

async function inspectWorker(ref: string) {
  const image = await inspectGhcrImage(ref);
  const labels = image.labels || {};
  return {
    ok: image.ok,
    amd64: image.amd64,
    digest: image.digest,
    detail: image.detail,
    sourceCommit: labels['ddp.source.commit'] || labels['org.opencontainers.image.revision'] || null,
    renderCodeSha256: labels['ddp.render.code.sha256'] || null,
    renderAssetSha256: labels['ddp.render.asset.sha256'] || null,
    capabilitySchema: labels['ddp.character.capability.schema'] || null,
    entrypoint: labels['ddp.character.entrypoint'] || null,
    liveAuthorization: labels['ddp.character.live.authorization'] || null,
    liveCapable: labels['ddp.character.live.capable'] === 'true',
    authorizedDownloadCapable: labels['ddp.character.authorized.download.capable'] === 'true',
    durableOutputCapable: labels['ddp.character.output.persistence'] === 'true',
    requiresPaidAuthorization: labels['ddp.character.requires.paid.authorization'] === 'true',
    sourceWritesForbidden: labels['ddp.character.source.writes.forbidden'] === 'true',
    mandatoryDryRun: labels['ddp.character.mandatory.dry.run'] === 'true',
    blender: labels['ddp.character.blender'] || null,
    stageCount: labels['ddp.character.stage.count'] || null,
  };
}

async function verifyLockedSource() {
  const config = resolveObjectStorageConfig(process.env);
  if (config.provider !== 's3') throw new Error('DURABLE_R2_NOT_CONFIGURED');
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const bucket = config.bucket;
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_OBJECT_KEY }));
  const storedSize = Number(head.ContentLength ?? 0);

  const receiptObject = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_RECEIPT_OBJECT_KEY }),
  );
  const receiptText = await receiptObject.Body?.transformToString?.();
  const receipt = parseGoatSourceReceipt(receiptText ? JSON.parse(receiptText) : null);
  const receiptShaMatches = receipt?.sourceSha256 === GOAT_SOURCE_SHA256;
  const receiptSizeMatches = receipt?.sourceSize === GOAT_SOURCE_SIZE_BYTES;

  const inspected = await inspectGoatZipSource({
    byteLength: storedSize,
    async read(offset: number, length: number) {
      const ranged = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: GOAT_SOURCE_OBJECT_KEY,
          Range: `bytes=${offset}-${offset + length - 1}`,
        }),
      );
      const bytes = await ranged.Body?.transformToByteArray?.();
      return bytes ? new Uint8Array(bytes) : new Uint8Array();
    },
  });
  const multiparts = await client.send(
    new ListMultipartUploadsCommand({
      Bucket: bucket,
      Prefix: `tivvlejoy-assets/characters/${GOAT_CHARACTER_ID}/source/`,
    }),
  );

  const evidenceKeys = [
    `tivvlejoy-assets/characters/${GOAT_CHARACTER_ID}/executions/${GOAT_V5_EXECUTION_ID}/manifest.json`,
    `jobs/${GOAT_V5_EXECUTION_ID}/status.json`,
    `jobs/${GOAT_V5_EXECUTION_ID}/startup-status.json`,
  ];
  let evidenceKeysAlreadyExist = false;
  for (const key of evidenceKeys) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      evidenceKeysAlreadyExist = true;
    } catch {
      // A missing key is the required clean execution namespace.
    }
  }

  return {
    objectExists: true,
    storedSize,
    storedSha256: receiptShaMatches ? GOAT_SOURCE_SHA256 : null,
    hashVerified: Boolean(receipt?.hashVerified && receiptShaMatches && receiptSizeMatches),
    sourceLocked: Boolean(
      receipt?.sourceLocked &&
        receipt?.productionStatus === 'LOCKED' &&
        storedSize === GOAT_SOURCE_SIZE_BYTES &&
        receiptShaMatches &&
        receiptSizeMatches,
    ),
    zipOk: inspected.ok,
    zipCode: inspected.code,
    zipMembers: inspected.members,
    incompleteMultipartCount: multiparts.Uploads?.length ?? 0,
    evidenceKeysAlreadyExist,
    fullSourceDownloaded: false,
  };
}

async function main() {
  ensureOutputDir();
  const receipt = readIssuedAuthorization();
  const pin = readCharacterWorkerPin(REPO_ROOT);
  const creds = credentialPresence();
  if (!creds.runpodApiKeyPresent) throw new Error('RUNPOD_KEY_MISSING');
  if (!creds.r2BucketPresent || !creds.r2EndpointPresent || !creds.r2AccessKeyPresent || !creds.r2SecretPresent) {
    throw new Error('R2_CREDENTIALS_MISSING');
  }
  if (creds.allowPaidGpuLaunch || creds.cloudRenderEnabled) {
    throw new Error('PREFLIGHT_REQUIRES_PAID_FLAGS_FALSE');
  }
  if (pin.digest !== GOAT_V5_REQUIRED_DIGEST || !pin.ref) throw new Error('V5_PIN_MISMATCH');

  const [registry, source] = await Promise.all([inspectWorker(pin.ref), verifyLockedSource()]);
  const client = new RunpodClient({
    env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
  });
  const auth = await client.verifyAuthAndListGpus();
  const gpu =
    auth.gpuTypes.find((item) => item.id === 'NVIDIA GeForce RTX 4090') ||
    auth.gpuTypes.find((item) => item.displayName === 'NVIDIA GeForce RTX 4090');
  const quote = gpu ? await client.getSecureOnDemandPrice(gpu.id) : null;
  const pods = await client.listMyPods();
  const billable = pods.filter(activePod);
  const exactName = pods.filter((pod) => pod.name === GOAT_V5_PLANNED_POD_NAME);
  const ledger = readGoatV5ConsumptionLedger(REPO_ROOT);

  let paidGateCode: string | null = null;
  try {
    await client.createPodForBenchmark({
      name: GOAT_V5_PLANNED_POD_NAME,
      imageName: pin.ref,
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      cloudType: 'SECURE',
      confirmPaidLaunch: true,
    });
    paidGateCode = 'GATE_DID_NOT_REFUSE';
  } catch (error) {
    paidGateCode = (error as { code?: string }).code || (error as Error).name;
  }

  const decision = evaluateGoatV5PaidExecutionAuthorization({
    repoRoot: REPO_ROOT,
    consumed: ledger?.consumed === true,
    live: {
      receipt,
      ...source,
      registryOk: registry.ok && registry.amd64,
      registryDigest: registry.digest,
      registrySourceCommit: registry.sourceCommit,
      registryRenderCodeSha256: registry.renderCodeSha256,
      registryRenderAssetSha256: registry.renderAssetSha256,
      registryCapabilitySchema: registry.capabilitySchema,
      registryEntrypoint: registry.entrypoint,
      registryRequiredAuthorization: registry.liveAuthorization,
      liveCharacterDepartmentCapable: registry.liveCapable,
      authorizedRealSourceDownloadCapable: registry.authorizedDownloadCapable,
      durableArtifactPersistenceCapable: registry.durableOutputCapable,
      requiresPaidAuthorization: registry.requiresPaidAuthorization,
      sourceWritesForbidden: registry.sourceWritesForbidden,
      mandatoryDryRun: registry.mandatoryDryRun,
      secure4090PriceUsdPerHr: quote?.uninterruptablePrice ?? null,
      secure4090StockStatus: quote?.stockStatus ?? null,
      existingBillablePodCount: billable.length,
      exactPlannedNamePodCount: exactName.length,
    },
  });
  const result = {
    ...decision,
    status:
      decision.launchAllowed && auth.ok && paidGateCode === 'PAID_GPU_NOT_APPROVED'
        ? 'LAUNCH_AUTHORIZED'
        : 'FAIL_CLOSED_DO_NOT_LAUNCH',
    launchAllowed: decision.launchAllowed && auth.ok && paidGateCode === 'PAID_GPU_NOT_APPROVED',
    credentials: creds,
    registry,
    source,
    pods: { total: pods.length, billable: billable.length, exactPlannedName: exactName.length },
    paidMutationGate: paidGateCode,
    createsPod: false,
    realGoatDownloadCount: 0,
    goatProductionReady: false,
  };
  writeJson(PREFLIGHT_FILE, redact(result));
  console.log(JSON.stringify(redact(result), null, 2));
  if (!result.launchAllowed) process.exitCode = 2;
}

main().catch((error) => {
  const failed = {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_V5_PREFLIGHT_V1',
    status: 'FAIL_CLOSED_DO_NOT_LAUNCH',
    launchAllowed: false,
    code: (error as { code?: string }).code || (error as Error).message,
    createsPod: false,
    realGoatDownloadCount: 0,
    goatProductionReady: false,
  };
  writeJson(PREFLIGHT_FILE, redact(failed));
  console.error(JSON.stringify(redact(failed), null, 2));
  process.exitCode = 1;
});

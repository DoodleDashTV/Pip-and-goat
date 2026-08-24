#!/usr/bin/env tsx
/**
 * TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1 preflight.
 *
 * Read-only. Creates no Pod. Never prints secrets, signed URLs, or registry orgs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand, S3Client } from '@aws-sdk/client-s3';
import { inspectGhcrImage } from '../../../packages/production/src/cloud/worker-provenance';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import {
  compileGoatPaidExecutionFinalReport,
  evaluateGoatPaidExecutionAuthorization,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST,
  inspectGoatZipSource,
} from '../src/lib/tivvlejoy-character-source-intake';
import { GOAT_SOURCE_OBJECT_KEY, GOAT_SOURCE_RECEIPT_OBJECT_KEY } from '../src/lib/tivvlejoy-character-source-intake/types';
import { parseGoatSourceReceipt } from '../src/lib/tivvlejoy-character-source-intake/durable';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-goat-paid-execution');

function redactRef(ref: string): string {
  return ref.replace(/^ghcr\.io\/[^/]+\//, 'ghcr.io/<org>/');
}

async function inspectKnownWorker(): Promise<{
  reachable: boolean;
  amd64: boolean | null;
  digest: string | null;
  sourceCommit: string | null;
  jobKind: string;
  hasCharacterDepartment: boolean;
  hasGoatMaterialize: boolean;
  detail: string;
}> {
  const owners = [process.env.GHCR_USERNAME, process.env.GHCR_USER].filter(Boolean) as string[];
  for (const owner of owners) {
    const ref = `ghcr.io/${owner}/ddp-runpod-blender@${KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST}`;
    const registry = await inspectGhcrImage(ref);
    if (registry.ok) {
      const labels = registry.labels;
      return {
        reachable: true,
        amd64: registry.amd64,
        digest: registry.digest,
        sourceCommit: labels['ddp.source.commit'] || labels['org.opencontainers.image.revision'] || null,
        jobKind: 'FINAL_1080P_RENDER',
        hasCharacterDepartment: false,
        hasGoatMaterialize: false,
        detail: registry.detail,
      };
    }
  }
  return {
    reachable: false,
    amd64: null,
    digest: KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST,
    sourceCommit: null,
    jobKind: 'FINAL_1080P_RENDER',
    hasCharacterDepartment: false,
    hasGoatMaterialize: false,
    detail: 'anonymous GHCR inspect did not resolve the known current digest',
  };
}

async function verifyLockedGoatSource() {
  const config = resolveObjectStorageConfig(process.env);
  if (config.provider !== 's3') {
    return {
      objectExists: false,
      storedSize: null as number | null,
      storedSha256: null as string | null,
      hashVerified: false,
      zipOk: null as boolean | null,
      zipCode: null as string | null,
      zipMembers: [] as string[],
      receiptLocked: false,
      incompleteMultipartCount: 0,
      sourceLocked: false,
    };
  }
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

  let storedSha256: string | null = null;
  if (objectExists && storedSize === GOAT_SOURCE_SIZE_BYTES) {
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_OBJECT_KEY }));
    const hash = createHash('sha256');
    const body = obj.Body;
    if (body && Symbol.asyncIterator in Object(body)) {
      for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
        hash.update(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
      }
    }
    storedSha256 = hash.digest('hex');
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
      zipOk = false;
      zipCode = 'ZIP_CORRUPT';
    }
  }

  let receiptLocked = false;
  try {
    const receiptObj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: GOAT_SOURCE_RECEIPT_OBJECT_KEY }),
    );
    const text = await receiptObj.Body?.transformToString?.();
    const parsed = parseGoatSourceReceipt(text ? JSON.parse(text) : null);
    receiptLocked = Boolean(parsed?.sourceLocked && parsed.sourceSha256 === GOAT_SOURCE_SHA256);
  } catch {
    receiptLocked = false;
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

  return {
    objectExists,
    storedSize,
    storedSha256,
    hashVerified: storedSha256 === GOAT_SOURCE_SHA256 && storedSize === GOAT_SOURCE_SIZE_BYTES,
    zipOk,
    zipCode,
    zipMembers,
    receiptLocked,
    incompleteMultipartCount,
    sourceLocked: objectExists && receiptLocked && storedSize === GOAT_SOURCE_SIZE_BYTES,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const workerInspect = await inspectKnownWorker();
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

  const live = {
    sourceLocked: source.sourceLocked,
    objectExists: source.objectExists,
    storedSize: source.storedSize,
    storedSha256: source.storedSha256,
    hashVerified: source.hashVerified,
    zipOk: source.zipOk,
    zipMembers: source.zipMembers,
    incompleteMultipartCount: source.incompleteMultipartCount,
    blender42CanOpen43: null,
    knownCurrentDigestReachable: workerInspect.reachable,
    knownCurrentImageJobKind: workerInspect.jobKind,
    knownCurrentImageHasCharacterDepartment: workerInspect.hasCharacterDepartment,
    knownCurrentImageHasGoatMaterialize: workerInspect.hasGoatMaterialize,
    secure4090PriceUsdPerHr: quote?.uninterruptablePrice ?? null,
    secure4090StockStatus: quote?.stockStatus ?? null,
    existingBillablePodCount: billable.length,
    priorAuthorizedLaunchCount: 0,
    requestedGpu: 'NVIDIA GeForce RTX 4090' as const,
    requestedCloudType: 'SECURE' as const,
  };

  const authorization = evaluateGoatPaidExecutionAuthorization({
    authorizationPresent: true,
    env: process.env,
    live,
  });
  const report = compileGoatPaidExecutionFinalReport({
    startingBranch: 'cursor/tivvlejoy-goat-character-source-intake-73f1',
    startingSha: 'e837122d5a1c4028a998ea073c867ce57ff00948',
    authorization,
    live: {
      ...live,
      zipCode: source.zipCode,
      workingCopyCreated: false,
      visualArtifacts: [],
      actualRuntimeMinutes: 0,
      actualCostUsd: 0,
      podsRemaining: billable.length,
      remainingDefects: authorization.remainingBlockers,
    },
  });

  const publicFacts = {
    schema: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1',
    runpodAuthOk: gpus.ok,
    gpu4090Present: Boolean(gpu4090),
    secureQuoteUsdPerHr: quote?.uninterruptablePrice ?? null,
    stockStatus: quote?.stockStatus ?? null,
    billablePodCount: billable.length,
    podNames: billable.map((pod) => pod.name),
    source: {
      objectExists: source.objectExists,
      storedSize: source.storedSize,
      hashVerified: source.hashVerified,
      zipOk: source.zipOk,
      zipCode: source.zipCode,
      memberCount: source.zipMembers.length,
      requiredBlendPresent: source.zipMembers.some((name) => name.endsWith('Goat_FINN.blend')),
      requiredFbxPresent: source.zipMembers.some((name) => name.endsWith('Goat_FINN.fbx')),
      receiptLocked: source.receiptLocked,
      incompleteMultipartCount: source.incompleteMultipartCount,
    },
    worker: {
      envConfigured: authorization.worker.envConfigured,
      positivelyResolved: authorization.worker.positivelyResolved,
      knownCurrentDigest: KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST,
      knownCurrentReachable: workerInspect.reachable,
      knownCurrentAmd64: workerInspect.amd64,
      knownCurrentSourceCommit: workerInspect.sourceCommit,
      knownCurrentRefRedacted: redactRef(
        `ghcr.io/org/ddp-runpod-blender@${KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST}`,
      ),
      jobKind: workerInspect.jobKind,
    },
    authorizationStatus: authorization.status,
    remainingBlockers: authorization.remainingBlockers,
    launchAllowed: authorization.launch.allowed,
  };

  writeFileSync(path.join(OUT_DIR, 'live-preflight.json'), `${JSON.stringify(publicFacts, null, 2)}\n`);
  writeFileSync(path.join(OUT_DIR, 'authorization.json'), `${JSON.stringify(authorization, null, 2)}\n`);
  writeFileSync(path.join(OUT_DIR, 'final-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(publicFacts, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, name: error?.name, code: error?.code || null }));
  process.exit(1);
});

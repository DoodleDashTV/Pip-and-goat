#!/usr/bin/env tsx
/**
 * Exactly-one-create paid launcher for the TivvleJoy 30-second scenery showcase.
 * CREATE is never retried. Cleanup may retry because cleanup only reduces spend.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import { RunpodClient, type RunpodPodStatus } from '../../../packages/production/src/cloud/runpod-client';
import {
  SCENERY_SHOWCASE_AUTHORIZATION,
  SCENERY_SHOWCASE_EXECUTION_ID,
  SCENERY_SHOWCASE_GPU_TYPE,
  SCENERY_SHOWCASE_HARD_COST_USD,
  SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES,
  SCENERY_SHOWCASE_OUTPUT_KEY,
  SCENERY_SHOWCASE_POD_NAME,
  SCENERY_SHOWCASE_POLL_MS,
  SCENERY_SHOWCASE_REMOTE_LEDGER_KEY,
  SCENERY_SHOWCASE_STATUS_KEY,
  SCENERY_SHOWCASE_STARTUP_WATCHDOG_MINUTES,
  exactAuthorizationPresent,
  type SceneryShowcaseWorkerPin,
} from './contract';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const PIN_FILE = path.join(REPO_ROOT, 'config/cloud/scenery-showcase-worker-image.json');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-showcase-30s');
const PREFLIGHT_FILE = path.join(OUT_DIR, 'preflight.json');
const LOCAL_LEDGER_FILE = path.join(OUT_DIR, 'consumption-ledger.json');
const LAUNCH_FILE = path.join(OUT_DIR, 'launch.json');
const VIDEO_FILE = path.join(OUT_DIR, 'tivvlejoy-scenery-showcase-30s.mp4');
const TERMINATION_CONFIRM_MS = 5 * 60_000;
const AMBIGUOUS_CREATE_RECOVERY_MS = 3 * 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function activePod(pod: RunpodPodStatus): boolean {
  const status = String(pod.desiredStatus || '').toUpperCase();
  return !['TERMINATED', 'EXITED', 'STOPPED'].includes(status);
}

function storageEnv(): Record<string, string | undefined> {
  return {
    ...process.env,
    OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER || (process.env.R2_BUCKET ? 'r2' : undefined),
    OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET || process.env.R2_BUCKET,
    OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT || process.env.R2_ENDPOINT,
    OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION || process.env.R2_REGION || 'auto',
    OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY,
  };
}

function makeR2() {
  const config = resolveObjectStorageConfig(storageEnv());
  if (config.provider !== 's3') throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return { client, bucket: config.bucket };
}

async function readJsonKey(r2: ReturnType<typeof makeR2>, key: string): Promise<any | null> {
  try {
    const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const text = await result.Body?.transformToString();
    return text ? JSON.parse(text) : null;
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey') return null;
    throw error;
  }
}

async function persistRemoteLedger(r2: ReturnType<typeof makeR2>, ledger: unknown) {
  await r2.client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: SCENERY_SHOWCASE_REMOTE_LEDGER_KEY,
    Body: Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`),
    ContentType: 'application/json',
    IfNoneMatch: '*',
  }));
}

async function downloadOutput(r2: ReturnType<typeof makeR2>, expectedSha: string) {
  const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: SCENERY_SHOWCASE_OUTPUT_KEY }));
  const bytes = Buffer.from(await result.Body!.transformToByteArray());
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== expectedSha) throw new Error('LOCAL_OUTPUT_DOWNLOAD_HASH_MISMATCH');
  writeFileSync(VIDEO_FILE, bytes);
  return { bytes: bytes.byteLength, sha256: sha };
}

async function listPods(client: RunpodClient) {
  return client.listMyPods();
}

async function recoverExactNamedPod(client: RunpodClient): Promise<RunpodPodStatus | null> {
  const start = Date.now();
  while (Date.now() - start < AMBIGUOUS_CREATE_RECOVERY_MS) {
    const exact = (await listPods(client)).filter((pod) => pod.name === SCENERY_SHOWCASE_POD_NAME && activePod(pod));
    if (exact.length > 1) throw new Error('MAX_POD_COUNT_VIOLATED');
    if (exact.length === 1) return exact[0];
    await sleep(10_000);
  }
  return null;
}

async function terminateAndConfirm(client: RunpodClient, podId: string | null) {
  if (podId) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await client.terminatePod(podId);
        break;
      } catch {
        if (attempt < 3) await sleep(10_000);
      }
    }
  }
  const start = Date.now();
  while (Date.now() - start < TERMINATION_CONFIRM_MS) {
    const pods = await listPods(client);
    const active = pods.filter(activePod);
    const exact = active.filter((pod) => pod.name === SCENERY_SHOWCASE_POD_NAME);
    if (active.length === 0 && exact.length === 0) return { confirmed: true, activePods: 0, exactPods: 0 };
    await sleep(10_000);
  }
  const pods = await listPods(client);
  return {
    confirmed: false,
    activePods: pods.filter(activePod).length,
    exactPods: pods.filter((pod) => activePod(pod) && pod.name === SCENERY_SHOWCASE_POD_NAME).length,
  };
}

function validateCompleteStatus(status: any) {
  const failures: string[] = [];
  if (status?.status !== 'COMPLETE' || status?.stage !== 'COMPLETE') failures.push('STATUS');
  if (status?.jobId !== SCENERY_SHOWCASE_EXECUTION_ID) failures.push('JOB_ID');
  if (status?.outputKey !== SCENERY_SHOWCASE_OUTPUT_KEY) failures.push('OUTPUT_KEY');
  if (status?.frameCount < 900) failures.push('FRAME_COUNT');
  if (status?.resolution !== '1080x1920') failures.push('RESOLUTION');
  if (status?.fps !== 30) failures.push('FPS');
  if (Math.abs(Number(status?.durationSeconds || 0) - 30) > 0.1) failures.push('DURATION');
  if (!Array.isArray(status?.requiredRoles) || status.requiredRoles.length !== 12) failures.push('REQUIRED_ROLES');
  if (Number(status?.selectedRoleCount || 0) !== 12) failures.push('SELECTED_ROLE_COUNT');
  if (status?.commercialAssetsPublished !== false) failures.push('COMMERCIAL_ASSET_PRIVACY');
  if (!/^[0-9a-f]{64}$/.test(String(status?.artifactSha256 || ''))) failures.push('ARTIFACT_SHA');
  if (status?.artifactSha256 !== status?.readbackSha256) failures.push('R2_READBACK_SHA');
  return { ok: failures.length === 0, failures };
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!exactAuthorizationPresent(process.env)) {
    throw new Error(`PAID_AUTHORIZATION_REQUIRED:${SCENERY_SHOWCASE_AUTHORIZATION}`);
  }
  if (existsSync(LOCAL_LEDGER_FILE)) throw new Error('LOCAL_AUTHORIZATION_ALREADY_CONSUMED');

  const preflightRun = await import('node:child_process').then(({ spawnSync }) =>
    spawnSync('pnpm', ['exec', 'tsx', 'scripts/cloud/scenery-showcase-30s/preflight.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8_000_000,
      env: process.env,
    }),
  );
  if (preflightRun.status !== 0) {
    throw new Error(`PREFLIGHT_REFUSED:${String(preflightRun.stderr || preflightRun.stdout || '').slice(-1000)}`);
  }
  const preflight = JSON.parse(readFileSync(PREFLIGHT_FILE, 'utf8'));
  if (preflight.launchAllowed !== true || preflight.authorizationPresent !== true) throw new Error('PREFLIGHT_NOT_LAUNCH_AUTHORIZED');
  if (!preflight.runpod?.gpuTypeId || !Number.isFinite(Number(preflight.runpod?.secureUsdPerHr))) throw new Error('PREFLIGHT_QUOTE_MISSING');

  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as SceneryShowcaseWorkerPin;
  const r2 = makeR2();
  const readClient = new RunpodClient({ env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' } });
  const before = await listPods(readClient);
  if (before.filter(activePod).length !== 0) throw new Error('ACTIVE_POD_PRESENT_AT_LAST_SECOND');

  const ledger = {
    schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_CONSUMPTION_LEDGER_V1',
    authorization: SCENERY_SHOWCASE_AUTHORIZATION,
    executionId: SCENERY_SHOWCASE_EXECUTION_ID,
    imageDigest: pin.digest,
    imageRef: pin.ref,
    podName: SCENERY_SHOWCASE_POD_NAME,
    maxCreateRequests: 1,
    createRetryAllowed: false,
    consumedAt: new Date().toISOString(),
  };
  writeFileSync(LOCAL_LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx' });
  await persistRemoteLedger(r2, ledger);

  const quotedRate = Number(preflight.runpod.secureUsdPerHr);
  const createClient = new RunpodClient({
    env: {
      ...process.env,
      ALLOW_PAID_GPU_LAUNCH: 'true',
      CLOUD_RENDER_ENABLED: 'true',
      MAX_GPU_HOURLY_PRICE: '0.8',
      MAX_SINGLE_JOB_COST: String(SCENERY_SHOWCASE_HARD_COST_USD),
      MAX_JOB_RUNTIME_MINUTES: String(SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES),
    },
  });

  const podEnv: Record<string, string> = {
    R2_ENDPOINT: process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT || '',
    R2_REGION: process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto',
    R2_BUCKET: process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET || '',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID || '',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '',
    OBJECT_STORAGE_PROVIDER: 'r2',
    CLOUD_RENDER_ENABLED: 'true',
    PAID_EXECUTION_AUTHORIZED: 'true',
    SCENERY_SHOWCASE_EXECUTION_MODE: 'live',
    TIVVLEJOY_SCENERY_ASSET_PREFIX: 'tivvlejoy-assets',
    RENDER_JOB_ID: SCENERY_SHOWCASE_EXECUTION_ID,
    RENDER_WORKER_ID: `tivvlejoy-${SCENERY_SHOWCASE_EXECUTION_ID}`,
    RUNPOD_GPU_HOURLY_RATE: String(quotedRate),
    SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES: String(SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES),
    SCENERY_SHOWCASE_MAX_INPUT_BYTES: String(5 * 1024 * 1024 * 1024),
    SCENERY_SHOWCASE_EEVEE_SAMPLES: '48',
    R2_CONNECT_TIMEOUT_MS: '10000',
    R2_REQUEST_TIMEOUT_MS: '120000',
    R2_MAX_ATTEMPTS: '3',
  };
  if (Object.values(podEnv).some((value) => !value)) throw new Error('POD_ENV_INCOMPLETE');
  if ('RUNPOD_API_KEY' in podEnv || 'ALLOW_PAID_GPU_LAUNCH' in podEnv) throw new Error('POD_SECRET_POLICY_VIOLATION');

  let podId: string | null = null;
  let createEntered = false;
  let finalStatus: any = null;
  let cleanup: any = null;
  const startedAt = Date.now();

  try {
    createEntered = true;
    try {
      const created = await createClient.createPodForBenchmark({
        name: SCENERY_SHOWCASE_POD_NAME,
        imageName: pin.ref,
        gpuTypeId: String(preflight.runpod.gpuTypeId),
        confirmPaidLaunch: true,
        cloudType: 'SECURE',
        gpuCount: 1,
        containerDiskInGb: 60,
        volumeInGb: 20,
        env: podEnv,
      });
      podId = created.podId;
    } catch (error) {
      // CREATE itself is never retried. If the response was ambiguous, recover
      // only the exact pre-authorized name from the read-only pod list.
      const recovered = await recoverExactNamedPod(readClient);
      if (!recovered) throw error;
      podId = recovered.id;
    }

    let observedRate = quotedRate;
    let hardDeadline = startedAt + Math.min(
      SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES * 60_000,
      (SCENERY_SHOWCASE_HARD_COST_USD / Math.max(0.01, observedRate)) * 3_600_000 * 0.97,
    );
    const startupDeadline = startedAt + SCENERY_SHOWCASE_STARTUP_WATCHDOG_MINUTES * 60_000;
    let workerStarted = false;

    while (Date.now() < hardDeadline) {
      finalStatus = await readJsonKey(r2, SCENERY_SHOWCASE_STATUS_KEY);
      if (finalStatus?.status === 'COMPLETE') break;
      if (finalStatus?.status === 'FAILED') throw new Error(`WORKER_FAILED:${finalStatus.code || 'UNKNOWN'}:${finalStatus.message || ''}`);

      const pods = await listPods(readClient);
      const exact = pods.find((pod) => pod.id === podId || pod.name === SCENERY_SHOWCASE_POD_NAME);
      if (exact && Number(exact.costPerHr || 0) > 0 && Number(exact.costPerHr) !== observedRate) {
        observedRate = Number(exact.costPerHr);
        hardDeadline = Math.min(
          startedAt + SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES * 60_000,
          startedAt + (SCENERY_SHOWCASE_HARD_COST_USD / observedRate) * 3_600_000 * 0.97,
        );
      }
      const startup = await readJsonKey(r2, `jobs/${SCENERY_SHOWCASE_EXECUTION_ID}/startup-status.json`);
      if (startup) workerStarted = true;
      if (!workerStarted && Date.now() > startupDeadline) throw new Error('STARTUP_WATCHDOG_TIMEOUT');
      if (exact && !activePod(exact) && !finalStatus) throw new Error('POD_EXITED_WITHOUT_TERMINAL_STATUS');
      await sleep(SCENERY_SHOWCASE_POLL_MS);
    }
    if (!finalStatus || finalStatus.status !== 'COMPLETE') throw new Error('HARD_RUNTIME_OR_COST_DEADLINE');

    const contract = validateCompleteStatus(finalStatus);
    if (!contract.ok) throw new Error(`OUTPUT_CONTRACT_FAILED:${contract.failures.join(',')}`);
    const localVideo = await downloadOutput(r2, finalStatus.artifactSha256);
    const elapsedHours = (Date.now() - startedAt) / 3_600_000;
    const estimatedCostUsd = Number((elapsedHours * Math.max(quotedRate, Number(finalStatus?.gpuHourlyRate || 0))).toFixed(4));
    const report = {
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V1',
      status: 'COMPLETE',
      executionId: SCENERY_SHOWCASE_EXECUTION_ID,
      podId,
      imageRef: pin.ref,
      imageDigest: pin.digest,
      createRequests: 1,
      createRetryCount: 0,
      output: finalStatus,
      localVideo,
      estimatedCostUsd,
      humanVisualApprovalRequired: true,
      at: new Date().toISOString(),
    };
    writeFileSync(LAUNCH_FILE, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    cleanup = await terminateAndConfirm(readClient, podId);
    if (!cleanup.confirmed) {
      writeFileSync(LAUNCH_FILE, `${JSON.stringify({
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V1',
        status: 'CLEANUP_NOT_CONFIRMED',
        executionId: SCENERY_SHOWCASE_EXECUTION_ID,
        podId,
        createEntered,
        cleanup,
        at: new Date().toISOString(),
      }, null, 2)}\n`);
      throw new Error('CLEANUP_NOT_CONFIRMED');
    }
  }

  console.log(JSON.stringify({
    status: 'COMPLETE',
    executionId: SCENERY_SHOWCASE_EXECUTION_ID,
    createRequests: 1,
    createRetryCount: 0,
    outputKey: SCENERY_SHOWCASE_OUTPUT_KEY,
    localVideo: path.relative(REPO_ROOT, VIDEO_FILE).replace(/\\/g, '/'),
    cleanupConfirmed: cleanup.confirmed,
  }));
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    executionId: SCENERY_SHOWCASE_EXECUTION_ID,
    authorizationRequired: SCENERY_SHOWCASE_AUTHORIZATION,
    error: String((error as Error).message || error).slice(0, 1600),
  }));
  process.exitCode = 2;
});

#!/usr/bin/env tsx
/** Zero-cost preflight for the 30-second scenery showcase. Never creates a Pod. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveObjectStorageConfig } from '../../../packages/shared/src/index';
import { RunpodClient } from '../../../packages/production/src/cloud/runpod-client';
import { validateRunpodWorkerImageRef } from '../../../packages/production/src/cloud/config';
import {
  SCENERY_SHOWCASE_AUTHORIZATION,
  SCENERY_SHOWCASE_EXECUTION_ID,
  SCENERY_SHOWCASE_GPU_TYPE,
  SCENERY_SHOWCASE_HARD_COST_USD,
  SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES,
  SCENERY_SHOWCASE_POD_NAME,
  exactAuthorizationPresent,
  type SceneryShowcaseWorkerPin,
} from './contract';
import { loadProductionReadinessReceipt } from './quality-guardrails';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const PIN_FILE = path.join(REPO_ROOT, 'config/cloud/scenery-showcase-worker-image.json');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-showcase-30s');
const OUT_FILE = path.join(OUT_DIR, 'preflight.json');

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

function activeStatus(value: unknown): boolean {
  const status = String(value || '').toUpperCase();
  return !['TERMINATED', 'EXITED', 'STOPPED'].includes(status);
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  const blockers: string[] = [];
  let pin: SceneryShowcaseWorkerPin | null = null;
  let imageCheck: ReturnType<typeof validateRunpodWorkerImageRef> | null = null;

  // Fail closed on the quality side before doing any paid-launch eligibility work.
  // This receipt is produced only after source provenance, hidden-limit audit,
  // distance-quality checks, component proofs, human still approval, temporal
  // approval, and worker parity have all passed.
  const qualityGuardrail = loadProductionReadinessReceipt(REPO_ROOT);
  blockers.push(...qualityGuardrail.blockers);

  try {
    pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as SceneryShowcaseWorkerPin;
    imageCheck = validateRunpodWorkerImageRef(pin.ref);
    if (pin.schema !== 'TIVVLEJOY_SCENERY_SHOWCASE_WORKER_IMAGE_V1') blockers.push('IMAGE_PIN_SCHEMA');
    if (pin.status !== 'PUBLISHED_IMMUTABLE_DIGEST') blockers.push('IMAGE_NOT_PUBLISHED');
    if (!imageCheck.ok) blockers.push(imageCheck.code);
    if (pin.digest !== imageCheck.digest) blockers.push('IMAGE_DIGEST_REF_MISMATCH');
    if (pin.blenderVersion !== '4.2.2') blockers.push('BLENDER_VERSION_MISMATCH');
    if (pin.resolution !== '1080x1920' || pin.fps !== 30 || pin.frameCount !== 900) blockers.push('OUTPUT_PROFILE_MISMATCH');
    if (pin.commercialAssetsBaked !== false || pin.credentialsIncluded !== false) blockers.push('IMAGE_PRIVACY_CONTRACT');
    if (pin.paidGpuLaunchCount !== 0 || pin.runpodContacted !== false) blockers.push('IMAGE_BUILD_MUTATION_CONTRACT');
  } catch {
    blockers.push('IMAGE_PIN_MISSING_OR_INVALID');
  }

  let storageConfigured = false;
  try {
    const config = resolveObjectStorageConfig(storageEnv());
    storageConfigured = config.provider === 's3' && Boolean(config.bucket && config.endpoint && config.accessKeyId && config.secretAccessKey);
    if (!storageConfigured) blockers.push('PRIVATE_R2_NOT_CONFIGURED');
  } catch {
    blockers.push('PRIVATE_R2_NOT_CONFIGURED');
  }

  let runpodAuthOk = false;
  let gpuTypeId: string | null = null;
  let secureUsdPerHr: number | null = null;
  let stockStatus: string | null = null;
  let activePodCount: number | null = null;
  let exactNamePodCount: number | null = null;
  if (!process.env.RUNPOD_API_KEY) {
    blockers.push('RUNPOD_KEY_MISSING');
  } else {
    try {
      const readClient = new RunpodClient({ env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' } });
      const auth = await readClient.verifyAuthAndListGpus();
      runpodAuthOk = auth.ok;
      if (!auth.ok) blockers.push('RUNPOD_AUTH_FAILED');
      const gpu = auth.gpuTypes.find((g) =>
        g.id === SCENERY_SHOWCASE_GPU_TYPE ||
        g.displayName === SCENERY_SHOWCASE_GPU_TYPE ||
        g.displayName.toLowerCase().includes('4090'),
      );
      if (!gpu) {
        blockers.push('RTX_4090_NOT_FOUND');
      } else {
        gpuTypeId = gpu.id;
        const quote = await readClient.getSecureOnDemandPrice(gpu.id);
        secureUsdPerHr = quote.uninterruptablePrice;
        stockStatus = quote.stockStatus;
        if (!Number.isFinite(secureUsdPerHr) || Number(secureUsdPerHr) <= 0) blockers.push('SECURE_PRICE_UNAVAILABLE');
        if (Number(secureUsdPerHr) > 0.8) blockers.push('SECURE_PRICE_ABOVE_0_80_USD_PER_HR');
      }
      const pods = await readClient.listMyPods();
      const active = pods.filter((pod) => activeStatus(pod.desiredStatus));
      activePodCount = active.length;
      exactNamePodCount = active.filter((pod) => pod.name === SCENERY_SHOWCASE_POD_NAME).length;
      if (activePodCount !== 0) blockers.push('ACTIVE_RUNPOD_POD_PRESENT');
      if (exactNamePodCount !== 0) blockers.push('EXACT_SCENERY_POD_ALREADY_PRESENT');
    } catch (error) {
      blockers.push(`RUNPOD_READ_ONLY_PREFLIGHT_FAILED:${(error as Error).name}`);
    }
  }

  const authorizationPresent = exactAuthorizationPresent(process.env);
  const nonAuthorizationBlockers = blockers.filter((x) => x !== 'PAID_AUTHORIZATION_MISSING');
  if (!authorizationPresent) blockers.push('PAID_AUTHORIZATION_MISSING');

  const facts = {
    schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PREFLIGHT_V2',
    executionId: SCENERY_SHOWCASE_EXECUTION_ID,
    podName: SCENERY_SHOWCASE_POD_NAME,
    requiredAuthorization: SCENERY_SHOWCASE_AUTHORIZATION,
    authorizationPresent,
    qualityGuardrail: {
      ok: qualityGuardrail.ok,
      path: qualityGuardrail.path,
      schema: qualityGuardrail.receipt?.schema || null,
      stages: qualityGuardrail.receipt?.stages || [],
      humanVisualApproved: qualityGuardrail.receipt?.humanVisualApproved === true,
      motionTemporalApproved: qualityGuardrail.receipt?.motionTemporalApproved === true,
      workerParityOk: qualityGuardrail.receipt?.workerParityOk === true,
      fallbackCount: qualityGuardrail.receipt?.fallbackCount ?? null,
      blockers: qualityGuardrail.blockers,
    },
    image: pin
      ? { status: pin.status, ref: pin.ref, digest: pin.digest, sourceCommit: pin.sourceCommit, blenderVersion: pin.blenderVersion }
      : null,
    output: { resolution: '1080x1920', fps: 30, frameCount: 900, durationSeconds: 30 },
    privateR2Configured: storageConfigured,
    runpod: {
      authOk: runpodAuthOk,
      gpuTypeId,
      secureUsdPerHr,
      stockStatus,
      activePodCount,
      exactNamePodCount,
      createRequests: 0,
    },
    limits: {
      hardCostUsd: SCENERY_SHOWCASE_HARD_COST_USD,
      maxRuntimeMinutes: SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES,
      secureHourlyPriceCeilingUsd: 0.8,
      maxCreateRequests: 1,
      maxPods: 1,
      retryCreate: false,
    },
    readyAwaitingAuthorization: nonAuthorizationBlockers.length === 0 && !authorizationPresent,
    launchAllowed: blockers.length === 0 && authorizationPresent,
    blockers,
    paidMutationPerformed: false,
    commercialAssetBytesDownloaded: 0,
    credentialsPrinted: false,
    at: new Date().toISOString(),
  };

  writeFileSync(OUT_FILE, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(JSON.stringify({
    status: facts.launchAllowed ? 'LAUNCH_AUTHORIZED' : facts.readyAwaitingAuthorization ? 'READY_AWAITING_AUTHORIZATION' : 'BLOCKED',
    launchAllowed: facts.launchAllowed,
    readyAwaitingAuthorization: facts.readyAwaitingAuthorization,
    qualityGuardrailOk: qualityGuardrail.ok,
    blockers: facts.blockers,
    secureUsdPerHr,
    createRequests: 0,
  }));
  process.exitCode = nonAuthorizationBlockers.length === 0 ? 0 : 2;
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'BLOCKED', code: 'PREFLIGHT_FATAL', error: String((error as Error).message || error).slice(0, 500), createRequests: 0 }));
  process.exitCode = 2;
});

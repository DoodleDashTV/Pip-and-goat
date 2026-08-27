import { NextResponse } from 'next/server';
import { S3Client } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const EXECUTION_ID = 'scenery-showcase-30s-v1-20260827';
const POD_NAME = 'tivvlejoy-scenery-showcase-30s-v1';
const V1_AUTHORIZATION = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V1';
const V2_AUTHORIZATION = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V2';
const WORKER_IMAGE = 'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673';
const MAX_HOURLY_USD = 0.8;
const HARD_COST_USD = 2.0;
const MAX_RUNTIME_MINUTES = 120;

function clean(value: string | null | undefined) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function r2Config() {
  const endpoint = clean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT);
  const region = clean(process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto');
  const bucket = clean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET);
  const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function runpod(runpodKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${runpodKey}`,
      'User-Agent': 'TivvleJoySceneryBridgeV2/1.0',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok || parsed?.errors?.length) throw new Error('RUNPOD_REQUEST_FAILED');
  return parsed.data || {};
}

function requireV2Authorization(request: Request) {
  if (clean(request.headers.get('x-tivvlejoy-scenery-authorization')) !== V2_AUTHORIZATION) {
    throw new Error('PAID_AUTHORIZATION_V2_REQUIRED');
  }
  const runpodKey = clean(request.headers.get('x-tivvlejoy-runpod-key'));
  if (!runpodKey) throw new Error('RUNPOD_KEY_REQUIRED');
  return runpodKey;
}

async function legacyPreflight(request: Request, runpodKey: string) {
  const url = new URL('/api/scenery/showcase-30s', request.url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tivvlejoy-scenery-authorization': V1_AUTHORIZATION,
      'x-tivvlejoy-runpod-key': runpodKey,
    },
    body: JSON.stringify({ action: 'preflight' }),
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`V1_PREFLIGHT_FAILED:${clean(payload?.error || String(res.status))}`);
  if (payload?.paidMutationPerformed !== false) throw new Error('V1_PREFLIGHT_MUTATION_CONTRACT_VIOLATION');
  if (payload?.ready !== true || payload?.assets?.ok !== true) throw new Error('SCENERY_PREFLIGHT_NOT_READY');
  const gpu = payload?.runpod || {};
  const rate = Number(gpu?.rate);
  const gpuTypeId = clean(gpu?.gpuTypeId);
  if (!gpuTypeId || !Number.isFinite(rate) || rate <= 0 || rate > MAX_HOURLY_USD) {
    throw new Error('SECURE_4090_PREFLIGHT_INVALID');
  }
  return { payload, gpuTypeId, rate, stockStatus: gpu?.stockStatus || null };
}

export async function GET() {
  return NextResponse.json({
    schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_BRIDGE_V3',
    executionId: EXECUTION_ID,
    workerImage: WORKER_IMAGE,
    workerImagePinned: WORKER_IMAGE.includes('@sha256:'),
    workerEntrypoint: 'scenery-showcase-entry-v2.js',
    dryShowcaseBaked: true,
    runtimeDockerArgsRequired: false,
    startupWatchdogRecommendedMinutes: 30,
    paidMutationPerformed: false,
  });
}

export async function POST(request: Request) {
  let createEntered = false;
  try {
    const runpodKey = requireV2Authorization(request);
    const body = await request.json().catch(() => ({}));
    const action = clean(body?.action || 'preflight');
    if (!['preflight', 'launch'].includes(action)) throw new Error('UNKNOWN_ACTION');

    const preflight = await legacyPreflight(request, runpodKey);
    if (action === 'preflight') {
      return NextResponse.json({
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PREFLIGHT_V4',
        ready: true,
        assets: preflight.payload.assets,
        runpod: {
          gpuTypeId: preflight.gpuTypeId,
          rate: preflight.rate,
          stockStatus: preflight.stockStatus,
        },
        workerImage: WORKER_IMAGE,
        workerImagePinned: true,
        workerEntrypoint: 'scenery-showcase-entry-v2.js',
        dryShowcaseBaked: true,
        runtimeDockerArgsRequired: false,
        startupWatchdogRecommendedMinutes: 30,
        limits: {
          hardCostUsd: HARD_COST_USD,
          maxRuntimeMinutes: MAX_RUNTIME_MINUTES,
          maxHourlyUsd: MAX_HOURLY_USD,
          maxCreates: 1,
        },
        paidMutationPerformed: false,
      });
    }

    const r2 = r2Config();
    const podEnv = [
      { key: 'R2_ENDPOINT', value: r2.endpoint },
      { key: 'R2_REGION', value: r2.region },
      { key: 'R2_BUCKET', value: r2.bucket },
      { key: 'R2_ACCESS_KEY_ID', value: r2.accessKeyId },
      { key: 'R2_SECRET_ACCESS_KEY', value: r2.secretAccessKey },
      { key: 'OBJECT_STORAGE_PROVIDER', value: 'r2' },
      { key: 'CLOUD_RENDER_ENABLED', value: 'true' },
      { key: 'PAID_EXECUTION_AUTHORIZED', value: 'true' },
      { key: 'SCENERY_SHOWCASE_EXECUTION_MODE', value: 'live' },
      { key: 'TIVVLEJOY_SCENERY_ASSET_PREFIX', value: 'tivvlejoy-assets' },
      { key: 'RENDER_JOB_ID', value: EXECUTION_ID },
      { key: 'RENDER_WORKER_ID', value: `tivvlejoy-${EXECUTION_ID}` },
      { key: 'RUNPOD_GPU_HOURLY_RATE', value: String(preflight.rate) },
      { key: 'SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES', value: String(MAX_RUNTIME_MINUTES) },
      { key: 'SCENERY_SHOWCASE_MAX_INPUT_BYTES', value: String(5 * 1024 * 1024 * 1024) },
      { key: 'SCENERY_SHOWCASE_EEVEE_SAMPLES', value: '48' },
      { key: 'R2_CONNECT_TIMEOUT_MS', value: '10000' },
      { key: 'R2_REQUEST_TIMEOUT_MS', value: '120000' },
      { key: 'R2_MAX_ATTEMPTS', value: '3' },
    ];
    if (podEnv.some((entry) => !entry.value)) throw new Error('POD_ENV_INCOMPLETE');

    createEntered = true;
    const data = await runpod(runpodKey, `mutation($input: PodFindAndDeployOnDemandInput!) {
      podFindAndDeployOnDemand(input: $input) { id }
    }`, {
      input: {
        name: POD_NAME,
        imageName: WORKER_IMAGE,
        gpuTypeId: preflight.gpuTypeId,
        gpuCount: 1,
        cloudType: 'SECURE',
        containerDiskInGb: 60,
        volumeInGb: 20,
        env: podEnv,
      },
    });

    const podId = clean(data?.podFindAndDeployOnDemand?.id);
    if (!podId) throw new Error('RUNPOD_POD_CREATE_RETURNED_NO_ID');
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V3',
      executionId: EXECUTION_ID,
      podId,
      createEntered: true,
      createRequests: 1,
      retryCreate: false,
      runpod: { secureUsdPerHr: preflight.rate, stockStatus: preflight.stockStatus },
      workerImage: WORKER_IMAGE,
      workerEntrypoint: 'scenery-showcase-entry-v2.js',
      dryShowcase: true,
      dryShowcaseBaked: true,
      runtimeDockerArgsRequired: false,
      limits: {
        hardCostUsd: HARD_COST_USD,
        maxRuntimeMinutes: MAX_RUNTIME_MINUTES,
        maxHourlyUsd: MAX_HOURLY_USD,
      },
    });
  } catch (error) {
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V3',
      error: clean((error as Error).message).slice(0, 240) || 'BRIDGE_V2_FAILED',
      createEntered,
      retryCreate: false,
    }, { status: 400 });
  }
}

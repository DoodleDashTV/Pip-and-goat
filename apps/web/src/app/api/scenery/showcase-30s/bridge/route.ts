import { NextResponse } from 'next/server';
import { handleSceneryIntakeAction } from '@/lib/scenery/intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GPU_NAME = 'NVIDIA GeForce RTX 4090';
const POD_NAME = 'tivvlejoy-scenery-showcase-30s-v1';
const IMAGE_REF =
  'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:3eb753e642a3d257c9291fa651124bceb707bd2ac4e1aa40c3cf1eedabda3f3a';

function nonEmpty(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function storageReady() {
  const endpoint = process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET;
  const access = process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  return [endpoint, bucket, access, secret].every(nonEmpty);
}

async function runpodGraphql(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch(process.env.RUNPOD_API_ENDPOINT || 'https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'TivvleJoySceneryShowcaseBridge/1.0',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as
    | { data?: Record<string, unknown>; errors?: Array<{ message?: string }> }
    | null;
  if (!response.ok || !json || json.errors?.length) {
    throw new Error('RUNPOD_READ_ONLY_PREFLIGHT_FAILED');
  }
  return json.data ?? {};
}

export async function GET() {
  const status = await handleSceneryIntakeAction({
    action: 'status',
    body: {},
    publicPreview: true,
  });
  const manifests = Array.isArray(status.manifests)
    ? (status.manifests as Array<Record<string, unknown>>)
    : [];
  const verified = manifests.filter(
    (item) =>
      String(item.uploadState ?? '') === 'completed' &&
      String(item.verificationState ?? '') === 'size_verified',
  ).length;

  return NextResponse.json({
    schema: 'TIVVLEJOY_SCENERY_SHOWCASE_R2_BRIDGE_V1',
    mode: 'R2_ONLY_ZERO_COST',
    privateR2Configured: storageReady(),
    purchasedSourceObjectCount:
      typeof status.purchasedSourceObjectCount === 'number' ? status.purchasedSourceObjectCount : null,
    verifiedPurchasedFiles: verified,
    requiredPurchasedFiles: 14,
    exactWorkerImage: IMAGE_REF,
    exactPodName: POD_NAME,
    gpuTarget: GPU_NAME,
    runpodKeyStoredHere: nonEmpty(process.env.RUNPOD_API_KEY),
    paidMutationPerformed: false,
    commercialAssetBytesReturned: 0,
    credentialsReturned: false,
  });
}

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-tivvlejoy-runpod-api-key')?.trim() ?? '';
  if (!apiKey) {
    return NextResponse.json(
      {
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_R2_BRIDGE_V1',
        status: 'RUNPOD_KEY_REQUIRED_FOR_READ_ONLY_BRIDGE',
        paidMutationPerformed: false,
      },
      { status: 401 },
    );
  }

  try {
    const status = await handleSceneryIntakeAction({
      action: 'status',
      body: {},
      publicPreview: true,
    });
    const manifests = Array.isArray(status.manifests)
      ? (status.manifests as Array<Record<string, unknown>>)
      : [];
    const verified = manifests.filter(
      (item) =>
        String(item.uploadState ?? '') === 'completed' &&
        String(item.verificationState ?? '') === 'size_verified',
    ).length;

    const data = (await runpodGraphql(
      apiKey,
      `query BridgePreflight($gpuId: String) {
        myself {
          id
          pods {
            id
            name
            desiredStatus
            costPerHr
          }
        }
        gpuTypes(input: { id: $gpuId }) {
          id
          displayName
          lowestPrice(input: { gpuCount: 1, secureCloud: true }) {
            uninterruptablePrice
            stockStatus
          }
        }
      }`,
      { gpuId: GPU_NAME },
    )) as {
      myself?: {
        id?: string;
        pods?: Array<{ id?: string; name?: string; desiredStatus?: string; costPerHr?: number }>;
      };
      gpuTypes?: Array<{
        id?: string;
        displayName?: string;
        lowestPrice?: { uninterruptablePrice?: number; stockStatus?: string } | null;
      }>;
    };

    const gpu = (data.gpuTypes ?? []).find(
      (item) => item.id === GPU_NAME || item.displayName === GPU_NAME,
    );
    const active = (data.myself?.pods ?? []).filter((pod) => {
      const state = String(pod.desiredStatus ?? '').toUpperCase();
      return !['TERMINATED', 'EXITED', 'STOPPED'].includes(state);
    });
    const exact = active.filter((pod) => pod.name === POD_NAME);
    const secureUsdPerHr = Number(gpu?.lowestPrice?.uninterruptablePrice ?? NaN);
    const blockers: string[] = [];
    if (!storageReady()) blockers.push('PRIVATE_R2_NOT_CONFIGURED');
    if (verified < 14) blockers.push('PURCHASED_SCENERY_NOT_VERIFIED_14_OF_14');
    if (!data.myself?.id) blockers.push('RUNPOD_AUTH_FAILED');
    if (!gpu) blockers.push('RTX_4090_NOT_FOUND');
    if (!Number.isFinite(secureUsdPerHr) || secureUsdPerHr <= 0) blockers.push('SECURE_PRICE_UNAVAILABLE');
    if (Number.isFinite(secureUsdPerHr) && secureUsdPerHr > 0.8) blockers.push('SECURE_PRICE_ABOVE_0_80_USD_PER_HR');
    if (active.length !== 0) blockers.push('ACTIVE_RUNPOD_POD_PRESENT');
    if (exact.length !== 0) blockers.push('EXACT_SCENERY_POD_ALREADY_PRESENT');

    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_COMBINED_PREFLIGHT_V1',
      status: blockers.length === 0 ? 'READY_AWAITING_PAID_AUTHORIZATION' : 'BLOCKED',
      exactWorkerImage: IMAGE_REF,
      exactPodName: POD_NAME,
      privateR2Configured: storageReady(),
      purchasedSourceObjectCount:
        typeof status.purchasedSourceObjectCount === 'number'
          ? status.purchasedSourceObjectCount
          : null,
      verifiedPurchasedFiles: verified,
      requiredPurchasedFiles: 14,
      runpod: {
        authOk: Boolean(data.myself?.id),
        gpuTypeId: gpu?.id ?? null,
        secureUsdPerHr: Number.isFinite(secureUsdPerHr) ? secureUsdPerHr : null,
        stockStatus: gpu?.lowestPrice?.stockStatus ?? null,
        activePodCount: active.length,
        exactNamePodCount: exact.length,
        createRequests: 0,
      },
      limits: {
        hardCostUsd: 2,
        secureHourlyPriceCeilingUsd: 0.8,
        maxCreateRequests: 1,
        retryCreate: false,
      },
      blockers,
      paidMutationPerformed: false,
      credentialsReturned: false,
      commercialAssetBytesReturned: 0,
    });
  } catch {
    return NextResponse.json(
      {
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_COMBINED_PREFLIGHT_V1',
        status: 'BLOCKED',
        blockers: ['RUNPOD_READ_ONLY_PREFLIGHT_FAILED'],
        paidMutationPerformed: false,
        credentialsReturned: false,
      },
      { status: 502 },
    );
  }
}

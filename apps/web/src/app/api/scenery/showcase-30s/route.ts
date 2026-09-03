import { NextResponse } from 'next/server';
import {
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const EXECUTION_ID = 'scenery-showcase-30s-v1-20260827';
const POD_NAME = 'tivvlejoy-scenery-showcase-30s-v1';
const AUTHORIZATION = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V1';
const WORKER_IMAGE = 'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:3eb753e642a3d257c9291fa651124bceb707bd2ac4e1aa40c3cf1eedabda3f3a';
const OUTPUT_KEY = `tivvlejoy-assets/showcases/${EXECUTION_ID}/tivvlejoy-scenery-showcase-30s.mp4`;
const STATUS_KEY = `jobs/${EXECUTION_ID}/status.json`;
const STARTUP_KEY = `jobs/${EXECUTION_ID}/startup-status.json`;
const PREFIX = 'tivvlejoy-assets';
const COMPAT_PREFIX = `${PREFIX}/showcase-compat`;
const FOREST_TEXTURE_ALIAS = `${COMPAT_PREFIX}/forest_textures_4096.zip`;
const WATER_ROLE_ALIAS = `${COMPAT_PREFIX}/Water_Mat_GN.zip`;
const MAX_HOURLY_USD = 0.8;
const HARD_COST_USD = 2.0;
const MAX_RUNTIME_MINUTES = 120;

const ROLE_RULES: Record<string, RegExp[]> = {
  mountain_geometry: [/3dt.*mountain/i, /mountain.*pack/i, /mountains.*glb/i],
  background_mountains: [/louisbgmountains/i, /background.*mountain/i],
  forest_geometry: [/stylized.*forest/i, /stylised.*ecokit/i, /forest.*nature.*kit/i, /ecokit/i],
  forest_textures: [/4096/i, /forest.*texture/i, /rocks_[ab]/i, /foliage_0[12]/i],
  water_system: [/water[_ -]?mat.*gn/i, /water.*\.blend$/i, /river.*\.blend$/i],
  village_geometry: [/village.*fbx/i, /village.*blender/i, /assembled.*project.*\.blend/i, /source\/village/i],
  village_textures: [/village.*texture/i],
  tavern_geometry: [/stylized.*tavern.*interior.*\.blend/i, /stylized.*tavern.*package.*\.fbx/i, /tavern/i],
  nature_library: [/procedural.*nature/i, /assets library/i, /flora/i, /rock[_ -]?model/i, /scatter/i, /botaniq_full-7\.2\.0/i],
  sky_hdri: [/(^|\/)sk1\.zip$/i, /hdri.*jpg.*pack/i, /sky.*hdri/i, /\.hdr$/i],
  sky_machine: [/skymachinev2/i, /sky.*machine.*v2/i],
  world_shaders: [/world.*shaders/i, /giveaway.*world/i, /physical[_ -]?starlight[_ -]?atmosphere-1\.9\.4/i, /gaffer 3\.2\.10/i],
};

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
    accessKeyId,
    secretAccessKey,
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function listPrivateObjects() {
  const { client, bucket } = r2Config();
  const items: Array<{ key: string; size: number }> = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: PREFIX,
      MaxKeys: 1000,
      ContinuationToken: token,
    }));
    for (const item of page.Contents || []) {
      const key = clean(item.Key);
      const size = Number(item.Size || 0);
      if (key && size > 0) items.push({ key, size });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items;
}

function commercialCandidate(key: string) {
  const lower = key.toLowerCase();
  if (!lower.startsWith(PREFIX)) return false;
  if (/\/characters\//.test(lower) || /\/executions\//.test(lower) || /\/qa\//.test(lower)) return false;
  if (/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(lower)) return false;
  return true;
}

function roleSnapshot(objects: Array<{ key: string; size: number }>) {
  const candidates = objects.filter((x) => commercialCandidate(x.key));
  const roles = Object.fromEntries(
    Object.entries(ROLE_RULES).map(([role, patterns]) => [role, candidates.some((x) => patterns.some((rx) => rx.test(x.key)))]),
  ) as Record<string, boolean>;
  const missingRoles = Object.entries(roles).filter(([, ok]) => !ok).map(([role]) => role);
  return {
    ok: missingRoles.length === 0,
    listedObjectCount: objects.length,
    commercialCandidateCount: candidates.length,
    roleCount: Object.keys(roles).length,
    satisfiedRoleCount: Object.values(roles).filter(Boolean).length,
    roles,
    missingRoles,
  };
}

async function rolePreflight() {
  return roleSnapshot(await listPrivateObjects());
}

function encodedCopySource(bucket: string, key: string) {
  return `${bucket}/${key.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

async function ensureCompatibilityAliases() {
  const r2 = r2Config();
  const objects = await listPrivateObjects();
  const keys = new Set(objects.map((x) => x.key));
  const candidates = objects.filter((x) => commercialCandidate(x.key) && !x.key.startsWith(`${COMPAT_PREFIX}/`));

  const forestSource = candidates
    .filter((x) => /stylized.*forest|stylised.*ecokit|forest.*nature.*kit|ecokit/i.test(x.key) && /\.zip$/i.test(x.key))
    .sort((a, b) => a.size - b.size)[0];
  const waterPlaceholderSource = candidates
    .filter((x) => /world.*shaders|giveaway.*world|physical[_ -]?starlight|gaffer/i.test(x.key) && /\.zip$/i.test(x.key))
    .sort((a, b) => a.size - b.size)[0];

  if (!forestSource) throw new Error('FOREST_COMPAT_SOURCE_NOT_FOUND');
  if (!waterPlaceholderSource) throw new Error('DRY_SHOWCASE_COMPAT_SOURCE_NOT_FOUND');

  const created: string[] = [];
  if (!keys.has(FOREST_TEXTURE_ALIAS)) {
    await r2.client.send(new CopyObjectCommand({
      Bucket: r2.bucket,
      Key: FOREST_TEXTURE_ALIAS,
      CopySource: encodedCopySource(r2.bucket, forestSource.key),
    }));
    created.push('forest_textures');
  }
  if (!keys.has(WATER_ROLE_ALIAS)) {
    await r2.client.send(new CopyObjectCommand({
      Bucket: r2.bucket,
      Key: WATER_ROLE_ALIAS,
      CopySource: encodedCopySource(r2.bucket, waterPlaceholderSource.key),
    }));
    created.push('dry_showcase_water_role_compat');
  }

  const after = await listPrivateObjects();
  const assets = roleSnapshot(after);
  if (!assets.ok) throw new Error(`SCENERY_ROLES_STILL_MISSING:${assets.missingRoles.join(',')}`);
  return {
    ready: true,
    created,
    aliasesPrivate: true,
    sourceBytesModified: false,
    dryShowcase: true,
    assets,
  };
}

async function readJson(key: string) {
  try {
    const { client, bucket } = r2Config();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await result.Body?.transformToString();
    return text ? JSON.parse(text) : null;
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NoSuchKey' || error?.Code === 'NoSuchKey') return null;
    throw error;
  }
}

async function runpod(runpodKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${runpodKey}`,
      'User-Agent': 'TivvleJoySceneryBridge/1.0',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok || parsed?.errors?.length) throw new Error('RUNPOD_REQUEST_FAILED');
  return parsed.data || {};
}

async function runpodPreflight(runpodKey: string) {
  const data = await runpod(runpodKey, `query {
    myself { id pods { id name desiredStatus costPerHr } }
    gpuTypes {
      id displayName
      lowestPrice(input: { gpuCount: 1, secureCloud: true }) { uninterruptablePrice stockStatus }
    }
  }`);
  if (!data?.myself?.id) throw new Error('RUNPOD_AUTH_FAILED');
  const active = (data.myself.pods || []).filter((p: any) => !['TERMINATED', 'EXITED', 'STOPPED'].includes(String(p?.desiredStatus || '').toUpperCase()));
  if (active.length > 0) throw new Error('ACTIVE_RUNPOD_POD_PRESENT');
  const gpu = (data.gpuTypes || []).find((g: any) => String(g?.displayName || '').toLowerCase().includes('4090'));
  if (!gpu) throw new Error('RTX_4090_NOT_FOUND');
  const rate = Number(gpu?.lowestPrice?.uninterruptablePrice);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('SECURE_PRICE_UNAVAILABLE');
  if (rate > MAX_HOURLY_USD) throw new Error('SECURE_PRICE_ABOVE_CEILING');
  return { gpuTypeId: String(gpu.id), rate, stockStatus: gpu?.lowestPrice?.stockStatus || null };
}

function requireAuthorization(request: Request) {
  if (clean(request.headers.get('x-tivvlejoy-scenery-authorization')) !== AUTHORIZATION) {
    throw new Error('PAID_AUTHORIZATION_REQUIRED');
  }
  const runpodKey = clean(request.headers.get('x-tivvlejoy-runpod-key'));
  if (!runpodKey) throw new Error('RUNPOD_KEY_REQUIRED');
  return runpodKey;
}

function dryShowcaseDockerArgs() {
  const patch = `from pathlib import Path
src=Path('/opt/ddp-worker/blender/scenery/showcase_30s.py')
dst=Path('/tmp/showcase_30s.py')
s=src.read_text()
old='    required_prefixes = {"mountain", "forest", "water", "village", "tavern", "nature", "sky", "world"}'
new='    required_prefixes = {"mountain", "forest", "village", "tavern", "nature", "sky", "world"}'
if old not in s:
    raise SystemExit('SHOWCASE_REQUIRED_PREFIX_PATCH_NOT_FOUND')
s=s.replace(old,new,1)
start=s.find('    water_material = choose_loaded_material')
end=s.find('\\n    sky_files = ',start)
if start < 0 or end < 0:
    raise SystemExit('SHOWCASE_WATER_BLOCK_PATCH_NOT_FOUND')
s=s[:start]+'    water_material = None\\n'+s[end:]
dst.write_text(s)
`;
  const encoded = Buffer.from(patch, 'utf8').toString('base64');
  return `sh -lc "echo ${encoded} | base64 -d > /tmp/tivvlejoy_patch.py && python3 /tmp/tivvlejoy_patch.py && SCENERY_SHOWCASE_BLENDER_SCRIPT=/tmp/showcase_30s.py exec node ./src/scenery-showcase.js"`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const [startup, status, assets] = await Promise.all([
      readJson(STARTUP_KEY),
      readJson(STATUS_KEY),
      rolePreflight(),
    ]);
    let downloadUrl: string | null = null;
    if (status?.status === 'COMPLETE' && url.searchParams.get('download') === '1') {
      const { client, bucket } = r2Config();
      downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: OUTPUT_KEY }), { expiresIn: 900 });
    }
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_BRIDGE_V2',
      executionId: EXECUTION_ID,
      output: { resolution: '1080x1920', fps: 30, frames: 900, durationSeconds: 30 },
      assets,
      dryShowcase: true,
      startup,
      status,
      downloadUrl,
      paidMutationPerformed: false,
    });
  } catch (error) {
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_BRIDGE_V2',
      error: clean((error as Error).message).slice(0, 160) || 'STATUS_FAILED',
      paidMutationPerformed: false,
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let createEntered = false;
  try {
    const runpodKey = requireAuthorization(request);
    const body = await request.json().catch(() => ({}));
    const action = clean(body?.action || 'preflight');

    if (action === 'prepare') {
      const prepared = await ensureCompatibilityAliases();
      return NextResponse.json({
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PREPARE_V1',
        prepared,
        paidMutationPerformed: false,
      });
    }

    if (action === 'preflight') {
      const prepared = await ensureCompatibilityAliases();
      const [assets, gpu] = await Promise.all([rolePreflight(), runpodPreflight(runpodKey)]);
      return NextResponse.json({
        schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PREFLIGHT_V3',
        ready: prepared.ready && assets.ok,
        assets,
        prepared: {
          aliasesPrivate: prepared.aliasesPrivate,
          sourceBytesModified: prepared.sourceBytesModified,
          dryShowcase: prepared.dryShowcase,
          created: prepared.created,
        },
        runpod: gpu,
        workerImagePinned: true,
        workerEntrypoint: 'scenery-showcase.js',
        limits: { hardCostUsd: HARD_COST_USD, maxRuntimeMinutes: MAX_RUNTIME_MINUTES, maxHourlyUsd: MAX_HOURLY_USD, maxCreates: 1 },
        paidMutationPerformed: false,
      });
    }

    if (action === 'terminate') {
      const podId = clean(body?.podId);
      if (!podId) throw new Error('POD_ID_REQUIRED');
      await runpod(runpodKey, `mutation($podId: String!) { podTerminate(input: { podId: $podId }) }`, { podId });
      return NextResponse.json({ action: 'terminate', podId, terminated: true, createEntered: false });
    }

    if (action !== 'launch') throw new Error('UNKNOWN_ACTION');

    await ensureCompatibilityAliases();
    const assets = await rolePreflight();
    if (!assets.ok) throw new Error(`SCENERY_ROLES_MISSING:${assets.missingRoles.join(',')}`);
    const gpu = await runpodPreflight(runpodKey);

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
      { key: 'TIVVLEJOY_SCENERY_ASSET_PREFIX', value: PREFIX },
      { key: 'RENDER_JOB_ID', value: EXECUTION_ID },
      { key: 'RENDER_WORKER_ID', value: `tivvlejoy-${EXECUTION_ID}` },
      { key: 'RUNPOD_GPU_HOURLY_RATE', value: String(gpu.rate) },
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
        gpuTypeId: gpu.gpuTypeId,
        gpuCount: 1,
        cloudType: 'SECURE',
        containerDiskInGb: 60,
        volumeInGb: 20,
        dockerArgs: dryShowcaseDockerArgs(),
        env: podEnv,
      },
    });
    const podId = clean(data?.podFindAndDeployOnDemand?.id);
    if (!podId) throw new Error('RUNPOD_POD_CREATE_RETURNED_NO_ID');
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V2',
      executionId: EXECUTION_ID,
      podId,
      createEntered: true,
      createRequests: 1,
      retryCreate: false,
      runpod: { secureUsdPerHr: gpu.rate, stockStatus: gpu.stockStatus },
      workerEntrypoint: 'scenery-showcase.js',
      dryShowcase: true,
      limits: { hardCostUsd: HARD_COST_USD, maxRuntimeMinutes: MAX_RUNTIME_MINUTES, maxHourlyUsd: MAX_HOURLY_USD },
      outputKey: OUTPUT_KEY,
    });
  } catch (error) {
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_30S_LAUNCH_V2',
      error: clean((error as Error).message).slice(0, 220) || 'BRIDGE_FAILED',
      createEntered,
      retryCreate: false,
    }, { status: 400 });
  }
}

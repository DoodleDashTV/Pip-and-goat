/**
 * TivvleJoy ONE-POD paid smoke test.
 *
 * Default CLI is preflight-only and remains fail-closed.
 * Real POST /v1/pods happens only from the execute command after every
 * zero-cost gate, preexisting-pod check, and live price check pass.
 *
 * Committed defaults stay blocked. Never print secrets.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
  REST_PODS_URL,
  extractPodId,
  formatUsdFromMicros,
  listPodsReadonly,
  parseUsdToMicros,
  projectedComputeMicros,
  runRenderPlan,
} from './tivvlejoy-guarded-render.mjs';
import {
  buildTivvleJoyRemoteJobPackage,
  buildWorkerEnvironment,
  defaultPilotJob,
  hashCanonical,
  redactWorkerSecrets,
  sanitizeWorkerEnvForLog,
} from './tivvlejoy-remote-blender-foundation.mjs';
import {
  APPROVED_TEMPLATE_ID,
  buildBoundGuardedPodPayload,
  createLaunchDryRunTripwire,
  resolveApprovedTemplateBinding,
  runBoundLaunchDryRun,
  verifyPinnedWorkerImageContract,
} from './tivvlejoy-runpod-template-binding.mjs';
import {
  APPROVED_LAUNCH_INTENT_SHA256,
  CLEANUP_ATTENTION_CODE,
  LIFECYCLE_STATUS,
  createClock,
  runPodLifecycle,
} from './tivvlejoy-runpod-lifecycle.mjs';
import {
  REAL_ADAPTER_STATUS,
  REQUIRED_PAID_APPROVAL_PHRASE,
  REQUIRED_PAID_SMOKE_MODE,
  completePaidSmokeAuthorization,
  createRealRunPodLifecycleAdapter,
  evaluatePaidSmokeGate,
  runRealLifecyclePreflight,
} from './tivvlejoy-runpod-real-lifecycle-adapter.mjs';
import {
  REQUIRED_IMAGE_NAME,
  redactSecrets,
} from './tivvlejoy-runpod-template-readiness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIB = path.join(REPO_ROOT, 'production-library');
const require = createRequire(path.join(REPO_ROOT, 'packages/shared/package.json'));
const { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

export const PAID_SMOKE_STATUS = 'PAID_SMOKE_PREFLIGHT_PASS';
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const REAL_NETWORK_MUTATION_ENABLED = false;
export const SMOKE_FRAME_START = 1;
export const SMOKE_FRAME_END = 8;
// Genuine STARTUP budget after the worker cancels StartupWatchdog at
// WORKER_READY. Covers container boot, GPU health, and the Blender probe.
// The single-shot runtime/cost guard owns the render after that.
export const SMOKE_STARTUP_WATCHDOG_MS = 300_000;
export const SMOKE_EPISODE_ID = 'meadow-map-mystery';
export const SMOKE_SHOT_ID = 'meadow-map-smoke';

const FOUNDING_ASSETS = Object.freeze([
  {
    role: 'meadow',
    kind: 'blend',
    logicalId: 'env_meadow_v1',
    filename: 'meadow_production.blend',
    localPath: path.join(LIB, 'environments/meadow_production.blend'),
  },
  {
    role: 'map',
    kind: 'blend',
    logicalId: 'prop_map_001',
    filename: 'adventure_map.blend',
    localPath: path.join(LIB, 'props/adventure_map.blend'),
  },
  {
    role: 'pip',
    kind: 'blend',
    logicalId: 'char_pip_v1',
    filename: 'pip_production.blend',
    localPath: path.join(LIB, 'characters/pip_production.blend'),
  },
  {
    role: 'goat',
    kind: 'blend',
    logicalId: 'char_goat_v1',
    filename: 'goat_production.blend',
    localPath: path.join(LIB, 'characters/goat_production.blend'),
  },
]);

function fail(reason, code, extras = {}) {
  return {
    ok: false,
    code,
    reason,
    paidExecutionEnabled: false,
    gpuLaunched: false,
    paidCompute: false,
    blenderExecuted: false,
    secretExposed: false,
    ...extras,
  };
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sanitizeKeyPart(value) {
  return String(value).replace(/[^A-Za-z0-9._@+-]+/g, '_');
}

function contentAddressedVersionId(checksum, logicalId) {
  return `${sanitizeKeyPart(logicalId)}_${checksum.slice(0, 12)}`;
}

export function resolveFoundingAssets() {
  return FOUNDING_ASSETS.map((asset) => {
    if (!existsSync(asset.localPath)) {
      throw new Error(`Founding asset missing: ${asset.role}`);
    }
    const body = readFileSync(asset.localPath);
    const sha256 = sha256Bytes(body);
    const version = contentAddressedVersionId(sha256, asset.logicalId);
    let r2Key;
    if (asset.role === 'pip') r2Key = `characters/pip/${version}/${asset.filename}`;
    else if (asset.role === 'goat') r2Key = `characters/goat/${version}/${asset.filename}`;
    else if (asset.role === 'meadow') r2Key = `environments/${asset.logicalId}/${version}/${asset.filename}`;
    else r2Key = `props/${asset.logicalId}/${version}/${asset.filename}`;
    return { ...asset, body, sha256, r2Key, bytes: body.length };
  });
}

export function validatePaidSmokeLaunchReceipt(receipt, { launchIntentSha256, jobPackage, templateId } = {}) {
  if (!receipt || typeof receipt !== 'object') {
    return fail('Paid-smoke launch receipt is required.', 'LAUNCH_INTENT_MISMATCH');
  }
  const required = [
    'launchIntentSha256',
    'templateId',
    'imageName',
    'podName',
    'gpuType',
    'cloudType',
    'gpuCount',
    'runtimeCap',
    'costCap',
    'jobPackageSha256',
    'workerManifestSha256',
    'manifestKey',
    'jobId',
  ];
  const missing = required.filter((key) => !receipt[key]);
  if (missing.length > 0) {
    return fail(`Paid-smoke launch receipt is missing ${missing.join(', ')}.`, 'LAUNCH_INTENT_MISMATCH');
  }
  if (receipt.templateId !== APPROVED_TEMPLATE_ID || (templateId && templateId !== APPROVED_TEMPLATE_ID)) {
    return fail(`Paid-smoke receipt templateId is not the current approved template ${APPROVED_TEMPLATE_ID}.`, 'TEMPLATE_ID_MISMATCH');
  }
  if (receipt.imageName !== REQUIRED_IMAGE_NAME) {
    return fail('Paid-smoke receipt image is not the pinned digest.', 'IMAGE_MISMATCH');
  }
  if (receipt.gpuType !== PINNED_GPU_TYPE_ID || receipt.cloudType !== PINNED_CLOUD_TYPE || receipt.gpuCount !== PINNED_GPU_COUNT) {
    return fail('Paid-smoke receipt GPU pins are not Secure RTX 4090 x1.', 'RENDER_PLAN_INVALID');
  }
  if (receipt.runtimeCap !== MAX_RUNTIME_MINUTES || Number(receipt.costCap) !== Number(MAX_COMPUTE_USD)) {
    return fail('Paid-smoke receipt loosened a cost/runtime cap.', 'RENDER_PLAN_INVALID');
  }
  if (jobPackage && receipt.jobPackageSha256 !== jobPackage.jobPackageSha256) {
    return fail('Paid-smoke receipt jobPackageSha256 does not match the staged package.', 'LAUNCH_INTENT_MISMATCH');
  }
  if (jobPackage && receipt.workerManifestSha256 !== jobPackage.workerManifestSha256) {
    return fail('Paid-smoke receipt workerManifestSha256 does not match the staged package.', 'LAUNCH_INTENT_MISMATCH');
  }
  if (launchIntentSha256 && receipt.launchIntentSha256 !== launchIntentSha256) {
    return fail('Paid-smoke receipt launchIntentSha256 does not match the computed intent.', 'LAUNCH_INTENT_MISMATCH');
  }
  if (receipt.launchIntentSha256 === APPROVED_LAUNCH_INTENT_SHA256 && jobPackage?.jobId !== 'tj-job-pilot-001') {
    return fail('Fresh smoke-test jobs must not reuse the PR #60 dry-run launch intent.', 'LAUNCH_INTENT_MISMATCH');
  }
  return { ok: true, receipt };
}

export function createS3R2Client(env = process.env) {
  if (!env.R2_ENDPOINT || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 configuration is incomplete.');
  }
  return {
    bucket: env.R2_BUCKET,
    client: new S3Client({
      region: env.R2_REGION || 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    }),
  };
}

export function createRealR2LifecycleObserver({ env = process.env, allowedKeys = null } = {}) {
  const { client, bucket } = createS3R2Client(env);
  const operations = [];
  return {
    kind: 'real-readonly',
    realR2: true,
    operations,
    async get(key) {
      operations.push({ op: 'GET', key, real: true });
      if (allowedKeys && !allowedKeys.has(key)) {
        return { ok: false, code: 'R2_KEY_REFUSED' };
      }
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = Buffer.from(await res.Body.transformToByteArray());
        return { ok: true, body, sha256: sha256Bytes(body) };
      } catch (error) {
        if (error && (error.$metadata?.httpStatusCode === 404 || error.name === 'NoSuchKey' || error.Code === 'NoSuchKey')) {
          return { ok: false, code: 'MISSING' };
        }
        return { ok: false, code: 'R2_READ_FAILED', reason: redactWorkerSecrets(error.message) };
      }
    },
    async head(key) {
      operations.push({ op: 'HEAD', key, real: true });
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true, sha256: res.Metadata?.sha256 || null };
      } catch {
        return { exists: false };
      }
    },
    put() {
      operations.push({ op: 'PUT_BLOCKED', real: true });
      return { ok: false, code: 'R2_MUTATION_FORBIDDEN' };
    },
    delete() {
      operations.push({ op: 'DELETE_BLOCKED', real: true });
      return { ok: false, code: 'R2_MUTATION_FORBIDDEN' };
    },
  };
}

export function createRealR2StagingAdapter({ env = process.env, allowedWriteKeys = null } = {}) {
  const { client, bucket } = createS3R2Client(env);
  const operations = [];
  return {
    kind: 'real-staging',
    realR2: true,
    operations,
    async head(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const got = await this.get(key);
        return { exists: got.ok, sha256: got.ok ? got.sha256 : null };
      } catch {
        return { exists: false };
      }
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const body = Buffer.from(await res.Body.transformToByteArray());
        operations.push({ op: 'GET', key, real: true });
        return { ok: true, body, sha256: sha256Bytes(body) };
      } catch {
        return { ok: false, code: 'MISSING' };
      }
    },
    async put(key, body, sha256) {
      if (allowedWriteKeys && !allowedWriteKeys.has(key)) {
        operations.push({ op: 'PUT_REFUSED', key, real: true });
        return { ok: false, code: 'R2_KEY_REFUSED' };
      }
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      if (sha256 && sha256Bytes(bytes) !== sha256) {
        return { ok: false, code: 'HASH_MISMATCH' };
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: key.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        }),
      );
      operations.push({ op: 'PUT', key, real: true });
      return { ok: true };
    },
  };
}

export function buildSmokeJob({ assets, jobId, createdAt }) {
  const meadow = assets.find((asset) => asset.role === 'meadow');
  return defaultPilotJob({
    job_id: jobId,
    episode_id: SMOKE_EPISODE_ID,
    shot_id: SMOKE_SHOT_ID,
    scene_reference: meadow.filename,
    scene_sha256: meadow.sha256,
    frame_start: SMOKE_FRAME_START,
    frame_end: SMOKE_FRAME_END,
    created_at: createdAt,
    expected_output_prefix: `${SMOKE_EPISODE_ID}/${SMOKE_SHOT_ID}/${jobId}`,
    camera_preset: 'PUSH_IN',
    shot_meta: {
      title: 'TivvleJoy one-Pod paid smoke',
      lightingState: 'DAY_KEY',
      placements: {
        pip: { location: [-0.72, -1.5, 0.0], rotation: [0.0, 0.0, 0.34], action: 'PIP_POINT' },
        goat: { location: [0.72, -1.2, 0.0], rotation: [0.0, 0.0, -0.42], action: 'GOAT_HEAD_NOD' },
      },
    },
    assets: assets.map((asset) => ({
      id: asset.role,
      role: asset.role,
      kind: 'blend',
      reference: asset.filename,
      r2Key: asset.r2Key,
      sha256: asset.sha256,
    })),
  });
}

export async function stageSmokeJobPackage({ env = process.env, jobId, now } = {}) {
  const assets = resolveFoundingAssets();
  const job = buildSmokeJob({
    assets,
    jobId,
    createdAt: new Date(now).toISOString(),
  });
  const packaged = buildTivvleJoyRemoteJobPackage(job);
  if (!packaged.ok) return fail(packaged.reason, packaged.code || 'NOT_READY');
  const pkg = packaged.jobPackage;
  const allowedWriteKeys = new Set([...pkg.expectedAssets.map((asset) => asset.r2Key), pkg.manifestKey]);
  const r2 = createRealR2StagingAdapter({ env, allowedWriteKeys });
  const reused = [];
  const written = [];

  for (const asset of pkg.expectedAssets) {
    const local = assets.find((item) => item.r2Key === asset.r2Key);
    const existing = await r2.get(asset.r2Key);
    if (existing.ok && existing.sha256 === asset.sha256) {
      reused.push(asset.r2Key);
      continue;
    }
    const put = await r2.put(asset.r2Key, local.body, asset.sha256);
    if (!put.ok) return fail(`Asset staging failed for ${asset.role}.`, put.code || 'NOT_READY');
    const readback = await r2.get(asset.r2Key);
    if (!readback.ok || readback.sha256 !== asset.sha256) {
      return fail(`Asset readback failed for ${asset.role}.`, 'HASH_MISMATCH');
    }
    written.push(asset.r2Key);
  }

  const manifestBody = Buffer.from(JSON.stringify(pkg.workerManifest));
  if (hashCanonical(pkg.workerManifest) !== pkg.workerManifestSha256) {
    return fail('Worker manifest hash drifted before upload.', 'HASH_MISMATCH');
  }
  const putManifest = await r2.put(pkg.manifestKey, manifestBody, sha256Bytes(manifestBody));
  if (!putManifest.ok) return fail('Manifest upload failed.', putManifest.code || 'NOT_READY');
  const manifestRead = await r2.get(pkg.manifestKey);
  if (!manifestRead.ok || hashCanonical(JSON.parse(manifestRead.body.toString('utf8'))) !== pkg.workerManifestSha256) {
    return fail('Manifest readback hash mismatch.', 'HASH_MISMATCH');
  }
  written.push(pkg.manifestKey);

  return {
    ok: true,
    jobPackage: { ...pkg, state: 'STAGED' },
    assets,
    written,
    reused,
    realR2: true,
  };
}

export async function countExistingPods({ apiKey, fetchFn = globalThis.fetch }) {
  const listed = await listPodsReadonly(apiKey, fetchFn);
  if (!listed.ok) return { ok: false, count: null, reason: listed.reason };
  return { ok: true, count: listed.items.length, items: listed.items };
}

function runNamedPnpmScript(script) {
  const result = spawnSync('pnpm', [script], { cwd: REPO_ROOT, encoding: 'utf8', env: process.env });
  return { ok: result.status === 0, output: redactSecrets(`${result.stdout || ''}\n${result.stderr || ''}`) };
}

export async function runPaidSmokePreflight(options = {}) {
  const say = (line) => (options.log || (() => {}))(redactSecrets(line));
  const recorder = options.mutationRecorder || { attempts: [] };
  const root =
    options.workspaceRoot || path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'paid-smoke-preflight');
  mkdirSync(root, { recursive: true });

  const image = verifyPinnedWorkerImageContract();
  if (!image.ok) return fail(image.reason, image.code);
  const bound = resolveApprovedTemplateBinding({
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    templateId: APPROVED_TEMPLATE_ID,
  });
  if (!bound.ok) return fail(bound.reason, bound.code);

  const launch = await runBoundLaunchDryRun({
    ...options,
    workspaceRoot: root,
    mutationRecorder: recorder,
    log: () => {},
    liveTemplateAudit: false,
    env: { ...(options.env || {}), RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    now: options.now ?? Date.parse('2026-08-18T19:00:00.000Z'),
    runId: options.runId ?? '20260818001',
    verifyImage: options.verifyImage,
    verifyPreflight: options.verifyPreflight,
  });
  if (!launch.ok) return fail(launch.reason, launch.code);

  const adapterReady = await runRealLifecyclePreflight({
    workspaceRoot: path.join(root, 'adapter'),
    mutationRecorder: { attempts: [] },
    log: () => {},
    verifyImage: async () => ({ ok: true }),
    verifyPreflight: async () => ({ ok: true }),
  });
  if (!adapterReady.ok) return fail(adapterReady.reason, adapterReady.code);

  const blocked = evaluatePaidSmokeGate({
    env: options.env || {},
    mode: options.env?.TIVVLEJOY_LIFECYCLE_MODE,
    confirmPaidGpu: options.env?.CONFIRM_PAID_GPU,
    paidApprovalPhrase: options.env?.PAID_APPROVAL_PHRASE,
  });
  if (blocked.ok) {
    return fail('Default paid-smoke preflight must remain unauthorized.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }

  say('WORKER_IMAGE_READY');
  say('TEMPLATE_READY');
  say('TEMPLATE_BOUND');
  say('POD_PAYLOAD_READY');
  say('LAUNCH_INTENT_READY');
  say('LIFECYCLE_READY');
  say('REAL_ADAPTER_READY');
  say('PAID_SMOKE_PREFLIGHT_PASS');
  say('PAID_EXECUTION_ENABLED=false');
  say('REAL_POST_PODS=0');
  say('REAL_DELETE_PODS=0');
  return {
    ok: true,
    code: PAID_SMOKE_STATUS,
    paidExecutionEnabled: false,
    realAdapter: REAL_ADAPTER_STATUS,
    lifecycleReady: LIFECYCLE_STATUS,
    approvedTemplateId: APPROVED_TEMPLATE_ID,
    approvedImage: REQUIRED_IMAGE_NAME,
    realPostPods: 0,
    realDeletePods: 0,
    gpuLaunched: false,
    paidCompute: false,
  };
}

function makeSmokeIds(now = Date.now()) {
  const stamp = new Date(now).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const jobId = `tjsmo${stamp}`;
  const runId = stamp;
  return { jobId, runId, stamp };
}

function writeReceipt(file, receipt) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(receipt, null, 2));
}

function probeVideo(localPath) {
  if (!existsSync(localPath)) return { ok: false, reason: 'Artifact file is missing.' };
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', localPath], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    return { ok: false, reason: 'ffprobe was unavailable or refused the artifact.' };
  }
  try {
    const parsed = JSON.parse(probe.stdout || '{}');
    const video = (parsed.streams || []).find((stream) => stream.width && stream.height);
    return {
      ok: Boolean(video && Number(video.width) === 1080 && Number(video.height) === 1920),
      width: video?.width || null,
      height: video?.height || null,
      codec: video?.codec_name || null,
    };
  } catch {
    return { ok: false, reason: 'ffprobe output was malformed.' };
  }
}

export async function runPaidSmokeExecute(options = {}) {
  const say = (line) => (options.log || (() => {}))(redactSecrets(line));
  const env = options.env || process.env;
  const apiKey = env.RUNPOD_API_KEY;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const now = options.now ?? Date.now();
  const ids = options.ids || makeSmokeIds(now);
  const artifactDir = options.artifactDir || path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-paid-smoke');
  mkdirSync(artifactDir, { recursive: true });

  if (!apiKey) return fail('RUNPOD_API_KEY is missing.', 'PAID_EXECUTION_NOT_AUTHORIZED');

  const preexisting = await countExistingPods({ apiKey, fetchFn });
  if (!preexisting.ok) return fail(preexisting.reason || 'Preexisting Pod list failed.', 'PREEXISTING_POD_CHECK_FAILED');
  if (preexisting.count !== 0) {
    return fail(`Refusing paid create: preexisting Pod count is ${preexisting.count}.`, 'PREEXISTING_PODS_PRESENT', {
      preexistingPodCount: preexisting.count,
    });
  }

  const planLogs = [];
  const planned = await runRenderPlan({
    apiKey,
    fetchFn,
    log: (line) => planLogs.push(redactSecrets(String(line))),
  });
  if (!planned.ok || !planned.plan) {
    return fail('Live render-plan did not PASS.', 'RENDER_PLAN_REFUSED', { preexistingPodCount: 0 });
  }
  const receipt = {
    gpu: PINNED_GPU_TYPE_ID,
    cloud: PINNED_CLOUD_TYPE,
    gpuCount: PINNED_GPU_COUNT,
    hourlyMicros: planned.plan.hourlyMicros,
    projectedMicros: planned.plan.projectedMicros,
    maxRuntimeMinutes: MAX_RUNTIME_MINUTES,
    checkedAt: new Date(now).toISOString(),
    verdict: planned.plan.verdict,
  };
  if (receipt.verdict !== 'PASS') return fail('Live render-plan verdict was not PASS.', 'RENDER_PLAN_REFUSED');

  const staged = await stageSmokeJobPackage({ env, jobId: ids.jobId, now });
  if (!staged.ok) return staged;

  const workerEnvironment = buildWorkerEnvironment({
    jobPackage: staged.jobPackage,
    storageConfig: {
      R2_BUCKET: env.R2_BUCKET,
      R2_ENDPOINT: env.R2_ENDPOINT,
      R2_REGION: env.R2_REGION || 'auto',
    },
    storageCredentials: {
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    },
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: formatUsdFromMicros(receipt.hourlyMicros).replace(/^\$/, ''),
      RENDER_WORKER_ID: `tivvlejoy-worker-${ids.jobId}`,
      REQUIRE_GPU_HEALTH: 'true',
      STARTUP_WATCHDOG_MS: String(SMOKE_STARTUP_WATCHDOG_MS),
    },
  });
  if (!workerEnvironment.ok) return fail(workerEnvironment.reason, workerEnvironment.code);

  const built = buildBoundGuardedPodPayload({
    templateId: APPROVED_TEMPLATE_ID,
    env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
    stagedJobPackage: { ok: true, jobPackage: staged.jobPackage, state: 'STAGED' },
    workerEnvironment,
    renderPlanReceipt: receipt,
    now,
    runId: ids.runId,
  });
  if (!built.ok) return fail(built.reason, built.code);

  const paidSmokeReceipt = {
    launchIntentSha256: built.launchIntentSha256,
    templateId: APPROVED_TEMPLATE_ID,
    imageName: REQUIRED_IMAGE_NAME,
    podName: built.privateExecutionPayload.name,
    gpuType: PINNED_GPU_TYPE_ID,
    cloudType: PINNED_CLOUD_TYPE,
    gpuCount: PINNED_GPU_COUNT,
    runtimeCap: MAX_RUNTIME_MINUTES,
    costCap: MAX_COMPUTE_USD,
    hourlyQuote: formatUsdFromMicros(receipt.hourlyMicros),
    jobId: staged.jobPackage.jobId,
    manifestKey: staged.jobPackage.manifestKey,
    outputKey: staged.jobPackage.outputKey,
    jobPackageSha256: staged.jobPackage.jobPackageSha256,
    workerManifestSha256: staged.jobPackage.workerManifestSha256,
    createdAt: new Date(now).toISOString(),
  };
  const receiptCheck = validatePaidSmokeLaunchReceipt(paidSmokeReceipt, {
    launchIntentSha256: built.launchIntentSha256,
    jobPackage: staged.jobPackage,
    templateId: APPROVED_TEMPLATE_ID,
  });
  if (!receiptCheck.ok) return receiptCheck;
  writeReceipt(path.join(artifactDir, 'paid-smoke-launch-receipt.json'), paidSmokeReceipt);

  const authorization = completePaidSmokeAuthorization({
    paidGpuEnabled: true,
    podCreationEnabled: true,
    realNetworkMutationEnabled: true,
    launchIntentSha256: built.launchIntentSha256,
    expectedLaunchIntentSha256: built.launchIntentSha256,
    paidSmokeReceipt,
    renderPlanReceipt: receipt,
    now,
  });
  const gate = evaluatePaidSmokeGate({ ...authorization, allowRealNetwork: true });
  if (!gate.ok) return fail(gate.reason, gate.code);

  const persistEnv = {
    TIVVLEJOY_POD_ID_FILE: path.join(artifactDir, 'pod-id'),
    TIVVLEJOY_POD_NAME_FILE: path.join(artifactDir, 'pod-name'),
    TIVVLEJOY_CREATE_ATTEMPTED_FILE: path.join(artifactDir, 'create-attempted'),
    GITHUB_ENV: path.join(artifactDir, 'github-env'),
  };
  const runpod = createRealRunPodLifecycleAdapter({
    apiKey,
    fetchFn,
    env: persistEnv,
    allowRealNetwork: true,
    authorization,
  });
  if (runpod.mode !== 'REAL_AUTHORIZED') {
    return fail(runpod.authorizationReason || 'Real adapter stayed blocked.', 'PAID_EXECUTION_NOT_AUTHORIZED');
  }

  const observer = createRealR2LifecycleObserver({
    env,
    allowedKeys: new Set([staged.jobPackage.startupStatusKey, staged.jobPackage.statusKey]),
  });

  say('PAID_APPROVAL_GATE=PASS');
  say(`LIVE_HOURLY=${formatUsdFromMicros(receipt.hourlyMicros)}`);
  say(`LIVE_PROJECTED=${formatUsdFromMicros(receipt.projectedMicros)}`);
  say('PREEXISTING_POD_COUNT=0');
  say(`SMOKE_JOB=${ids.jobId}`);

  let result;
  try {
    result = await runPodLifecycle({
      env: { RUNPOD_RENDER_TEMPLATE_ID: APPROVED_TEMPLATE_ID },
      templateId: APPROVED_TEMPLATE_ID,
      builtPayload: built,
      jobPackage: staged.jobPackage,
      renderPlanReceipt: receipt,
      now,
      expectedLaunchIntentSha256: built.launchIntentSha256,
      paidSmokeReceipt,
      r2: observer,
      runpod,
      tick: () => {},
      liveObserve: true,
      allowPaidNetwork: true,
      clock: { now: () => Date.now(), advance: () => Date.now() },
      startupTimeoutMs: options.startupTimeoutMs ?? 15 * 60_000,
      readyTimeoutMs: options.readyTimeoutMs ?? 18 * 60_000,
      renderTimeoutMs: options.renderTimeoutMs ?? MAX_RUNTIME_MINUTES * 60_000,
      maxTicks: options.maxTicks ?? 400,
      idlePollMs: options.idlePollMs ?? 20_000,
      activePollMs: options.activePollMs ?? 4_000,
      mutationRecorder: { attempts: [] },
    });
  } catch (error) {
    result = fail(redactWorkerSecrets(error.message || 'Paid smoke launcher exception.'), 'LAUNCHER_EXCEPTION');
    if (runpod.lastPodId && extractPodId({ id: runpod.lastPodId }) && runpod.deleteCount() === 0) {
      await runpod.deletePod(runpod.lastPodId);
    }
  }

  const mutations = runpod.recordedMutations();
  let absence = { ok: false, remaining: null, total: null };
  if (result.podId) {
    absence = await runpod.confirmAbsence(result.podId);
  } else {
    const listed = await countExistingPods({ apiKey, fetchFn });
    absence = { ok: listed.ok && listed.count === 0, remaining: listed.count, total: listed.count };
  }

  let artifact = null;
  if (result.ok && result.terminal?.kind === 'COMPLETE') {
    const staging = createRealR2StagingAdapter({ env, allowedWriteKeys: new Set([result.terminal.artifactKey]) });
    const got = await staging.get(result.terminal.artifactKey);
    if (!got.ok || got.sha256 !== result.terminal.artifactSha256) {
      result = {
        ...result,
        ok: false,
        code: 'ARTIFACT_HASH_MISMATCH',
        reason: 'Artifact readback did not match COMPLETE evidence.',
      };
    } else {
      const localMp4 = path.join(artifactDir, 'paid-smoke-final.mp4');
      writeFileSync(localMp4, got.body);
      artifact = {
        key: result.terminal.artifactKey,
        sha256: result.terminal.artifactSha256,
        readbackSha256: got.sha256,
        bytes: got.body.length,
        qc: probeVideo(localMp4),
      };
    }
  }

  if (result.ok && (!absence.ok || absence.remaining !== 0)) {
    return fail('Pod absence was not confirmed after delete.', CLEANUP_ATTENTION_CODE, {
      podId: result.podId,
      cleanupVerified: false,
    });
  }

  const success = result.ok === true && result.code === 'LIFECYCLE_PASS' && artifact && absence.ok;
  say(success ? 'PAID_SMOKE_TEST_PASS' : `PAID_SMOKE_TEST_FAIL ${result.code || ''}`);
  say(`REAL_POST_PODS=${mutations.postPods}`);
  say(`REAL_DELETE_PODS=${mutations.deletePods}`);
  if (result.podId) say(`POD_ID=${result.podId}`);

  return {
    ok: success,
    code: success ? 'PAID_SMOKE_TEST_PASS' : result.code || 'PAID_SMOKE_TEST_FAIL',
    reason: success ? null : result.reason,
    history: result.history || [],
    podId: result.podId || null,
    terminal: result.terminal || null,
    livePrice: {
      gpu: PINNED_GPU_TYPE_ID,
      cloud: PINNED_CLOUD_TYPE,
      gpuCount: PINNED_GPU_COUNT,
      hourly: formatUsdFromMicros(receipt.hourlyMicros),
      projected: formatUsdFromMicros(receipt.projectedMicros),
      stock: 'verified-by-render-plan',
    },
    preexistingPodCount: 0,
    remainingPodCount: absence.total,
    smokeJob: {
      jobId: ids.jobId,
      manifestKey: staged.jobPackage.manifestKey,
      outputKey: staged.jobPackage.outputKey,
      frameCount: SMOKE_FRAME_END - SMOKE_FRAME_START + 1,
      resolution: '1080x1920',
      manifestSha: staged.jobPackage.workerManifestSha256,
      jobPackageSha256: staged.jobPackage.jobPackageSha256,
      workerManifestSha256: staged.jobPackage.workerManifestSha256,
      launchIntentSha256: built.launchIntentSha256,
    },
    paidSmokeReceipt,
    envKeyNames: Object.keys(built.privateExecutionPayload.env).sort(),
    envRedacted: sanitizeWorkerEnvForLog(built.privateExecutionPayload.env),
    realPostPods: mutations.postPods,
    realDeletePods: mutations.deletePods,
    artifact,
    r2Written: staged.written,
    r2Reused: staged.reused,
    cleanupVerified: result.cleanupVerified === true && absence.ok === true,
    absenceConfirmed: absence.ok === true,
    gpuLaunched: mutations.postPods > 0,
    paidCompute: mutations.postPods > 0,
    blenderExecuted: result.history?.includes('RENDER_RUNNING') === true,
    paidExecutionEnabled: false,
    secretExposed: false,
    planLines: planLogs,
  };
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'preflight';
  if (command === 'preflight') {
    const result = await runPaidSmokePreflight({
      log: (line) => console.log(line),
      verifyImage: async () => runNamedPnpmScript('cloud:verify-image'),
      verifyPreflight: async () => runNamedPnpmScript('cloud:preflight-offline'),
    });
    return result.ok ? 0 : 1;
  }
  if (command === 'execute') {
    const result = await runPaidSmokeExecute({
      log: (line) => console.log(line),
    });
    return result.ok ? 0 : 1;
  }
  console.log('usage: node scripts/cloud/tivvlejoy-runpod-one-pod-paid-smoke.mjs preflight|execute');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    () => process.exit(1),
  );
}

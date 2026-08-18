/**
 * TivvleJoy remote Blender execution foundation.
 *
 * Architecture:
 *   tivvlejoy-remote-render-job-v1 = studio / orchestration contract
 *   ddp-cloud-job-manifest-v1      = RunPod worker execution contract
 *   compileTivvleJoyJobToWorkerManifest() = ONLY approved bridge
 *
 * Do not invent a second worker manifest. The compiled output must pass the
 * real workers/runpod-blender/src/render-core.js validateManifest().
 * Runtime/cost enforcement stays in the existing single-shot watchdog.
 *
 * CURRENT STATUS: REMOTE JOB PACKAGE STAGING FOUNDATION
 * REMOTE EXECUTION FOUNDATION ONLY remains true for GPU/Blender execution.
 * NOT YET ENABLED: paid GPU execution, Pod creation, remote Blender execution,
 * automatic production rendering.
 *
 * This module never creates a Pod, never calls the paid Pods API, and never runs Blender.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  MAX_RUNTIME_MINUTES,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_COUNT,
  PINNED_GPU_TYPE_ID,
  REQUIRED_APPROVAL_PHRASE,
  REST_PODS_URL,
  buildRemoteRenderDeadlineWrapper,
} from './tivvlejoy-guarded-render.mjs';

const require = createRequire(import.meta.url);
const renderCore = require('../../workers/runpod-blender/src/render-core.js');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FOUNDATION_STATUS = 'REMOTE EXECUTION FOUNDATION ONLY';
export const STAGING_FOUNDATION_STATUS = 'REMOTE JOB PACKAGE STAGING FOUNDATION';
export const PAID_GPU_ENABLED = false;
export const POD_CREATION_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const AUTOMATIC_PRODUCTION_RENDERING_ENABLED = false;
export const JOB_PACKAGE_SCHEMA = 'tivvlejoy-remote-job-package-v1';
export const PACKAGE_STATE_STAGED = 'STAGED';
export const PACKAGE_STATE_NOT_READY = 'NOT_READY';
export const STAGING_STATES = Object.freeze([
  'ALREADY_PRESENT_AND_HASH_MATCHES',
  'UPLOAD_REQUIRED',
  'HASH_MISMATCH',
  'MISSING',
  'REFUSED',
]);
export const MANIFEST_PUBLISH_ORDER = Object.freeze([
  'VERIFY_IMMUTABLE_ASSETS',
  'REFUSE_HASH_MISMATCH',
  'UPLOAD_MISSING_APPROVED_ASSETS',
  'VERIFY_UPLOADED_ASSET_CHECKSUMS',
  'COMPILE_WORKER_MANIFEST',
  'HASH_WORKER_MANIFEST',
  'UPLOAD_MANIFEST_LAST',
  'READ_MANIFEST_BACK',
  'VERIFY_MANIFEST_SHA256',
  'MARK_STAGED',
]);
export const SINGLE_SHOT_R2_KEY_CONTRACT = Object.freeze({
  manifest: 'jobs/<jobId>/manifest.json',
  status: 'jobs/<jobId>/status.json',
  startupStatus: 'jobs/<jobId>/startup-status.json',
  metadata: 'jobs/<jobId>/metadata.json',
  source: 'workers/runpod-blender/src/single-shot.js',
});
export const SECRET_BOUNDARY_STATUS = 'LEAST-PRIVILEGE WORKER SECRET BOUNDARY';
export const REAL_WORKER_ENV_AUDIT = Object.freeze([
  { name: 'RENDER_JOB_ID', category: 'JOB_IDENTITY', sources: ['single-shot.js', 'worker.js'] },
  { name: 'RENDER_JOB_MANIFEST_KEY', category: 'JOB_IDENTITY', sources: ['single-shot.js'] },
  { name: 'RENDER_WORKSPACE_DIR', category: 'RENDER_CONFIGURATION', sources: ['single-shot.js', 'worker.js', 'boot-diagnostics.js'] },
  { name: 'BLENDER_BIN', category: 'RENDER_CONFIGURATION', sources: ['single-shot.js', 'worker.js', 'blender-preflight.js', 'health.js', 'boot-diagnostics.js'] },
  { name: 'BLENDER_ASSEMBLE_SCRIPT', category: 'RENDER_CONFIGURATION', sources: ['single-shot.js', 'worker.js'] },
  { name: 'SKIP_BLENDER_PREFLIGHT', category: 'RENDER_CONFIGURATION', sources: ['single-shot.js'] },
  { name: 'BLENDER_PREFLIGHT_TIMEOUT_MS', category: 'RENDER_CONFIGURATION', sources: ['single-shot.js'] },
  { name: 'REQUIRE_GPU_HEALTH', category: 'RENDER_CONFIGURATION', sources: ['worker.js', 'health.js', 'boot-diagnostics.js'] },
  { name: 'STARTUP_WATCHDOG_MS', category: 'RENDER_CONFIGURATION', sources: ['worker.js'] },
  { name: 'ALLOW_WORKER_SELF_TERMINATE', category: 'RENDER_CONFIGURATION', sources: ['worker.js'] },
  { name: 'R2_BUCKET', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_ENDPOINT', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_REGION', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'OBJECT_STORAGE_BUCKET', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'OBJECT_STORAGE_ENDPOINT', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'OBJECT_STORAGE_REGION', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_CONNECT_TIMEOUT_MS', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_REQUEST_TIMEOUT_MS', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_MAX_ATTEMPTS', category: 'STORAGE_CONFIGURATION', sources: ['r2-client.js'] },
  { name: 'R2_ACCESS_KEY_ID', category: 'STORAGE_SECRET', sources: ['r2-client.js'] },
  { name: 'R2_SECRET_ACCESS_KEY', category: 'STORAGE_SECRET', sources: ['r2-client.js'] },
  { name: 'OBJECT_STORAGE_ACCESS_KEY_ID', category: 'STORAGE_SECRET', sources: ['r2-client.js'] },
  { name: 'OBJECT_STORAGE_SECRET_ACCESS_KEY', category: 'STORAGE_SECRET', sources: ['r2-client.js'] },
  { name: 'RUNPOD_GPU_HOURLY_RATE', category: 'RUNPOD_METADATA', sources: ['single-shot.js'] },
  { name: 'GPU_HOURLY_RATE_USD', category: 'RUNPOD_METADATA', sources: ['single-shot.js'] },
  { name: 'RUNPOD_POD_ID', category: 'RUNPOD_METADATA', sources: ['single-shot.js', 'worker.js'] },
  { name: 'RUNPOD_GPU_NAME', category: 'RUNPOD_METADATA', sources: ['single-shot.js'] },
  { name: 'RENDER_WORKER_ID', category: 'RUNPOD_METADATA', sources: ['single-shot.js', 'worker.js'] },
  { name: 'RUNPOD_API_KEY', category: 'LAUNCHER_ONLY_SECRET', sources: ['worker.js terminateSelf'], tivvlejoy: 'REFUSED' },
  { name: 'RUNPOD_API_ENDPOINT', category: 'LAUNCHER_ONLY_SECRET', sources: ['worker.js terminateSelf'], tivvlejoy: 'REFUSED' },
  { name: 'RUNPOD_RENDER_TEMPLATE_ID', category: 'LAUNCHER_ONLY_SECRET', sources: ['tivvlejoy-guarded-render.mjs'], tivvlejoy: 'REFUSED' },
  { name: 'RENDER_API_URL', category: 'OPTIONAL_DIAGNOSTIC', sources: ['worker.js claim loop'], tivvlejoy: 'REFUSED' },
  { name: 'OBJECT_STORAGE_ROOT', category: 'OPTIONAL_DIAGNOSTIC', sources: ['worker.js claim loop'], tivvlejoy: 'REFUSED' },
  { name: 'CLOUD_RENDER_ENABLED', category: 'OPTIONAL_DIAGNOSTIC', sources: ['worker.js claim loop'], tivvlejoy: 'REFUSED' },
  { name: 'MAX_JOB_RUNTIME_MINUTES', category: 'OPTIONAL_DIAGNOSTIC', sources: ['worker.js claim loop'], tivvlejoy: 'REFUSED' },
  { name: 'ALLOW_CPU_DIAGNOSTIC_FALLBACK', category: 'OPTIONAL_DIAGNOSTIC', sources: ['worker.js', 'gpu-health.js'] },
  { name: 'DDP_IMAGE_DIGEST', category: 'OPTIONAL_DIAGNOSTIC', sources: ['boot-diagnostics.js', 'provenance.js'] },
  { name: 'DDP_RENDER_CODE_SHA256', category: 'OPTIONAL_DIAGNOSTIC', sources: ['provenance.js'] },
  { name: 'DDP_SOURCE_COMMIT', category: 'OPTIONAL_DIAGNOSTIC', sources: ['provenance.js'] },
  { name: 'DDP_WORKER_BUILD_TIME', category: 'OPTIONAL_DIAGNOSTIC', sources: ['provenance.js'] },
  { name: 'RUNPOD_WORKER_IMAGE', category: 'OPTIONAL_DIAGNOSTIC', sources: ['boot-diagnostics.js', 'provenance.js'] },
  { name: 'NVIDIA_VISIBLE_DEVICES', category: 'OPTIONAL_DIAGNOSTIC', sources: ['boot-diagnostics.js'] },
  { name: 'EGL_PLATFORM', category: 'OPTIONAL_DIAGNOSTIC', sources: ['headless-gl.js'] },
  { name: 'MESA_GL_VERSION_OVERRIDE', category: 'OPTIONAL_DIAGNOSTIC', sources: ['headless-gl.js'] },
]);
export const WORKER_ENV_ALLOWLIST = Object.freeze([
  'RENDER_JOB_ID',
  'RENDER_JOB_MANIFEST_KEY',
  'RENDER_WORKSPACE_DIR',
  'BLENDER_BIN',
  'BLENDER_ASSEMBLE_SCRIPT',
  'SKIP_BLENDER_PREFLIGHT',
  'BLENDER_PREFLIGHT_TIMEOUT_MS',
  'REQUIRE_GPU_HEALTH',
  'STARTUP_WATCHDOG_MS',
  'ALLOW_WORKER_SELF_TERMINATE',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_REGION',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'R2_CONNECT_TIMEOUT_MS',
  'R2_REQUEST_TIMEOUT_MS',
  'R2_MAX_ATTEMPTS',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  'RUNPOD_GPU_HOURLY_RATE',
  'GPU_HOURLY_RATE_USD',
  'RUNPOD_POD_ID',
  'RUNPOD_GPU_NAME',
  'RENDER_WORKER_ID',
  'ALLOW_CPU_DIAGNOSTIC_FALLBACK',
  'DDP_IMAGE_DIGEST',
  'DDP_RENDER_CODE_SHA256',
  'DDP_SOURCE_COMMIT',
  'DDP_WORKER_BUILD_TIME',
  'RUNPOD_WORKER_IMAGE',
  'NVIDIA_VISIBLE_DEVICES',
  'EGL_PLATFORM',
  'MESA_GL_VERSION_OVERRIDE',
]);
export const LAUNCHER_ONLY_ENV = Object.freeze([
  'RUNPOD_API_KEY',
  'RUNPOD_API_ENDPOINT',
  'RUNPOD_RENDER_TEMPLATE_ID',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_PAT',
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'LAUNCH_TIVVLEJOY_GPU',
  'confirm_paid_gpu',
  'RENDER_API_URL',
  'OBJECT_STORAGE_ROOT',
  'CLOUD_RENDER_ENABLED',
  'MAX_JOB_RUNTIME_MINUTES',
]);
export const WORKER_SECRET_ENV_KEYS = Object.freeze([
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
]);
export const WORKER_CAPABILITY_BOUNDARY = Object.freeze({
  canCreatePods: false,
  canDeletePods: false,
  canQueryRunPodAccount: false,
  canUseLauncherRunPodApiKey: false,
  cleanupOwner: 'guarded launcher',
  authorizedWork: 'single-shot render job only',
  allowWorkerSelfTerminate: false,
});
export const WORKER_ENV_CONTRACT = Object.freeze({
  fromJobPackage: Object.freeze(['RENDER_JOB_ID', 'RENDER_JOB_MANIFEST_KEY']),
  fromServerSideSecrets: Object.freeze([
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
  ]),
  launcherOnlySecrets: LAUNCHER_ONLY_ENV,
  fromGuardedLaunchMetadata: Object.freeze([
    'RUNPOD_GPU_HOURLY_RATE',
    'GPU_HOURLY_RATE_USD',
    'RUNPOD_POD_ID',
    'RUNPOD_GPU_NAME',
    'RENDER_WORKER_ID',
  ]),
  fromImageOrWorkspace: Object.freeze([
    'R2_BUCKET',
    'R2_ENDPOINT',
    'R2_REGION',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_REGION',
    'RENDER_WORKSPACE_DIR',
    'BLENDER_BIN',
    'BLENDER_ASSEMBLE_SCRIPT',
    'SKIP_BLENDER_PREFLIGHT',
    'BLENDER_PREFLIGHT_TIMEOUT_MS',
    'R2_CONNECT_TIMEOUT_MS',
    'R2_REQUEST_TIMEOUT_MS',
    'R2_MAX_ATTEMPTS',
    'REQUIRE_GPU_HEALTH',
    'STARTUP_WATCHDOG_MS',
    'ALLOW_WORKER_SELF_TERMINATE',
  ]),
  secretsInManifest: false,
  podLaunchImplemented: false,
  capabilityBoundary: WORKER_CAPABILITY_BOUNDARY,
});

const WORKER_ENV_ALLOWLIST_SET = new Set(WORKER_ENV_ALLOWLIST);
const LAUNCHER_ONLY_ENV_SET = new Set(LAUNCHER_ONLY_ENV);
const WORKER_SECRET_ENV_SET = new Set(WORKER_SECRET_ENV_KEYS);

export function redactWorkerSecrets(text) {
  return String(text ?? '')
    .replace(/\brpa_[A-Za-z0-9]+/g, 'rpa_[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\bghp_[A-Za-z0-9]+/g, 'ghp_[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, 'github_pat_[REDACTED]')
    .replace(/\bghs_[A-Za-z0-9]+/g, 'ghs_[REDACTED]')
    .replace(/(R2_SECRET_ACCESS_KEY|OBJECT_STORAGE_SECRET_ACCESS_KEY|secret_access_key|SecretAccessKey)\s*[":=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/(R2_ACCESS_KEY_ID|OBJECT_STORAGE_ACCESS_KEY_ID|accessKeyId|AccessKeyId)\s*[":=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/LAUNCH_TIVVLEJOY_GPU/g, '[REDACTED_APPROVAL_PHRASE]')
    .replace(/\bvercel_[A-Za-z0-9]+/gi, 'vercel_[REDACTED]');
}

export function sanitizeWorkerEnvForLog(env) {
  return Object.fromEntries(
    Object.entries(env || {}).map(([key, value]) => [
      key,
      WORKER_SECRET_ENV_SET.has(key) ? '[REDACTED]' : redactWorkerSecrets(value),
    ]),
  );
}

function collectInputEnvBags(input = {}) {
  return {
    ...(input.storageConfig || {}),
    ...(input.storageCredentials || {}),
    ...(input.launchMetadata || {}),
    ...(input.runtimeConfig || {}),
    ...(input.injected || {}),
  };
}

export function buildWorkerEnvironment(input = {}) {
  const pkg = input.jobPackage?.jobPackage || input.jobPackage || {};
  const bags = collectInputEnvBags(input);
  const forbidden = Object.keys(bags).filter((key) => LAUNCHER_ONLY_ENV_SET.has(key) || key === REQUIRED_APPROVAL_PHRASE);
  if (bags[REQUIRED_APPROVAL_PHRASE] || Object.values(bags).includes(REQUIRED_APPROVAL_PHRASE)) {
    return fail('Paid approval phrase is refused from worker env.', 'LAUNCHER_ONLY_SECRET');
  }
  if (forbidden.length > 0) {
    return fail(`Launcher-only or refused env variables: ${forbidden.sort().join(', ')}.`, 'LAUNCHER_ONLY_SECRET');
  }
  const unknown = Object.keys(bags).filter((key) => !WORKER_ENV_ALLOWLIST_SET.has(key));
  if (unknown.length > 0) {
    return fail(`Arbitrary env injection refused: ${unknown.sort().join(', ')}.`, 'ARBITRARY_ENV_INJECTION');
  }

  const jobId = pkg.jobId || bags.RENDER_JOB_ID;
  const manifestKey = pkg.manifestKey || bags.RENDER_JOB_MANIFEST_KEY;
  if (!SAFE_ID.test(String(jobId || ''))) return fail('RENDER_JOB_ID is required.', 'WORKER_ENV_INCOMPLETE');
  if (!manifestKey || !String(manifestKey).startsWith(`jobs/${jobId}/`)) {
    return fail('RENDER_JOB_MANIFEST_KEY must stay inside the job namespace.', 'WORKER_ENV_INCOMPLETE');
  }

  const bucket = bags.R2_BUCKET || bags.OBJECT_STORAGE_BUCKET;
  const endpoint = bags.R2_ENDPOINT || bags.OBJECT_STORAGE_ENDPOINT;
  const accessKey = bags.R2_ACCESS_KEY_ID || bags.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretKey = bags.R2_SECRET_ACCESS_KEY || bags.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKey || !secretKey) {
    return fail('Scoped R2 storage configuration and credentials are required.', 'WORKER_ENV_INCOMPLETE');
  }

  const env = {
    RENDER_JOB_ID: String(jobId),
    RENDER_JOB_MANIFEST_KEY: String(manifestKey),
    R2_BUCKET: String(bucket),
    R2_ENDPOINT: String(endpoint),
    R2_ACCESS_KEY_ID: String(accessKey),
    R2_SECRET_ACCESS_KEY: String(secretKey),
    ALLOW_WORKER_SELF_TERMINATE: 'false',
  };
  const optional = [
    'R2_REGION',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'R2_CONNECT_TIMEOUT_MS',
    'R2_REQUEST_TIMEOUT_MS',
    'R2_MAX_ATTEMPTS',
    'RENDER_WORKSPACE_DIR',
    'BLENDER_BIN',
    'BLENDER_ASSEMBLE_SCRIPT',
    'SKIP_BLENDER_PREFLIGHT',
    'BLENDER_PREFLIGHT_TIMEOUT_MS',
    'REQUIRE_GPU_HEALTH',
    'STARTUP_WATCHDOG_MS',
    'RUNPOD_GPU_HOURLY_RATE',
    'GPU_HOURLY_RATE_USD',
    'RUNPOD_POD_ID',
    'RUNPOD_GPU_NAME',
    'RENDER_WORKER_ID',
    'ALLOW_CPU_DIAGNOSTIC_FALLBACK',
    'DDP_IMAGE_DIGEST',
    'DDP_RENDER_CODE_SHA256',
    'DDP_SOURCE_COMMIT',
    'DDP_WORKER_BUILD_TIME',
    'RUNPOD_WORKER_IMAGE',
    'NVIDIA_VISIBLE_DEVICES',
    'EGL_PLATFORM',
    'MESA_GL_VERSION_OVERRIDE',
  ];
  for (const key of optional) {
    if (bags[key] !== undefined && bags[key] !== null && bags[key] !== '') env[key] = String(bags[key]);
  }

  if (Object.keys(env).some((key) => !WORKER_ENV_ALLOWLIST_SET.has(key))) {
    return fail('Worker env contain a non-allowlisted key.', 'ARBITRARY_ENV_INJECTION');
  }
  if (LAUNCHER_ONLY_ENV.some((key) => key in env)) {
    return fail('Launcher-only secrets cannot enter worker env.', 'LAUNCHER_ONLY_SECRET');
  }

  const serialized = JSON.stringify(env);
  if (/LAUNCH_TIVVLEJOY_GPU|GITHUB_TOKEN|VERCEL_TOKEN|RUNPOD_API_KEY|RUNPOD_RENDER_TEMPLATE_ID/.test(serialized)) {
    return fail('Worker env leaked a launcher-only secret.', 'SECRET_LEAK');
  }

  return {
    ok: true,
    env,
    sanitized: sanitizeWorkerEnvForLog(env),
    allowlist: WORKER_ENV_ALLOWLIST,
    capabilityBoundary: WORKER_CAPABILITY_BOUNDARY,
  };
}

export const PILOT_RENDER_PROFILE = 'FINAL_1080P';
export const PILOT_RESOLUTION_WIDTH = 1080;
export const PILOT_RESOLUTION_HEIGHT = 1920;
export const PILOT_RESOLUTION = `${PILOT_RESOLUTION_WIDTH}x${PILOT_RESOLUTION_HEIGHT}`;
export const PILOT_FPS = 30;
export const PILOT_ENGINE = 'EEVEE';
export const PILOT_SAMPLES = 24;
export const PILOT_OUTPUT_FORMAT = 'mp4';
export const PILOT_MAX_RUNTIME_MINUTES = MAX_RUNTIME_MINUTES;
export const PILOT_MAX_FRAMES = 300;
export const ACCEPTED_ASSEMBLE_SCRIPT = 'scripts/blender/assemble_scene.py';
export const ACCEPTED_RENDER_CORE = 'workers/runpod-blender/src/render-core.js';
export const WORKER_MANIFEST_SCHEMA = renderCore.MANIFEST_SCHEMA;
export const WORKER_COST_WATCHDOG = 'workers/runpod-blender/src/watchdog.js computeCostAwareMaxRuntime';
export const PILOT_MAX_COST_USD = Number(MAX_COMPUTE_USD);
export const REQUIRED_REMOTE_ASSET_CLASSES = Object.freeze(['character']);
export const APPROVED_R2_PREFIXES = Object.freeze([
  'characters/',
  'environments/',
  'props/',
  'animations/',
  'vfx/',
  'audio/',
  'episodes/',
  'renders/',
  'cache/',
  'tivvlejoy-assets/',
  'scenery/',
]);
export const FFMPEG_FINALIZE_ARGV = ['-y', '-framerate', String(PILOT_FPS), '-i', 'frame_%04d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18'];

export const LIFECYCLE_STATES = Object.freeze([
  'PLANNED',
  'PREFLIGHT_PASSED',
  'POD_REQUESTED',
  'POD_READY',
  'ASSETS_STAGED',
  'RENDER_RUNNING',
  'RENDER_SUCCEEDED',
  'RENDER_FAILED',
  'OUTPUT_VERIFIED',
  'CLEANUP_PENDING',
  'CLEANUP_CONFIRMED',
  'MANUAL_ATTENTION',
]);

export const ALLOWED_TRANSITIONS = Object.freeze({
  PLANNED: ['PREFLIGHT_PASSED', 'MANUAL_ATTENTION'],
  PREFLIGHT_PASSED: ['POD_REQUESTED', 'MANUAL_ATTENTION'],
  POD_REQUESTED: ['POD_READY', 'MANUAL_ATTENTION'],
  POD_READY: ['ASSETS_STAGED', 'CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  ASSETS_STAGED: ['RENDER_RUNNING', 'CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  RENDER_RUNNING: ['RENDER_SUCCEEDED', 'RENDER_FAILED', 'CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  RENDER_SUCCEEDED: ['OUTPUT_VERIFIED', 'RENDER_FAILED', 'CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  RENDER_FAILED: ['CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  OUTPUT_VERIFIED: ['CLEANUP_PENDING', 'MANUAL_ATTENTION'],
  CLEANUP_PENDING: ['CLEANUP_CONFIRMED', 'MANUAL_ATTENTION'],
  CLEANUP_CONFIRMED: [],
  MANUAL_ATTENTION: [],
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,80}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UNSAFE = /[;|&$`<>\\\n\r\0]|\$\(|\.\./;
const ALLOWED_ENGINES = new Set(['EEVEE', 'CYCLES']);
const ALLOWED_FPS = new Set([24, 30, 60]);
const ALLOWED_RESOLUTIONS = new Set(['1080x1920']);

function fail(reason, code = 'PREFLIGHT_REFUSED') {
  return { ok: false, reason, code };
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function hashCanonical(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function rejectUnsafeText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') return `${label} is required.`;
  if (UNSAFE.test(value)) return `${label} contains unsafe characters.`;
  return null;
}

export function constrainToRoot(candidate, root, label) {
  const unsafe = rejectUnsafeText(candidate, label);
  if (unsafe) return { ok: false, reason: unsafe };
  if (!path.isAbsolute(root)) {
    return { ok: false, reason: `${label} root must be absolute.` };
  }
  const resolved = path.resolve(root, candidate);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: `${label} escapes the approved workspace.` };
  }
  return { ok: true, path: resolved };
}

export function defaultPilotJob(overrides = {}) {
  return {
    schema_version: 'tivvlejoy-remote-render-job-v1',
    job_id: overrides.job_id ?? 'tj-job-pilot-001',
    episode_id: overrides.episode_id ?? 'ep-pilot-001',
    shot_id: overrides.shot_id ?? 'shot-pilot-001',
    scene_reference: overrides.scene_reference ?? 'scene.blend',
    scene_sha256: overrides.scene_sha256 ?? null,
    render_profile: overrides.render_profile ?? PILOT_RENDER_PROFILE,
    resolution_width: overrides.resolution_width ?? PILOT_RESOLUTION_WIDTH,
    resolution_height: overrides.resolution_height ?? PILOT_RESOLUTION_HEIGHT,
    fps: overrides.fps ?? PILOT_FPS,
    frame_start: overrides.frame_start ?? 1,
    frame_end: overrides.frame_end ?? 90,
    engine: overrides.engine ?? PILOT_ENGINE,
    samples: overrides.samples ?? PILOT_SAMPLES,
    output_format: overrides.output_format ?? PILOT_OUTPUT_FORMAT,
    asset_manifest_reference: overrides.asset_manifest_reference ?? 'assets/manifest.json',
    expected_output_prefix: overrides.expected_output_prefix ?? 'ep-pilot-001/shot-pilot-001/tj-job-pilot-001',
    max_runtime_minutes: overrides.max_runtime_minutes ?? PILOT_MAX_RUNTIME_MINUTES,
    requested_gpu: overrides.requested_gpu ?? PINNED_GPU_TYPE_ID,
    cloud_type: overrides.cloud_type ?? PINNED_CLOUD_TYPE,
    gpu_count: overrides.gpu_count ?? PINNED_GPU_COUNT,
    created_at: overrides.created_at ?? '2026-08-18T00:00:00.000Z',
    scene_r2_key: overrides.scene_r2_key ?? null,
    required_asset_classes: overrides.required_asset_classes ?? [...REQUIRED_REMOTE_ASSET_CLASSES],
    assets: overrides.assets ?? [
      {
        id: 'pip',
        role: 'pip',
        kind: 'blend',
        reference: 'pip.blend',
        r2Key: 'characters/pip/v1/pip.blend',
        sha256: overrides.pip_sha256 ?? null,
      },
    ],
    camera_preset: overrides.camera_preset ?? 'PUSH_IN',
    shot_meta: overrides.shot_meta ?? { lightingState: 'DAY_KEY' },
  };
}

export function normalizeJob(raw) {
  if (!raw || typeof raw !== 'object') return fail('Job manifest is not an object.', 'MALFORMED_JOB');
  const job = defaultPilotJob(raw);
  for (const key of ['job_id', 'episode_id', 'shot_id']) {
    if (!SAFE_ID.test(job[key])) return fail(`${key} is malformed.`, 'MALFORMED_JOB');
  }
  const textFields = [
    job.scene_reference,
    job.asset_manifest_reference,
    job.expected_output_prefix,
    job.render_profile,
    job.output_format,
    job.camera_preset,
  ];
  for (const field of textFields) {
    const unsafe = rejectUnsafeText(field, 'job field');
    if (unsafe) return fail(unsafe, 'MALFORMED_JOB');
  }
  if (job.schema_version !== 'tivvlejoy-remote-render-job-v1') {
    return fail('Unsupported job schema_version.', 'MALFORMED_JOB');
  }
  return { ok: true, job };
}

export function assertPilotPins(job) {
  if (job.render_profile !== PILOT_RENDER_PROFILE) return fail('Pilot render_profile must remain FINAL_1080P.');
  if (job.resolution_width !== PILOT_RESOLUTION_WIDTH || job.resolution_height !== PILOT_RESOLUTION_HEIGHT) {
    return fail('Invalid resolution. Pilot profile is locked to 1080x1920.');
  }
  if (job.fps !== PILOT_FPS) return fail('Invalid fps. Pilot profile is locked to 30.');
  if (job.engine !== PILOT_ENGINE) return fail('Unsupported render engine. Pilot profile is locked to EEVEE.');
  if (job.samples !== PILOT_SAMPLES) return fail('Pilot EEVEE samples must remain 24.');
  if (job.max_runtime_minutes !== PILOT_MAX_RUNTIME_MINUTES) return fail('max_runtime_minutes must remain 20.');
  if (job.requested_gpu !== PINNED_GPU_TYPE_ID) return fail('requested_gpu must remain NVIDIA GeForce RTX 4090.');
  if (job.cloud_type !== PINNED_CLOUD_TYPE) return fail('cloud_type must remain SECURE.');
  if (job.gpu_count !== PINNED_GPU_COUNT) return fail('gpu_count must remain 1.');
  if (job.output_format !== PILOT_OUTPUT_FORMAT) return fail('output_format must remain mp4.');
  return { ok: true };
}

export function validateFrameRange(job) {
  if (!Number.isInteger(job.frame_start) || !Number.isInteger(job.frame_end)) {
    return fail('Frame range must be integers.', 'UNSAFE_FRAME_RANGE');
  }
  if (job.frame_start < 1 || job.frame_end < job.frame_start) {
    return fail('Unsafe frame range.', 'UNSAFE_FRAME_RANGE');
  }
  const count = job.frame_end - job.frame_start + 1;
  if (count > PILOT_MAX_FRAMES) return fail('Frame range exceeds the 300-frame bound.', 'UNSAFE_FRAME_RANGE');
  return { ok: true, frameCount: count };
}

export function expectedOutputPrefix(job) {
  return `${job.episode_id}/${job.shot_id}/${job.job_id}`;
}

export function hashJobManifest(job) {
  const { ok, job: normalized, reason, code } = normalizeJob(job);
  if (!ok) return fail(reason, code);
  return { ok: true, sha256: hashCanonical(normalized), job: normalized };
}

function extractPinnedVersion(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

export function resolveAuthoritativeBlenderVersion(repoRoot = REPO_ROOT) {
  const dockerfile = readFileSync(path.join(repoRoot, 'workers/runpod-blender/Dockerfile'), 'utf8');
  const acceptance = readFileSync(path.join(repoRoot, 'scripts/cloud/acceptance-1080p/common.ts'), 'utf8');
  const workerManifest = readFileSync(path.join(repoRoot, 'workers/runpod-blender/src/manifest.js'), 'utf8');
  const productionConfig = readFileSync(path.join(repoRoot, 'packages/production/src/cloud/config.ts'), 'utf8');
  const productionPreflight = readFileSync(path.join(repoRoot, 'packages/production/src/cloud/preflight.ts'), 'utf8');

  const executionPins = {
    workerDockerfile: extractPinnedVersion(dockerfile, /BLENDER_VERSION=([0-9]+\.[0-9]+\.[0-9]+)/),
    acceptance1080p: extractPinnedVersion(acceptance, /export const BLENDER_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/),
    workerManifestDefault: extractPinnedVersion(workerManifest, /blenderVersion: input\.blenderVersion \|\| '([0-9]+\.[0-9]+\.[0-9]+)'/),
  };
  const observedNonExecution = {
    productionRequirement: extractPinnedVersion(productionConfig, /DEFAULT_BLENDER_VERSION = '([0-9.]+)'/),
    productionGpuHealthExample: extractPinnedVersion(productionPreflight, /blenderVersion: '([0-9.]+)'/),
  };
  const values = Object.values(executionPins);
  if (values.some((value) => !value) || new Set(values).size !== 1) {
    return fail(
      `Authoritative Blender execution pins conflict or are missing: ${JSON.stringify(executionPins)}.`,
      'BLENDER_VERSION_CONFLICT',
    );
  }
  return {
    ok: true,
    version: values[0],
    sources: executionPins,
    nonExecutionNotes: observedNonExecution,
  };
}

export function sanitizeKeyPart(value) {
  return String(value).replace(/[^A-Za-z0-9._@+-]+/g, '_');
}

export function isApprovedR2Key(key) {
  if (typeof key !== 'string' || key.trim() === '') return false;
  if (key.startsWith('file:') || key.startsWith('/') || key.includes('\\') || key.includes('..')) return false;
  if (UNSAFE.test(key)) return false;
  return APPROVED_R2_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function buildWorkerOutputKey(job) {
  if (!SAFE_ID.test(job.episode_id) || !SAFE_ID.test(job.job_id) || !SAFE_ID.test(job.shot_id)) {
    return fail('outputKey identity is invalid.', 'OUTPUT_KEY');
  }
  const outputKey = `renders/finals/${sanitizeKeyPart(job.episode_id)}/${sanitizeKeyPart(job.job_id)}/final_1080p.mp4`;
  if (outputKey.includes('..') || outputKey.includes('//') || outputKey.includes('\\')) {
    return fail('outputKey path traversal refused.', 'OUTPUT_KEY');
  }
  return {
    ok: true,
    outputKey,
    expected_output_prefix: expectedOutputPrefix(job),
    layout: 'packages/production/src/cloud/r2-layout.ts renderFinalKey',
  };
}

export function classifyRemoteAssetClass(asset) {
  const role = String(asset?.role || '').toLowerCase();
  const kind = String(asset?.kind || '').toLowerCase();
  if (['pip', 'goat', 'character'].includes(role) || kind === 'character') return 'character';
  if (['scenery', 'environment', 'scene', 'map'].includes(role) || ['scenery', 'environment'].includes(kind)) {
    return 'scenery';
  }
  if (['texture', 'hdri', 'hdr'].includes(role) || ['texture', 'hdri', 'hdr'].includes(kind)) return 'texture';
  if (role === 'prop' || kind === 'prop') return 'prop';
  return 'other';
}

function requiredAssetClassCode(assetClass) {
  if (assetClass === 'character') return 'MISSING_ASSET';
  if (assetClass === 'scenery') return 'MISSING_SCENERY';
  if (assetClass === 'texture') return 'MISSING_TEXTURE';
  if (assetClass === 'prop') return 'MISSING_PROP';
  return 'MISSING_ASSET';
}

export function compileRemoteAsset(asset) {
  if (!asset || typeof asset !== 'object') return fail('Malformed asset.', 'MISSING_ASSET');
  if (!asset.role) return fail('Asset role is required.', 'MISSING_ASSET');
  if (!asset.r2Key) return fail('r2Key is missing.', 'MISSING_R2_KEY');
  if (String(asset.r2Key).startsWith('file:') || String(asset.uri || '').startsWith('file:') || String(asset.reference || '').startsWith('file:')) {
    return fail('Local file paths are not allowed in the remote worker manifest.', 'LOCAL_PATH_IN_REMOTE_MANIFEST');
  }
  if (!isApprovedR2Key(asset.r2Key)) return fail('Asset R2 key is outside the approved TivvleJoy namespace.', 'UNSAFE_R2_NAMESPACE');
  if (!asset.sha256) return fail('sha256 is missing.', 'MISSING_SHA256');
  if (!SHA256.test(asset.sha256)) return fail('sha256 is malformed.', 'MALFORMED_SHA256');
  return {
    ok: true,
    asset: {
      role: asset.role,
      r2Key: asset.r2Key,
      sha256: asset.sha256,
    },
  };
}

export function compileExpectedAssets(assets, requiredClasses = REQUIRED_REMOTE_ASSET_CLASSES) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return fail('Remote worker assets are required.', 'MISSING_ASSET');
  }
  const seen = new Set();
  const expectedAssets = [];
  const resolvedClasses = new Set();
  for (const asset of assets) {
    const compiled = compileRemoteAsset(asset);
    if (!compiled.ok) return compiled;
    if (seen.has(compiled.asset.role)) return fail('Duplicate asset role is ambiguous.', 'DUPLICATE_ROLE');
    seen.add(compiled.asset.role);
    resolvedClasses.add(classifyRemoteAssetClass(asset));
    expectedAssets.push(compiled.asset);
  }
  for (const required of requiredClasses) {
    if (!resolvedClasses.has(required)) {
      return fail(`Required ${required} asset cannot be resolved.`, requiredAssetClassCode(required));
    }
  }
  return { ok: true, expectedAssets };
}

export function compileTivvleJoyJobToWorkerManifest(jobInput) {
  const parsed = normalizeJob(jobInput);
  if (!parsed.ok) return parsed;
  const pins = assertPilotPins(parsed.job);
  if (!pins.ok) return pins;
  const frames = validateFrameRange(parsed.job);
  if (!frames.ok) return frames;
  const blender = resolveAuthoritativeBlenderVersion();
  if (!blender.ok) return blender;
  const remoteAssets = [...parsed.job.assets];
  if (parsed.job.scene_r2_key) {
    remoteAssets.push({
      role: 'scene',
      kind: 'scenery',
      r2Key: parsed.job.scene_r2_key,
      sha256: parsed.job.scene_sha256,
    });
  }
  const assets = compileExpectedAssets(remoteAssets, parsed.job.required_asset_classes);
  if (!assets.ok) return assets;
  const output = buildWorkerOutputKey(parsed.job);
  if (!output.ok) return output;

  const workerManifest = {
    schemaVersion: WORKER_MANIFEST_SCHEMA,
    jobId: parsed.job.job_id,
    episodeId: parsed.job.episode_id,
    sceneId: parsed.job.shot_id,
    renderMode: parsed.job.render_profile,
    resolution: `${parsed.job.resolution_width}x${parsed.job.resolution_height}`,
    fps: parsed.job.fps,
    frameRange: { start: parsed.job.frame_start, end: parsed.job.frame_end },
    blenderVersion: blender.version,
    eevee: { engine: parsed.job.engine, samples: parsed.job.samples },
    cameraState: { preset: parsed.job.camera_preset },
    shotMeta: parsed.job.shot_meta,
    expectedAssets: assets.expectedAssets,
    outputKey: output.outputKey,
    limits: {
      maxRuntimeMinutes: parsed.job.max_runtime_minutes,
      maxCostUsd: PILOT_MAX_COST_USD,
      maxFrames: PILOT_MAX_FRAMES,
    },
    createdAt: parsed.job.created_at,
    credentialsPolicy: {
      secretsInManifest: false,
      r2Scoped: true,
      runpodServerSideOnly: true,
    },
  };

  const serialized = JSON.stringify(workerManifest);
  if (/file:\/\//.test(serialized) || /rpa_[A-Za-z0-9]/.test(serialized) || /secret_access_key|Authorization/i.test(serialized)) {
    return fail('Compiled worker manifest must not embed secrets or local paths.', 'SECRET_LEAK');
  }

  try {
    renderCore.validateManifest(workerManifest);
  } catch (error) {
    return fail(error.message, error.code || 'WORKER_MANIFEST_INVALID');
  }
  return {
    ok: true,
    workerManifest,
    blenderVersion: blender.version,
    outputKey: output.outputKey,
    schemaVersion: WORKER_MANIFEST_SCHEMA,
  };
}

function fileSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function runPreflight(jobInput, options = {}) {
  const roots = options.roots;
  const completed = options.completedJobs ?? [];
  const reservedPrefixes = options.reservedOutputPrefixes ?? [];
  const parsed = normalizeJob(jobInput);
  if (!parsed.ok) return parsed;
  const job = parsed.job;

  const pins = assertPilotPins(job);
  if (!pins.ok) return pins;

  if (!ALLOWED_RESOLUTIONS.has(`${job.resolution_width}x${job.resolution_height}`)) {
    return fail('Invalid resolution.', 'INVALID_RESOLUTION');
  }
  if (!ALLOWED_FPS.has(job.fps)) return fail('Invalid fps.', 'INVALID_FPS');
  if (!ALLOWED_ENGINES.has(job.engine)) return fail('Unsupported render engine.', 'UNSUPPORTED_ENGINE');

  const frames = validateFrameRange(job);
  if (!frames.ok) return frames;

  if (job.max_runtime_minutes > PILOT_MAX_RUNTIME_MINUTES) {
    return fail('Estimated runtime exceeds the 20-minute guardrail.');
  }

  if (!roots?.sceneRoot || !roots?.assetRoot || !roots?.outputRoot) {
    return fail('Approved workspace roots are required.', 'AMBIGUOUS');
  }

  const scene = constrainToRoot(job.scene_reference, roots.sceneRoot, 'scene_reference');
  if (!scene.ok) return scene;
  if (!existsSync(scene.path) || !statSync(scene.path).isFile()) {
    return fail('Scene does not exist.', 'SCENE_MISSING');
  }
  const sceneHash = fileSha256(scene.path);
  if (!job.scene_sha256 || !SHA256.test(job.scene_sha256)) {
    return fail('scene_sha256 is required and must be a 64-hex digest.', 'SCENE_HASH_MISMATCH');
  }
  if (sceneHash !== job.scene_sha256) return fail('Scene hash mismatch.', 'SCENE_HASH_MISMATCH');

  if (!Array.isArray(job.assets) || job.assets.length === 0) {
    return fail('Asset list is required.', 'MISSING_ASSET');
  }
  const stagedAssets = [];
  for (const asset of job.assets) {
    if (!asset || typeof asset !== 'object') return fail('Malformed asset.', 'MISSING_ASSET');
    const unsafe = rejectUnsafeText(asset.reference, 'asset reference');
    if (unsafe) return fail(unsafe, 'MISSING_ASSET');
    const located = constrainToRoot(asset.reference, roots.assetRoot, 'asset');
    if (!located.ok) return located;
    if (!existsSync(located.path) || !statSync(located.path).isFile()) {
      return fail(`Required asset is missing: ${asset.role || asset.id || 'unknown'}.`, 'MISSING_ASSET');
    }
    const digest = fileSha256(located.path);
    if (!asset.sha256 || !SHA256.test(asset.sha256) || digest !== asset.sha256) {
      return fail('Required asset hash mismatch.', 'ASSET_HASH_MISMATCH');
    }
    stagedAssets.push({
      id: asset.id ?? asset.role,
      role: asset.role,
      kind: asset.kind ?? 'blend',
      uri: `file://${located.path}`,
      localPath: located.path,
      checksum: digest,
    });
  }

  const prefix = expectedOutputPrefix(job);
  if (job.expected_output_prefix !== prefix) {
    return fail('expected_output_prefix must include episode_id/shot_id/job_id.', 'OUTPUT_OVERWRITE');
  }
  const output = constrainToRoot(prefix, roots.outputRoot, 'expected_output_prefix');
  if (!output.ok) return output;
  if (reservedPrefixes.includes(prefix) || completed.some((done) => done.expected_output_prefix === prefix && done.job_id !== job.job_id)) {
    return fail('Job cannot overwrite another episode/shot output.', 'OUTPUT_OVERWRITE');
  }
  if (completed.some((done) => done.job_id === job.job_id && ['OUTPUT_VERIFIED', 'CLEANUP_CONFIRMED', 'RENDER_SUCCEEDED'].includes(done.state))) {
    return fail('Job has already completed.', 'DUPLICATE_JOB');
  }

  const hashed = hashJobManifest(job);
  return {
    ok: true,
    job,
    scenePath: scene.path,
    outputDir: output.path,
    assets: stagedAssets,
    frameCount: frames.frameCount,
    manifestSha256: hashed.sha256,
  };
}

export function buildRemoteBlenderCommand(preflight) {
  if (!preflight?.ok) return fail(preflight?.reason ?? 'Preflight must pass before command build.', 'COMMAND_REFUSED');
  const assembleScript = path.join(REPO_ROOT, ACCEPTED_ASSEMBLE_SCRIPT);
  if (!existsSync(assembleScript)) {
    return fail('Accepted Blender assemble script is missing.', 'COMMAND_UNKNOWN');
  }
  if (typeof renderCore.buildBlenderArgv !== 'function' || typeof renderCore.validateManifest !== 'function') {
    return fail('Accepted Blender command cannot be determined.', 'COMMAND_UNKNOWN');
  }
  const compiled = compileTivvleJoyJobToWorkerManifest(preflight.job);
  if (!compiled.ok) return compiled;
  const blenderArgv = renderCore.buildBlenderArgv({
    manifest: compiled.workerManifest,
    assets: compiled.workerManifest.expectedAssets.map((asset) => ({
      id: asset.role,
      role: asset.role,
      kind: asset.kind || 'blend',
      uri: `r2://${asset.r2Key}`,
      checksum: asset.sha256,
    })),
    outputDir: preflight.outputDir,
    assembleScript,
  });
  if (!Array.isArray(blenderArgv) || blenderArgv[0] !== '--background' || !blenderArgv.includes('--factory-startup')) {
    return fail('Accepted Blender command cannot be determined.', 'COMMAND_UNKNOWN');
  }
  if (blenderArgv.some((part) => String(part).startsWith('file://'))) {
    return fail('Local file paths are not allowed in the remote worker command.', 'LOCAL_PATH_IN_REMOTE_MANIFEST');
  }
  const wrapped = buildRemoteRenderDeadlineWrapper(['blender', ...blenderArgv]);
  if (!wrapped.ok) return fail(wrapped.reason, 'TIMEOUT_WRAPPER');
  const joined = wrapped.argv.join(' ');
  if (/rpa_|Authorization|secret_access_key/i.test(joined)) {
    return fail('Command would expose a secret.', 'SECRET_LEAK');
  }
  return {
    ok: true,
    blenderArgv,
    argv: wrapped.argv,
    hardDeadlineMinutes: wrapped.hardDeadlineMinutes,
    reusedComponent: ACCEPTED_RENDER_CORE,
    assembleScript: ACCEPTED_ASSEMBLE_SCRIPT,
    compiled,
  };
}

export function transitionState(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return fail(`Unknown state ${from}.`, 'STATE_INVALID');
  if (!allowed.includes(to)) return fail(`Illegal transition ${from} -> ${to}.`, 'STATE_INVALID');
  return { ok: true, from, to };
}

export function simulateLifecycle(kind) {
  const success = ['PLANNED', 'PREFLIGHT_PASSED', 'POD_REQUESTED', 'POD_READY', 'ASSETS_STAGED', 'RENDER_RUNNING', 'RENDER_SUCCEEDED', 'OUTPUT_VERIFIED', 'CLEANUP_PENDING', 'CLEANUP_CONFIRMED'];
  const failure = ['PLANNED', 'PREFLIGHT_PASSED', 'POD_REQUESTED', 'POD_READY', 'ASSETS_STAGED', 'RENDER_RUNNING', 'RENDER_FAILED', 'CLEANUP_PENDING', 'CLEANUP_CONFIRMED'];
  const timeout = ['PLANNED', 'PREFLIGHT_PASSED', 'POD_REQUESTED', 'POD_READY', 'ASSETS_STAGED', 'RENDER_RUNNING', 'RENDER_FAILED', 'CLEANUP_PENDING', 'CLEANUP_CONFIRMED'];
  const sequence = kind === 'failure' ? failure : kind === 'timeout' ? timeout : success;
  const steps = [];
  for (let i = 0; i < sequence.length - 1; i += 1) {
    const moved = transitionState(sequence[i], sequence[i + 1]);
    if (!moved.ok) return { ok: false, reason: moved.reason, steps, cleanupRequired: true };
    steps.push(moved);
  }
  return {
    ok: true,
    kind,
    steps,
    finalState: sequence[sequence.length - 1],
    cleanupRequired: true,
    cleanupConfirmed: sequence[sequence.length - 1] === 'CLEANUP_CONFIRMED',
    timedOut: kind === 'timeout',
    failed: kind === 'failure',
  };
}

export function buildSingleShotR2Keys(jobId) {
  if (!SAFE_ID.test(jobId)) return fail('jobId is malformed.', 'MALFORMED_JOB');
  const manifestKey = `jobs/${jobId}/manifest.json`;
  const statusKey = `jobs/${jobId}/status.json`;
  const startupStatusKey = `jobs/${jobId}/startup-status.json`;
  const metadataKey = `jobs/${jobId}/metadata.json`;
  for (const key of [manifestKey, statusKey, startupStatusKey, metadataKey]) {
    if (key.includes('..') || key.includes('//') || key.includes('\\') || key.startsWith('/') || key.startsWith('file:')) {
      return fail('R2 job key path traversal refused.', 'UNSAFE_R2_NAMESPACE');
    }
    if (!key.startsWith(`jobs/${jobId}/`)) {
      return fail('R2 job key must stay inside the job namespace.', 'UNSAFE_R2_NAMESPACE');
    }
  }
  return { ok: true, manifestKey, statusKey, startupStatusKey, metadataKey };
}

export function hashJobPackageIdentity(identity) {
  return hashCanonical(identity);
}

export function buildTivvleJoyRemoteJobPackage(jobInput) {
  const compiled = compileTivvleJoyJobToWorkerManifest(jobInput);
  if (!compiled.ok) return compiled;
  const parsed = normalizeJob(jobInput);
  if (!parsed.ok) return parsed;
  if (!parsed.job.scene_sha256 || !SHA256.test(parsed.job.scene_sha256)) {
    return fail('scene_sha256 is required to lock the job package.', 'SCENE_HASH_MISMATCH');
  }
  const keys = buildSingleShotR2Keys(compiled.workerManifest.jobId);
  if (!keys.ok) return keys;

  const renderSettings = {
    renderMode: compiled.workerManifest.renderMode,
    resolution: compiled.workerManifest.resolution,
    fps: compiled.workerManifest.fps,
    frameRange: compiled.workerManifest.frameRange,
    eevee: compiled.workerManifest.eevee,
    blenderVersion: compiled.workerManifest.blenderVersion,
  };
  const workerManifestSha256 = hashCanonical(compiled.workerManifest);
  const identity = {
    jobId: compiled.workerManifest.jobId,
    workerManifestSha256,
    sceneSha256: parsed.job.scene_sha256,
    expectedAssets: compiled.workerManifest.expectedAssets,
    outputKey: compiled.workerManifest.outputKey,
    blenderVersion: compiled.workerManifest.blenderVersion,
    renderSettings,
    runtimeLimit: compiled.workerManifest.limits.maxRuntimeMinutes,
    costLimit: compiled.workerManifest.limits.maxCostUsd,
    manifestKey: keys.manifestKey,
    statusKey: keys.statusKey,
    startupStatusKey: keys.startupStatusKey,
  };
  const jobPackage = {
    schema_version: JOB_PACKAGE_SCHEMA,
    state: PACKAGE_STATE_NOT_READY,
    jobId: compiled.workerManifest.jobId,
    workerManifest: compiled.workerManifest,
    workerManifestSha256,
    manifestKey: keys.manifestKey,
    statusKey: keys.statusKey,
    startupStatusKey: keys.startupStatusKey,
    metadataKey: keys.metadataKey,
    expectedAssets: compiled.workerManifest.expectedAssets,
    outputKey: compiled.workerManifest.outputKey,
    renderProfile: compiled.workerManifest.renderMode,
    runtimeLimit: compiled.workerManifest.limits.maxRuntimeMinutes,
    costLimit: compiled.workerManifest.limits.maxCostUsd,
    blenderVersion: compiled.workerManifest.blenderVersion,
    sceneSha256: parsed.job.scene_sha256,
    identity,
    jobPackageSha256: hashJobPackageIdentity(identity),
    compiled,
  };

  const serialized = JSON.stringify(jobPackage);
  if (/file:\/\//.test(serialized) || /rpa_[A-Za-z0-9]/.test(serialized) || /secret_access_key|Authorization/i.test(serialized)) {
    return fail('Job package must not embed secrets or local paths.', 'SECRET_LEAK');
  }
  return { ok: true, jobPackage };
}

export function createInMemoryR2Adapter(seed = {}) {
  const store = new Map();
  const mutations = [];
  for (const [key, value] of Object.entries(seed)) {
    const body = value && typeof value === 'object' && 'body' in value ? value.body : value;
    const sha256 = value && typeof value === 'object' && value.sha256 ? value.sha256 : hashCanonical(body);
    store.set(key, { body, sha256 });
  }
  return {
    kind: 'in-memory',
    realR2: false,
    store,
    mutations,
    head(key) {
      const obj = store.get(key);
      if (!obj) return { exists: false };
      return { exists: true, sha256: obj.sha256 };
    },
    get(key) {
      const obj = store.get(key);
      if (!obj) return { ok: false, code: 'MISSING' };
      return { ok: true, body: obj.body, sha256: obj.sha256 };
    },
    put(key, body, sha256) {
      mutations.push({ op: 'PUT', key, sha256 });
      store.set(key, { body, sha256 });
      return { ok: true };
    },
  };
}

export function classifyStagedObject({ key, expectedSha256, head, localSource }) {
  if (!isApprovedR2Key(key) && !key.startsWith('jobs/')) return 'REFUSED';
  if (key.startsWith('file:') || key.includes('..') || key.startsWith('/')) return 'REFUSED';
  if (head?.exists) {
    if (!expectedSha256 || head.sha256 !== expectedSha256) return 'HASH_MISMATCH';
    return 'ALREADY_PRESENT_AND_HASH_MATCHES';
  }
  if (localSource?.sha256 && localSource.sha256 === expectedSha256) return 'UPLOAD_REQUIRED';
  return 'MISSING';
}

export function planJobPackageStaging(jobPackage, { adapter, localSources = {} } = {}) {
  if (!jobPackage?.workerManifest) return fail('Job package is required.', 'NOT_READY');
  const objects = [];
  for (const asset of jobPackage.expectedAssets) {
    const state = classifyStagedObject({
      key: asset.r2Key,
      expectedSha256: asset.sha256,
      head: adapter.head(asset.r2Key),
      localSource: localSources[asset.r2Key],
    });
    objects.push({ kind: 'asset', role: asset.role, r2Key: asset.r2Key, sha256: asset.sha256, state });
  }
  objects.push({
    kind: 'manifest',
    r2Key: jobPackage.manifestKey,
    sha256: jobPackage.workerManifestSha256,
    state: classifyStagedObject({
      key: jobPackage.manifestKey,
      expectedSha256: jobPackage.workerManifestSha256,
      head: adapter.head(jobPackage.manifestKey),
      localSource: { sha256: jobPackage.workerManifestSha256 },
    }),
  });
  return { ok: true, objects, realR2: adapter.realR2 === true };
}

export function simulatePublishJobPackage(jobPackage, { adapter, localSources = {}, failOnKey = null } = {}) {
  const pkg = jobPackage?.jobPackage || jobPackage;
  if (!pkg?.workerManifest) {
    return { ok: false, reason: jobPackage?.reason ?? 'Job package is required.', code: 'NOT_READY', state: PACKAGE_STATE_NOT_READY };
  }
  const existing = adapter.get(pkg.manifestKey);
  if (existing.ok && existing.sha256 === pkg.workerManifestSha256) {
    return {
      ok: true,
      state: PACKAGE_STATE_STAGED,
      idempotent: true,
      plan: planJobPackageStaging(pkg, { adapter, localSources }),
      publishOrder: [...MANIFEST_PUBLISH_ORDER],
      r2MutationSimulated: true,
      realR2: false,
      gpuLaunched: false,
      podCreated: false,
      blenderExecuted: false,
      contactedPaidEndpoint: false,
      jobPackage: { ...pkg, state: PACKAGE_STATE_STAGED },
    };
  }
  if (existing.ok && existing.sha256 !== pkg.workerManifestSha256) {
    return {
      ok: false,
      reason: 'Job identity conflict: same job ID with different execution content.',
      code: 'JOB_IDENTITY_CONFLICT',
      state: PACKAGE_STATE_NOT_READY,
    };
  }

  const steps = [];
  const plan = planJobPackageStaging(pkg, { adapter, localSources });
  if (!plan.ok) return { ...plan, state: PACKAGE_STATE_NOT_READY };
  const refused = (reason, code, extra = {}) => ({
    ok: false,
    reason,
    code,
    state: PACKAGE_STATE_NOT_READY,
    plan,
    steps: [...steps],
    gpuLaunched: false,
    podCreated: false,
    blenderExecuted: false,
    contactedPaidEndpoint: false,
    realR2: false,
    ...extra,
  });

  steps.push('VERIFY_IMMUTABLE_ASSETS');
  if (plan.objects.some((object) => object.state === 'HASH_MISMATCH')) {
    steps.push('REFUSE_HASH_MISMATCH');
    return refused('Remote asset hash mismatch refuses staging.', 'HASH_MISMATCH');
  }
  steps.push('REFUSE_HASH_MISMATCH');
  if (plan.objects.some((object) => object.kind === 'asset' && object.state === 'REFUSED')) {
    return refused('Unsafe R2 key refuses staging.', 'UNSAFE_R2_NAMESPACE');
  }
  if (plan.objects.some((object) => object.kind === 'asset' && object.state === 'MISSING')) {
    return refused('Required remote asset is missing.', 'MISSING_ASSET');
  }

  steps.push('UPLOAD_MISSING_APPROVED_ASSETS');
  for (const object of plan.objects.filter((item) => item.kind === 'asset')) {
    if (object.state !== 'UPLOAD_REQUIRED') continue;
    if (failOnKey && failOnKey === object.r2Key) {
      return refused('Partial asset upload left the package NOT_READY.', 'NOT_READY', {
        partial: true,
        manifestUploaded: adapter.mutations.some((mutation) => mutation.key === pkg.manifestKey),
      });
    }
    const source = localSources[object.r2Key];
    if (!source?.body || source.sha256 !== object.sha256) {
      return refused('Required remote asset is missing.', 'MISSING_ASSET');
    }
    adapter.put(object.r2Key, source.body, source.sha256);
  }

  steps.push('VERIFY_UPLOADED_ASSET_CHECKSUMS');
  for (const asset of pkg.expectedAssets) {
    const remote = adapter.get(asset.r2Key);
    if (!remote.ok || remote.sha256 !== asset.sha256) {
      return refused('Uploaded asset checksum verification failed.', 'HASH_MISMATCH');
    }
  }

  steps.push('COMPILE_WORKER_MANIFEST');
  steps.push('HASH_WORKER_MANIFEST');
  const manifestBody = JSON.stringify(canonicalize(pkg.workerManifest));
  const manifestSha = hashCanonical(pkg.workerManifest);
  if (manifestSha !== pkg.workerManifestSha256) {
    return refused('Worker manifest hash changed after package finalization.', 'JOB_IDENTITY_CONFLICT');
  }

  steps.push('UPLOAD_MANIFEST_LAST');
  if (failOnKey === pkg.manifestKey) {
    return refused('Partial staging left the package NOT_READY.', 'NOT_READY', {
      partial: true,
      manifestUploaded: false,
    });
  }
  adapter.put(pkg.manifestKey, manifestBody, manifestSha);

  steps.push('READ_MANIFEST_BACK');
  const readback = adapter.get(pkg.manifestKey);
  if (!readback.ok) {
    return refused('Manifest read-back is required before STAGED.', 'NOT_READY');
  }
  steps.push('VERIFY_MANIFEST_SHA256');
  if (readback.sha256 !== pkg.workerManifestSha256 || hashCanonical(JSON.parse(readback.body)) !== pkg.workerManifestSha256) {
    return refused('Manifest read-back hash mismatch.', 'HASH_MISMATCH');
  }

  steps.push('MARK_STAGED');
  const puts = adapter.mutations.filter((mutation) => mutation.op === 'PUT').map((mutation) => mutation.key);
  return {
    ok: true,
    state: PACKAGE_STATE_STAGED,
    idempotent: false,
    plan: planJobPackageStaging(pkg, { adapter, localSources }),
    publishOrder: steps,
    manifestUploadedLast: puts.length > 0 && puts[puts.length - 1] === pkg.manifestKey,
    r2MutationSimulated: true,
    realR2: false,
    gpuLaunched: false,
    podCreated: false,
    blenderExecuted: false,
    contactedPaidEndpoint: false,
    jobPackage: { ...pkg, state: PACKAGE_STATE_STAGED },
  };
}

export const ASSET_STAGING_PLAN = Object.freeze({
  source: 'Reuse existing R2 + render-core single-shot staging. Do not invent a second pipeline.',
  worker: 'workers/runpod-blender/src/single-shot.js downloads expectedAssets by r2Key and verifies sha256.',
  layout: 'characters/, environments/, props/, animations/, vfx/, audio/, episodes/, renders/, cache/, tivvlejoy-assets/, scenery/ via packages/production/src/cloud/r2-layout.ts',
  cache: 'Reuse remote checksum when unchanged. Detect missing/corrupt assets before Blender starts.',
  contents: ['Blender scene', 'Pip/Goat assets when production-ready', 'scenery', 'textures', 'HDRIs', 'render configuration', 'audio only if the render stage needs it'],
  secrets: 'Never embed credentials in the job manifest or argv.',
  productionMutation: false,
});

export const OUTPUT_VERIFICATION_CONTRACT = Object.freeze({
  required: [
    'expected frames exist',
    'expected frame count',
    'non-zero files',
    'valid image/video decode',
    'resolution 1080x1920',
    'frame rate 30 where applicable',
    'no missing sequence frames',
    'output hashes recorded',
    'render duration recorded',
    'GPU wall time recorded',
    'projected and actual cost fields supported',
  ],
  reuse: 'workers/runpod-blender/src/render-core.js verifyFrames + encodeVideo + validateOutput',
  artisticQc: false,
  failureDoesNotCompleteShot: true,
});

export const FUTURE_LAUNCH_GATES = Object.freeze({
  confirm_paid_gpu: true,
  paid_approval_phrase: REQUIRED_APPROVAL_PHRASE,
  render_plan: 'PASS',
  template: 'RUNPOD_RENDER_TEMPLATE_ID',
  gpu: PINNED_GPU_TYPE_ID,
  cloud: PINNED_CLOUD_TYPE,
  gpuCount: PINNED_GPU_COUNT,
  interruptible: false,
  maxHourlyUsd: MAX_HOURLY_USD,
  maxComputeUsd: MAX_COMPUTE_USD,
  maxRuntimeMinutes: PILOT_MAX_RUNTIME_MINUTES,
  automaticCleanup: true,
});

export function createSampleWorkspace(root) {
  mkdirSync(path.join(root, 'scenes'), { recursive: true });
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  mkdirSync(path.join(root, 'outputs'), { recursive: true });
  const scenePath = path.join(root, 'scenes', 'scene.blend');
  const assetPath = path.join(root, 'assets', 'pip.blend');
  writeFileSync(scenePath, 'TIVVLEJOY_DRY_RUN_SCENE\n');
  writeFileSync(assetPath, 'TIVVLEJOY_DRY_RUN_PIP\n');
  return {
    sceneRoot: path.join(root, 'scenes'),
    assetRoot: path.join(root, 'assets'),
    outputRoot: path.join(root, 'outputs'),
    sceneSha256: fileSha256(scenePath),
    pipSha256: fileSha256(assetPath),
  };
}

export function runDryRun({ workspaceRoot, completedJobs = [], log = console.log } = {}) {
  const roots = createSampleWorkspace(workspaceRoot);
  const job = defaultPilotJob({
    scene_sha256: roots.sceneSha256,
    pip_sha256: roots.pipSha256,
    assets: [
      {
        id: 'pip',
        role: 'pip',
        kind: 'blend',
        reference: 'pip.blend',
        r2Key: 'characters/pip/v1/pip.blend',
        sha256: roots.pipSha256,
      },
    ],
  });
  const preflight = runPreflight(job, { roots, completedJobs });
  if (!preflight.ok) {
    log('dry-run REFUSE');
    log(preflight.reason);
    return { ok: false, preflight, contactedPaidEndpoint: false };
  }
  const compiled = compileTivvleJoyJobToWorkerManifest(job);
  if (!compiled.ok) {
    log('dry-run REFUSE');
    log(compiled.reason);
    return { ok: false, preflight, compiled, contactedPaidEndpoint: false };
  }
  const packaged = buildTivvleJoyRemoteJobPackage(job);
  if (!packaged.ok) {
    log('dry-run REFUSE');
    log(packaged.reason);
    return { ok: false, preflight, compiled, packaged, contactedPaidEndpoint: false };
  }
  const command = buildRemoteBlenderCommand(preflight);
  if (!command.ok) {
    log('dry-run REFUSE');
    log(command.reason);
    return { ok: false, preflight, compiled, packaged, command, contactedPaidEndpoint: false };
  }
  const adapter = createInMemoryR2Adapter();
  const localSources = Object.fromEntries(
    packaged.jobPackage.expectedAssets.map((asset) => {
      const local = preflight.assets.find((item) => item.role === asset.role);
      return [asset.r2Key, { body: local?.localPath ? readFileSync(local.localPath) : asset.sha256, sha256: asset.sha256 }];
    }),
  );
  const staged = simulatePublishJobPackage(packaged, { adapter, localSources });
  if (!staged.ok) {
    log('dry-run REFUSE');
    log(staged.reason);
    return { ok: false, preflight, compiled, packaged, command, staged, contactedPaidEndpoint: false };
  }
  const success = simulateLifecycle('success');
  const failure = simulateLifecycle('failure');
  const timeout = simulateLifecycle('timeout');
  log('dry-run PASS');
  log(`Status: ${STAGING_FOUNDATION_STATUS}`);
  log(`Execution status: ${FOUNDATION_STATUS}`);
  log('Worker contract alignment: compiled ddp-cloud-job-manifest-v1 passed renderCore.validateManifest');
  log(`Reused command: ${ACCEPTED_RENDER_CORE} buildBlenderArgv`);
  log(`Assemble script: ${ACCEPTED_ASSEMBLE_SCRIPT}`);
  log(`Worker schema: ${compiled.schemaVersion}`);
  log(`Blender version: ${compiled.blenderVersion}`);
  log(`outputKey: ${compiled.outputKey}`);
  log(`manifestKey: ${packaged.jobPackage.manifestKey}`);
  log(`statusKey: ${packaged.jobPackage.statusKey}`);
  log(`startupStatusKey: ${packaged.jobPackage.startupStatusKey}`);
  log(`jobPackageSha256: ${packaged.jobPackage.jobPackageSha256}`);
  log(`Package state: ${staged.state}`);
  log(`Resolution: ${PILOT_RESOLUTION}`);
  log(`FPS: ${PILOT_FPS}`);
  log(`Engine: ${PILOT_ENGINE}`);
  log(`Timeout: ${command.hardDeadlineMinutes} minutes`);
  log(`Cost cap: ${compiled.workerManifest.limits.maxCostUsd}`);
  log(`Manifest sha256: ${preflight.manifestSha256}`);
  log(`Success final state: ${success.finalState}`);
  log(`Failure cleanup confirmed: ${failure.cleanupConfirmed}`);
  log(`Timeout cleanup confirmed: ${timeout.cleanupConfirmed}`);
  const workerEnv = buildWorkerEnvironment({
    jobPackage: packaged.jobPackage,
    storageConfig: {
      R2_BUCKET: 'tivvlejoy-dry-run-bucket',
      R2_ENDPOINT: 'https://example.invalid',
      R2_REGION: 'auto',
    },
    storageCredentials: {
      R2_ACCESS_KEY_ID: 'tj-dry-run-access',
      R2_SECRET_ACCESS_KEY: 'tj-dry-run-storage',
    },
    launchMetadata: {
      RUNPOD_GPU_HOURLY_RATE: '0.75',
      RUNPOD_POD_ID: 'dry-run-pod',
      RENDER_WORKER_ID: 'dry-run-worker',
    },
  });
  if (!workerEnv.ok) {
    log('dry-run REFUSE');
    log(workerEnv.reason);
    return { ok: false, preflight, compiled, packaged, command, staged, workerEnv, contactedPaidEndpoint: false };
  }
  log('R2 mutation simulated only');
  log('GPU launched: false');
  log('Pod created: false');
  log('Blender executed: false');
  log('Paid mutation contacted: false');
  const publicWorkerKeys = Object.keys(workerEnv.env)
    .filter((key) => !WORKER_SECRET_ENV_SET.has(key))
    .sort();
  log(`Worker env public keys: ${publicWorkerKeys.join(',')}`);
  log('Least-privilege worker env allowlist applied');
  log('Launcher-only credentials excluded');
  log('Paid GPU execution is not enabled.');
  log('Remote Blender execution is not enabled.');
  return {
    ok: true,
    job,
    preflight,
    compiled,
    packaged,
    staged,
    command,
    workerEnv,
    success,
    failure,
    timeout,
    contactedPaidEndpoint: false,
    paidMutationUrl: REST_PODS_URL,
    blenderExecuted: false,
    podCreated: false,
    gpuLaunched: false,
    r2MutationSimulated: true,
    realR2: false,
  };
}

async function cli(command) {
  if (command === 'dry-run') {
    const root = path.join(REPO_ROOT, 'artifacts', 'tivvlejoy-remote-render', 'dry-run');
    const result = runDryRun({ workspaceRoot: root });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }
  console.log('Unknown command. Use dry-run.');
  process.exitCode = 1;
}

const invokedDirectly = Boolean(process.argv[1] && process.argv[1].endsWith('tivvlejoy-remote-blender-foundation.mjs'));
if (invokedDirectly && process.env.VITEST !== 'true') {
  await cli(process.argv[2] ?? '');
}

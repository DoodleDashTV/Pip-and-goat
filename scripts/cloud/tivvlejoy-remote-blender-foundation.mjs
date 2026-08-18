/**
 * TivvleJoy remote Blender execution foundation.
 *
 * CURRENT STATUS: REMOTE EXECUTION FOUNDATION ONLY
 * NOT YET ENABLED: paid GPU execution, remote Blender execution, automatic production rendering.
 *
 * Reuses the accepted RunPod worker command from
 * workers/runpod-blender/src/render-core.js → buildBlenderArgv().
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
export const PAID_GPU_ENABLED = false;
export const REMOTE_BLENDER_EXECUTION_ENABLED = false;
export const AUTOMATIC_PRODUCTION_RENDERING_ENABLED = false;

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
    assets: overrides.assets ?? [
      {
        id: 'pip',
        role: 'pip',
        kind: 'blend',
        reference: 'pip.blend',
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
  if (typeof renderCore.buildBlenderArgv !== 'function') {
    return fail('Accepted Blender command cannot be determined.', 'COMMAND_UNKNOWN');
  }
  const job = preflight.job;
  const blenderArgv = renderCore.buildBlenderArgv({
    manifest: {
      sceneId: job.shot_id,
      episodeId: job.episode_id,
      jobId: job.job_id,
      resolution: PILOT_RESOLUTION,
      fps: job.fps,
      frameRange: { start: job.frame_start, end: job.frame_end },
      eevee: { engine: job.engine, samples: job.samples },
      cameraState: { preset: job.camera_preset },
      shotMeta: job.shot_meta,
    },
    assets: preflight.assets,
    outputDir: preflight.outputDir,
    assembleScript,
  });
  if (!Array.isArray(blenderArgv) || blenderArgv[0] !== '--background' || !blenderArgv.includes('--factory-startup')) {
    return fail('Accepted Blender command cannot be determined.', 'COMMAND_UNKNOWN');
  }
  const wrapped = buildRemoteRenderDeadlineWrapper(['blender', ...blenderArgv]);
  if (!wrapped.ok) return fail(wrapped.reason, 'TIMEOUT_WRAPPER');
  const joined = wrapped.argv.join(' ');
  if (/rpa_|RUNPOD_|Authorization|secret/i.test(joined)) {
    return fail('Command would expose a secret.', 'SECRET_LEAK');
  }
  return {
    ok: true,
    blenderArgv,
    argv: wrapped.argv,
    hardDeadlineMinutes: wrapped.hardDeadlineMinutes,
    reusedComponent: ACCEPTED_RENDER_CORE,
    assembleScript: ACCEPTED_ASSEMBLE_SCRIPT,
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

export const ASSET_STAGING_PLAN = Object.freeze({
  source: 'Reuse existing R2 + render-core single-shot staging. Do not invent a second pipeline.',
  worker: 'workers/runpod-blender/src/single-shot.js downloads expectedAssets by r2Key and verifies sha256.',
  layout: 'characters/, environments/, props/, scenery/, cache/{fingerprint}/ via packages/production/src/cloud/r2-layout.ts',
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
    assets: [{ id: 'pip', role: 'pip', kind: 'blend', reference: 'pip.blend', sha256: roots.pipSha256 }],
  });
  const preflight = runPreflight(job, { roots, completedJobs });
  if (!preflight.ok) {
    log('dry-run REFUSE');
    log(preflight.reason);
    return { ok: false, preflight, contactedPaidEndpoint: false };
  }
  const command = buildRemoteBlenderCommand(preflight);
  if (!command.ok) {
    log('dry-run REFUSE');
    log(command.reason);
    return { ok: false, preflight, command, contactedPaidEndpoint: false };
  }
  const success = simulateLifecycle('success');
  const failure = simulateLifecycle('failure');
  const timeout = simulateLifecycle('timeout');
  log('dry-run PASS');
  log(`Status: ${FOUNDATION_STATUS}`);
  log(`Reused command: ${ACCEPTED_RENDER_CORE} buildBlenderArgv`);
  log(`Assemble script: ${ACCEPTED_ASSEMBLE_SCRIPT}`);
  log(`Resolution: ${PILOT_RESOLUTION}`);
  log(`FPS: ${PILOT_FPS}`);
  log(`Engine: ${PILOT_ENGINE}`);
  log(`Timeout: ${command.hardDeadlineMinutes} minutes`);
  log(`Manifest sha256: ${preflight.manifestSha256}`);
  log(`Success final state: ${success.finalState}`);
  log(`Failure cleanup confirmed: ${failure.cleanupConfirmed}`);
  log(`Timeout cleanup confirmed: ${timeout.cleanupConfirmed}`);
  log('Paid GPU execution is not enabled.');
  log('Remote Blender execution is not enabled.');
  return {
    ok: true,
    job,
    preflight,
    command,
    success,
    failure,
    timeout,
    contactedPaidEndpoint: false,
    paidMutationUrl: REST_PODS_URL,
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

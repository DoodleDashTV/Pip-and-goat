import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const renderCore = require('../../workers/runpod-blender/src/render-core.js');

import {
  ACCEPTED_ASSEMBLE_SCRIPT,
  ACCEPTED_RENDER_CORE,
  ASSET_STAGING_PLAN,
  FOUNDATION_STATUS,
  FUTURE_LAUNCH_GATES,
  OUTPUT_VERIFICATION_CONTRACT,
  PILOT_ENGINE,
  PILOT_FPS,
  PILOT_MAX_COST_USD,
  PILOT_MAX_RUNTIME_MINUTES,
  PILOT_RESOLUTION,
  WORKER_MANIFEST_SCHEMA,
  assertPilotPins,
  buildRemoteBlenderCommand,
  buildWorkerOutputKey,
  compileTivvleJoyJobToWorkerManifest,
  createSampleWorkspace,
  defaultPilotJob,
  expectedOutputPrefix,
  hashJobManifest,
  rejectUnsafeText,
  resolveAuthoritativeBlenderVersion,
  runDryRun,
  runPreflight,
  simulateLifecycle,
  transitionState,
} from './tivvlejoy-remote-blender-foundation.mjs';
import {
  MAX_COMPUTE_USD,
  MAX_HOURLY_USD,
  PINNED_CLOUD_TYPE,
  PINNED_GPU_TYPE_ID,
  REQUIRED_APPROVAL_PHRASE,
} from './tivvlejoy-guarded-render.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/tivvlejoy-runpod.yml'), 'utf8');
const foundationSource = readFileSync(path.join(repoRoot, 'scripts/cloud/tivvlejoy-remote-blender-foundation.mjs'), 'utf8');
const docs = readFileSync(path.join(repoRoot, 'docs/runpod-blender-execution.md'), 'utf8');

let temps = [];
afterEach(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  temps = [];
});

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-remote-blender-'));
  temps.push(root);
  return createSampleWorkspace(root);
}

function validJob(roots, overrides = {}) {
  return defaultPilotJob({
    scene_sha256: roots.sceneSha256,
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
    ...overrides,
  });
}

describe('valid job manifest and hashing', () => {
  it('accepts a valid pilot job and hashes it deterministically', () => {
    const roots = workspace();
    const jobA = validJob(roots);
    const jobB = validJob(roots);
    const first = hashJobManifest(jobA);
    const second = hashJobManifest({ ...jobB, camera_preset: jobA.camera_preset });
    assert.equal(first.ok, true);
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.sha256.length, 64);
    assert.equal(jobA.resolution_width, 1080);
    assert.equal(jobA.resolution_height, 1920);
    assert.equal(jobA.fps, 30);
  });

  it('refuses a malformed job', () => {
    assert.equal(hashJobManifest(null).ok, false);
    assert.equal(hashJobManifest({ job_id: 'bad id' }).code, 'MALFORMED_JOB');
  });
});

describe('preflight gates', () => {
  it('passes a valid workspace job', () => {
    const roots = workspace();
    const result = runPreflight(validJob(roots), { roots });
    assert.equal(result.ok, true);
    assert.equal(result.frameCount, 90);
  });

  it('refuses a scene hash mismatch', () => {
    const roots = workspace();
    const result = runPreflight(validJob(roots, { scene_sha256: 'a'.repeat(64) }), { roots });
    assert.equal(result.code, 'SCENE_HASH_MISMATCH');
  });

  it('refuses a missing asset', () => {
    const roots = workspace();
    const result = runPreflight(
      validJob(roots, {
        assets: [{ id: 'goat', role: 'goat', kind: 'blend', reference: 'missing.blend', sha256: 'b'.repeat(64) }],
      }),
      { roots },
    );
    assert.equal(result.code, 'MISSING_ASSET');
  });

  it('refuses invalid resolution, fps, engine, and unsafe frames', () => {
    const roots = workspace();
    assert.equal(assertPilotPins(validJob(roots, { resolution_width: 1920, resolution_height: 1080 })).ok, false);
    assert.equal(assertPilotPins(validJob(roots, { fps: 24 })).ok, false);
    assert.equal(assertPilotPins(validJob(roots, { engine: 'CYCLES' })).ok, false);
    assert.equal(runPreflight(validJob(roots, { frame_start: 0, frame_end: 2 }), { roots }).code, 'UNSAFE_FRAME_RANGE');
    assert.equal(runPreflight(validJob(roots, { frame_start: 1, frame_end: 400 }), { roots }).code, 'UNSAFE_FRAME_RANGE');
  });

  it('refuses path traversal and command injection', () => {
    const roots = workspace();
    assert.ok(rejectUnsafeText('../secret.blend', 'scene'));
    assert.ok(rejectUnsafeText('scene.blend; rm -rf /', 'scene'));
    assert.equal(runPreflight(validJob(roots, { scene_reference: '../secret.blend' }), { roots }).ok, false);
    assert.equal(hashJobManifest(validJob(roots, { camera_preset: 'WIDE;curl evil' })).ok, false);
    assert.equal(hashJobManifest(validJob(roots, { job_id: '$(reboot)' })).ok, false);
  });

  it('refuses output overwrite and duplicate completed jobs', () => {
    const roots = workspace();
    const job = validJob(roots);
    const overwrite = runPreflight(job, {
      roots,
      reservedOutputPrefixes: [expectedOutputPrefix(job)],
    });
    assert.equal(overwrite.code, 'OUTPUT_OVERWRITE');
    const duplicate = runPreflight(job, {
      roots,
      completedJobs: [{ job_id: job.job_id, expected_output_prefix: job.expected_output_prefix, state: 'OUTPUT_VERIFIED' }],
    });
    assert.equal(duplicate.code, 'DUPLICATE_JOB');
  });
});

describe('remote command contract', () => {
  it('reuses render-core argv and wraps a 20-minute timeout', () => {
    const roots = workspace();
    const preflight = runPreflight(validJob(roots), { roots });
    const command = buildRemoteBlenderCommand(preflight);
    assert.equal(command.ok, true);
    assert.equal(command.reusedComponent, ACCEPTED_RENDER_CORE);
    assert.equal(command.assembleScript, ACCEPTED_ASSEMBLE_SCRIPT);
    assert.deepEqual(command.argv.slice(0, 4), ['timeout', '--kill-after=30s', '20m', 'blender']);
    assert.equal(command.blenderArgv[0], '--background');
    assert.equal(command.blenderArgv.includes('--factory-startup'), true);
    assert.equal(command.blenderArgv.includes(PILOT_RESOLUTION), true);
    assert.equal(command.blenderArgv.includes(String(PILOT_FPS)), true);
    assert.equal(command.blenderArgv.includes(PILOT_ENGINE), true);
    assert.equal(command.hardDeadlineMinutes, PILOT_MAX_RUNTIME_MINUTES);
    assert.equal(command.argv.join(' ').includes('rpa_'), false);
  });

  it('refuses to build a command without preflight', () => {
    assert.equal(buildRemoteBlenderCommand({ ok: false, reason: 'no' }).ok, false);
  });
});

describe('state machine', () => {
  it('walks success, failure, and timeout into cleanup-confirmed', () => {
    const success = simulateLifecycle('success');
    const failure = simulateLifecycle('failure');
    const timeout = simulateLifecycle('timeout');
    assert.equal(success.ok, true);
    assert.equal(success.finalState, 'CLEANUP_CONFIRMED');
    assert.equal(success.cleanupRequired, true);
    assert.equal(failure.failed, true);
    assert.equal(failure.cleanupConfirmed, true);
    assert.equal(timeout.timedOut, true);
    assert.equal(timeout.cleanupConfirmed, true);
    assert.equal(transitionState('PLANNED', 'RENDER_RUNNING').ok, false);
    assert.equal(transitionState('CLEANUP_PENDING', 'CLEANUP_CONFIRMED').ok, true);
    assert.equal(transitionState('CLEANUP_PENDING', 'MANUAL_ATTENTION').ok, true);
  });
});

describe('worker contract compiler', () => {
  it('compiles a valid TivvleJoy job into ddp-cloud-job-manifest-v1', () => {
    const roots = workspace();
    const job = validJob(roots);
    const first = compileTivvleJoyJobToWorkerManifest(job);
    const second = compileTivvleJoyJobToWorkerManifest(job);
    assert.equal(first.ok, true);
    assert.equal(first.schemaVersion, 'ddp-cloud-job-manifest-v1');
    assert.equal(first.schemaVersion, WORKER_MANIFEST_SCHEMA);
    assert.deepEqual(first.workerManifest, second.workerManifest);
    const manifest = first.workerManifest;
    assert.equal(manifest.jobId, job.job_id);
    assert.equal(manifest.episodeId, job.episode_id);
    assert.equal(manifest.sceneId, job.shot_id);
    assert.equal(manifest.renderMode, 'FINAL_1080P');
    assert.equal(manifest.resolution, '1080x1920');
    assert.equal(manifest.fps, 30);
    assert.deepEqual(manifest.frameRange, { start: 1, end: 90 });
    assert.deepEqual(manifest.eevee, { engine: 'EEVEE', samples: 24 });
    assert.equal(manifest.limits.maxRuntimeMinutes, 20);
    assert.equal(manifest.limits.maxCostUsd, 0.25);
    assert.equal(manifest.limits.maxCostUsd, PILOT_MAX_COST_USD);
    assert.equal(manifest.blenderVersion, '4.2.3');
    assert.equal(manifest.blenderVersion, resolveAuthoritativeBlenderVersion().version);
    assert.equal(manifest.outputKey, `renders/finals/${job.episode_id}/${job.job_id}/final_1080p.mp4`);
    assert.deepEqual(manifest.expectedAssets, [
      { role: 'pip', r2Key: 'characters/pip/v1/pip.blend', sha256: roots.pipSha256 },
    ]);
    assert.equal(JSON.stringify(manifest).includes('file://'), false);
    assert.equal(JSON.stringify(manifest).includes('rpa_'), false);
    assert.equal(JSON.stringify(manifest).includes('Authorization'), false);
    assert.equal(JSON.stringify(manifest).includes('secret_access_key'), false);
  });

  it('passes the real renderCore.validateManifest and buildBlenderArgv', () => {
    const roots = workspace();
    const compiled = compileTivvleJoyJobToWorkerManifest(validJob(roots));
    assert.equal(renderCore.validateManifest(compiled.workerManifest), compiled.workerManifest);
    const argv = renderCore.buildBlenderArgv({
      manifest: compiled.workerManifest,
      assets: compiled.workerManifest.expectedAssets,
      outputDir: '/tmp/out',
      assembleScript: '/tmp/assemble_scene.py',
    });
    assert.equal(argv.includes('--background'), true);
    assert.equal(argv.includes('1080x1920'), true);
    assert.equal(argv.includes('30'), true);
    assert.equal(argv.includes('EEVEE'), true);
    assert.equal(argv.includes('24'), true);
  });

  it('refuses missing, malformed, duplicate, unsafe, and local remote assets', () => {
    const roots = workspace();
    const base = validJob(roots);
    assert.equal(compileTivvleJoyJobToWorkerManifest({ job_id: 'bad id' }).ok, false);
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { assets: [{ ...base.assets[0], r2Key: undefined }] })).code,
      'MISSING_R2_KEY',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { assets: [{ ...base.assets[0], sha256: undefined }] })).code,
      'MISSING_SHA256',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { assets: [{ ...base.assets[0], sha256: 'zzz' }] })).code,
      'MALFORMED_SHA256',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(
        validJob(roots, { assets: [base.assets[0], { ...base.assets[0], id: 'pip-2', r2Key: 'characters/pip/v2/pip.blend' }] }),
      ).code,
      'DUPLICATE_ROLE',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { assets: [{ ...base.assets[0], r2Key: 'tmp/evil.blend' }] })).code,
      'UNSAFE_R2_NAMESPACE',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { assets: [{ ...base.assets[0], r2Key: 'file:///tmp/pip.blend' }] }))
        .code,
      'LOCAL_PATH_IN_REMOTE_MANIFEST',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(validJob(roots, { required_asset_classes: ['character', 'scenery'] })).code,
      'MISSING_SCENERY',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(
        validJob(roots, {
          assets: [
            base.assets[0],
            { id: 'village', role: 'scenery', kind: 'scenery', reference: 'village.blend', sha256: 'c'.repeat(64) },
          ],
        }),
      ).code,
      'MISSING_R2_KEY',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(
        validJob(roots, {
          assets: [
            base.assets[0],
            {
              id: 'sky',
              role: 'hdri',
              kind: 'hdri',
              reference: 'sky.hdr',
              r2Key: 'environments/sky/v1/sky.hdr',
            },
          ],
        }),
      ).code,
      'MISSING_SHA256',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(
        validJob(roots, {
          required_asset_classes: ['character', 'prop'],
          assets: [base.assets[0]],
        }),
      ).code,
      'MISSING_PROP',
    );
    assert.equal(
      compileTivvleJoyJobToWorkerManifest(
        validJob(roots, {
          assets: [
            { id: 'map', role: 'scenery', kind: 'scenery', reference: 'map.blend', r2Key: 'environments/map/v1/map.blend', sha256: 'd'.repeat(64) },
          ],
        }),
      ).code,
      'MISSING_ASSET',
    );
  });

  it('keeps outputKey deterministic and refuses traversal', () => {
    const roots = workspace();
    const job = validJob(roots);
    const key = buildWorkerOutputKey(job);
    assert.equal(key.ok, true);
    assert.equal(key.outputKey, `renders/finals/${job.episode_id}/${job.job_id}/final_1080p.mp4`);
    assert.equal(buildWorkerOutputKey({ ...job, job_id: '../escape' }).ok, false);
    assert.equal(buildWorkerOutputKey({ ...job, episode_id: 'ep/../other' }).ok, false);
  });

  it('reads the authoritative Blender version and fails closed on pin conflict', () => {
    const resolved = resolveAuthoritativeBlenderVersion();
    assert.equal(resolved.ok, true);
    assert.equal(resolved.version, '4.2.3');
    assert.equal(resolved.sources.workerDockerfile, '4.2.3');
    assert.equal(resolved.sources.acceptance1080p, '4.2.3');
    assert.equal(resolved.sources.workerManifestDefault, '4.2.3');
    assert.equal(resolved.nonExecutionNotes.productionRequirement, '4.2');
  });
});

describe('dry-run', () => {
  it('validates, builds argv, simulates lifecycles, and never contacts paid RunPod', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-dry-run-'));
    temps.push(root);
    const logs = [];
    const result = runDryRun({ workspaceRoot: root, log: (line) => logs.push(line) });
    assert.equal(result.ok, true);
    assert.equal(result.contactedPaidEndpoint, false);
    assert.equal(result.blenderExecuted, false);
    assert.equal(result.podCreated, false);
    assert.equal(result.compiled.schemaVersion, 'ddp-cloud-job-manifest-v1');
    assert.equal(result.compiled.workerManifest.limits.maxRuntimeMinutes, 20);
    assert.equal(result.compiled.workerManifest.limits.maxCostUsd, 0.25);
    assert.equal(result.command.argv[0], 'timeout');
    assert.equal(logs.includes('dry-run PASS'), true);
    assert.equal(logs.some((line) => /rpa_|Authorization|secret/i.test(line)), false);
    assert.equal(foundationSource.includes("method: 'POST'"), false);
    assert.equal(foundationSource.includes('https://rest.runpod.io/v1/pods'), false);
    assert.equal(ASSET_STAGING_PLAN.productionMutation, false);
    assert.equal(OUTPUT_VERIFICATION_CONTRACT.artisticQc, false);
    assert.equal(OUTPUT_VERIFICATION_CONTRACT.failureDoesNotCompleteShot, true);
  });
});

describe('existing guarded gates remain intact', () => {
  it('keeps the paid launch phrase, caps, and workflow_dispatch-only path', () => {
    assert.equal(FUTURE_LAUNCH_GATES.paid_approval_phrase, REQUIRED_APPROVAL_PHRASE);
    assert.equal(FUTURE_LAUNCH_GATES.gpu, PINNED_GPU_TYPE_ID);
    assert.equal(FUTURE_LAUNCH_GATES.cloud, PINNED_CLOUD_TYPE);
    assert.equal(FUTURE_LAUNCH_GATES.maxHourlyUsd, MAX_HOURLY_USD);
    assert.equal(FUTURE_LAUNCH_GATES.maxComputeUsd, MAX_COMPUTE_USD);
    assert.match(workflow, /workflow_dispatch:/);
    assert.equal(workflow.includes('\n  push:'), false);
    assert.match(workflow, /LAUNCH_TIVVLEJOY_GPU/);
    assert.equal(FOUNDATION_STATUS, 'REMOTE EXECUTION FOUNDATION ONLY');
    assert.match(docs, /REMOTE EXECUTION FOUNDATION ONLY/);
    assert.match(docs, /WORKER CONTRACT ALIGNMENT COMPLETE/);
    assert.match(docs, /NOT YET ENABLED/);
  });
});

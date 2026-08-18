import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCEPTED_ASSEMBLE_SCRIPT,
  ACCEPTED_RENDER_CORE,
  ASSET_STAGING_PLAN,
  FOUNDATION_STATUS,
  FUTURE_LAUNCH_GATES,
  OUTPUT_VERIFICATION_CONTRACT,
  PILOT_ENGINE,
  PILOT_FPS,
  PILOT_MAX_RUNTIME_MINUTES,
  PILOT_RESOLUTION,
  assertPilotPins,
  buildRemoteBlenderCommand,
  createSampleWorkspace,
  defaultPilotJob,
  expectedOutputPrefix,
  hashJobManifest,
  rejectUnsafeText,
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
    assets: [{ id: 'pip', role: 'pip', kind: 'blend', reference: 'pip.blend', sha256: roots.pipSha256 }],
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

describe('dry-run', () => {
  it('validates, builds argv, simulates lifecycles, and never contacts paid RunPod', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tivvlejoy-dry-run-'));
    temps.push(root);
    const logs = [];
    const result = runDryRun({ workspaceRoot: root, log: (line) => logs.push(line) });
    assert.equal(result.ok, true);
    assert.equal(result.contactedPaidEndpoint, false);
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
    assert.match(docs, /NOT YET ENABLED/);
  });
});

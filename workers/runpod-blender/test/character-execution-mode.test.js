'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const { runDepartment } = require('../src/character-master');
const { resolveExecutionMode, EXECUTION_MODE_DRY_RUN, EXECUTION_MODE_LIVE } = require('../src/character-job-kinds');
const { rejectCapabilityV1ForLive, compileCharacterCapability } = require('../src/character-capability');

const repoRoot = path.resolve(__dirname, '../../..');
const builder = path.join(repoRoot, 'scripts/blender/characters/build_character.py');

test('absent execution mode defaults to dry-run', () => {
  const mode = resolveExecutionMode({}, {});
  assert.equal(mode.ok, true);
  assert.equal(mode.mode, EXECUTION_MODE_DRY_RUN);
  assert.equal(mode.defaulted, true);
  assert.equal(mode.blenderFlag, '--dry-run');
});

test('dry-run department argv includes --dry-run and not --execute', () => {
  const department = runDepartment({
    root: repoRoot,
    executionModeResolved: resolveExecutionMode({ executionMode: 'dry-run' }, {}),
  });
  assert.equal(department.dryRunFlagPresent, true);
  assert.equal(department.executeFlagPresent, false);
  assert.ok(department.sanitizedArgv.includes('--dry-run'));
  assert.equal(department.sanitizedArgv.includes('--execute'), false);
});

test('live department argv includes --execute and not --dry-run', () => {
  const department = runDepartment({
    root: repoRoot,
    executionModeResolved: resolveExecutionMode({ executionMode: EXECUTION_MODE_LIVE }, {}),
  });
  assert.equal(department.executeFlagPresent, true);
  assert.equal(department.dryRunFlagPresent, false);
  assert.ok(department.sanitizedArgv.includes('--execute'));
  assert.equal(department.sanitizedArgv.includes('--dry-run'), false);
});

test('build_character.py refuses missing and conflicting mode flags', () => {
  const neither = spawnSync('python3', [builder, '--manifest', 'x'], { encoding: 'utf8' });
  assert.notEqual(neither.status, 0);
  assert.match(neither.stdout + neither.stderr, /EXECUTION_MODE_REQUIRED|FAIL_CLOSED/);
  const both = spawnSync('python3', [builder, '--manifest', 'x', '--dry-run', '--execute'], { encoding: 'utf8' });
  assert.notEqual(both.status, 0);
  assert.match(both.stdout + both.stderr, /CONFLICTING_EXECUTION_FLAGS|FAIL_CLOSED/);
});

test('Capability V1 is rejected for live character execution', () => {
  const rejected = rejectCapabilityV1ForLive({ schema: 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V1' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE');
  const live = rejectCapabilityV1ForLive(compileCharacterCapability({ root: repoRoot }));
  assert.equal(live.ok, true);
});

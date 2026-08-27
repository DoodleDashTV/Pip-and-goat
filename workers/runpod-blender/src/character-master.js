'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHARACTER_MASTER_BUILD,
  CHARACTER_SOURCE_MATERIALIZE,
  CHARACTER_BUILD,
  FINAL_1080P_RENDER,
  CHARACTER_JOB_KINDS,
  ENTRYPOINT_VERSION,
  GOAT_CHARACTER_ID,
  DEPARTMENT_STAGE_COUNT,
  resolveDeclaredJobKind,
  isCharacterJobKind,
  isFinal1080p,
} = require('./character-job-kinds');
const { materializeGoatSource, planCharacterSourceMaterialize } = require('./character-source-materialize');
const { compileCharacterCapability } = require('./character-capability');

function fail(code, reason, extra = {}) {
  return {
    ok: false,
    launched: false,
    paid: false,
    gpuRequested: false,
    goatProductionReady: false,
    characterMaster: true,
    entrypointVersion: ENTRYPOINT_VERSION,
    status: 'FAIL_CLOSED',
    code,
    reason,
    ...extra,
  };
}

function isCharacterMasterJob(env = process.env) {
  const declared = resolveDeclaredJobKind(env);
  return isCharacterJobKind(declared);
}

function resolveJobKind(env = process.env) {
  const declared = resolveDeclaredJobKind(env);
  const renderHint = String(env.RENDER_MODE || env.RENDER_PROFILE || '').trim();
  if (isFinal1080p(declared) || renderHint === FINAL_1080P_RENDER) {
    if (isCharacterJobKind(declared) && declared !== FINAL_1080P_RENDER) {
      return { ok: false, code: 'CHARACTER_RENDER_KIND_COLLISION', kind: declared };
    }
    return { ok: true, kind: FINAL_1080P_RENDER, characterMaster: false };
  }
  if (!declared) {
    return { ok: false, code: 'JOB_KIND_MISSING', kind: null };
  }
  if (!isCharacterJobKind(declared)) {
    return { ok: false, code: 'UNSUPPORTED_JOB_KIND', kind: declared };
  }
  return { ok: true, kind: declared, characterMaster: true };
}

function departmentScriptPath(root) {
  const candidates = [
    path.join(root, 'blender/characters/build_character.py'),
    path.join(root, 'scripts/blender/characters/build_character.py'),
  ];
  return candidates.find((file) => fs.existsSync(file)) || candidates[0];
}

function runDepartment(input = {}) {
  const root = input.root || process.cwd();
  const script = departmentScriptPath(root);
  const python = input.pythonBin || process.env.PYTHON_BIN || 'python3';
  const manifest = input.manifestPath || path.join(root, 'config/characters/CHAR_GOAT_001/manifest.json');
  const artifactDir = input.artifactDir || path.join(root, 'artifacts/character-rigging/CHAR_GOAT_001');
  const args = [
    script,
    '--manifest',
    manifest,
    '--artifact-dir',
    artifactDir,
    '--character-id',
    GOAT_CHARACTER_ID,
    '--dry-run',
  ];
  if (input.workingBlend) {
    args.push('--working-blend', input.workingBlend);
  }
  const result = spawnSync(python, args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...(input.env || {}), CHARACTER_WORKER_ROOT: root },
  });
  let parsed = null;
  const stdout = String(result.stdout || '').trim();
  if (stdout) {
    try {
      parsed = JSON.parse(stdout.split('\n').filter(Boolean).at(-1));
    } catch {
      parsed = null;
    }
  }
  const gate = parsed?.gate || {
    status: 'BLOCKED_REAL_EXECUTION_REQUIRED',
    goatProductionReady: false,
    verdict: 'NOT_PRODUCTION_READY',
  };
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout,
    stderr: String(result.stderr || ''),
    parsed,
    gate,
    goatProductionReady: false,
    characterMasterGate: gate.status || 'BLOCKED_REAL_EXECUTION_REQUIRED',
    stageCount: DEPARTMENT_STAGE_COUNT,
    script,
  };
}

async function runCharacterMaster(input = {}) {
  const env = input.env || process.env;
  const resolved = resolveJobKind(env);
  if (!resolved.ok) {
    return fail(resolved.code, `Job kind ${resolved.kind || '(empty)'} is not a character-master job.`);
  }
  if (resolved.kind === FINAL_1080P_RENDER) {
    return fail(
      'FINAL_1080P_CANNOT_IMPERSONATE_CHARACTER',
      'FINAL_1080P_RENDER cannot route through the character-master entrypoint.',
      { kind: FINAL_1080P_RENDER, characterMaster: false },
    );
  }

  const root = input.root || env.CHARACTER_WORKER_ROOT || process.cwd();
  const capability = compileCharacterCapability({ root });
  const materialize =
    resolved.kind === CHARACTER_BUILD && input.skipMaterialize === true
      ? planCharacterSourceMaterialize({ dryRun: true })
      : materializeGoatSource({
          env,
          syntheticBytes: input.syntheticBytes,
          syntheticPath: input.syntheticPath,
          expectedSize: input.expectedSize,
          expectedSha256: input.expectedSha256,
          workspaceDir: input.workspaceDir,
          runBlenderProbe: input.runBlenderProbe === true,
          createWorkingCopy: input.createWorkingCopy === true,
          allowRealGoatDownload: env.GOAT_ALLOW_REAL_DOWNLOAD === 'true',
          paidExecutionAuthorized: env.PAID_EXECUTION_AUTHORIZED === 'true',
          incompleteMultipartCount: input.incompleteMultipartCount,
        });

  if (resolved.kind === CHARACTER_SOURCE_MATERIALIZE) {
    return {
      ...materialize,
      characterMaster: true,
      entrypointVersion: ENTRYPOINT_VERSION,
      jobKind: CHARACTER_SOURCE_MATERIALIZE,
      capability,
    };
  }

  if (materialize.ok === false && resolved.kind === CHARACTER_MASTER_BUILD && !input.allowDepartmentWithoutMaterialize) {
    return {
      ...materialize,
      characterMaster: true,
      entrypointVersion: ENTRYPOINT_VERSION,
      jobKind: CHARACTER_MASTER_BUILD,
      capability,
    };
  }

  const department = runDepartment({
    root,
    env,
    pythonBin: input.pythonBin,
    manifestPath: input.manifestPath,
    artifactDir: input.artifactDir,
    workingBlend: materialize.working?.department,
  });

  return {
    ok: department.ok,
    launched: false,
    paid: false,
    gpuRequested: false,
    goatProductionReady: false,
    characterMaster: true,
    entrypointVersion: ENTRYPOINT_VERSION,
    jobKind: resolved.kind,
    characterId: GOAT_CHARACTER_ID,
    materialize,
    department,
    capability,
    characterMasterGate: department.characterMasterGate,
    status: department.goatProductionReady ? 'REFUSED_FALSE_PASS' : 'BLOCKED_REAL_EXECUTION_REQUIRED',
    code: 'BLOCKED_REAL_EXECUTION_REQUIRED',
  };
}

module.exports = {
  isCharacterMasterJob,
  resolveJobKind,
  runCharacterMaster,
  runDepartment,
  CHARACTER_JOB_KINDS,
};

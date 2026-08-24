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
  EXECUTION_MODE_LIVE,
  resolveDeclaredJobKind,
  resolveExecutionMode,
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
    paidFlagsSetByWorker: false,
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

function sanitizeArgv(args) {
  return args.map((item) => {
    const value = String(item);
    if (/secret|token|password|signedurl|accesskey|apikey/i.test(value)) return '[redacted]';
    if (/https?:\/\/\S*(X-Amz-|token=|Signature=)/i.test(value)) return '[redacted-url]';
    return value;
  });
}

function runDepartment(input = {}) {
  const root = input.root || process.cwd();
  const script = departmentScriptPath(root);
  const python = input.pythonBin || process.env.PYTHON_BIN || 'python3';
  const blender = input.blenderBin || process.env.BLENDER_BIN || '';
  const manifest = input.manifestPath || path.join(root, 'config/characters/CHAR_GOAT_001/manifest.json');
  const artifactDir = input.artifactDir || path.join(root, 'artifacts/character-rigging/CHAR_GOAT_001');
  const mode = input.executionModeResolved || resolveExecutionMode(input, input.env || process.env);
  if (!mode.ok) {
    return {
      ok: false,
      exitCode: 2,
      stdout: '',
      stderr: mode.reason,
      parsed: null,
      gate: { status: 'FAIL_CLOSED', goatProductionReady: false, verdict: 'NOT_PRODUCTION_READY' },
      goatProductionReady: false,
      characterMasterGate: 'FAIL_CLOSED',
      stageCount: DEPARTMENT_STAGE_COUNT,
      script,
      argv: [],
      sanitizedArgv: [],
      blenderFlag: null,
    };
  }
  const useBlender = Boolean(blender) && mode.mode === EXECUTION_MODE_LIVE;
  const args = useBlender
    ? ['--background', '--python-exit-code', '1', '--python', script, '--']
    : [script];
  args.push(
    '--manifest',
    manifest,
    '--artifact-dir',
    artifactDir,
    '--character-id',
    GOAT_CHARACTER_ID,
    mode.blenderFlag,
  );
  if (input.workingBlend) {
    args.push('--working-blend', input.workingBlend);
  }
  if (input.sourceZip) {
    args.push('--source-zip', input.sourceZip);
  }
  if (input.injectStageFailure) {
    args.push('--inject-stage-failure', input.injectStageFailure);
  }
  const bin = useBlender ? blender : python;
  const sanitizedArgv = sanitizeArgv([bin, ...args]);
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: input.timeoutMs || 180_000,
    env: {
      ...process.env,
      ...(input.env || {}),
      CHARACTER_WORKER_ROOT: root,
      CHARACTER_EXECUTION_MODE: mode.mode,
      CHARACTER_WORKING_BLEND: input.workingBlend || '',
      CHARACTER_SOURCE_ZIP: input.sourceZip || '',
    },
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
    status: mode.mode === EXECUTION_MODE_LIVE ? 'FAILED' : 'BLOCKED_REAL_EXECUTION_REQUIRED',
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
    stageCount: parsed?.stages?.length || DEPARTMENT_STAGE_COUNT,
    script,
    argv: sanitizedArgv,
    sanitizedArgv,
    blenderFlag: mode.blenderFlag,
    executionMode: mode.mode,
    dryRunFlagPresent: sanitizedArgv.includes('--dry-run'),
    executeFlagPresent: sanitizedArgv.includes('--execute'),
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

  const mode = resolveExecutionMode(input, env);
  if (!mode.ok) {
    return fail(mode.code, mode.reason);
  }

  const root = input.root || env.CHARACTER_WORKER_ROOT || process.cwd();
  const capability = compileCharacterCapability({ root });
  const materializeInput = {
    env,
    executionMode: mode.mode,
    syntheticBytes: input.syntheticBytes,
    syntheticPath: input.syntheticPath,
    expectedSize: input.expectedSize,
    expectedSha256: input.expectedSha256,
    workspaceDir: input.workspaceDir,
    outputDestination: input.workspaceDir,
    runBlenderProbe: input.runBlenderProbe === true || mode.mode === EXECUTION_MODE_LIVE,
    createWorkingCopy: input.createWorkingCopy === true || mode.mode === EXECUTION_MODE_LIVE,
    allowRealGoatDownload: env.GOAT_ALLOW_REAL_DOWNLOAD === 'true',
    paidExecutionAuthorized: env.PAID_EXECUTION_AUTHORIZED === 'true',
    requestRealDownload: input.requestRealDownload === true,
    authorizationReceipt: input.authorizationReceipt,
    authorizationReceiptPath: input.authorizationReceiptPath,
    authorizedImageDigest: input.authorizedImageDigest || env.AUTHORIZED_IMAGE_DIGEST,
    imageRef: input.imageRef || env.AUTHORIZED_IMAGE_REF,
    executionId: input.executionId || env.CHARACTER_EXECUTION_ID,
    objectKey: input.objectKey,
    incompleteMultipartCount: input.incompleteMultipartCount,
    maxBytes: input.maxBytes,
  };

  const materialize =
    resolved.kind === CHARACTER_BUILD && input.skipMaterialize === true
      ? planCharacterSourceMaterialize({ dryRun: mode.mode !== EXECUTION_MODE_LIVE })
      : mode.mode !== EXECUTION_MODE_LIVE && !input.syntheticBytes && !input.syntheticPath
        ? planCharacterSourceMaterialize({ dryRun: true })
        : materializeGoatSource(materializeInput);

  if (resolved.kind === CHARACTER_SOURCE_MATERIALIZE) {
    return {
      ...materialize,
      characterMaster: true,
      entrypointVersion: ENTRYPOINT_VERSION,
      jobKind: CHARACTER_SOURCE_MATERIALIZE,
      capability,
      executionMode: mode.mode,
      paidFlagsSetByWorker: false,
    };
  }

  if (materialize.ok === false && resolved.kind === CHARACTER_MASTER_BUILD && !input.allowDepartmentWithoutMaterialize) {
    return {
      ...materialize,
      characterMaster: true,
      entrypointVersion: ENTRYPOINT_VERSION,
      jobKind: CHARACTER_MASTER_BUILD,
      capability,
      executionMode: mode.mode,
      paidFlagsSetByWorker: false,
    };
  }

  const department = runDepartment({
    root,
    env,
    pythonBin: input.pythonBin,
    blenderBin: input.blenderBin || env.BLENDER_BIN,
    manifestPath: input.manifestPath,
    artifactDir: input.artifactDir,
    workingBlend: materialize.working?.department,
    sourceZip: input.sourceZip || materialize.stagedZip,
    executionModeResolved: mode,
    injectStageFailure: input.injectStageFailure,
    timeoutMs: input.timeoutMs,
  });

  const liveOk = mode.mode === EXECUTION_MODE_LIVE && department.ok && department.executeFlagPresent && !department.dryRunFlagPresent;
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
    executionMode: mode.mode,
    sanitizedArgv: department.sanitizedArgv,
    blenderFlag: department.blenderFlag,
    status: liveOk
      ? 'LIVE_DEPARTMENT_EXECUTED_AWAITING_VISUAL_APPROVAL'
      : department.goatProductionReady
        ? 'REFUSED_FALSE_PASS'
        : 'BLOCKED_REAL_EXECUTION_REQUIRED',
    code: liveOk ? 'LIVE_DEPARTMENT_EXECUTED' : 'BLOCKED_REAL_EXECUTION_REQUIRED',
    paidFlagsSetByWorker: false,
  };
}

module.exports = {
  isCharacterMasterJob,
  resolveJobKind,
  runCharacterMaster,
  runDepartment,
  CHARACTER_JOB_KINDS,
};

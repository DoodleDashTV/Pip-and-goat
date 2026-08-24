'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { evaluateRealDownloadAuthorization } = require('./character-download-gate');
const { materializeGoatSource } = require('./character-source-materialize');
const { runCharacterMaster } = require('./character-master');
const { compileCharacterCapability } = require('./character-capability');
const {
  CHARACTER_MASTER_BUILD,
  GOAT_CHARACTER_ID,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
  REQUIRED_LIVE_AUTHORIZATION_NAME,
  REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS,
} = require('./character-job-kinds');

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function die(message) {
  throw new Error(message);
}

function completeReceipt(overrides = {}) {
  return {
    authorizationName: REQUIRED_LIVE_AUTHORIZATION_NAME,
    authorizationId: 'auth-live-path-0001',
    characterId: GOAT_CHARACTER_ID,
    permitsRealSourceDownload: true,
    consumed: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    executionId: 'exec-live-path-0001',
    authorizedImageDigest: 'sha256:' + 'ab'.repeat(32),
    sourceKey: LOCKED_SOURCE_KEY,
    expectedSizeBytes: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
    ...overrides,
  };
}

function createFixture(outDir, blenderBin) {
  fs.mkdirSync(outDir, { recursive: true });
  const script = path.join(
    process.env.CHARACTER_WORKER_ROOT || '/opt/ddp-worker',
    'blender/characters/create_synthetic_goat_fixture.py',
  );
  const alt = path.join(process.cwd(), 'scripts/blender/characters/create_synthetic_goat_fixture.py');
  const fixtureScript = fs.existsSync(script) ? script : alt;
  const result = spawnSync(blenderBin, ['--background', '--python', fixtureScript, '--', '--out', outDir], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (result.status !== 0) {
    die(`synthetic fixture failed: ${result.stderr || result.stdout}`);
  }
  const receipt = JSON.parse(fs.readFileSync(path.join(outDir, 'fixture.receipt.json'), 'utf8'));
  if (receipt.zipBytes === 269512136 || receipt.matchesLockedArchive) {
    die('synthetic fixture must not match the locked Goat archive');
  }
  return receipt;
}

function assertForbidden(label, input, env) {
  const gate = evaluateRealDownloadAuthorization(input, env);
  if (gate.ok || gate.code !== 'REAL_GOAT_DOWNLOAD_FORBIDDEN') {
    die(`${label} did not return REAL_GOAT_DOWNLOAD_FORBIDDEN`);
  }
}

function runGateMatrix() {
  const digest = 'sha256:' + 'ab'.repeat(32);
  const base = {
    executionMode: 'live',
    authorizationReceipt: completeReceipt(),
    objectKey: LOCKED_SOURCE_KEY,
    expectedSize: LOCKED_SOURCE_SIZE,
    expectedSha256: LOCKED_SOURCE_SHA256,
    authorizedImageDigest: digest,
    imageRef: `ghcr.io/example/ddp-runpod-blender@${digest}`,
    executionId: 'exec-live-path-0001',
    outputDestination: '/tmp/tivvlejoy-live-out',
  };
  const env = {
    GOAT_ALLOW_REAL_DOWNLOAD: 'true',
    PAID_EXECUTION_AUTHORIZED: 'true',
    AUTHORIZED_IMAGE_DIGEST: digest,
    AUTHORIZED_IMAGE_REF: base.imageRef,
    CHARACTER_EXECUTION_ID: 'exec-live-path-0001',
  };
  assertForbidden('no authorization', { executionMode: 'live', outputDestination: '/tmp/x' }, {});
  assertForbidden('missing live mode', { ...base, executionMode: 'dry-run' }, env);
  assertForbidden('missing GOAT_ALLOW_REAL_DOWNLOAD', base, { ...env, GOAT_ALLOW_REAL_DOWNLOAD: 'false' });
  assertForbidden('missing PAID_EXECUTION_AUTHORIZED', base, { ...env, PAID_EXECUTION_AUTHORIZED: 'false' });
  assertForbidden('wrong character', { ...base, authorizationReceipt: completeReceipt({ characterId: 'CHAR_PIP_001' }) }, env);
  assertForbidden('wrong key', { ...base, objectKey: 'other/key.zip', authorizationReceipt: completeReceipt({ sourceKey: 'other/key.zip' }) }, env);
  assertForbidden('wrong size', { ...base, expectedSize: 12, authorizationReceipt: completeReceipt({ expectedSizeBytes: 12 }) }, env);
  assertForbidden('wrong hash', { ...base, expectedSha256: 'aa'.repeat(32), authorizationReceipt: completeReceipt({ expectedSha256: 'aa'.repeat(32) }) }, env);
  assertForbidden('mutable image', { ...base, authorizedImageDigest: 'latest', imageRef: 'ghcr.io/example/ddp-runpod-blender:latest' }, env);
  assertForbidden('wrong digest', { ...base, authorizedImageDigest: 'sha256:' + 'cd'.repeat(32) }, env);
  assertForbidden('expired', { ...base, authorizationReceipt: completeReceipt({ expiresAt: '2020-01-01T00:00:00.000Z' }) }, env);
  assertForbidden('consumed', { ...base, authorizationReceipt: completeReceipt({ consumed: true }) }, env);
  assertForbidden('v2 invalid', { ...base, authorizationReceipt: completeReceipt({ authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V2' }) }, env);
  assertForbidden('v4 invalid', { ...base, authorizationReceipt: completeReceipt({ authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4' }) }, env);
  const opened = evaluateRealDownloadAuthorization(base, env);
  if (!opened.ok) die(`complete gate unexpectedly failed: ${JSON.stringify(opened.failedConditions)}`);
  return { negatives: 14, completeGateOpens: true };
}

async function main() {
  const blender = process.env.BLENDER_BIN || 'blender';
  const root = process.env.CHARACTER_WORKER_ROOT || (fs.existsSync('/opt/ddp-worker/src/character-master.js') ? '/opt/ddp-worker' : process.cwd());
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tivvlejoy-synthetic-live-'));
  const fixtureDir = path.join(work, 'fixture');
  const workspace = path.join(work, 'workspace');
  const artifacts = path.join(work, 'artifacts');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });

  const gate = runGateMatrix();
  const fixture = createFixture(fixtureDir, blender);
  const sourceHashBefore = fixture.zipSha256;
  const blendHashBefore = fixture.blendSha256;

  const dry = await runCharacterMaster({
    env: { CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD, CHARACTER_EXECUTION_MODE: 'dry-run', CHARACTER_WORKER_ROOT: root },
    root,
    syntheticPath: fixture.zip,
    expectedSize: fixture.zipBytes,
    expectedSha256: fixture.zipSha256,
    workspaceDir: path.join(work, 'dry-workspace'),
    artifactDir: path.join(work, 'dry-artifacts'),
    pythonBin: process.env.PYTHON_BIN || 'python3',
    runBlenderProbe: false,
    createWorkingCopy: false,
  });
  if (!dry.department || !dry.department.dryRunFlagPresent || dry.department.executeFlagPresent) {
    die(`dry-run argv invalid: ${JSON.stringify(dry.department && dry.department.sanitizedArgv)}`);
  }
  if (fs.existsSync(path.join(work, 'dry-workspace', 'WORKING', 'CHAR_GOAT_001_working.blend'))) {
    die('dry-run created a WORKING blend');
  }

  const live = await runCharacterMaster({
    env: {
      CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD,
      CHARACTER_EXECUTION_MODE: 'live',
      CHARACTER_WORKER_ROOT: root,
      BLENDER_BIN: blender,
    },
    root,
    syntheticPath: fixture.zip,
    expectedSize: fixture.zipBytes,
    expectedSha256: fixture.zipSha256,
    workspaceDir: workspace,
    artifactDir: artifacts,
    blenderBin: blender,
    runBlenderProbe: true,
    createWorkingCopy: true,
    timeoutMs: 180_000,
  });
  if (!live.ok) {
    die(
      `live department failed: ${live.code} exit=${live.department && live.department.exitCode} working=${live.materialize && live.materialize.working && live.materialize.working.department} stdout=${live.department && live.department.stdout} stderr=${live.department && live.department.stderr}`,
    );
  }
  if (!live.department.executeFlagPresent || live.department.dryRunFlagPresent) {
    die(`live argv must include --execute and exclude --dry-run: ${JSON.stringify(live.department.sanitizedArgv)}`);
  }
  const stages = live.department.parsed && live.department.parsed.stages;
  if (!stages || stages.length !== 26) die(`expected 26 stages, got ${stages && stages.length}`);
  const simulated = stages.filter((stage) => stage.simulated !== false);
  if (simulated.length) die(`stages still simulated: ${simulated.map((s) => s.stage).join(',')}`);
  if (live.goatProductionReady !== false) die('goatProductionReady must remain false');
  if (sha256(fixture.zip) !== sourceHashBefore) die('synthetic source zip changed');
  if (sha256(fixture.blend) !== blendHashBefore) die('synthetic source blend changed');
  const working = live.materialize.working && live.materialize.working.department;
  if (!working || !fs.existsSync(working)) die('WORKING blend was not created');
  const workingHash = sha256(working);
  if (workingHash === blendHashBefore) die('WORKING hash must differ from source blend hash after live execute');
  const reopen = spawnSync(blender, ['--background', '--python-expr', `import bpy; bpy.ops.wm.open_mainfile(filepath=r"${working}", load_ui=False); print("REOPEN_OK")`], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (!String(reopen.stdout || '').includes('REOPEN_OK')) die('WORKING blend could not be reopened');
  if (!live.department.parsed.datablocksChanged) die('live execute did not change datablocks');

  const failed = await runCharacterMaster({
    env: { CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD, CHARACTER_EXECUTION_MODE: 'live', CHARACTER_WORKER_ROOT: root, BLENDER_BIN: blender },
    root,
    syntheticPath: fixture.zip,
    expectedSize: fixture.zipBytes,
    expectedSha256: fixture.zipSha256,
    workspaceDir: path.join(work, 'fail-workspace'),
    artifactDir: path.join(work, 'fail-artifacts'),
    blenderBin: blender,
    injectStageFailure: 'UV_VALIDATION',
    timeoutMs: 180_000,
  });
  if (failed.goatProductionReady !== false) die('failed live path claimed production ready');
  const failedStages = failed.department.parsed && failed.department.parsed.stages;
  const afterUv = failedStages && failedStages.find((stage) => stage.stage === 'SKELETON_BUILD');
  if (afterUv && afterUv.status === 'EXECUTED' && afterUv.simulated === false && failed.department.parsed.gate.goatProductionReady) {
    die('stage failure did not prevent production-ready claims');
  }

  const capability = compileCharacterCapability({ root });
  if (capability.schema !== 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2') die('capability schema is not V2');
  if (capability.mandatoryDryRun !== false) die('mandatoryDryRun must be false');
  if (capability.liveCharacterDepartmentCapable !== true) die('liveCharacterDepartmentCapable must be true');
  if (REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS.includes('sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e') !== true) {
    die('old digest is not rejected for live execution');
  }

  const receipt = {
    schema: 'TIVVLEJOY_SYNTHETIC_LIVE_PATH_PROOF_V1',
    gate,
    fixture: {
      zipSha256: fixture.zipSha256,
      blendSha256: fixture.blendSha256,
      zipBytes: fixture.zipBytes,
      realGoat: false,
    },
    dryRunArgv: dry.department.sanitizedArgv,
    liveArgv: live.department.sanitizedArgv,
    stages: stages.map((stage) => ({ stage: stage.stage, status: stage.status, simulated: stage.simulated })),
    workingSha256: workingHash,
    sourceSha256Unchanged: sourceHashBefore,
    goatProductionReady: false,
    realGoatDownloaded: false,
    runpodLaunchCount: 0,
  };
  const out = process.env.SYNTHETIC_LIVE_PATH_RECEIPT || path.join(work, 'synthetic-live-path.receipt.json');
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, receipt: out, workingSha256: workingHash, sourceSha256: sourceHashBefore })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { runGateMatrix, completeReceipt, createFixture };

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const {
  resolveJobKind,
  runCharacterMaster,
  isCharacterMasterJob,
  resolveDepartmentTimeoutMs,
} = require('../src/character-master');
const {
  materializeGoatSource,
  planCharacterSourceMaterialize,
  credentialsPresent,
  OBJECT_KEY,
} = require('../src/character-source-materialize');
const { inspectZipSafety } = require('../src/zip-safe');
const { compileCharacterCapability } = require('../src/character-capability');
const {
  CHARACTER_MASTER_BUILD,
  CHARACTER_SOURCE_MATERIALIZE,
  FINAL_1080P_RENDER,
} = require('../src/character-job-kinds');
const { validGoatLikeZip, traversalZip, prohibitedZip, missingBlendZip, duplicateZip } = require('./character-zip-fixtures');

const repoRoot = path.resolve(__dirname, '../../..');
const workerRoot = path.resolve(__dirname, '..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceFiles() {
  return [
    'src/character-master.js',
    'src/character-source-materialize.js',
    'src/character-download-gate.js',
    'src/character-job-kinds.js',
    'src/character-worker-entry.js',
    'src/worker.js',
  ].map((rel) => fs.readFileSync(path.join(workerRoot, rel), 'utf8'));
}

test('character job kind routes to the character-master entrypoint', () => {
  assert.equal(isCharacterMasterJob({ CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD }), true);
  assert.equal(isCharacterMasterJob({ JOB_KIND: CHARACTER_SOURCE_MATERIALIZE }), true);
  assert.equal(isCharacterMasterJob({ CHARACTER_JOB_KIND: FINAL_1080P_RENDER }), false);
  const resolved = resolveJobKind({ CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.characterMaster, true);
});

test('FINAL_1080P_RENDER cannot impersonate the character worker', async () => {
  const resolved = resolveJobKind({ CHARACTER_JOB_KIND: FINAL_1080P_RENDER });
  assert.equal(resolved.kind, FINAL_1080P_RENDER);
  assert.equal(resolved.characterMaster, false);
  const ran = await runCharacterMaster({
    env: { CHARACTER_JOB_KIND: FINAL_1080P_RENDER },
    root: repoRoot,
  });
  assert.equal(ran.ok, false);
  assert.equal(ran.code, 'FINAL_1080P_CANNOT_IMPERSONATE_CHARACTER');
  assert.equal(ran.goatProductionReady, false);
});

test('unsupported job kinds fail closed', async () => {
  const resolved = resolveJobKind({ JOB_KIND: 'NOT_A_REAL_KIND' });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, 'UNSUPPORTED_JOB_KIND');
  const ran = await runCharacterMaster({ env: { JOB_KIND: 'NOT_A_REAL_KIND' }, root: repoRoot });
  assert.equal(ran.ok, false);
  assert.equal(ran.code, 'UNSUPPORTED_JOB_KIND');
});

test('live character department uses the 165-minute stage ceiling instead of the old three-minute timeout', () => {
  assert.equal(resolveDepartmentTimeoutMs({}, {}), 165 * 60_000);
  assert.equal(
    resolveDepartmentTimeoutMs({}, { MAX_JOB_RUNTIME_MINUTES: '120', CHARACTER_STOP_NEW_STAGES_MINUTES: '110' }),
    110 * 60_000,
  );
  assert.equal(resolveDepartmentTimeoutMs({ timeoutMs: 42_000 }, {}), 42_000);
});

test('missing credentials fail before asset mutation', () => {
  assert.equal(credentialsPresent({}), false);
  const result = materializeGoatSource({
    allowRealGoatDownload: true,
    paidExecutionAuthorized: true,
    env: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REAL_GOAT_DOWNLOAD_FORBIDDEN');
  assert.equal(result.workingCopyCreated, false);
  assert.equal(result.realGoatDownloaded, false);
  const forbidden = materializeGoatSource({
    allowRealGoatDownload: true,
    paidExecutionAuthorized: true,
    env: {
      R2_BUCKET: 'bucket',
      R2_ENDPOINT: 'https://example.invalid',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
    },
  });
  assert.equal(forbidden.code, 'REAL_GOAT_DOWNLOAD_FORBIDDEN');
  assert.equal(forbidden.realGoatDownloaded, false);
});

test('wrong size or hash fails before extraction', () => {
  const zip = validGoatLikeZip();
  const sizeFail = materializeGoatSource({
    syntheticBytes: zip,
    expectedSize: zip.length + 1,
  });
  assert.equal(sizeFail.ok, false);
  assert.equal(sizeFail.code, 'SIZE_MISMATCH');
  assert.equal(sizeFail.workingCopyCreated, false);
  const hashFail = materializeGoatSource({
    syntheticBytes: zip,
    expectedSize: zip.length,
    expectedSha256: 'a'.repeat(64),
  });
  assert.equal(hashFail.ok, false);
  assert.equal(hashFail.code, 'SHA256_MISMATCH');
  assert.equal(hashFail.workingCopyCreated, false);
});

test('unsafe ZIP paths, payloads, missing members, and duplicates are rejected', () => {
  assert.equal(inspectZipSafety(traversalZip()).code, 'ZIP_TRAVERSAL');
  assert.equal(inspectZipSafety(prohibitedZip()).code, 'ZIP_PROHIBITED_PAYLOAD');
  assert.equal(inspectZipSafety(missingBlendZip()).code, 'MISSING_REQUIRED_FILE');
  assert.equal(inspectZipSafety(duplicateZip()).code, 'ZIP_DUPLICATE');
  assert.equal(inspectZipSafety(validGoatLikeZip()).code, 'ZIP_SAFE');
  const incomplete = materializeGoatSource({
    syntheticBytes: validGoatLikeZip(),
    incompleteMultipartCount: 1,
  });
  assert.equal(incomplete.code, 'ORPHAN_MULTIPART_REMAINS');
});

test('WORKING copies stay unwritten until hash, ZIP, extract, and Blender-open succeed', () => {
  const zip = validGoatLikeZip();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'goat-working-'));
  const extractedOnly = materializeGoatSource({
    syntheticBytes: zip,
    expectedSize: zip.length,
    expectedSha256: sha256(zip),
    workspaceDir: workspace,
    runBlenderProbe: false,
    createWorkingCopy: true,
  });
  assert.equal(extractedOnly.workingCopyCreated, false);
  assert.equal(fs.existsSync(path.join(workspace, 'WORKING/goat_working_4_2_2.blend')), false);
  const probeFail = materializeGoatSource({
    syntheticBytes: zip,
    expectedSize: zip.length,
    expectedSha256: sha256(zip),
    workspaceDir: fs.mkdtempSync(path.join(os.tmpdir(), 'goat-probe-')),
    runBlenderProbe: true,
    createWorkingCopy: true,
    env: { BLENDER_BIN: '/bin/false' },
  });
  assert.equal(probeFail.ok, false);
  assert.equal(probeFail.code, 'BLENDER_CONVERSION_UNSAFE');
  assert.equal(probeFail.workingCopyCreated, false);
});

test('26 department stages and Goat materializer are discoverable', async () => {
  const capability = compileCharacterCapability({ root: repoRoot });
  assert.equal(capability.goatMaterializerBaked, true);
  assert.equal(capability.characterMasterEntrypointBaked, true);
  assert.equal(capability.schema, 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2');
  assert.equal(capability.characterDepartmentBaked, true);
  assert.equal(capability.liveCharacterDepartmentCapable, true);
  assert.equal(capability.realSourceDownloadCodeBaked, true);
  assert.equal(capability.authorizedRealSourceDownloadCapable, true);
  assert.equal(capability.durableArtifactPersistenceCapable, true);
  assert.equal(capability.requiredLiveAuthorizationName, 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V5');
  assert.equal(capability.defaultExecutionMode, 'dry-run');
  assert.equal(capability.mandatoryDryRun, false);
  assert.equal(capability.requiresPaidAuthorization, true);
  assert.equal(capability.sourceWritesForbidden, true);
  assert.equal(capability.syntheticLivePathVerified, true);
  assert.equal(capability.realGoatSourceTested, false);
  assert.equal(capability.characterDepartmentStageCount, 26);
  const stages = fs.readFileSync(
    path.join(repoRoot, 'scripts/blender/characters/common/stages.py'),
    'utf8',
  );
  assert.match(stages, /BUILD_STAGES/);
  assert.match(stages, /CHARACTER_MASTER_GATE/);
  const tuple = stages.match(/BUILD_STAGES\s*=\s*\(([\s\S]*?)\)/);
  assert.ok(tuple);
  assert.equal([...tuple[1].matchAll(/"([A-Z0-9_]+)"/g)].length, 26);
  const ran = await runCharacterMaster({
    env: { CHARACTER_JOB_KIND: CHARACTER_MASTER_BUILD },
    root: repoRoot,
    skipMaterialize: false,
    allowDepartmentWithoutMaterialize: true,
    syntheticBytes: validGoatLikeZip(),
  });
  assert.equal(ran.goatProductionReady, false);
  assert.equal(ran.characterMasterGate, 'BLOCKED');
  assert.equal(ran.department.stageCount, 26);
  assert.equal(ran.launched, false);
});

test('goatProductionReady cannot become true during dry-run', () => {
  const planned = planCharacterSourceMaterialize({ dryRun: true });
  assert.equal(planned.goatProductionReady, false);
  assert.equal(planned.realGoatDownloaded, false);
  assert.equal(planned.objectKey, OBJECT_KEY);
});

test('paid-mutation tripwire: character runtime never creates a Pod', () => {
  const joined = sourceFiles().join('\n');
  assert.equal(joined.includes('createPodForBenchmark'), false);
  assert.equal(joined.includes('podFindAndDeployOnDemand'), false);
  assert.equal(joined.includes('ALLOW_PAID_GPU_LAUNCH=true'), false);
  assert.equal(process.env.ALLOW_PAID_GPU_LAUNCH === 'true', false);
});

test('materialization refuses writes into the locked source prefix', () => {
  const zip = validGoatLikeZip();
  const result = materializeGoatSource({
    syntheticBytes: zip,
    expectedSize: zip.length,
    expectedSha256: sha256(zip),
    workspaceDir: '/tmp/tivvlejoy-assets/characters/CHAR_GOAT_001/source/working',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LOCKED_SOURCE_WRITE_FORBIDDEN');
});

test('real locked Goat archive is never processed by these tests', () => {
  const zip = validGoatLikeZip();
  assert.notEqual(zip.length, 269512136);
  const result = materializeGoatSource({
    syntheticBytes: zip,
    allowRealGoatDownload: false,
    paidExecutionAuthorized: false,
  });
  assert.equal(result.realGoatDownloaded, false);
  assert.notEqual(result.observedSize, 269512136);
});

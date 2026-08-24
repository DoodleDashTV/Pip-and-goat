'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { inspectZipSafety, extractZipSafely, inspectZipSafetyFromFile, extractZipSafelyFromFile } = require('./zip-safe');
const { streamHashAndWrite, streamReadableHashAndWrite } = require('./character-stream-hash');
const { evaluateRealDownloadAuthorization } = require('./character-download-gate');
const {
  GOAT_CHARACTER_ID,
  STUDIO_BLENDER,
  CHARACTER_SOURCE_MATERIALIZE,
  LOCKED_SOURCE_KEY,
  LOCKED_SOURCE_PREFIX,
  LOCKED_SOURCE_SHA256,
  LOCKED_SOURCE_SIZE,
} = require('./character-job-kinds');

const OBJECT_KEY = LOCKED_SOURCE_KEY;
const EXPECTED_SHA = LOCKED_SOURCE_SHA256;
const EXPECTED_SIZE = LOCKED_SOURCE_SIZE;
const REQUIRED = { blend: 'Goat_FINN.blend', fbx: 'Goat_FINN.fbx' };

function sha256File(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(65_536);
  let read;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    hash.update(buf.subarray(0, read));
  }
  fs.closeSync(fd);
  return hash.digest('hex');
}

function fail(code, reason, extra = {}) {
  return {
    ok: false,
    launched: false,
    paid: false,
    gpuRequested: false,
    goatProductionReady: false,
    workingCopyCreated: false,
    realGoatDownloaded: false,
    blenderCompatibility: 'UNTESTED_REAL_SOURCE',
    jobKind: CHARACTER_SOURCE_MATERIALIZE,
    characterId: GOAT_CHARACTER_ID,
    objectKey: OBJECT_KEY,
    expectedSha256: EXPECTED_SHA,
    expectedSize: EXPECTED_SIZE,
    status: 'FAIL_CLOSED',
    code,
    reason,
    paidFlagsSetByWorker: false,
    ...extra,
  };
}

function credentialsPresent(env = {}) {
  return Boolean(
    String(env.R2_BUCKET || env.OBJECT_STORAGE_BUCKET || '').trim() &&
      String(env.R2_ENDPOINT || env.OBJECT_STORAGE_ENDPOINT || '').trim() &&
      String(env.R2_ACCESS_KEY_ID || env.OBJECT_STORAGE_ACCESS_KEY_ID || '').trim() &&
      String(env.R2_SECRET_ACCESS_KEY || env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '').trim(),
  );
}

function findRequired(extractedDir) {
  const found = { blend: null, fbx: null };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === REQUIRED.blend) found.blend = full;
      else if (entry.name === REQUIRED.fbx) found.fbx = full;
    }
  };
  walk(extractedDir);
  return found;
}

function removeQuietly(target) {
  try {
    if (target && fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* ignore */
  }
}

function removeTreeQuietly(target) {
  try {
    if (target && fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function isLoopbackUrl(value) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(String(value || ''));
}

function assertOutsideLockedSource(target) {
  const normalized = path.resolve(target).replace(/\\/g, '/');
  if (normalized.includes(`/${LOCKED_SOURCE_PREFIX}/`) || normalized.endsWith(`/${LOCKED_SOURCE_PREFIX}`)) {
    const err = new Error('Output destination is inside the locked source prefix.');
    err.code = 'LOCKED_SOURCE_WRITE_FORBIDDEN';
    throw err;
  }
}

function probeBlenderOpen(blendPath, env = {}) {
  const blender = String(env.BLENDER_BIN || 'blender');
  const script = `
import bpy, json, sys, os
src = sys.argv[sys.argv.index('--') + 1]
try:
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
    print(json.dumps({
      "ok": True,
      "blenderVersion": bpy.app.version_string,
      "saved": False,
      "sourceOverwritten": False,
      "objects": [obj.name for obj in bpy.data.objects]
    }))
except Exception as exc:
    print(json.dumps({"ok": False, "error": type(exc).__name__, "sourceOverwritten": False}))
    raise SystemExit(2)
`;
  const probeFile = path.join(os.tmpdir(), `goat-open-probe-${process.pid}.py`);
  fs.writeFileSync(probeFile, script);
  const result = spawnSync(blender, ['--background', '--python', probeFile, '--', blendPath], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
  try {
    fs.unlinkSync(probeFile);
  } catch {
    /* ignore */
  }
  const lines = String(result.stdout || '')
    .trim()
    .split('\n')
    .reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.ok === 'boolean') {
        return { ...parsed, exitCode: result.status };
      }
    } catch {
      /* continue */
    }
  }
  return {
    ok: false,
    error: result.error ? result.error.code : 'BLENDER_PROBE_FAILED',
    exitCode: result.status,
    sourceOverwritten: false,
  };
}

function copyProtectedWorking(blendPath, workingDir) {
  assertOutsideLockedSource(workingDir);
  const conversion = path.join(workingDir, 'goat_working_4_2_2.blend');
  const department = path.join(workingDir, 'CHAR_GOAT_001_working.blend');
  fs.mkdirSync(workingDir, { recursive: true });
  const sourceHash = sha256File(blendPath);
  for (const dest of [conversion, department]) {
    if (fs.existsSync(dest)) {
      const existing = sha256File(dest);
      if (existing !== sourceHash) {
        const err = new Error('Refusing to overwrite an existing different WORKING file.');
        err.code = 'WORKING_OVERWRITE_FORBIDDEN';
        throw err;
      }
    }
  }
  fs.copyFileSync(blendPath, conversion);
  fs.copyFileSync(conversion, department);
  fs.chmodSync(blendPath, 0o444);
  fs.chmodSync(conversion, 0o644);
  fs.chmodSync(department, 0o644);
  return {
    conversion,
    department,
    sourceHash,
    workingHash: sha256File(department),
  };
}

function planCharacterSourceMaterialize(input = {}) {
  const authorized = input.paidExecutionAuthorized === true && input.dryRun === false;
  if (authorized && input.allowRealGoatDownload !== true) {
    return fail(
      'REAL_GOAT_DOWNLOAD_FORBIDDEN',
      'Real Goat archive download is not enabled. This worker build task must not process the locked 269512136-byte object.',
    );
  }
  return {
    ok: true,
    launched: false,
    paid: false,
    gpuRequested: false,
    jobKind: CHARACTER_SOURCE_MATERIALIZE,
    objectKey: OBJECT_KEY,
    expectedSha256: EXPECTED_SHA,
    expectedSize: EXPECTED_SIZE,
    verifyHashAfterDownload: true,
    overwriteSourceForbidden: true,
    blenderConversionClaimed: false,
    blenderCompatibility: 'UNTESTED_REAL_SOURCE',
    secureGpuPolicy: 'SECURE_GPU_PRESERVED',
    status: 'DRY_RUN',
    goatProductionReady: false,
    realGoatDownloaded: false,
    paidFlagsSetByWorker: false,
  };
}

function evaluateRealDownloadRequest(input = {}) {
  const env = input.env || process.env;
  const wantsReal =
    input.requestRealDownload === true ||
    (input.allowRealGoatDownload === true && input.paidExecutionAuthorized === true) ||
    env.GOAT_ALLOW_REAL_DOWNLOAD === 'true' ||
    env.PAID_EXECUTION_AUTHORIZED === 'true' ||
    env.GOAT_PERFORM_REAL_DOWNLOAD === 'true';
  if (!wantsReal) return { wanted: false, gate: null };
  return {
    wanted: true,
    gate: evaluateRealDownloadAuthorization(
      {
        executionMode: input.executionMode,
        authorizationReceipt: input.authorizationReceipt,
        authorizationReceiptJson: input.authorizationReceiptJson,
        authorizationReceiptPath: input.authorizationReceiptPath,
        objectKey: input.objectKey,
        expectedSize: input.expectedSize,
        expectedSha256: input.expectedSha256,
        authorizedImageDigest: input.authorizedImageDigest,
        imageRef: input.imageRef,
        executionId: input.executionId,
        outputDestination: input.outputDestination || input.workspaceDir,
      },
      env,
      input.nowMs,
    ),
  };
}

function extractValidatedArchiveFromFile(zipPath, workspace, input, env) {
  assertOutsideLockedSource(workspace);
  const zip = inspectZipSafetyFromFile(zipPath, REQUIRED);
  if (!zip.ok) {
    removeQuietly(zipPath);
    return fail(zip.code, 'ZIP safety validation failed before extraction.', { zip });
  }

  const ephemeral = path.join(workspace, 'ephemeral');
  const extractDir = path.join(ephemeral, 'extract');
  const workingDir = path.join(workspace, 'WORKING');
  fs.mkdirSync(extractDir, { recursive: true });

  let extracted;
  try {
    extracted = extractZipSafelyFromFile(zipPath, extractDir);
  } catch (error) {
    removeTreeQuietly(extractDir);
    removeQuietly(zipPath);
    return fail(error.code || 'UNSAFE_EXTRACTION', error.message);
  }

  const files = findRequired(extractDir);
  if (!files.blend || !files.fbx) {
    removeTreeQuietly(extractDir);
    removeQuietly(zipPath);
    return fail('MISSING_REQUIRED_FILE', 'Extracted archive is missing Goat_FINN.blend or Goat_FINN.fbx.');
  }
  fs.chmodSync(files.blend, 0o444);

  let blenderProbe = { ok: null, skipped: true, blenderCompatibility: 'UNTESTED_REAL_SOURCE' };
  if (input.runBlenderProbe === true) {
    blenderProbe = probeBlenderOpen(files.blend, env);
    if (!blenderProbe.ok) {
      return fail('BLENDER_CONVERSION_UNSAFE', 'Blender could not safely open the source. WORKING copy was not written.', {
        blenderProbe,
        blenderCompatibility: 'UNSAFE',
        extractedBlendPreserved: true,
        originalBlendOverwriteForbidden: true,
      });
    }
  }

  if (input.createWorkingCopy === true && blenderProbe.ok === true) {
    let working;
    try {
      working = copyProtectedWorking(files.blend, workingDir);
    } catch (error) {
      return fail(error.code || 'WORKING_COPY_FAILED', error.message);
    }
    return {
      ok: true,
      launched: false,
      paid: false,
      gpuRequested: false,
      goatProductionReady: false,
      workingCopyCreated: true,
      realGoatDownloaded: input.treatAsRealGoat === true,
      blenderCompatibility: input.treatAsRealGoat === true ? 'TESTED_REAL_SOURCE' : 'SYNTHETIC_ONLY',
      jobKind: CHARACTER_SOURCE_MATERIALIZE,
      characterId: GOAT_CHARACTER_ID,
      objectKey: input.objectKey || OBJECT_KEY,
      observedSha256: input.observedSha256,
      observedSize: input.observedSize,
      zip,
      extracted,
      files,
      working,
      blenderProbe,
      originalBlendPath: files.blend,
      originalBlendOverwriteForbidden: true,
      fbxIsEquivalentToBlend: false,
      studioBlender: STUDIO_BLENDER,
      status: 'WORKING_COPY_READY',
      code: 'WORKING_COPY_READY',
      paidFlagsSetByWorker: false,
      streamed: true,
      hashedWhileStreaming: true,
      stagedZip: zipPath,
    };
  }

  return {
    ok: true,
    launched: false,
    paid: false,
    gpuRequested: false,
    goatProductionReady: false,
    workingCopyCreated: false,
    realGoatDownloaded: input.treatAsRealGoat === true,
    blenderCompatibility: input.runBlenderProbe === true ? 'SYNTHETIC_ONLY' : 'UNTESTED_REAL_SOURCE',
    jobKind: CHARACTER_SOURCE_MATERIALIZE,
    characterId: GOAT_CHARACTER_ID,
    objectKey: input.objectKey || OBJECT_KEY,
    observedSha256: input.observedSha256,
    observedSize: input.observedSize,
    zip,
    extracted,
    files,
    blenderProbe,
    originalBlendOverwriteForbidden: true,
    fbxIsEquivalentToBlend: false,
    studioBlender: STUDIO_BLENDER,
    status: input.runBlenderProbe === true ? 'EXTRACTED_PROBE_PENDING_WORKING' : 'EXTRACTED_CHECKS_PASSED',
    code: 'HASH_AND_ZIP_VERIFIED',
    reason: 'WORKING copies are withheld until hashing, ZIP validation, extraction, and Blender-open checks succeed.',
    paidFlagsSetByWorker: false,
    streamed: true,
    hashedWhileStreaming: true,
    stagedZip: zipPath,
  };
}

function extractValidatedArchive(bytes, workspace, input, env) {
  assertOutsideLockedSource(workspace);
  const zip = inspectZipSafety(bytes, REQUIRED);
  if (!zip.ok) {
    return fail(zip.code, 'ZIP safety validation failed before extraction.', { zip });
  }

  const ephemeral = path.join(workspace, 'ephemeral');
  const extractDir = path.join(ephemeral, 'extract');
  const workingDir = path.join(workspace, 'WORKING');
  fs.mkdirSync(extractDir, { recursive: true });

  let extracted;
  try {
    extracted = extractZipSafely(bytes, extractDir, fs);
  } catch (error) {
    return fail(error.code || 'UNSAFE_EXTRACTION', error.message);
  }

  const files = findRequired(extractDir);
  if (!files.blend || !files.fbx) {
    return fail('MISSING_REQUIRED_FILE', 'Extracted archive is missing Goat_FINN.blend or Goat_FINN.fbx.');
  }
  fs.chmodSync(files.blend, 0o444);

  let blenderProbe = { ok: null, skipped: true, blenderCompatibility: 'UNTESTED_REAL_SOURCE' };
  if (input.runBlenderProbe === true) {
    blenderProbe = probeBlenderOpen(files.blend, env);
    if (!blenderProbe.ok) {
      return fail('BLENDER_CONVERSION_UNSAFE', 'Blender could not safely open the source. WORKING copy was not written.', {
        blenderProbe,
        blenderCompatibility: 'UNSAFE',
        extractedBlendPreserved: true,
        originalBlendOverwriteForbidden: true,
      });
    }
  }

  if (input.createWorkingCopy === true && blenderProbe.ok === true) {
    let working;
    try {
      working = copyProtectedWorking(files.blend, workingDir);
    } catch (error) {
      return fail(error.code || 'WORKING_COPY_FAILED', error.message);
    }
    return {
      ok: true,
      launched: false,
      paid: false,
      gpuRequested: false,
      goatProductionReady: false,
      workingCopyCreated: true,
      realGoatDownloaded: false,
      blenderCompatibility: input.treatAsRealGoat === true ? 'TESTED_REAL_SOURCE' : 'SYNTHETIC_ONLY',
      jobKind: CHARACTER_SOURCE_MATERIALIZE,
      characterId: GOAT_CHARACTER_ID,
      objectKey: input.objectKey || 'synthetic-local',
      observedSha256: input.observedSha256,
      observedSize: input.observedSize,
      zip,
      extracted,
      files,
      working,
      blenderProbe,
      originalBlendPath: files.blend,
      originalBlendOverwriteForbidden: true,
      fbxIsEquivalentToBlend: false,
      studioBlender: STUDIO_BLENDER,
      status: 'WORKING_COPY_READY',
      code: 'WORKING_COPY_READY',
      paidFlagsSetByWorker: false,
      streamed: true,
      hashedWhileStreaming: true,
    };
  }

  return {
    ok: true,
    launched: false,
    paid: false,
    gpuRequested: false,
    goatProductionReady: false,
    workingCopyCreated: false,
    realGoatDownloaded: false,
    blenderCompatibility: input.runBlenderProbe === true ? 'SYNTHETIC_ONLY' : 'UNTESTED_REAL_SOURCE',
    jobKind: CHARACTER_SOURCE_MATERIALIZE,
    characterId: GOAT_CHARACTER_ID,
    objectKey: input.objectKey || 'synthetic-local',
    observedSha256: input.observedSha256,
    observedSize: input.observedSize,
    zip,
    extracted,
    files,
    blenderProbe,
    originalBlendOverwriteForbidden: true,
    fbxIsEquivalentToBlend: false,
    studioBlender: STUDIO_BLENDER,
    status: input.runBlenderProbe === true ? 'EXTRACTED_PROBE_PENDING_WORKING' : 'EXTRACTED_CHECKS_PASSED',
    code: 'HASH_AND_ZIP_VERIFIED',
    reason: 'WORKING copies are withheld until hashing, ZIP validation, extraction, and Blender-open checks succeed.',
    paidFlagsSetByWorker: false,
    streamed: true,
    hashedWhileStreaming: true,
  };
}

function materializeGoatSource(input = {}) {
  const env = input.env || process.env;
  const incompleteMultipartCount = Number(input.incompleteMultipartCount ?? 0);
  if (incompleteMultipartCount > 0) {
    return fail('ORPHAN_MULTIPART_REMAINS', 'Incomplete multipart uploads remain. Extraction is refused.');
  }

  const real = evaluateRealDownloadRequest(input);
  if (real.wanted) {
    if (!real.gate.ok) {
      return fail(real.gate.code, real.gate.reason, {
        failedConditions: real.gate.failedConditions,
        authorizationReceipt: real.gate.authorizationReceipt,
      });
    }
    if (input.objectKey && input.objectKey !== OBJECT_KEY) {
      return fail('REAL_GOAT_DOWNLOAD_FORBIDDEN', 'Object key is not the locked CHAR_GOAT_001 source.');
    }
    if (input.performNetworkDownload === true || env.GOAT_PERFORM_REAL_DOWNLOAD === 'true') {
      return fail(
        'REAL_GOAT_DOWNLOAD_FORBIDDEN',
        'This repair task forbids performing the real Goat network download. The gated path is baked but not invoked.',
        { gate: { ok: true, code: real.gate.code }, networkDownloadInvoked: false },
      );
    }
    return fail(
      'REAL_GOAT_DOWNLOAD_FORBIDDEN',
      'Authorization gate passed in evaluation only. The worker still requires an explicit future launcher network request and must not download the locked archive in this task.',
      { gate: { ok: true, code: real.gate.code }, networkDownloadInvoked: false },
    );
  }

  const workspace = input.workspaceDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tivvlejoy-character-'));
  try {
    assertOutsideLockedSource(workspace);
  } catch (error) {
    return fail(error.code, error.message);
  }

  const ephemeral = path.join(workspace, 'ephemeral');
  fs.mkdirSync(ephemeral, { recursive: true });
  const stagedZip = path.join(ephemeral, 'source.zip');
  const expectedSize = input.expectedSize != null ? Number(input.expectedSize) : null;
  const maxBytes = Number(input.maxBytes || expectedSize || 8_000_000);
  let streamed;
  try {
    if (input.syntheticBytes) {
      streamed = streamHashAndWrite(Buffer.from(input.syntheticBytes), stagedZip, {
        maxBytes,
        expectedSize: expectedSize == null ? Buffer.from(input.syntheticBytes).length : expectedSize,
        expectedSha256: input.expectedSha256,
      });
    } else if (input.syntheticPath) {
      streamed = streamHashAndWrite(input.syntheticPath, stagedZip, {
        maxBytes,
        expectedSize: expectedSize == null ? fs.statSync(input.syntheticPath).size : expectedSize,
        expectedSha256: input.expectedSha256,
      });
    } else {
      return {
        ...planCharacterSourceMaterialize(input),
        status: 'BLOCKED_REAL_EXECUTION_REQUIRED',
        code: 'SYNTHETIC_OR_AUTHORIZED_BYTES_REQUIRED',
        reason: 'No synthetic fixture was supplied and real Goat download is forbidden.',
        goatProductionReady: false,
      };
    }
  } catch (error) {
    return fail(error.code || 'STREAM_FAILED', error.message, {
      observedSize: error.observedSize,
      observedSha256: error.observedSha256,
    });
  }

  const bytes = fs.readFileSync(stagedZip);
  return {
    ...extractValidatedArchive(bytes, workspace, {
      ...input,
      observedSha256: streamed.sha256,
      observedSize: streamed.size,
      objectKey: 'synthetic-local',
    }, env),
    stagedZip,
  };
}

function resolveAuthorizedStreamExpectation(input = {}, env = {}) {
  const testTransport =
    input.authorizedTestTransport === true ||
    env.GOAT_SOURCE_TEST_TRANSPORT === 'true' ||
    typeof input.sourceTransport === 'function';
  if (!testTransport) {
    return {
      testMode: false,
      expectedSize: EXPECTED_SIZE,
      expectedSha256: EXPECTED_SHA,
      treatAsRealGoat: true,
    };
  }
  const expectedSize = Number(input.testExpectedSize || env.GOAT_SOURCE_TEST_EXPECTED_SIZE);
  const expectedSha256 = String(input.testExpectedSha256 || env.GOAT_SOURCE_TEST_EXPECTED_SHA256 || '').toLowerCase();
  if (!Number.isFinite(expectedSize) || expectedSize <= 0 || expectedSize === EXPECTED_SIZE) {
    return {
      testMode: true,
      ok: false,
      code: 'TEST_TRANSPORT_REFUSED',
      reason: 'Authorized test transport cannot impersonate the locked Goat archive size.',
    };
  }
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || expectedSha256 === EXPECTED_SHA) {
    return {
      testMode: true,
      ok: false,
      code: 'TEST_TRANSPORT_REFUSED',
      reason: 'Authorized test transport cannot impersonate the locked Goat archive hash.',
    };
  }
  return { testMode: true, ok: true, expectedSize, expectedSha256, treatAsRealGoat: false };
}

async function openAuthorizedSourceBody(input = {}, env = {}) {
  if (typeof input.sourceTransport === 'function') {
    const result = await input.sourceTransport({
      method: 'GetObject',
      key: OBJECT_KEY,
      bucket: 'test-transport',
    });
    if (!result || !result.Body) {
      const err = new Error('Authorized test transport returned no readable body.');
      err.code = 'SOURCE_TRANSPORT_EMPTY';
      throw err;
    }
    if (typeof result.putObject === 'function' || typeof result.deleteObject === 'function') {
      const err = new Error('Source transport must be read-only.');
      err.code = 'SOURCE_WRITE_FORBIDDEN';
      throw err;
    }
    return result.Body;
  }
  if (env.GOAT_SOURCE_TEST_TRANSPORT === 'true') {
    const url = String(env.GOAT_SOURCE_TEST_URL || '');
    if (!isLoopbackUrl(url)) {
      const err = new Error('Test transport URL must be loopback-only.');
      err.code = 'TEST_TRANSPORT_REFUSED';
      throw err;
    }
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      const err = new Error(`Test transport HTTP ${res.status}`);
      err.code = 'SOURCE_TRANSPORT_EMPTY';
      throw err;
    }
    return res.body;
  }
  if (!credentialsPresent(env)) {
    const err = new Error('R2 credentials are missing. Fail closed before any asset mutation.');
    err.code = 'R2_CREDENTIALS_MISSING';
    throw err;
  }
  if (env.TIVVLEJOY_FORBID_REAL_GOAT_DOWNLOAD === 'true' || input.forbidRealNetwork === true) {
    const err = new Error('Real Goat network download is forbidden in this process. Download count remains 0.');
    err.code = 'REAL_GOAT_DOWNLOAD_FORBIDDEN';
    throw err;
  }
  const r2 = require('./r2-client');
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const ctx = r2.createR2Client(env);
  const res = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: OBJECT_KEY }));
  return res.Body;
}

async function downloadAuthorizedGoatSource(input = {}) {
  const env = input.env || process.env;
  const gate = evaluateRealDownloadAuthorization(input, env, input.nowMs);
  if (!gate.ok) {
    return fail(gate.code, gate.reason, {
      failedConditions: gate.failedConditions,
      authorizationReceipt: gate.authorizationReceipt,
      authorizedDownloadInvoked: 0,
      networkDownloadInvoked: false,
    });
  }
  if (input.performNetworkDownload !== true) {
    return fail(
      'REAL_GOAT_DOWNLOAD_FORBIDDEN',
      'Authorized real download requires an explicit launcher network request. The worker does not start downloads on its own.',
      { authorizedDownloadInvoked: 0, networkDownloadInvoked: false },
    );
  }
  const expectation = resolveAuthorizedStreamExpectation(input, env);
  if (expectation.testMode && expectation.ok === false) {
    return fail(expectation.code, expectation.reason, { authorizedDownloadInvoked: 0, networkDownloadInvoked: false });
  }
  const workspace = input.workspaceDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tivvlejoy-character-'));
  try {
    assertOutsideLockedSource(workspace);
  } catch (error) {
    return fail(error.code, error.message, { authorizedDownloadInvoked: 0, networkDownloadInvoked: false });
  }
  const dest = path.join(workspace, 'ephemeral', 'Goat_FINN.zip');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let body;
  try {
    body = await openAuthorizedSourceBody(input, env);
  } catch (error) {
    removeQuietly(dest);
    return fail(error.code || 'SOURCE_TRANSPORT_FAILED', error.message, {
      authorizedDownloadInvoked: 1,
      networkDownloadInvoked: false,
    });
  }
  let streamed;
  try {
    streamed = await streamReadableHashAndWrite(body, dest, {
      maxBytes: expectation.expectedSize,
      expectedSize: expectation.expectedSize,
      expectedSha256: expectation.expectedSha256,
    });
  } catch (error) {
    removeQuietly(dest);
    return fail(error.code || 'STREAM_FAILED', error.message, {
      observedSize: error.observedSize,
      observedSha256: error.observedSha256,
      authorizedDownloadInvoked: 1,
      networkDownloadInvoked: true,
    });
  }
  const extracted = extractValidatedArchiveFromFile(dest, workspace, {
    ...input,
    observedSha256: streamed.sha256,
    observedSize: streamed.size,
    objectKey: OBJECT_KEY,
    treatAsRealGoat: expectation.treatAsRealGoat === true,
    runBlenderProbe: input.runBlenderProbe === true,
    createWorkingCopy: input.createWorkingCopy === true,
  }, env);
  return {
    ...extracted,
    authorizedDownloadInvoked: 1,
    networkDownloadInvoked: true,
    streamed: true,
    hashedWhileStreaming: true,
    bufferedEntireArchive: false,
  };
}

module.exports = {
  planCharacterSourceMaterialize,
  materializeGoatSource,
  downloadAuthorizedGoatSource,
  evaluateRealDownloadRequest,
  credentialsPresent,
  probeBlenderOpen,
  OBJECT_KEY,
  EXPECTED_SHA,
  EXPECTED_SIZE,
  REQUIRED,
};

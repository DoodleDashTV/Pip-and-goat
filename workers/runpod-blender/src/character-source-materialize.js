'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { inspectZipSafety, extractZipSafely } = require('./zip-safe');
const { GOAT_CHARACTER_ID, STUDIO_BLENDER, CHARACTER_SOURCE_MATERIALIZE } = require('./character-job-kinds');

const OBJECT_KEY = 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip';
const EXPECTED_SHA = 'f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5';
const EXPECTED_SIZE = 269512136;
const REQUIRED = { blend: 'Goat_FINN.blend', fbx: 'Goat_FINN.fbx' };

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function probeBlenderOpen(blendPath, env = {}) {
  const blender = String(env.BLENDER_BIN || 'blender');
  const script = `
import bpy, json, sys
src = sys.argv[sys.argv.index('--') + 1]
try:
    bpy.ops.wm.open_mainfile(filepath=src, load_ui=False)
    print(json.dumps({
      "ok": True,
      "blenderVersion": bpy.app.version_string,
      "saved": False,
      "sourceOverwritten": False
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
  const conversion = path.join(workingDir, 'goat_working_4_2_2.blend');
  const department = path.join(workingDir, 'CHAR_GOAT_001_working.blend');
  fs.mkdirSync(workingDir, { recursive: true });
  fs.copyFileSync(blendPath, conversion);
  fs.copyFileSync(conversion, department);
  return { conversion, department };
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
  };
}

function materializeGoatSource(input = {}) {
  const env = input.env || process.env;
  const allowReal = input.allowRealGoatDownload === true && input.paidExecutionAuthorized === true;
  const incompleteMultipartCount = Number(input.incompleteMultipartCount ?? 0);
  if (incompleteMultipartCount > 0) {
    return fail('ORPHAN_MULTIPART_REMAINS', 'Incomplete multipart uploads remain. Extraction is refused.');
  }
  if (allowReal && input.objectKey && input.objectKey !== OBJECT_KEY) {
    return fail('UNSAFE_OBJECT_KEY', 'Object key is not the locked CHAR_GOAT_001 source.');
  }
  if (allowReal && !credentialsPresent(env)) {
    return fail('R2_CREDENTIALS_MISSING', 'R2 credentials are missing. Fail closed before any asset mutation.');
  }
  if (allowReal) {
    return fail(
      'REAL_GOAT_DOWNLOAD_FORBIDDEN',
      'Real Goat download remains disabled in this worker-image task. No SOURCE/WORKING files were written.',
    );
  }

  const bytes = input.syntheticBytes
    ? Buffer.from(input.syntheticBytes)
    : input.syntheticPath
      ? fs.readFileSync(input.syntheticPath)
      : null;
  if (!bytes) {
    return {
      ...planCharacterSourceMaterialize(input),
      status: 'BLOCKED_REAL_EXECUTION_REQUIRED',
      code: 'SYNTHETIC_OR_AUTHORIZED_BYTES_REQUIRED',
      reason: 'No synthetic fixture was supplied and real Goat download is forbidden.',
      goatProductionReady: false,
    };
  }

  if (input.expectedSize != null && bytes.length !== input.expectedSize) {
    return fail('SIZE_MISMATCH', 'Source size does not match the expected fixture or locked identity.', {
      observedSize: bytes.length,
    });
  }
  const digest = sha256(bytes);
  if (input.expectedSha256 && digest !== input.expectedSha256) {
    return fail('SHA256_MISMATCH', 'Source hash does not match. Extraction was not attempted.', {
      observedSha256: digest,
    });
  }

  const zip = inspectZipSafety(bytes, REQUIRED);
  if (!zip.ok) {
    return fail(zip.code, 'ZIP safety validation failed before extraction.', { zip });
  }

  const workspace = input.workspaceDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tivvlejoy-character-'));
  const sourceDir = path.join(workspace, 'SOURCE');
  const extractDir = path.join(sourceDir, 'extracted');
  const workingDir = path.join(workspace, 'WORKING');
  const productionDir = path.join(workspace, 'PRODUCTION');
  fs.mkdirSync(extractDir, { recursive: true });
  if (fs.existsSync(productionDir) === false) {
    /* production master stays untouched / uncreated */
  }

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
    const working = copyProtectedWorking(files.blend, workingDir);
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
      objectKey: OBJECT_KEY,
      observedSha256: digest,
      observedSize: bytes.length,
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
    objectKey: OBJECT_KEY,
    observedSha256: digest,
    observedSize: bytes.length,
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
  };
}

module.exports = {
  planCharacterSourceMaterialize,
  materializeGoatSource,
  credentialsPresent,
  probeBlenderOpen,
  OBJECT_KEY,
  EXPECTED_SHA,
  EXPECTED_SIZE,
  REQUIRED,
};

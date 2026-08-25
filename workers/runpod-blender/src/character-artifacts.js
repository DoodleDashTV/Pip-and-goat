'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const r2 = require('./r2-client');
const { GOAT_CHARACTER_ID, LOCKED_SOURCE_KEY, LOCKED_SOURCE_PREFIX } = require('./character-job-kinds');

const EXECUTION_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const CHARACTER_EVIDENCE_ROOT = `tivvlejoy-assets/characters/${GOAT_CHARACTER_ID}/executions`;
const MAX_ARTIFACT_FILES = 512;
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024 * 1024;

function tagged(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeExecutionId(value) {
  const id = String(value || '').trim();
  if (!EXECUTION_ID_RE.test(id)) {
    throw tagged('Character execution id is missing or malformed.', 'CHARACTER_EXECUTION_ID_INVALID');
  }
  return id;
}

function assertEvidenceKey(key) {
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  if (!normalized.startsWith(`${CHARACTER_EVIDENCE_ROOT}/`)) {
    throw tagged('Character artifacts may only be written to the execution-evidence prefix.', 'CHARACTER_OUTPUT_PREFIX_FORBIDDEN');
  }
  if (
    normalized === LOCKED_SOURCE_KEY ||
    normalized.startsWith(`${LOCKED_SOURCE_PREFIX}/`) ||
    lower.includes('/source/') ||
    lower.includes('/production/')
  ) {
    throw tagged('SOURCE and PRODUCTION writes are forbidden.', 'CHARACTER_OUTPUT_PREFIX_FORBIDDEN');
  }
  return normalized;
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.blend') return 'application/x-blender';
  if (extension === '.fbx') return 'application/octet-stream';
  return 'application/octet-stream';
}

function listArtifactFiles(root) {
  if (!fs.existsSync(root)) return [];
  const resolvedRoot = path.resolve(root);
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(resolvedRoot, absolute).replace(/\\/g, '/');
      if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
        throw tagged('Artifact traversal escaped the execution directory.', 'CHARACTER_ARTIFACT_TRAVERSAL');
      }
      if (path.basename(relative).toLowerCase() === 'goat_finn.zip') {
        throw tagged('The locked Goat source archive cannot be uploaded as an execution artifact.', 'SOURCE_WRITE_FORBIDDEN');
      }
      const stat = fs.statSync(absolute);
      files.push({ absolute, relative, byteSize: stat.size });
      if (files.length > MAX_ARTIFACT_FILES) {
        throw tagged('Character artifact file-count limit exceeded.', 'CHARACTER_ARTIFACT_LIMIT_EXCEEDED');
      }
    }
  };
  visit(resolvedRoot);
  const totalBytes = files.reduce((sum, item) => sum + item.byteSize, 0);
  if (totalBytes > MAX_ARTIFACT_BYTES) {
    throw tagged('Character artifact byte limit exceeded.', 'CHARACTER_ARTIFACT_LIMIT_EXCEEDED');
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function sha256File(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function compactCharacterResult(result) {
  const department = result?.department || null;
  const materialize = result?.materialize || null;
  const capability = result?.capability || null;
  return {
    ok: result?.ok === true,
    status: result?.status || null,
    code: result?.code || null,
    jobKind: result?.jobKind || null,
    characterId: result?.characterId || GOAT_CHARACTER_ID,
    executionMode: result?.executionMode || null,
    authorizedDownloadInvoked: Number(result?.authorizedDownloadInvoked || 0),
    networkDownloadInvoked: result?.networkDownloadInvoked === true,
    goatProductionReady: false,
    characterMasterGate: result?.characterMasterGate || null,
    capability: capability
      ? {
          schema: capability.schema || null,
          entrypointVersion: capability.entrypointVersion || null,
          liveCharacterDepartmentCapable: capability.liveCharacterDepartmentCapable === true,
          liveDepartmentUsesBlenderRuntime: capability.liveDepartmentUsesBlenderRuntime === true,
          requiresArtistAuthoredRig: capability.requiresArtistAuthoredRig === true,
          automaticPlaceholderRigAllowed: false,
          semanticBodySelectionRequired: capability.semanticBodySelectionRequired === true,
          qaUsesCharacterBounds: capability.qaUsesCharacterBounds === true,
          authorizedRealSourceDownloadCapable: capability.authorizedRealSourceDownloadCapable === true,
          durableArtifactPersistenceCapable: capability.durableArtifactPersistenceCapable === true,
          sourceWritesForbidden: capability.sourceWritesForbidden === true,
          goatProductionReady: false,
        }
      : null,
    materialize: materialize
      ? {
          ok: materialize.ok === true,
          code: materialize.code || null,
          objectKey: materialize.objectKey || null,
          observedSize: materialize.observedSize ?? null,
          observedSha256: materialize.observedSha256 || null,
          streamed: materialize.streamed === true,
          hashedWhileStreaming: materialize.hashedWhileStreaming === true,
          zipCode: materialize.zip?.code || null,
          workingCopyCreated: materialize.workingCopyCreated === true,
          sourceOverwritten: false,
        }
      : null,
    department: department
      ? {
          ok: department.ok === true,
          exitCode: department.exitCode ?? null,
          stageCount: department.stageCount ?? null,
          executionMode: department.executionMode || null,
          executionRuntime: department.executionRuntime || null,
          executeFlagPresent: department.executeFlagPresent === true,
          dryRunFlagPresent: department.dryRunFlagPresent === true,
          gate: department.gate || null,
          parsed: department.parsed || null,
          stderrTail: String(department.stderr || '').slice(-4000),
        }
      : null,
  };
}

async function persistCharacterRun(input = {}) {
  const env = input.env || process.env;
  if (String(env.CHARACTER_PERSIST_ARTIFACTS || '').trim() !== 'true') {
    throw tagged(
      'Live character execution requires durable artifact persistence before Pod cleanup.',
      'CHARACTER_ARTIFACT_PERSIST_REQUIRED',
    );
  }
  const executionId = safeExecutionId(input.executionId || env.CHARACTER_EXECUTION_ID);
  const jobId = safeExecutionId(input.jobId || env.RENDER_JOB_ID || executionId);
  const artifactDir = path.resolve(String(input.artifactDir || ''));
  const transport = input.transport || r2;
  const context = input.context || transport.createR2Client(env);
  const prefix = `${CHARACTER_EVIDENCE_ROOT}/${executionId}`;
  const files = listArtifactFiles(artifactDir);
  const uploaded = [];

  for (const file of files) {
    const key = assertEvidenceKey(`${prefix}/artifacts/${file.relative}`);
    const sha256 = sha256File(file.absolute);
    const sent = await transport.uploadFile(context, key, file.absolute, contentType(file.absolute));
    const remote = await transport.headObject(context, key);
    if (remote.byteSize !== file.byteSize || sent.byteSize !== file.byteSize) {
      throw tagged(`Artifact size verification failed for ${file.relative}.`, 'CHARACTER_ARTIFACT_READBACK_MISMATCH');
    }
    uploaded.push({ key, relativePath: file.relative, byteSize: file.byteSize, sha256, contentType: contentType(file.absolute) });
  }

  const result = compactCharacterResult(input.result || {});
  const manifest = {
    schema: 'TIVVLEJOY_CHARACTER_EXECUTION_ARTIFACT_MANIFEST_V1',
    executionId,
    jobId,
    characterId: GOAT_CHARACTER_ID,
    outputPrefix: prefix,
    sourceWritesForbidden: true,
    productionWritesForbidden: true,
    lockedSourceUploaded: false,
    files: uploaded,
    fileCount: uploaded.length,
    totalBytes: uploaded.reduce((sum, item) => sum + item.byteSize, 0),
    result,
    goatProductionReady: false,
    humanVisualApprovalRequired: true,
    persistedAt: new Date().toISOString(),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestKey = assertEvidenceKey(`${prefix}/manifest.json`);
  const resultKey = assertEvidenceKey(`${prefix}/character-result.json`);
  await transport.uploadBuffer(context, manifestKey, manifestBytes, 'application/json');
  await transport.uploadBuffer(context, resultKey, Buffer.from(`${JSON.stringify(result, null, 2)}\n`), 'application/json');

  const complete = result.ok && result.department?.executeFlagPresent === true && result.department?.dryRunFlagPresent === false;
  const status = {
    jobId,
    status: complete ? 'COMPLETE' : 'FAILED',
    stage: 'CHARACTER_MASTER',
    code: complete ? 'LIVE_DEPARTMENT_EXECUTED_AWAITING_VISUAL_APPROVAL' : result.code || 'CHARACTER_MASTER_FAILED',
    outputPrefix: prefix,
    manifestKey,
    resultKey,
    fileCount: uploaded.length,
    goatProductionReady: false,
    humanVisualApprovalRequired: true,
    at: new Date().toISOString(),
  };
  await transport.uploadBuffer(
    context,
    `jobs/${jobId}/character-result.json`,
    Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
    'application/json',
  );
  await transport.uploadBuffer(
    context,
    `jobs/${jobId}/status.json`,
    Buffer.from(`${JSON.stringify(status, null, 2)}\n`),
    'application/json',
  );

  return { ok: true, complete, executionId, jobId, prefix, manifestKey, resultKey, files: uploaded, status };
}

module.exports = {
  CHARACTER_EVIDENCE_ROOT,
  assertEvidenceKey,
  listArtifactFiles,
  persistCharacterRun,
  compactCharacterResult,
  safeExecutionId,
};

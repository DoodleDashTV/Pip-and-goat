import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import type { MultipartStoragePort } from './scenery/intake/multipart';
import { ConnectionReadyMultipartStorage, MemoryMultipartStorage } from './scenery/intake/multipart';
import { resetIntakeRateLimit } from './scenery/intake/access';
import { describeGoatSessionOpenFailure } from './tivvlejoy-character-source-intake/client-failure';
import {
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_RECEIPT_OBJECT_KEY,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  buildGoatSourceReceipt,
  connectReceiptToCharacterPipeline,
  createGoatUploadSession,
  compileGoatPaidExecutionFinalReport,
  compileGoatPostUploadPreflight,
  dryRunGoatSourceMaterialization,
  evaluateGoatPaidExecutionAuthorization,
  GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA,
  KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST,
  READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION,
  RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
  resolveAuthorizedCharacterWorkerImage,
  emptyGoatSourceReceipt,
  handleCharacterSourceAction,
  inspectGoatZipOrFail,
  operatorChecklist,
  persistGoatSourceReceipt,
  planGoatSourceMaterialization,
  preflightGoatUpload,
  receiptContainsSecrets,
  refuseSourceOverwrite,
  remainingParts,
  resetCharacterSourceStore,
  resumeGuidance,
  recordPartEtag,
  verifyGoatSourceHash,
} from './tivvlejoy-character-source-intake';
import {
  corruptZip,
  missingBlendZip,
  prohibitedPayloadZip,
  traversalZip,
  validGoatLikeZip,
} from './tivvlejoy-character-source-intake/zip-fixtures';

const configuredEnv = {
  VERCEL_ENV: 'preview',
  DATABASE_URL: 'postgres://preview',
  R2_BUCKET: 'bucket',
  R2_ENDPOINT: 'https://example.invalid',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
};

function fakeStorage(overrides: Partial<MultipartStoragePort> = {}): MultipartStoragePort {
  let stored = false;
  return {
    async createMultipartUpload() {
      return { uploadId: 'up-1' };
    },
    async signPart(input) {
      return { url: `https://example.invalid/part/${input.partNumber}`, expiresAt: new Date().toISOString() };
    },
    async completeMultipartUpload() {
      stored = true;
      return { size: GOAT_SOURCE_SIZE_BYTES };
    },
    async abortMultipartUpload() {},
    async headObject() {
      return stored
        ? { exists: true, size: GOAT_SOURCE_SIZE_BYTES }
        : { exists: false, size: null };
    },
    ...overrides,
  };
}

async function act(
  action: Parameters<typeof handleCharacterSourceAction>[0]['action'],
  body: Record<string, unknown>,
  extras?: Partial<Parameters<typeof handleCharacterSourceAction>[0]>,
) {
  return handleCharacterSourceAction({
    action,
    body,
    env: configuredEnv,
    publicPreview: false,
    storage: fakeStorage(),
    ...extras,
  });
}

describe('Goat character source intake bridge', () => {
  beforeEach(() => {
    resetCharacterSourceStore();
    resetIntakeRateLimit();
  });

  it('accepts only the locked Goat SHA', () => {
    expect(verifyGoatSourceHash(GOAT_SOURCE_SHA256).ok).toBe(true);
    expect(verifyGoatSourceHash('a'.repeat(64)).ok).toBe(false);
    expect(verifyGoatSourceHash('a'.repeat(64)).code).toBe('SHA256_MISMATCH');
  });

  it('rejects the wrong filename and size', () => {
    expect(preflightGoatUpload({ filename: 'Goat.zip', byteSize: GOAT_SOURCE_SIZE_BYTES }).ok).toBe(false);
    expect(preflightGoatUpload({ filename: 'Goat_FINN.zip', byteSize: 12 }).code).toBe('SIZE_MISMATCH');
  });

  it('refuses a create-session with the wrong SHA', async () => {
    await expect(
      act('create-session', {
        filename: 'Goat_FINN.zip',
        byteSize: GOAT_SOURCE_SIZE_BYTES,
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'SHA256_MISMATCH' });
  });

  it('plans a resumable multipart session and can continue after interruption', async () => {
    const created = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    const sessionId = (created.session as { sessionId: string }).sessionId;
    const first = await act('sign-part', { sessionId, partNumber: 1 });
    expect(String(first.signedUrl)).toContain('example.invalid');
    const resumed = await act('resume', { sessionId, partNumber: 1, etag: '"etag-1"' });
    const resume = resumed.resume as { resumable: boolean; restartCompletedUpload: boolean; completedParts: number };
    expect(resume.resumable).toBe(true);
    expect(resume.restartCompletedUpload).toBe(false);
    expect(resume.completedParts).toBe(1);
  });

  it('reuses an already-verified SOURCE instead of overwriting', async () => {
    const { getCharacterSourceStore } = await import('./tivvlejoy-character-source-intake/store');
    getCharacterSourceStore().lockReceipt(
      buildGoatSourceReceipt({
        sourceSha256: GOAT_SOURCE_SHA256,
        sourceSize: GOAT_SOURCE_SIZE_BYTES,
        hashVerified: true,
        zipIntegrityVerified: true,
        sourceLocked: true,
        bucketConfigured: true,
      }),
    );
    const created = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    expect(created.alreadyPresent).toBe(true);
    expect(refuseSourceOverwrite(GOAT_SOURCE_SHA256, 'c'.repeat(64)).code).toBe('SOURCE_OVERWRITE_REFUSED');
    expect(refuseSourceOverwrite(GOAT_SOURCE_SHA256, GOAT_SOURCE_SHA256).reused).toBe(true);
  });

  it('locks SOURCE after a size-matching complete and keeps production closed', async () => {
    const created = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    const session = created.session as { sessionId: string; parts: Array<{ partNumber: number }> };
    let current = createGoatUploadSession({
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
      env: configuredEnv,
    });
    current = { ...current, sessionId: session.sessionId, uploadId: 'up-1' };
    for (const part of current.parts) {
      current = recordPartEtag(current, part.partNumber, `"etag-${part.partNumber}"`);
    }
    const { getCharacterSourceStore } = await import('./tivvlejoy-character-source-intake/store');
    getCharacterSourceStore().putSession(current);
    const completed = await act('complete', { sessionId: session.sessionId });
    const receipt = completed.receipt as { sourceLocked: boolean; goatProductionReady: boolean; objectKey: string };
    expect(receipt.sourceLocked).toBe(true);
    expect(receipt.goatProductionReady).toBe(false);
    expect(receipt.objectKey).toBe(GOAT_SOURCE_OBJECT_KEY);
    expect(receiptContainsSecrets(receipt as never)).toBe(false);
  });

  it('fails closed when the stored R2 object is missing', async () => {
    const created = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    const sessionId = (created.session as { sessionId: string }).sessionId;
    let current = createGoatUploadSession({
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
      env: configuredEnv,
    });
    current = { ...current, sessionId, uploadId: 'up-1' };
    for (const part of current.parts) current = recordPartEtag(current, part.partNumber, `"e${part.partNumber}"`);
    const { getCharacterSourceStore } = await import('./tivvlejoy-character-source-intake/store');
    getCharacterSourceStore().putSession(current);
    await expect(
      act(
        'complete',
        { sessionId },
        {
          storage: fakeStorage({
            async headObject() {
              return { exists: false, size: null };
            },
          }),
        },
      ),
    ).rejects.toMatchObject({ code: 'R2_OBJECT_MISSING' });
  });

  it('inspects ZIP safety without claiming a visual PASS', async () => {
    expect((await inspectGoatZipOrFail(validGoatLikeZip())).ok).toBe(true);
    expect((await inspectGoatZipOrFail(traversalZip())).code).toBe('ZIP_TRAVERSAL');
    expect((await inspectGoatZipOrFail(missingBlendZip())).code).toBe('MISSING_REQUIRED_FILE');
    expect((await inspectGoatZipOrFail(prohibitedPayloadZip())).code).toBe('ZIP_PROHIBITED_PAYLOAD');
    expect((await inspectGoatZipOrFail(corruptZip())).code).toBe('ZIP_CORRUPT');
  });

  it('keeps worker materialization dry-run and fail-closed', () => {
    const missing = dryRunGoatSourceMaterialization({ objectExists: false, authAvailable: true });
    expect(missing.blockers).toContain('R2_OBJECT_MISSING');
    expect(missing.paid).toBe(false);
    expect(missing.launched).toBe(false);
    const mismatch = dryRunGoatSourceMaterialization({
      objectExists: true,
      authAvailable: true,
      downloadedSha256: 'd'.repeat(64),
    });
    expect(mismatch.blockers).toContain('WORKER_DOWNLOAD_HASH_MISMATCH');
    expect(planGoatSourceMaterialization().blenderConversionClaimed).toBe(false);
    expect(planGoatSourceMaterialization().fbxIsEquivalentToBlend).toBe(false);
  });

  it('connects a locked receipt into the existing 26-stage pipeline without a false PASS', () => {
    const receipt = buildGoatSourceReceipt({
      sourceSha256: GOAT_SOURCE_SHA256,
      sourceSize: GOAT_SOURCE_SIZE_BYTES,
      hashVerified: true,
      zipIntegrityVerified: true,
      sourceLocked: true,
      bucketConfigured: true,
    });
    const connected = connectReceiptToCharacterPipeline(receipt);
    expect(connected.duplicatePipelineCreated).toBe(false);
    expect(connected.stageCount).toBe(26);
    expect(connected.goatProductionReady).toBe(false);
    expect(connected.stages.filter((stage) => stage.stage === 'CHARACTER_MASTER_GATE')[0]?.disposition).toBe('BLOCKED');
    expect(connected.stages.filter((stage) => stage.stage === 'SOURCE_HASH_LOCK')[0]?.disposition).toBe('REUSED');
  });

  it('compiles a post-upload preflight that stops before paid GPU launch', () => {
    const receipt = buildGoatSourceReceipt({
      sourceSha256: GOAT_SOURCE_SHA256,
      sourceSize: GOAT_SOURCE_SIZE_BYTES,
      hashVerified: true,
      zipIntegrityVerified: true,
      sourceLocked: true,
      bucketConfigured: true,
    });
    const preflight = compileGoatPostUploadPreflight({
      receipt,
      live: {
        objectExists: true,
        storedSize: GOAT_SOURCE_SIZE_BYTES,
        storedSha256: GOAT_SOURCE_SHA256,
        zipOk: true,
        incompleteMultipartCount: 0,
      },
    });
    expect(preflight.status).toBe(READY_FOR_EXPLICIT_GOAT_PAID_EXECUTION_AUTHORIZATION);
    expect(preflight.sourceImmutable).toBe(true);
    expect(preflight.goatProductionReady).toBe(false);
    expect(preflight.paidGpuLaunchCount).toBe(0);
    expect(preflight.productionMutationCount).toBe(0);
    expect(preflight.paidExecution.launched).toBe(false);
    expect(preflight.paidExecution.proposedGpu).toBe('NVIDIA GeForce RTX 4090');
    expect(preflight.paidExecution.cloudType).toBe('SECURE');
    expect(preflight.working.conversionCopy).toContain('goat_working_4_2_2.blend');
    expect(preflight.working.originalBlendOverwriteForbidden).toBe(true);
    expect(preflight.blender.conversionClaimed).toBe(false);
    expect(preflight.departmentStages).toHaveLength(26);
    expect(preflight.departmentStages.find((stage) => stage.stage === 'SOURCE_INTAKE')?.disposition).toBe('REUSED');
    expect(preflight.departmentStages.find((stage) => stage.stage === 'CHARACTER_MASTER_GATE')?.disposition).toBe(
      'BLOCKED',
    );
    expect(preflight.nextAuthorizationAction).not.toContain('Upload Goat Source');
  });

  it('refuses TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1 when the digest-pinned worker cannot be resolved', () => {
    const locked = {
      sourceLocked: true,
      objectExists: true,
      storedSize: GOAT_SOURCE_SIZE_BYTES,
      storedSha256: GOAT_SOURCE_SHA256,
      hashVerified: true,
      zipOk: true,
      incompleteMultipartCount: 0,
      secure4090PriceUsdPerHr: 0.74,
      secure4090StockStatus: 'High',
      existingBillablePodCount: 0,
      priorAuthorizedLaunchCount: 0,
      requestedGpu: 'NVIDIA GeForce RTX 4090',
      requestedCloudType: 'SECURE' as const,
      knownCurrentDigestReachable: true,
      knownCurrentImageJobKind: 'FINAL_1080P_RENDER',
      knownCurrentImageHasCharacterDepartment: false,
      knownCurrentImageHasGoatMaterialize: false,
    };
    const decision = evaluateGoatPaidExecutionAuthorization({
      authorizationPresent: true,
      env: {
        RUNPOD_WORKER_IMAGE: '',
        ALLOW_PAID_GPU_LAUNCH: 'false',
        CLOUD_RENDER_ENABLED: 'false',
      },
      live: locked,
    });
    expect(decision.schema).toBe(GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA);
    expect(decision.status).toBe('FAIL_CLOSED_DO_NOT_LAUNCH');
    expect(decision.launch.allowed).toBe(false);
    expect(decision.launch.launchCount).toBe(0);
    expect(decision.worker.positivelyResolved).toBe(false);
    expect(decision.worker.checkoutStalePinUsable).toBe(false);
    expect(decision.worker.knownCurrentTivvleJoyDigest).toBe(KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST);
    expect(decision.remainingBlockers).toContain('WORKER_IMAGE_MISSING');
    expect(decision.remainingBlockers).toContain('WORKER_IMAGE_WRONG_JOB_KIND');
    expect(decision.remainingBlockers).toContain('WORKER_IMAGE_CHARACTER_DEPARTMENT_NOT_BAKED');
    expect(decision.goatProductionReady).toBe(false);
    expect(decision.paidGpuLaunched).toBe(false);
    expect(decision.quote.withinAuthorization).toBe(true);
    const report = compileGoatPaidExecutionFinalReport({
      startingBranch: 'cursor/tivvlejoy-goat-character-source-intake-73f1',
      startingSha: 'e837122d5a1c4028a998ea073c867ce57ff00948',
      authorization: decision,
      live: { ...locked, actualRuntimeMinutes: 0, actualCostUsd: 0, podsRemaining: 0 },
    });
    expect(report.exactLaunchCount).toBe(0);
    expect(report.characterMasterGateResult).toBe('BLOCKED');
    expect(report.goatProductionReady).toBe(false);
    expect(report.actualCostUsd).toBe(0);
  });

  it('still refuses a digest-pinned render worker even when RUNPOD_WORKER_IMAGE is set', () => {
    const digest = KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST;
    const decision = evaluateGoatPaidExecutionAuthorization({
      authorizationPresent: true,
      env: {
        RUNPOD_WORKER_IMAGE: `ghcr.io/example-org/ddp-runpod-blender@${digest}`,
        ALLOW_PAID_GPU_LAUNCH: 'true',
        CLOUD_RENDER_ENABLED: 'true',
      },
      live: {
        sourceLocked: true,
        objectExists: true,
        storedSize: GOAT_SOURCE_SIZE_BYTES,
        storedSha256: GOAT_SOURCE_SHA256,
        hashVerified: true,
        zipOk: true,
        incompleteMultipartCount: 0,
        secure4090PriceUsdPerHr: 0.74,
        knownCurrentDigestReachable: true,
        knownCurrentImageJobKind: 'FINAL_1080P_RENDER',
        knownCurrentImageHasCharacterDepartment: false,
        knownCurrentImageHasGoatMaterialize: false,
        requestedGpu: 'NVIDIA GeForce RTX 4090',
        requestedCloudType: 'SECURE',
      },
    });
    expect(decision.launch.allowed).toBe(false);
    expect(decision.remainingBlockers).toContain('WORKER_IMAGE_WRONG_JOB_KIND');
    expect(decision.worker.digestUsed).toBeNull();
  });

  it('refuses community cloud, a second launch, and a quote above $3', () => {
    const overBudget = evaluateGoatPaidExecutionAuthorization({
      authorizationPresent: true,
      env: { RUNPOD_WORKER_IMAGE: '' },
      live: {
        requestedCloudType: 'COMMUNITY',
        requestedGpu: 'NVIDIA GeForce RTX 5090',
        priorAuthorizedLaunchCount: 1,
        secure4090PriceUsdPerHr: 1.2,
        sourceLocked: true,
        objectExists: true,
        storedSize: GOAT_SOURCE_SIZE_BYTES,
        storedSha256: GOAT_SOURCE_SHA256,
        hashVerified: true,
        zipOk: true,
      },
    });
    expect(overBudget.remainingBlockers).toEqual(
      expect.arrayContaining([
        'COMMUNITY_CLOUD_REFUSED',
        'WRONG_GPU',
        'PRIOR_LAUNCH_ALREADY_CONSUMED',
        'HOURLY_RATE_EXCEEDS_STUDIO_CAP',
        'PREDICTED_COST_EXCEEDS_AUTHORIZATION',
      ]),
    );
    expect(overBudget.launch.allowed).toBe(false);
  });

  it('resolves RUNPOD_WORKER_IMAGE from the authoritative character pin and rejects stale digests', () => {
    const resolved = resolveAuthorizedCharacterWorkerImage({ RUNPOD_WORKER_IMAGE: '' });
    expect(resolved.ok).toBe(true);
    expect(resolved.source).toBe('authoritative-pin');
    expect(resolved.digest).toBe('sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e');
    expect(resolved.ref).toContain('@sha256:f732091b0fc1035aff09ed5897672eec786b1d618b2c2ac07d5ad4d217c0008e');
    const stale = resolveAuthorizedCharacterWorkerImage({
      RUNPOD_WORKER_IMAGE: `ghcr.io/example-org/ddp-runpod-blender@${KNOWN_CURRENT_TIVVLEJOY_WORKER_DIGEST}`,
    });
    expect(stale.ok).toBe(false);
    expect(stale.code).toBe(RUNPOD_WORKER_IMAGE_PIN_BLOCKED);
  });

  it('stays connection-ready without R2 and refuses Production mutations', async () => {
    const ready = await handleCharacterSourceAction({
      action: 'create-session',
      body: { filename: 'Goat_FINN.zip', byteSize: GOAT_SOURCE_SIZE_BYTES, sha256: GOAT_SOURCE_SHA256 },
      env: { VERCEL_ENV: 'preview', DATABASE_URL: 'postgres://preview' },
      publicPreview: false,
      storage: new ConnectionReadyMultipartStorage(),
    });
    expect(ready.connectionReadyOnly).toBe(true);
    await expect(
      handleCharacterSourceAction({
        action: 'create-session',
        body: { filename: 'Goat_FINN.zip', byteSize: GOAT_SOURCE_SIZE_BYTES, sha256: GOAT_SOURCE_SHA256 },
        env: { ...configuredEnv, VERCEL_ENV: 'production' },
        publicPreview: false,
        storage: fakeStorage(),
      }),
    ).rejects.toMatchObject({ code: 'PRODUCTION_INTAKE_REFUSED' });
  });

  it('does not treat an empty receipt as uploaded', () => {
    const receipt = emptyGoatSourceReceipt(false);
    expect(receipt.sourceLocked).toBe(false);
    expect(operatorChecklist('NOT_UPLOADED').goatProductionMaster).toBe('LOCKED');
    expect(createHash('sha256').update('not-goat').digest('hex')).not.toBe(GOAT_SOURCE_SHA256);
  });

  it('keeps session part planning resumable after a failed part', () => {
    let session = createGoatUploadSession({
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    session = recordPartEtag(session, 1, '"one"');
    expect(remainingParts(session).length).toBeGreaterThan(0);
    expect(resumeGuidance(session).resumable).toBe(true);
  });

  it('rediscovers a size-matching R2 object after the in-memory lock is lost', async () => {
    const memory = new MemoryMultipartStorage();
    await memory.putObject(GOAT_SOURCE_OBJECT_KEY, new Uint8Array(GOAT_SOURCE_SIZE_BYTES));
    await persistGoatSourceReceipt(
      buildGoatSourceReceipt({
        sourceSha256: GOAT_SOURCE_SHA256,
        sourceSize: GOAT_SOURCE_SIZE_BYTES,
        hashVerified: true,
        zipIntegrityVerified: true,
        sourceLocked: true,
        bucketConfigured: true,
      }),
      memory,
    );
    resetCharacterSourceStore();
    const status = await act('status', {}, { storage: memory });
    const receipt = status.receipt as { sourceLocked: boolean; objectKey: string; goatProductionReady: boolean };
    expect(receipt.sourceLocked).toBe(true);
    expect(receipt.objectKey).toBe(GOAT_SOURCE_OBJECT_KEY);
    expect(receipt.goatProductionReady).toBe(false);
    expect(status.state).toBe('SOURCE_LOCKED');
    const reused = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    }, { storage: memory });
    expect(reused.alreadyPresent).toBe(true);
  });

  it('refuses to start a new upload over a stored Goat object with the wrong size', async () => {
    const memory = new MemoryMultipartStorage();
    await memory.putObject(GOAT_SOURCE_OBJECT_KEY, new Uint8Array(12));
    await expect(
      act(
        'create-session',
        {
          filename: 'Goat_FINN.zip',
          byteSize: GOAT_SOURCE_SIZE_BYTES,
          sha256: GOAT_SOURCE_SHA256,
        },
        { storage: memory },
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_OVERWRITE_REFUSED' });
  });

  it('reloads a persisted multipart session after the in-memory store is cleared', async () => {
    const created = await act('create-session', {
      filename: 'Goat_FINN.zip',
      byteSize: GOAT_SOURCE_SIZE_BYTES,
      sha256: GOAT_SOURCE_SHA256,
    });
    const sessionId = (created.session as { sessionId: string }).sessionId;
    const memory = new MemoryMultipartStorage();
    const { getCharacterSourceStore } = await import('./tivvlejoy-character-source-intake/store');
    const session = getCharacterSourceStore().getSession(sessionId);
    expect(session).toBeTruthy();
    const { persistGoatUploadSession } = await import('./tivvlejoy-character-source-intake');
    await persistGoatUploadSession(session!, memory);
    resetCharacterSourceStore();
    const resumed = await act('resume', { sessionId, partNumber: 1, etag: '"etag-1"' }, { storage: memory });
    const resume = resumed.resume as { resumable: boolean; restartCompletedUpload: boolean; completedParts: number };
    expect(resume.resumable).toBe(true);
    expect(resume.restartCompletedUpload).toBe(false);
    expect(resume.completedParts).toBe(1);
  });

  it('runs the Python materialize dry-run without GPU', () => {
    const stdout = execFileSync(
      'python3',
      [path.resolve(__dirname, '../../../../scripts/blender/characters/materialize_source.py'), '--dry-run'],
      { encoding: 'utf8' },
    );
    expect(stdout).toContain('BLOCKED_REAL_EXECUTION_REQUIRED');
    expect(stdout).toContain('"paid": false');
    expect(stdout).toContain(GOAT_SOURCE_OBJECT_KEY);
  });

  it('reproduces the 35% session-open stall as a failed authorization, not a hang', () => {
    const failure = describeGoatSessionOpenFailure({
      httpStatus: 401,
      code: 'INTAKE_UNAUTHORIZED',
      error: 'Scenery asset intake mutations require the authorized TivvleJoy studio, not the public website preview.',
      tokenPresented: false,
    });
    expect(failure.phase).toBe('Failed');
    expect(failure.stoppedAfterHash).toBe(true);
    expect(failure.code).toBe('INTAKE_UNAUTHORIZED');
    expect(failure.error).toContain('INTAKE_UNAUTHORIZED');
    expect(failure.nextUserAction).toContain('Goat_FINN.zip');
  });

  it('requires the Preview studio token on public Preview and accepts the correct token', async () => {
    const previewEnv = {
      VERCEL_ENV: 'preview',
      TIVVLEJOY_SCENERY_INTAKE_TOKEN: 'preview-studio-token',
      R2_BUCKET: 'bucket',
      R2_ENDPOINT: 'https://example.invalid',
      R2_ACCESS_KEY_ID: 'id',
      R2_SECRET_ACCESS_KEY: 'secret',
    };
    await expect(
      handleCharacterSourceAction({
        action: 'create-session',
        body: { filename: 'Goat_FINN.zip', byteSize: GOAT_SOURCE_SIZE_BYTES, sha256: GOAT_SOURCE_SHA256 },
        env: previewEnv,
        publicPreview: true,
        storage: fakeStorage(),
      }),
    ).rejects.toMatchObject({ code: 'INTAKE_UNAUTHORIZED' });
    await expect(
      handleCharacterSourceAction({
        action: 'create-session',
        body: { filename: 'Goat_FINN.zip', byteSize: GOAT_SOURCE_SIZE_BYTES, sha256: GOAT_SOURCE_SHA256 },
        env: previewEnv,
        publicPreview: true,
        studioToken: 'wrong-token',
        storage: fakeStorage(),
      }),
    ).rejects.toMatchObject({ code: 'INTAKE_UNAUTHORIZED' });
    const authorized = await handleCharacterSourceAction({
      action: 'authorize',
      body: {},
      env: previewEnv,
      publicPreview: true,
      studioToken: 'preview-studio-token',
      storage: fakeStorage(),
    });
    expect(authorized.authorized).toBe(true);
    expect(authorized.sessionOpened).toBe(false);
    expect(authorized.bytesUploaded).toBe(0);
    expect(authorized.goatProductionReady).toBe(false);
    const opened = await handleCharacterSourceAction({
      action: 'create-session',
      body: { filename: 'Goat_FINN.zip', byteSize: GOAT_SOURCE_SIZE_BYTES, sha256: GOAT_SOURCE_SHA256 },
      env: previewEnv,
      publicPreview: true,
      studioToken: 'preview-studio-token',
      storage: fakeStorage(),
    });
    expect((opened.session as { sessionId: string }).sessionId).toMatch(/^goat-/);
    expect(opened.goatProductionReady).toBe(false);
    expect(JSON.stringify(opened)).not.toMatch(/preview-studio-token|R2_SECRET_ACCESS_KEY/);
  });

  it('does not commit Goat_FINN.zip and does not expose secrets in docs', () => {
    const gitignore = readFileSync(path.resolve(__dirname, '../../../../.gitignore'), 'utf8');
    expect(gitignore).toContain('Goat_FINN.zip');
    const doc = readFileSync(
      path.resolve(__dirname, '../../../../docs/TIVVLEJOY_GOAT_CHARACTER_SOURCE_INTAKE_AND_EXECUTION_BRIDGE_V1.md'),
      'utf8',
    );
    expect(doc).toContain(GOAT_SOURCE_OBJECT_KEY);
    expect(doc).toContain(GOAT_SOURCE_RECEIPT_OBJECT_KEY);
    expect(doc).toContain(GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_SCHEMA);
    expect(doc).toContain('FAIL_CLOSED');
    expect(doc).not.toMatch(/R2_SECRET_ACCESS_KEY=|sk_live_/);
    const preflightScript = readFileSync(
      path.resolve(__dirname, '../../scripts/goat-paid-execution-authorization-preflight.ts'),
      'utf8',
    );
    expect(preflightScript).not.toMatch(/ALLOW_PAID_GPU_LAUNCH\s*=\s*['"]true['"]/);
    expect(preflightScript).not.toMatch(/createPodForBenchmark/);
    expect(preflightScript).toContain('Creates no Pod');
  });
});

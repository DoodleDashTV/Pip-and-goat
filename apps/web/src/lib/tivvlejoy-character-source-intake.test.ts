import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import type { MultipartStoragePort } from './scenery/intake/multipart';
import { ConnectionReadyMultipartStorage } from './scenery/intake/multipart';
import { resetIntakeRateLimit } from './scenery/intake/access';
import {
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  buildGoatSourceReceipt,
  connectReceiptToCharacterPipeline,
  createGoatUploadSession,
  dryRunGoatSourceMaterialization,
  emptyGoatSourceReceipt,
  handleCharacterSourceAction,
  inspectGoatZipOrFail,
  operatorChecklist,
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
  return {
    async createMultipartUpload() {
      return { uploadId: 'up-1' };
    },
    async signPart(input) {
      return { url: `https://example.invalid/part/${input.partNumber}`, expiresAt: new Date().toISOString() };
    },
    async completeMultipartUpload() {
      return { size: GOAT_SOURCE_SIZE_BYTES };
    },
    async abortMultipartUpload() {},
    async headObject() {
      return { exists: true, size: GOAT_SOURCE_SIZE_BYTES };
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

  it('does not commit Goat_FINN.zip and does not expose secrets in docs', () => {
    const gitignore = readFileSync(path.resolve(__dirname, '../../../../.gitignore'), 'utf8');
    expect(gitignore).toContain('Goat_FINN.zip');
    const doc = readFileSync(
      path.resolve(__dirname, '../../../../docs/TIVVLEJOY_GOAT_CHARACTER_SOURCE_INTAKE_AND_EXECUTION_BRIDGE_V1.md'),
      'utf8',
    );
    expect(doc).toContain(GOAT_SOURCE_OBJECT_KEY);
    expect(doc).not.toMatch(/R2_SECRET_ACCESS_KEY=|sk_live_/);
  });
});

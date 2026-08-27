import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryMultipartStorage } from '@/lib/scenery/intake/multipart';
import {
  characterIntakeAuthorized,
  handleEp001RigDeliveryIntake,
  publicRigIntakeStatus,
} from './tivvlejoy-ep001-rig-delivery-intake';

const TOKEN = 'test-character-intake-token';
const ENV = { VERCEL_ENV: 'preview', TIVVLEJOY_CHARACTER_INTAKE_TOKEN: TOKEN };

function sha(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('EP001 rig delivery intake', () => {
  it('is Preview/token fail-closed and exposes only safe public status', async () => {
    expect(characterIntakeAuthorized({ token: TOKEN, env: ENV })).toBe(true);
    expect(characterIntakeAuthorized({ token: 'wrong', env: ENV })).toBe(false);
    expect(publicRigIntakeStatus(ENV)).toMatchObject({ previewRuntime: true, tokenConfigured: true, uploaded: false, approved: false, productionEnabled: false });
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: 'wrong', env: ENV, body: {} })).rejects.toThrow('RIG_INTAKE_UNAUTHORIZED');
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: { ...ENV, VERCEL_ENV: 'production' }, body: {} })).rejects.toThrow('RIG_INTAKE_PREVIEW_REQUIRED');
  });

  it('creates, signs, completes, hashes and idempotently receipts one immutable rig version', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = new TextEncoder().encode('synthetic rig bytes for intake contract test');
    const expectedSha = sha(bytes);
    const created = await handleEp001RigDeliveryIntake({
      action: 'create', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', originalFilename: 'Goat_Final.blend', byteSize: bytes.byteLength, sha256: expectedSha, artistVersionNote: 'Synthetic test delivery only' },
    });
    const versionId = String(created.body.versionId);
    expect(created.body).toMatchObject({ characterId: 'CHAR_GOAT_001', partCount: 1, uploaded: false, approved: false });

    const signed = await handleEp001RigDeliveryIntake({ action: 'sign-part', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_GOAT_001', versionId, partNumber: 1 } });
    expect(signed.body).toMatchObject({ action: 'sign-part', partNumber: 1, uploaded: false, approved: false });

    const uploadId = [...storage.uploads.keys()][0]!;
    const etag = await storage.putPart(uploadId, 1, bytes);
    const completed = await handleEp001RigDeliveryIntake({ action: 'complete', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_GOAT_001', versionId, parts: [{ partNumber: 1, etag }] } });
    expect(completed.body).toMatchObject({ characterId: 'CHAR_GOAT_001', sourceSha256: expectedSha, byteSize: bytes.byteLength, immutableOriginal: true, uploadVerified: true, technicalInspectionPassed: false, humanApproved: false, episodeAdmitted: false, productionEnabled: false, idempotent: false });

    const repeated = await handleEp001RigDeliveryIntake({ action: 'complete', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_GOAT_001', versionId, parts: [{ partNumber: 1, etag }] } });
    expect(repeated.body).toMatchObject({ sourceSha256: expectedSha, idempotent: true, humanApproved: false });
  });

  it('requires a supported extension, positive size, note and exact client SHA when supplied', async () => {
    const storage = new MemoryMultipartStorage();
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', originalFilename: 'Pip.exe', byteSize: 10, artistVersionNote: 'x' } })).rejects.toThrow('RIG_EXTENSION_INVALID');
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', originalFilename: 'Pip.blend', byteSize: 0, artistVersionNote: 'x' } })).rejects.toThrow('RIG_BYTE_SIZE_INVALID');
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', originalFilename: 'Pip.blend', byteSize: 10, artistVersionNote: '' } })).rejects.toThrow('RIG_ARTIST_VERSION_NOTE_REQUIRED');
    await expect(handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', originalFilename: 'Pip.blend', byteSize: 10, sha256: 'bad', artistVersionNote: 'x' } })).rejects.toThrow('RIG_SHA256_INVALID');
  });

  it('aborts unfinished sessions and never marks them received', async () => {
    const storage = new MemoryMultipartStorage();
    const created = await handleEp001RigDeliveryIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', originalFilename: 'Pip_Final.blend', byteSize: 10, artistVersionNote: 'Synthetic test delivery only' } });
    const versionId = String(created.body.versionId);
    const aborted = await handleEp001RigDeliveryIntake({ action: 'abort', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', versionId } });
    expect(aborted.body).toMatchObject({ aborted: true, approved: false });
    await expect(handleEp001RigDeliveryIntake({ action: 'sign-part', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', versionId, partNumber: 1 } })).rejects.toThrow('RIG_SESSION_ABORTED');
  });
});

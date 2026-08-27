import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryMultipartStorage } from '@/lib/scenery/intake/multipart';
import { compileEp001RigInspectionEvidenceSlots, validateRigEvidenceFilename } from './tivvlejoy-ep001-rig-inspection-evidence';
import { handleEp001RigEvidenceIntake, publicRigEvidenceIntakeStatus } from './tivvlejoy-ep001-rig-inspection-evidence-intake';

const TOKEN = 'test-character-intake-token';
const ENV = { VERCEL_ENV: 'preview', TIVVLEJOY_CHARACTER_INTAKE_TOKEN: TOKEN };
const VERSION = '11111111-1111-4111-8111-111111111111';
const RIG_SHA = createHash('sha256').update('rig-version').digest('hex');

describe('EP001 rig inspection evidence', () => {
  it('defines 12 required slots per character and never grants approval', () => {
    const contract = compileEp001RigInspectionEvidenceSlots();
    expect(contract.pip).toHaveLength(12);
    expect(contract.goat).toHaveLength(12);
    expect(contract.requiredCount).toBe(24);
    expect(contract).toMatchObject({ uploadDoesNotApprove: true, humanApprovalRequired: true, productionEnabled: false });
    expect(publicRigEvidenceIntakeStatus(ENV)).toMatchObject({ previewRuntime: true, tokenConfigured: true, requiredSlots: 24, approved: false, productionEnabled: false });
  });

  it('enforces slot-specific formats and character ownership', async () => {
    expect(validateRigEvidenceFilename({ slotId: 'PIP_WALK', filename: 'pip_walk.mp4' }).valid).toBe(true);
    expect(validateRigEvidenceFilename({ slotId: 'PIP_WALK', filename: 'pip_walk.exe' }).valid).toBe(false);
    const storage = new MemoryMultipartStorage();
    await expect(handleEp001RigEvidenceIntake({
      action: 'create', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: RIG_SHA, slotId: 'PIP_WALK', originalFilename: 'walk.mp4', byteSize: 20 },
    })).rejects.toThrow('RIG_EVIDENCE_SLOT_CHARACTER_MISMATCH');
  });

  it('uploads, hashes and binds evidence to one exact rig version without approval', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = new TextEncoder().encode('synthetic playblast bytes');
    const created = await handleEp001RigEvidenceIntake({
      action: 'create', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: RIG_SHA, slotId: 'PIP_WALK', originalFilename: 'pip_walk.mp4', byteSize: bytes.byteLength },
    });
    const evidenceId = String(created.body.evidenceId);
    const uploadId = [...storage.uploads.keys()][0]!;
    const etag = await storage.putPart(uploadId, 1, bytes);
    const completed = await handleEp001RigEvidenceIntake({
      action: 'complete', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: RIG_SHA, evidenceId, parts: [{ partNumber: 1, etag }] },
    });
    expect(completed.body).toMatchObject({
      rigVersionId: VERSION, rigSourceSha256: RIG_SHA, slotId: 'PIP_WALK',
      evidenceSha256: createHash('sha256').update(bytes).digest('hex'), immutableOriginal: true,
      uploadVerified: true, evidenceBoundToRigVersion: true, technicalInspectionPassed: false,
      humanApproved: false, episodeAdmitted: false, productionEnabled: false, idempotent: false,
    });
    const repeat = await handleEp001RigEvidenceIntake({
      action: 'complete', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: RIG_SHA, evidenceId, parts: [{ partNumber: 1, etag }] },
    });
    expect(repeat.body).toMatchObject({ idempotent: true, humanApproved: false });
  });

  it('rejects evidence when the rig hash binding changes', async () => {
    const storage = new MemoryMultipartStorage();
    const created = await handleEp001RigEvidenceIntake({
      action: 'create', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: RIG_SHA, slotId: 'GOAT_RUN', originalFilename: 'goat_run.mp4', byteSize: 10 },
    });
    await expect(handleEp001RigEvidenceIntake({
      action: 'sign-part', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: '0'.repeat(64), evidenceId: String(created.body.evidenceId), partNumber: 1 },
    })).rejects.toThrow('RIG_EVIDENCE_RIG_BINDING_MISMATCH');
  });

  it('fails closed outside Preview and with a wrong token', async () => {
    await expect(handleEp001RigEvidenceIntake({ action: 'create', token: 'wrong', env: ENV, body: {} })).rejects.toThrow('RIG_EVIDENCE_UNAUTHORIZED');
    await expect(handleEp001RigEvidenceIntake({ action: 'create', token: TOKEN, env: { ...ENV, VERCEL_ENV: 'production' }, body: {} })).rejects.toThrow('RIG_EVIDENCE_PREVIEW_REQUIRED');
  });
});

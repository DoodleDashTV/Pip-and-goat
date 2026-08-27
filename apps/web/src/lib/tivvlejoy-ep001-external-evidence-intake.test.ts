import { describe, expect, it } from 'vitest';
import { MemoryMultipartStorage } from '@/lib/scenery/intake/multipart';
import { evidenceIntakeAuthorized, handleEp001ExternalEvidenceIntake } from './tivvlejoy-ep001-external-evidence-intake';

const TOKEN = 'test-evidence-token';
const ENV = { VERCEL_ENV: 'preview', TIVVLEJOY_EVIDENCE_INTAKE_TOKEN: TOKEN };

describe('EP001 external evidence intake', () => {
  it('requires Preview and a separate evidence token', async () => {
    expect(evidenceIntakeAuthorized({ token: TOKEN, env: ENV })).toBe(true);
    expect(evidenceIntakeAuthorized({ token: 'wrong', env: ENV })).toBe(false);
    await expect(handleEp001ExternalEvidenceIntake({ action: 'create', token: 'wrong', env: ENV, body: {} })).rejects.toThrow('EVIDENCE_INTAKE_UNAUTHORIZED');
  });

  it('stores and hashes license evidence without verifying commercial rights', async () => {
    const storage = new MemoryMultipartStorage();
    const bytes = new TextEncoder().encode('synthetic purchase evidence fixture');
    const created = await handleEp001ExternalEvidenceIntake({
      action: 'create', token: TOKEN, env: ENV, storage,
      body: { sourceId: 'VILLAGE_FBX_V1', evidenceKind: 'PURCHASE_RECEIPT', productIdentity: 'Village Environment', originalFilename: 'receipt.pdf', byteSize: bytes.byteLength, note: 'synthetic test only' },
    });
    const evidenceId = String(created.body.evidenceId);
    const signed = await handleEp001ExternalEvidenceIntake({ action: 'sign-part', token: TOKEN, env: ENV, storage, body: { sourceId: 'VILLAGE_FBX_V1', evidenceId, partNumber: 1 } });
    expect(signed.body).toMatchObject({ partNumber: 1, admitted: false });
    const uploadId = [...storage.uploads.keys()][0]!;
    const etag = await storage.putPart(uploadId, 1, bytes);
    const completed = await handleEp001ExternalEvidenceIntake({ action: 'complete', token: TOKEN, env: ENV, storage, body: { sourceId: 'VILLAGE_FBX_V1', evidenceId, parts: [{ partNumber: 1, etag }] } });
    expect(completed.body).toMatchObject({ evidenceReceived: true, commercialUseVerified: false, humanReviewed: false, admittedForEp001: false, productionEnabled: false, idempotent: false });
    expect(String(completed.body.evidenceSha256)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unsafe or unsupported evidence', async () => {
    const storage = new MemoryMultipartStorage();
    await expect(handleEp001ExternalEvidenceIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { sourceId: 'bad source', evidenceKind: 'PURCHASE_RECEIPT', productIdentity: 'x', originalFilename: 'receipt.pdf', byteSize: 10 } })).rejects.toThrow('EVIDENCE_SOURCE_ID_INVALID');
    await expect(handleEp001ExternalEvidenceIntake({ action: 'create', token: TOKEN, env: ENV, storage, body: { sourceId: 'VILLAGE_FBX_V1', evidenceKind: 'PURCHASE_RECEIPT', productIdentity: 'x', originalFilename: 'malware.exe', byteSize: 10 } })).rejects.toThrow('EVIDENCE_EXTENSION_INVALID');
  });
});

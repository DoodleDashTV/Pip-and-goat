import { describe, expect, it } from 'vitest';
import { MemoryMultipartStorage } from '@/lib/scenery/intake/multipart';
import { compileEp001RigDeliveryLedger } from './tivvlejoy-ep001-rig-delivery-ledger';

async function putReceipt(storage: MemoryMultipartStorage, input: { characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001'; versionId: string; hash: string; receivedAt: string }) {
  const key = `tivvlejoy-assets/characters/${input.characterId}/rig-deliveries/${input.versionId}/receipt.json`;
  await storage.putObject(key, new TextEncoder().encode(JSON.stringify({
    schemaVersion: 'TIVVLEJOY_EP001_RIG_DELIVERY_RECEIPT_V1', episodeId: 'EP001', versionId: input.versionId,
    characterId: input.characterId, originalFilename: 'Final.blend', byteSize: 123, sourceSha256: input.hash,
    artistVersionNote: 'test', receivedAt: input.receivedAt, receiptSha256: 'r'.repeat(64), immutableOriginal: true,
    uploadVerified: true, technicalInspectionPassed: false, humanApproved: false, episodeAdmitted: false,
  })), 'application/json');
}

describe('EP001 rig delivery ledger', () => {
  it('is empty before corrected delivery receipts exist', async () => {
    const ledger = await compileEp001RigDeliveryLedger({ characterId: 'CHAR_PIP_001', storage: new MemoryMultipartStorage() });
    expect(ledger.state).toBe('NO_CORRECTED_DELIVERY_PRESENT');
    expect(ledger.metrics.verifiedDeliveryCount).toBe(0);
    expect(ledger.authority.canonicalVersionSelected).toBe(false);
  });

  it('preserves multiple versions and surfaces duplicate hashes without auto-selecting one', async () => {
    const storage = new MemoryMultipartStorage();
    const hash = 'a'.repeat(64);
    await putReceipt(storage, { characterId: 'CHAR_GOAT_001', versionId: '11111111-1111-1111-1111-111111111111', hash, receivedAt: '2026-08-27T12:00:00.000Z' });
    await putReceipt(storage, { characterId: 'CHAR_GOAT_001', versionId: '22222222-2222-2222-2222-222222222222', hash, receivedAt: '2026-08-27T13:00:00.000Z' });
    const ledger = await compileEp001RigDeliveryLedger({ characterId: 'CHAR_GOAT_001', storage });
    expect(ledger.metrics.verifiedDeliveryCount).toBe(2);
    expect(ledger.metrics.uniqueSourceHashCount).toBe(1);
    expect(ledger.metrics.duplicateHashGroupCount).toBe(1);
    expect(ledger.versions.map((item) => item.versionId)).toEqual(['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']);
    expect(ledger.authority.canonicalVersionSelected).toBe(false);
    expect(ledger.authority.humanApprovalGranted).toBe(false);
  });
});

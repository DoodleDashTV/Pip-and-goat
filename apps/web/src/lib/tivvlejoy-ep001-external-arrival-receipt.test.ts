import { describe, expect, it } from 'vitest';
import { compileEp001ExternalArrivalReceipt } from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

const SHA = 'b'.repeat(64);

describe('compileEp001ExternalArrivalReceipt', () => {
  it('creates a deterministic rig candidate receipt without granting authority', () => {
    const input = {
      arrivalType: 'RIG' as const,
      candidate: {
        characterId: 'CHAR_GOAT_001' as const,
        filename: 'Goat_Final.blend',
        byteSize: 298 * 1024 * 1024,
        sha256: SHA,
        artistVersionNote: 'Final artist delivery v1',
      },
    };
    const a = compileEp001ExternalArrivalReceipt(input);
    const b = compileEp001ExternalArrivalReceipt(input);
    expect(a.arrivalReceiptSha256).toBe(b.arrivalReceiptSha256);
    expect(a.receiptState).toBe('STRUCTURALLY_VALID_EXTERNAL_CANDIDATE');
    expect(a.authority.admissionGranted).toBe(false);
    expect(a.authority.arrivalObserved).toBe(false);
  });

  it('rejects invalid candidates before receipt creation', () => {
    expect(() => compileEp001ExternalArrivalReceipt({
      arrivalType: 'SCENERY_LICENSE',
      candidate: {
        sourceId: '',
        productIdentity: '',
        orderEvidenceRef: '',
        licenseTextOrGrant: '',
        evidenceSha256: 'bad',
      },
    })).toThrow('EXTERNAL_ARRIVAL_VALIDATION_FAILED');
  });

  it('keeps structurally valid paid authorization receipts non-executable', () => {
    const receipt = compileEp001ExternalArrivalReceipt({
      arrivalType: 'PAID_AUTHORIZATION',
      candidate: {
        authorizationId: 'AUTH-EP001-ONE-SHOT',
        scope: 'EP001_FINAL_RENDER',
        costCeilingUsd: 1,
        oneShot: true,
        authorizationReceiptSha256: SHA,
      },
    });
    expect(receipt.authority.paidExecutionAuthorized).toBe(false);
    expect(receipt.authority.productionWritesAllowed).toBe(false);
  });
});

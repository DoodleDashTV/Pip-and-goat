import { describe, expect, it } from 'vitest';
import { compileEp001ExternalArrivalBatchPlan } from '@/lib/tivvlejoy-ep001-external-arrival-batch-plan';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('compileEp001ExternalArrivalBatchPlan', () => {
  it('prepares Pip and Goat rig intake in parallel without granting authority', () => {
    const batch = compileEp001ExternalArrivalBatchPlan([
      {
        arrivalType: 'RIG',
        candidate: {
          characterId: 'CHAR_PIP_001',
          filename: 'Pip_Final.blend',
          byteSize: 298 * 1024 * 1024,
          sha256: SHA_A,
          artistVersionNote: 'Pip final artist delivery',
        },
      },
      {
        arrivalType: 'RIG',
        candidate: {
          characterId: 'CHAR_GOAT_001',
          filename: 'Goat_Final.blend',
          byteSize: 298 * 1024 * 1024,
          sha256: SHA_B,
          artistVersionNote: 'Goat final artist delivery',
        },
      },
    ]);
    expect(batch.metrics.inputCount).toBe(2);
    expect(batch.metrics.uniqueTriggerCount).toBe(2);
    expect(batch.metrics.safeActionCount).toBe(10);
    expect(batch.authority.admissionGranted).toBe(false);
    expect(batch.authority.paidExecutionAuthorized).toBe(false);
  });

  it('rejects duplicate trigger claims inside one batch', () => {
    expect(() => compileEp001ExternalArrivalBatchPlan([
      {
        arrivalType: 'RIG',
        candidate: {
          characterId: 'CHAR_PIP_001',
          filename: 'Pip_A.blend',
          byteSize: 1024 * 1024,
          sha256: SHA_A,
          artistVersionNote: 'fixture A',
        },
      },
      {
        arrivalType: 'RIG',
        candidate: {
          characterId: 'CHAR_PIP_001',
          filename: 'Pip_B.blend',
          byteSize: 1024 * 1024,
          sha256: SHA_B,
          artistVersionNote: 'fixture B',
        },
      },
    ])).toThrow('DUPLICATE_EP001_EXTERNAL_TRIGGER_IN_BATCH:PIP_RIG_ARRIVES');
  });

  it('rejects empty batches', () => {
    expect(() => compileEp001ExternalArrivalBatchPlan([])).toThrow('EP001_EXTERNAL_ARRIVAL_BATCH_EMPTY');
  });
});

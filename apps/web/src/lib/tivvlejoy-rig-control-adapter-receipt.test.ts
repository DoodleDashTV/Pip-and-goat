import { describe, expect, it } from 'vitest';
import { MemoryMultipartStorage } from '@/lib/scenery/intake/multipart';
import { canonicalControlsFor, type RigControlMapping } from './tivvlejoy-rig-control-adapter';
import { handleRigAdapterReceipt, publicRigAdapterReceiptStatus } from './tivvlejoy-rig-control-adapter-receipt';

const TOKEN = 'test-character-intake-token';
const ENV = { VERCEL_ENV: 'preview', TIVVLEJOY_CHARACTER_INTAKE_TOKEN: TOKEN };
const VERSION = '44444444-4444-4444-8444-444444444444';
const SHA = 'd'.repeat(64);

function completeMapping(characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001'): RigControlMapping {
  return {
    schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1',
    characterId,
    rigVersionId: VERSION,
    rigSourceSha256: SHA,
    mappings: Object.fromEntries(canonicalControlsFor(characterId).map((control, index) => [control.canonicalId, `${characterId.toLowerCase()}_ctrl_${index + 1}`])),
  };
}

describe('rig control adapter receipt', () => {
  it('is Preview/token fail-closed and reports zero approval authority', async () => {
    expect(publicRigAdapterReceiptStatus(ENV)).toMatchObject({ previewRuntime: true, tokenConfigured: true, persistedAdapters: 0, humanApproved: false, productionEnabled: false });
    await expect(handleRigAdapterReceipt({ action: 'save', token: 'wrong', env: ENV, body: {} })).rejects.toThrow('RIG_ADAPTER_RECEIPT_UNAUTHORIZED');
    await expect(handleRigAdapterReceipt({ action: 'save', token: TOKEN, env: { ...ENV, VERCEL_ENV: 'production' }, body: {} })).rejects.toThrow('RIG_ADAPTER_RECEIPT_PREVIEW_REQUIRED');
  });

  it('stores one structurally valid adapter immutably and idempotently', async () => {
    const storage = new MemoryMultipartStorage();
    const mapping = completeMapping('CHAR_GOAT_001');
    const saved = await handleRigAdapterReceipt({
      action: 'save', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, mapping },
    });
    expect(saved.body).toMatchObject({
      characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: SHA,
      structurallyValid: true, requiredControlCount: 18, mappedControlCount: 18,
      technicalInspectionPassed: false, humanApproved: false, productionEnabled: false, idempotent: false,
    });
    expect(String(saved.body.adapterSha256)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(saved.body.receiptSha256)).toMatch(/^[a-f0-9]{64}$/);

    const repeated = await handleRigAdapterReceipt({
      action: 'save', token: TOKEN, env: ENV, storage,
      body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, mapping },
    });
    expect(repeated.body).toMatchObject({ adapterSha256: saved.body.adapterSha256, idempotent: true, humanApproved: false });
  });

  it('refuses a different mapping for the same immutable rig version', async () => {
    const storage = new MemoryMultipartStorage();
    const mapping = completeMapping('CHAR_PIP_001');
    await handleRigAdapterReceipt({ action: 'save', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, mapping } });
    const changed = { ...mapping, mappings: { ...mapping.mappings, ROOT: 'different_root_control' } };
    await expect(handleRigAdapterReceipt({ action: 'save', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, mapping: changed } })).rejects.toThrow('RIG_ADAPTER_RECEIPT_IMMUTABLE_CONFLICT');
  });

  it('refuses incomplete mappings and cross-character/version binding mismatches', async () => {
    const storage = new MemoryMultipartStorage();
    const mapping = completeMapping('CHAR_GOAT_001');
    mapping.mappings.JAW = '';
    await expect(handleRigAdapterReceipt({ action: 'save', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, mapping } })).rejects.toThrow('RIG_ADAPTER_RECEIPT_MAPPING_INVALID');

    const valid = completeMapping('CHAR_GOAT_001');
    await expect(handleRigAdapterReceipt({ action: 'save', token: TOKEN, env: ENV, storage, body: { characterId: 'CHAR_PIP_001', rigVersionId: VERSION, mapping: valid } })).rejects.toThrow('RIG_ADAPTER_RECEIPT_MAPPING_BINDING_INVALID');
  });
});

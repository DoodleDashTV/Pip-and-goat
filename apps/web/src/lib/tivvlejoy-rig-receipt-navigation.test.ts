import { describe, expect, it } from 'vitest';
import { parseRigNavigationBinding, rigNavigationQuery } from './tivvlejoy-rig-receipt-navigation';

describe('rig receipt navigation binding', () => {
  const binding = {
    characterId: 'CHAR_PIP_001' as const,
    rigVersionId: '11111111-2222-3333-4444-555555555555',
    rigSourceSha256: 'a'.repeat(64),
    rigReceiptSha256: 'b'.repeat(64),
  };

  it('round-trips exact immutable receipt identity', () => {
    const query = rigNavigationQuery(binding);
    const params = Object.fromEntries(new URLSearchParams(query).entries());
    expect(parseRigNavigationBinding(params)).toEqual(binding);
  });

  it('rejects malformed or unknown bindings', () => {
    expect(parseRigNavigationBinding({ ...binding, characterId: 'CHAR_FAKE_001' })).toBeNull();
    expect(parseRigNavigationBinding({ ...binding, rigVersionId: 'bad' })).toBeNull();
    expect(parseRigNavigationBinding({ ...binding, rigSourceSha256: 'bad' })).toBeNull();
    expect(parseRigNavigationBinding({ ...binding, rigReceiptSha256: 'bad' })).toBeNull();
  });

  it('allows receipt hash omission without inventing one', () => {
    const parsed = parseRigNavigationBinding({ characterId: 'CHAR_GOAT_001', rigVersionId: binding.rigVersionId, rigSourceSha256: 'c'.repeat(64) });
    expect(parsed).toEqual({ characterId: 'CHAR_GOAT_001', rigVersionId: binding.rigVersionId, rigSourceSha256: 'c'.repeat(64), rigReceiptSha256: '' });
  });
});

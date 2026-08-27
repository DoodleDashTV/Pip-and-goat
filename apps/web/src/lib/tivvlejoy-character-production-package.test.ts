import { describe, expect, it } from 'vitest';
import { compileCharacterProductionPackage } from './tivvlejoy-character-production-package';

const base = {
  rigVersionId: '11111111-2222-3333-4444-555555555555',
  canonicalBlendSha256: 'a'.repeat(64),
  canonicalBlendByteSize: 123456789,
  rigReceiptSha256: 'b'.repeat(64),
  adapterSha256: 'c'.repeat(64),
  adapterReceiptSha256: 'd'.repeat(64),
  validationJobSha256: 'e'.repeat(64),
  validationResultSha256: 'f'.repeat(64),
  inspectionEvidenceBundleSha256: '1'.repeat(64),
  humanApprovalReceiptSha256: '2'.repeat(64),
  companions: [
    { kind: 'FBX' as const, sha256: '3'.repeat(64), byteSize: 100, filename: 'character.fbx' },
    { kind: 'GLB' as const, sha256: '4'.repeat(64), byteSize: 100, filename: 'character.glb' },
    { kind: 'RIG_README' as const, sha256: '5'.repeat(64), byteSize: 100, filename: 'RIG_README.pdf' },
  ],
};

describe('character production package', () => {
  it('compiles an immutable candidate without performing registry writes', () => {
    const result = compileCharacterProductionPackage({ characterId: 'CHAR_PIP_001', ...base });
    expect(result.structurallyComplete).toBe(true);
    expect(result.registryCandidate?.state).toBe('CANDIDATE_READY_FOR_EXPLICIT_ADMISSION');
    expect(result.packageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.authority.registryWritePerformed).toBe(false);
    expect(result.authority.episodeAdmissionGranted).toBe(false);
  });

  it('requires FBX, GLB and rig README companion identities', () => {
    const result = compileCharacterProductionPackage({ characterId: 'CHAR_GOAT_001', ...base, companions: base.companions.filter((item) => item.kind !== 'GLB') });
    expect(result.structurallyComplete).toBe(false);
    expect(result.errors).toContain('CHARACTER_PACKAGE_REQUIRED_COMPANION_MISSING:GLB');
  });

  it('rejects malformed approval or source identities', () => {
    const result = compileCharacterProductionPackage({ characterId: 'CHAR_PIP_001', ...base, humanApprovalReceiptSha256: 'bad' });
    expect(result.structurallyComplete).toBe(false);
    expect(result.registryCandidate).toBeNull();
    expect(result.authority.productionEnabled).toBe(false);
  });
});

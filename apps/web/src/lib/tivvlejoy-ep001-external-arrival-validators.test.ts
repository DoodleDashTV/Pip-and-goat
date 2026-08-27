import { describe, expect, it } from 'vitest';
import {
  validatePaidAuthorizationArrival,
  validateRigArrival,
  validateSceneryLicenseArrival,
} from '@/lib/tivvlejoy-ep001-external-arrival-validators';

const SHA = 'a'.repeat(64);

describe('EP001 external arrival validators', () => {
  it('accepts structurally valid canonical rig metadata without granting authority', () => {
    const result = validateRigArrival({
      characterId: 'CHAR_PIP_001',
      filename: 'Pip_v12.blend',
      byteSize: 298 * 1024 * 1024,
      sha256: SHA,
      artistVersionNote: 'Michael final retopo/rig v12',
    });
    expect(result).toEqual({ valid: true, errors: [], authorityGranted: false, persisted: false });
  });

  it('rejects oversized or non-canonical rig candidates', () => {
    const result = validateRigArrival({
      characterId: 'CHAR_GOAT_001',
      filename: 'Goat.fbx',
      byteSize: 385 * 1024 * 1024,
      sha256: 'bad',
      artistVersionNote: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('CANONICAL_BLEND_REQUIRED');
    expect(result.errors).toContain('RIG_EXCEEDS_384_MIB_LIMIT');
    expect(result.errors).toContain('INVALID_RIG_SHA256');
  });

  it('requires concrete scenery purchase/license evidence', () => {
    const result = validateSceneryLicenseArrival({
      sourceId: 'VILLAGE_BLEND_402_V1',
      productIdentity: 'Village Pack',
      orderEvidenceRef: 'ORDER-123',
      licenseTextOrGrant: 'Commercial project use granted.',
      evidenceSha256: SHA,
    });
    expect(result.valid).toBe(true);
    expect(result.authorityGranted).toBe(false);
  });

  it('requires positive paid scope plus future expiry or one-shot constraint', () => {
    const result = validatePaidAuthorizationArrival(
      {
        authorizationId: 'AUTH-EP001-VOICE-01',
        scope: 'EP001_VOICE_GENERATION',
        costCeilingUsd: 1,
        expiresAtIso: '2030-01-01T00:00:00.000Z',
        authorizationReceiptSha256: SHA,
      },
      new Date('2026-08-27T00:00:00.000Z'),
    );
    expect(result.valid).toBe(true);
    expect(result.authorityGranted).toBe(false);
  });

  it('fails closed on an expired paid authorization', () => {
    const result = validatePaidAuthorizationArrival(
      {
        authorizationId: 'AUTH-OLD',
        scope: 'EP001_FINAL_RENDER',
        costCeilingUsd: 1,
        expiresAtIso: '2026-01-01T00:00:00.000Z',
        authorizationReceiptSha256: SHA,
      },
      new Date('2026-08-27T00:00:00.000Z'),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('FUTURE_EXPIRY_OR_ONE_SHOT_REQUIRED');
  });
});

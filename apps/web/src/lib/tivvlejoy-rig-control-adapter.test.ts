import { describe, expect, it } from 'vitest';
import { canonicalControlsFor, emptyRigControlMapping, validateRigControlMapping } from './tivvlejoy-rig-control-adapter';

const VERSION = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);

describe('TivvleJoy rig control adapter', () => {
  it('locks the expected canonical control counts', () => {
    expect(canonicalControlsFor('CHAR_PIP_001')).toHaveLength(25);
    expect(canonicalControlsFor('CHAR_GOAT_001')).toHaveLength(18);
  });

  it('fails when required controls are missing', () => {
    const result = validateRigControlMapping({ ...emptyRigControlMapping('CHAR_PIP_001'), rigVersionId: VERSION, rigSourceSha256: SHA });
    expect(result.valid).toBe(false);
    expect(result.mappedControlCount).toBe(0);
    expect(result.errors).toContain('RIG_ADAPTER_REQUIRED_CONTROL_MISSING:ROOT');
    expect(result).toMatchObject({ technicalInspectionPassed: false, humanApproved: false, productionEnabled: false });
  });

  it('accepts a complete one-to-one mapping but grants no rig approval', () => {
    const controls = canonicalControlsFor('CHAR_GOAT_001');
    const mappings = Object.fromEntries(controls.map((control, index) => [control.canonicalId, `artist_ctrl_${index + 1}`]));
    const result = validateRigControlMapping({ schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1', characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: SHA, mappings });
    expect(result).toMatchObject({ valid: true, requiredControlCount: 18, mappedControlCount: 18, technicalInspectionPassed: false, humanApproved: false, productionEnabled: false });
    expect(result.adapterSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate artist controls and unknown canonical roles', () => {
    const controls = canonicalControlsFor('CHAR_GOAT_001');
    const mappings = Object.fromEntries(controls.map((control) => [control.canonicalId, `artist_${control.canonicalId}`]));
    mappings.HEAD = mappings.NECK;
    mappings.UNKNOWN = 'bad';
    const result = validateRigControlMapping({ schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1', characterId: 'CHAR_GOAT_001', rigVersionId: VERSION, rigSourceSha256: SHA, mappings });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('RIG_ADAPTER_DUPLICATE_TARGET:'))).toBe(true);
    expect(result.errors).toContain('RIG_ADAPTER_UNKNOWN_CANONICAL_CONTROL:UNKNOWN');
  });

  it('binds adapter identity to rig version and source hash', () => {
    const controls = canonicalControlsFor('CHAR_PIP_001');
    const mappings = Object.fromEntries(controls.map((control) => [control.canonicalId, `pip_${control.canonicalId}`]));
    const first = validateRigControlMapping({ schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1', characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: SHA, mappings });
    const second = validateRigControlMapping({ schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1', characterId: 'CHAR_PIP_001', rigVersionId: VERSION, rigSourceSha256: 'b'.repeat(64), mappings });
    expect(first.adapterSha256).not.toBe(second.adapterSha256);
  });
});

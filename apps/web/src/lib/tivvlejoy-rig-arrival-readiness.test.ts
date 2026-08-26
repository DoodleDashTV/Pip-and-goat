import { describe, expect, it } from 'vitest';
import {
  admitRigMetadata,
  advanceRigArrival,
  playSyntheticRigArrival,
  syntheticRigCannotReachApproval,
  currentRigReadiness,
  RIG_MAX_BYTES,
} from './tivvlejoy-real-input-convergence';

describe('TIVVLEJOY_REAL_RIG_ARRIVAL_READINESS_V1', () => {
  it('reports both production rigs as not present', () => {
    const readiness = currentRigReadiness();
    expect(readiness.pip.sourcePresent).toBe(false);
    expect(readiness.goat.sourcePresent).toBe(false);
    expect(readiness.pipStatus).toBe('NOT_PRESENT');
    expect(readiness.goatStatus).toBe('NOT_PRESENT');
  });

  it('proves the synthetic arrival playbook and never auto-approves', () => {
    const rows = playSyntheticRigArrival('PIP');
    expect(rows.map((row) => row.state)).toEqual([
      'STORED',
      'HASH_VERIFIED',
      'INSPECTION_REQUIRED',
      'CAPABILITY_CHECK',
      'VISUAL_REVIEW',
      'HUMAN_APPROVAL_REQUIRED',
    ]);
    expect(syntheticRigCannotReachApproval(rows)).toBe(true);
    expect(rows.every((row) => row.autoApproved === false)).toBe(true);
    expect(rows.every((row) => row.evidenceClass === 'SYNTHETIC_FIXTURE')).toBe(true);
  });

  it('rejects unsafe intake metadata', () => {
    expect(admitRigMetadata({
      characterId: 'GOAT',
      byteSize: 10,
      extension: '.exe',
      sha256: 'ab'.repeat(32),
      evidenceClass: 'SYNTHETIC_FIXTURE',
    }).blocker).toBe('RIG_EXTENSION_REJECTED');
    expect(admitRigMetadata({
      characterId: 'GOAT',
      byteSize: 12,
      extension: '.blend',
      sha256: 'ab'.repeat(32),
      evidenceClass: 'SYNTHETIC_FIXTURE',
    }).blocker).toBe('RIG_TOO_SMALL');
    const stored = admitRigMetadata({
      characterId: 'GOAT',
      byteSize: 4096,
      extension: '.blend',
      sha256: 'cd'.repeat(32),
      evidenceClass: 'SYNTHETIC_FIXTURE',
    });
    expect(advanceRigArrival(stored, 'VISUAL_REVIEW').blocker).toMatch(/INVALID_RIG_TRANSITION/);
  });

  it('admits the verified Goat working-blend size while preserving a hard upper bound', () => {
    const verifiedGoatWorkingBlendBytes = 298_161_606;
    const knownGood = admitRigMetadata({
      characterId: 'GOAT',
      byteSize: verifiedGoatWorkingBlendBytes,
      extension: '.blend',
      sha256: 'ab'.repeat(32),
      evidenceClass: 'REAL_RIG_INTAKE',
    });
    const exactCeiling = admitRigMetadata({
      characterId: 'GOAT',
      byteSize: RIG_MAX_BYTES,
      extension: '.blend',
      sha256: 'bc'.repeat(32),
      evidenceClass: 'REAL_RIG_INTAKE',
    });
    const overCeiling = admitRigMetadata({
      characterId: 'GOAT',
      byteSize: RIG_MAX_BYTES + 1,
      extension: '.blend',
      sha256: 'cd'.repeat(32),
      evidenceClass: 'REAL_RIG_INTAKE',
    });
    const oversizedGlb = admitRigMetadata({
      characterId: 'GOAT',
      byteSize: 300 * 1024 * 1024,
      extension: '.glb',
      sha256: 'de'.repeat(32),
      evidenceClass: 'REAL_RIG_INTAKE',
    });

    expect(RIG_MAX_BYTES).toBe(384 * 1024 * 1024);
    expect(knownGood).toMatchObject({ state: 'STORED', blocker: null });
    expect(exactCeiling).toMatchObject({ state: 'STORED', blocker: null });
    expect(overCeiling.blocker).toBe('RIG_TOO_LARGE');
    expect(oversizedGlb.blocker).toBe('RIG_TOO_LARGE');
    expect(knownGood.autoApproved).toBe(false);
  });
});

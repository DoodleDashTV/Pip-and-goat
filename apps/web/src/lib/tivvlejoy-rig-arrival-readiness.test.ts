import { describe, expect, it } from 'vitest';
import {
  admitRigMetadata,
  advanceRigArrival,
  playSyntheticRigArrival,
  syntheticRigCannotReachApproval,
  currentRigReadiness,
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
});

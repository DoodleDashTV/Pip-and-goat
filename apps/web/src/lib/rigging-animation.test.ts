import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRiggingGates, RIGGING_GATES, type RiggingCharacterEvidence } from './rigging-animation-gates';

const repoRoot = path.resolve(__dirname, '../../../..');
const validationPath = path.join(repoRoot, 'artifacts/performance/rigging-audit/validation.json');
const auditPath = path.join(repoRoot, 'artifacts/performance/rigging-audit/rigging-animation-audit.json');

function unboundQuaternionCharacter(overrides: Partial<RiggingCharacterEvidence> = {}): RiggingCharacterEvidence {
  return {
    weightedVerts: 0,
    hasArmatureModifier: true,
    poseModes: ['QUATERNION'],
    motion: {
      maxVertexDelta: 0,
      boneWorldDelta: 0,
      modeMismatchEulerOnQuaternionBones: true,
      eulerMaxDelta: 0.5,
      actionFound: true,
    },
    ...overrides,
  };
}

function repairedCharacter(overrides: Partial<RiggingCharacterEvidence> = {}): RiggingCharacterEvidence {
  return {
    weightedVerts: 1000,
    hasArmatureModifier: true,
    poseModes: ['XYZ'],
    motion: {
      maxVertexDelta: 0.07,
      boneWorldDelta: 0.04,
      modeMismatchEulerOnQuaternionBones: false,
      eulerMaxDelta: 0.5,
      actionFound: true,
    },
    ...overrides,
  };
}

describe('rigging animation fail-closed gates', () => {
  it('exposes the required gate names', () => {
    expect(RIGGING_GATES).toEqual([
      'RIG_BINDING_VALID',
      'PIP_MOTION_VALID',
      'GOAT_MOTION_VALID',
      'ANIMATION_CHANNELS_VALID',
    ]);
  });

  it('FAILS on pre-repair evidence (unbound + quaternion/euler mismatch)', () => {
    const result = evaluateRiggingGates({
      pip: unboundQuaternionCharacter({
        motion: {
          maxVertexDelta: 0,
          boneWorldDelta: 0,
          modeMismatchEulerOnQuaternionBones: true,
          eulerMaxDelta: 0,
          actionFound: true,
        },
      }),
      goat: unboundQuaternionCharacter(),
      cameraMotionCountedAsCharacterMotion: false,
    });
    expect(result.status).toBe('FAIL');
    expect(result.checks.RIG_BINDING_VALID).toBe(false);
    expect(result.checks.PIP_MOTION_VALID).toBe(false);
    expect(result.checks.GOAT_MOTION_VALID).toBe(false);
    expect(result.checks.ANIMATION_CHANNELS_VALID).toBe(false);
  });

  it('never treats camera motion as character motion', () => {
    const result = evaluateRiggingGates({
      pip: repairedCharacter(),
      goat: repairedCharacter(),
      cameraMotionCountedAsCharacterMotion: true,
    });
    expect(result.status).toBe('FAIL');
    expect(result.failed).toEqual([...RIGGING_GATES]);
  });

  it('PASSES only when binding, channels, and real mesh/bone motion are present', () => {
    const result = evaluateRiggingGates({
      pip: repairedCharacter(),
      goat: repairedCharacter(),
      cameraMotionCountedAsCharacterMotion: false,
    });
    expect(result.status).toBe('PASS');
    for (const gate of RIGGING_GATES) {
      expect(result.checks[gate]).toBe(true);
    }
  });

  it('reads committed Blender validation evidence when present', () => {
    expect(existsSync(validationPath)).toBe(true);
    expect(existsSync(auditPath)).toBe(true);
    const validation = JSON.parse(readFileSync(validationPath, 'utf8')) as {
      status: string;
      checks: Record<string, boolean>;
      cameraMotionCountedAsCharacterMotion: boolean;
      sampleFrames: number[];
    };
    expect(validation.status).toBe('PASS');
    expect(validation.cameraMotionCountedAsCharacterMotion).toBe(false);
    expect(validation.sampleFrames).toEqual([1, 10, 20, 30]);
    for (const gate of RIGGING_GATES) {
      expect(validation.checks[gate]).toBe(true);
    }

    const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as {
      assets: Record<string, { motion: { maxVertexDelta: number; boneWorldDelta: number }; checks: Record<string, boolean> }>;
    };
    expect(audit.assets.pip.motion.maxVertexDelta).toBeGreaterThanOrEqual(0.02);
    expect(audit.assets.goat.motion.maxVertexDelta).toBeGreaterThanOrEqual(0.02);
    expect(audit.assets.pip.checks.PIP_MOTION_VALID).toBe(true);
    expect(audit.assets.goat.checks.GOAT_MOTION_VALID).toBe(true);
  });
});

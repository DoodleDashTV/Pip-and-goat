/**
 * Fail-closed Pip/Goat rigging + animation gate evaluation.
 * Camera motion must never satisfy character-motion gates.
 */

export const RIGGING_GATES = [
  'RIG_BINDING_VALID',
  'PIP_MOTION_VALID',
  'GOAT_MOTION_VALID',
  'ANIMATION_CHANNELS_VALID',
] as const;

export type RiggingGate = (typeof RIGGING_GATES)[number];

export type RiggingMotionEvidence = {
  maxVertexDelta: number;
  boneWorldDelta: number;
  modeMismatchEulerOnQuaternionBones: boolean;
  eulerMaxDelta: number;
  actionFound: boolean;
};

export type RiggingCharacterEvidence = {
  weightedVerts: number;
  hasArmatureModifier: boolean;
  poseModes: string[];
  motion: RiggingMotionEvidence;
};

export type RiggingGateInput = {
  pip: RiggingCharacterEvidence;
  goat: RiggingCharacterEvidence;
  cameraMotionCountedAsCharacterMotion: boolean;
  meshMotionMin?: number;
  boneMotionMin?: number;
};

export type RiggingGateResult = {
  checks: Record<RiggingGate, boolean>;
  status: 'PASS' | 'FAIL';
  failed: RiggingGate[];
};

const DEFAULT_MESH_MOTION_MIN = 0.02;
const DEFAULT_BONE_MOTION_MIN = 0.015;

function characterMotionValid(c: RiggingCharacterEvidence, meshMin: number, boneMin: number): boolean {
  return (
    c.hasArmatureModifier &&
    c.weightedVerts > 0 &&
    !c.motion.modeMismatchEulerOnQuaternionBones &&
    c.motion.actionFound &&
    c.motion.maxVertexDelta >= meshMin &&
    c.motion.boneWorldDelta >= boneMin
  );
}

function channelsValid(c: RiggingCharacterEvidence, boneMin: number): boolean {
  const eulerOk = c.poseModes.includes('XYZ') && c.motion.eulerMaxDelta > 1e-4;
  return (
    c.motion.actionFound &&
    !c.motion.modeMismatchEulerOnQuaternionBones &&
    eulerOk &&
    c.motion.boneWorldDelta >= boneMin
  );
}

export function evaluateRiggingGates(input: RiggingGateInput): RiggingGateResult {
  const meshMin = input.meshMotionMin ?? DEFAULT_MESH_MOTION_MIN;
  const boneMin = input.boneMotionMin ?? DEFAULT_BONE_MOTION_MIN;

  // Hard fail-closed: camera motion can never substitute for character motion.
  if (input.cameraMotionCountedAsCharacterMotion) {
    const checks = {
      RIG_BINDING_VALID: false,
      PIP_MOTION_VALID: false,
      GOAT_MOTION_VALID: false,
      ANIMATION_CHANNELS_VALID: false,
    } satisfies Record<RiggingGate, boolean>;
    return { checks, status: 'FAIL', failed: [...RIGGING_GATES] };
  }

  const checks: Record<RiggingGate, boolean> = {
    RIG_BINDING_VALID:
      input.pip.hasArmatureModifier &&
      input.pip.weightedVerts > 0 &&
      input.goat.hasArmatureModifier &&
      input.goat.weightedVerts > 0,
    PIP_MOTION_VALID: characterMotionValid(input.pip, meshMin, boneMin),
    GOAT_MOTION_VALID: characterMotionValid(input.goat, meshMin, boneMin),
    ANIMATION_CHANNELS_VALID: channelsValid(input.pip, boneMin) && channelsValid(input.goat, boneMin),
  };
  const failed = RIGGING_GATES.filter((g) => !checks[g]);
  return { checks, status: failed.length ? 'FAIL' : 'PASS', failed };
}

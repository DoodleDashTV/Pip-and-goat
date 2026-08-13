import type { CharacterMotionEvidence, CameraMotionEvidence, FCurveEvidence } from './types';

/** Character motion must exceed this to count as real animation (not noise). */
export const CHARACTER_MOTION_EPSILON = 1e-4;

/** Camera motion alone is never character animation. */
export function hasCameraMotion(camera: CameraMotionEvidence): boolean {
  return camera.transformDelta > CHARACTER_MOTION_EPSILON || camera.channelRange > CHARACTER_MOTION_EPSILON;
}

/**
 * True character motion: root/bone/shape-key change on the character itself.
 * Camera deltas are intentionally ignored here.
 */
export function hasCharacterMotion(motion: CharacterMotionEvidence): boolean {
  return (
    motion.rootTransformDelta > CHARACTER_MOTION_EPSILON ||
    motion.boneChannelRange > CHARACTER_MOTION_EPSILON ||
    motion.shapeKeyRange > CHARACTER_MOTION_EPSILON
  );
}

export function isConstantFCurve(curve: FCurveEvidence): boolean {
  return curve.keyframeCount > 0 && curve.valueRange <= CHARACTER_MOTION_EPSILON;
}

export function hasRotationModeMismatch(curve: FCurveEvidence): boolean {
  if (!curve.rotationMode || !curve.keyedRotationMode) return false;
  const eulerModes = new Set(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX']);
  const a = curve.rotationMode;
  const b = curve.keyedRotationMode;
  if (a === b) return false;
  // Quaternion keyed while object is Euler (or vice versa) is incompatible.
  if (a === 'QUATERNION' || b === 'QUATERNION') return true;
  if (a === 'AXIS_ANGLE' || b === 'AXIS_ANGLE') return true;
  // Different Euler orders are also treated as mismatch for production safety.
  if (eulerModes.has(a) && eulerModes.has(b) && a !== b) return true;
  return false;
}

export function hasKeyedButUnevaluated(curve: FCurveEvidence): boolean {
  if (curve.keyframeCount <= 0) return false;
  if (curve.muted) return true;
  if (curve.evaluated === false) return true;
  return false;
}

export function summarizeChannelIssues(curves: FCurveEvidence[] | undefined): string[] {
  if (!curves?.length) return [];
  const issues: string[] = [];
  for (const curve of curves) {
    if (isConstantFCurve(curve) && curve.dataPath.includes('pose.bones')) {
      issues.push(`constant f-curve: ${curve.dataPath}`);
    }
    if (hasRotationModeMismatch(curve)) {
      issues.push(
        `rotation mode mismatch on ${curve.dataPath}: object=${curve.rotationMode} keyed=${curve.keyedRotationMode}`,
      );
    }
    if (hasKeyedButUnevaluated(curve)) {
      issues.push(`keyed-but-unevaluated: ${curve.dataPath}`);
    }
  }
  return issues;
}

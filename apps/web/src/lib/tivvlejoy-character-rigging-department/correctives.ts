export const CORRECTIVE_CANDIDATES = [
  'shoulder_pinch',
  'elbow_pinch',
  'wrist_collapse',
  'hip_collapse',
  'knee_collapse',
  'ankle_fold',
  'neck_volume',
  'jaw_open_volume',
  'eyelid_intersection',
  'mouth_corner_tear',
] as const;

export type CorrectiveCandidate = (typeof CORRECTIVE_CANDIDATES)[number];

export type CorrectivePlan = {
  candidate: CorrectiveCandidate;
  method: 'SHAPE_KEY' | 'WEIGHT_FIRST';
  createOnlyIfWeightsCannotFix: true;
  state: 'BLOCKED_REAL_EXECUTION_REQUIRED';
};

export function planCorrectiveDeformation(): readonly CorrectivePlan[] {
  return CORRECTIVE_CANDIDATES.map((candidate) => ({
    candidate,
    method: 'WEIGHT_FIRST' as const,
    createOnlyIfWeightsCannotFix: true as const,
    state: 'BLOCKED_REAL_EXECUTION_REQUIRED' as const,
  }));
}

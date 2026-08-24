export type VertexInfluences = {
  vertexIndex: number;
  weights: readonly { group: string; value: number }[];
  side?: 'L' | 'R' | 'C';
};

export type WeightDiagnostic = {
  code:
    | 'UNWEIGHTED_VERTEX'
    | 'NON_NORMALIZED'
    | 'EXCESSIVE_INFLUENCES'
    | 'WRONG_SIDE_CONTAMINATION'
    | 'COLLAPSING_JOINT'
    | 'OK';
  vertexIndex?: number;
  detail: string;
};

export const MAX_INFLUENCES = 4;
export const NORMALIZE_EPSILON = 0.02;

export function diagnoseVertexWeights(vertices: readonly VertexInfluences[]): WeightDiagnostic[] {
  const findings: WeightDiagnostic[] = [];
  for (const vertex of vertices) {
    const total = vertex.weights.reduce((sum, item) => sum + item.value, 0);
    if (vertex.weights.length === 0 || total <= 1e-4) {
      findings.push({ code: 'UNWEIGHTED_VERTEX', vertexIndex: vertex.vertexIndex, detail: 'Vertex has no usable weight.' });
      continue;
    }
    if (Math.abs(total - 1) > NORMALIZE_EPSILON) {
      findings.push({
        code: 'NON_NORMALIZED',
        vertexIndex: vertex.vertexIndex,
        detail: `Weight total ${total.toFixed(3)} is outside normalize epsilon.`,
      });
    }
    if (vertex.weights.filter((item) => item.value > 0.02).length > MAX_INFLUENCES) {
      findings.push({
        code: 'EXCESSIVE_INFLUENCES',
        vertexIndex: vertex.vertexIndex,
        detail: `More than ${MAX_INFLUENCES} meaningful influences.`,
      });
    }
    if (vertex.side === 'L' && vertex.weights.some((item) => /\.R$|_R$|Right/i.test(item.group) && item.value > 0.15)) {
      findings.push({
        code: 'WRONG_SIDE_CONTAMINATION',
        vertexIndex: vertex.vertexIndex,
        detail: 'Left-side vertex is weighted to a right-side group.',
      });
    }
    if (vertex.side === 'R' && vertex.weights.some((item) => /\.L$|_L$|Left/i.test(item.group) && item.value > 0.15)) {
      findings.push({
        code: 'WRONG_SIDE_CONTAMINATION',
        vertexIndex: vertex.vertexIndex,
        detail: 'Right-side vertex is weighted to a left-side group.',
      });
    }
  }
  return findings.length ? findings : [{ code: 'OK', detail: 'No weight defects in the supplied sample.' }];
}

export function automaticWeightsAreFinal(): false {
  return false;
}

export function evaluateWeightProblemChecks(realWeightsInspected: boolean) {
  return WEIGHT_PROBLEM_CHECKS.map((check) => ({
    check,
    state: realWeightsInspected ? ('NEEDS_HUMAN_REVIEW' as const) : ('BLOCKED_REAL_EXECUTION_REQUIRED' as const),
    automaticWeightsAcceptedAsFinal: false as const,
  }));
}

export const WEIGHT_PROBLEM_CHECKS = [
  'normalized weights',
  'excessive influences',
  'unweighted vertices',
  'wrong-side contamination',
  'disconnected islands',
  'collapsing joints',
  'shoulder pinching',
  'elbow pinching',
  'wrist collapse',
  'hip collapse',
  'knee collapse',
  'ankle/foot problems',
  'neck/head deformation',
  'mouth distortion',
  'eyelid distortion',
] as const;

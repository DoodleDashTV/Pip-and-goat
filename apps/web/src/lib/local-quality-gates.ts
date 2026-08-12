/**
 * Fail-closed local quality gates that must pass before any FINAL_1080P cloud
 * acceptance render is allowed to spend money on a GPU.
 *
 * The gate reports are produced locally by Blender:
 *   scripts/assets/scene_gates.py      -> scene_gates.json
 *   scripts/assets/local_acceptance.py -> local_acceptance.json
 *
 * Everything here fails closed: a missing report, a non-boolean gate value, a
 * fault-injected report, or a report produced from different asset bytes than
 * the ones about to be rendered all block the paid launch.
 */

export const REQUIRED_SCENE_GATES = [
  'RIG_BINDING_VALID',
  'PIP_MOTION_VALID',
  'GOAT_MOTION_VALID',
  'ANIMATION_CHANNELS_VALID',
  'LIGHTING_STATE_VALID',
  'NO_DUPLICATE_LIGHTS',
  'ASSET_HIERARCHY_VALID',
] as const;

export const LOCAL_ACCEPTANCE_GATE = 'LOCAL_VISUAL_ACCEPTANCE' as const;

export const ALL_REQUIRED_GATES = [...REQUIRED_SCENE_GATES, LOCAL_ACCEPTANCE_GATE] as const;

export type GateName = (typeof ALL_REQUIRED_GATES)[number];

export type GateEvaluation = {
  ok: boolean;
  gates: Partial<Record<GateName, boolean>>;
  missing: GateName[];
  failed: GateName[];
  reasons: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Evaluate the two local gate reports.
 *
 * @param expectedAssetSha256 when provided, the scene report must have been
 *   produced from exactly these asset bytes, so stale gates cannot authorize a
 *   render of different assets.
 */
export function evaluateLocalQualityGates(
  sceneReport: unknown,
  localReport: unknown,
  expectedAssetSha256?: Record<string, string>,
): GateEvaluation {
  const gates: Partial<Record<GateName, boolean>> = {};
  const missing: GateName[] = [];
  const failed: GateName[] = [];
  const reasons: string[] = [];

  const sceneGates = isRecord(sceneReport) && isRecord(sceneReport.gates) ? sceneReport.gates : null;
  if (!sceneGates) {
    reasons.push('scene gate report missing or malformed');
    missing.push(...REQUIRED_SCENE_GATES);
  } else {
    for (const name of REQUIRED_SCENE_GATES) {
      const value = sceneGates[name];
      if (typeof value !== 'boolean') {
        missing.push(name);
        reasons.push(`${name}: absent or not a boolean`);
        continue;
      }
      gates[name] = value;
      if (!value) {
        failed.push(name);
        reasons.push(`${name}: FAIL`);
      }
    }
  }

  // A report generated with an injected fault proves the gates work; it must
  // never be mistaken for authorization to render.
  if (isRecord(sceneReport) && sceneReport.injectedFault) {
    reasons.push(`scene gate report was produced with injected fault "${String(sceneReport.injectedFault)}"`);
  }

  const localGate = isRecord(localReport) && isRecord(localReport.gate) ? localReport.gate : null;
  const localValue = localGate ? localGate[LOCAL_ACCEPTANCE_GATE] : undefined;
  if (typeof localValue !== 'boolean') {
    missing.push(LOCAL_ACCEPTANCE_GATE);
    reasons.push(`${LOCAL_ACCEPTANCE_GATE}: absent or not a boolean`);
  } else {
    gates[LOCAL_ACCEPTANCE_GATE] = localValue;
    if (!localValue) {
      failed.push(LOCAL_ACCEPTANCE_GATE);
      reasons.push(`${LOCAL_ACCEPTANCE_GATE}: FAIL`);
    }
  }

  if (expectedAssetSha256) {
    const recorded = isRecord(sceneReport) && isRecord(sceneReport.assetSha256) ? sceneReport.assetSha256 : null;
    if (!recorded) {
      reasons.push('scene gate report does not record asset hashes');
    } else {
      for (const [role, sha] of Object.entries(expectedAssetSha256)) {
        if (recorded[role] !== sha) {
          reasons.push(`asset ${role} changed since gates ran (gates: ${String(recorded[role])}, now: ${sha})`);
        }
      }
    }
  }

  return {
    ok: reasons.length === 0 && missing.length === 0 && failed.length === 0,
    gates,
    missing,
    failed,
    reasons,
  };
}

export function assertLocalQualityGates(
  sceneReport: unknown,
  localReport: unknown,
  expectedAssetSha256?: Record<string, string>,
): GateEvaluation {
  const evaluation = evaluateLocalQualityGates(sceneReport, localReport, expectedAssetSha256);
  if (!evaluation.ok) {
    throw new Error(`LOCAL_QUALITY_GATES_FAILED: ${evaluation.reasons.join('; ')}`);
  }
  return evaluation;
}

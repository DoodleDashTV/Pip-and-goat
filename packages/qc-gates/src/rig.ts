import type { RigBindingEvidence } from './types';

/**
 * Valid deformation OR valid rigid-part parenting is accepted.
 * Fake/nonfunctional bindings (armature with nothing bound) are rejected.
 */
export function evaluateRigBinding(binding: RigBindingEvidence): {
  ok: boolean;
  reason: string;
} {
  if (binding.fakeBinding) {
    return {
      ok: false,
      reason: `${binding.character}: fake/nonfunctional rig binding (armature unbound)`,
    };
  }
  if (!binding.hasArmature) {
    return { ok: false, reason: `${binding.character}: armature missing` };
  }
  if (binding.deformationBinding && binding.boundObjectCount > 0) {
    return { ok: true, reason: `${binding.character}: deformation rig binding valid` };
  }
  if (binding.rigidPartBinding && binding.boundObjectCount > 0) {
    return { ok: true, reason: `${binding.character}: rigid-part rig binding valid` };
  }
  return {
    ok: false,
    reason: `${binding.character}: no deformation or rigid-part binding detected`,
  };
}

export function evaluateAllRigBindings(bindings: RigBindingEvidence[]): {
  ok: boolean;
  reason: string;
  failures: string[];
} {
  if (!bindings.length) {
    return { ok: false, reason: 'no rig binding evidence provided', failures: ['missing evidence'] };
  }
  const failures: string[] = [];
  for (const binding of bindings) {
    const result = evaluateRigBinding(binding);
    if (!result.ok) failures.push(result.reason);
  }
  return {
    ok: failures.length === 0,
    reason: failures.length === 0 ? 'all rig bindings valid' : failures.join('; '),
    failures,
  };
}

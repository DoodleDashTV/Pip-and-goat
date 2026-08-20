import { COMMERCIAL_GATE_KEYS, COMMERCIAL_GATE_SCHEMA, type CommercialGateKey, type CommercialInspectionGate } from './types';

export const COMMERCIAL_GATE_POLICY: Record<CommercialGateKey, true> = {
  sourceHashVerified: true,
  temporaryImmutableCopy: true,
  factoryStartup: true,
  autoExecDisabled: true,
  networkBlocked: true,
  timeoutArmed: true,
  sourceSaveForbidden: true,
  addonActivationForbidden: true,
  scriptExecutionForbidden: true,
  driverPolicyDefined: true,
  cleanupArmed: true,
};

export function emptyCommercialGateSatisfied(): Record<CommercialGateKey, boolean> {
  return {
    sourceHashVerified: false,
    temporaryImmutableCopy: false,
    factoryStartup: false,
    autoExecDisabled: false,
    networkBlocked: false,
    timeoutArmed: false,
    sourceSaveForbidden: false,
    addonActivationForbidden: false,
    scriptExecutionForbidden: false,
    driverPolicyDefined: false,
    cleanupArmed: false,
  };
}

export function evaluateCommercialBlenderInspectionGate(
  satisfied: Record<CommercialGateKey, boolean> = emptyCommercialGateSatisfied(),
): CommercialInspectionGate {
  const missing = COMMERCIAL_GATE_KEYS.filter((key) => !satisfied[key]);
  return {
    schemaVersion: COMMERCIAL_GATE_SCHEMA,
    requirements: { ...satisfied },
    ready: missing.length === 0,
    blocker: missing.length === 0 ? '' : `COMMERCIAL_DEEP_INSPECTION_BLOCKED:${missing.join(',')}`,
  };
}

export function mayOpenCommercialBlend(gate: CommercialInspectionGate): boolean {
  return gate.ready && COMMERCIAL_GATE_KEYS.every((key) => gate.requirements[key]);
}

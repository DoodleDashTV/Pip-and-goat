import { sha256Canonical } from './hash';
import {
  CAPABILITY_FAMILIES,
  RIG_CONTRACT_SCHEMA,
  type CapabilityFamily,
  type CapabilityRequirement,
  type CapabilitySpec,
  type RigIdentity,
} from './types';

export type CharacterRigContract = RigIdentity & {
  schemaVersion: typeof RIG_CONTRACT_SCHEMA;
  capabilities: CapabilitySpec[];
  contractSha256: string;
};

export function capability(
  family: CapabilityFamily,
  controlId: string,
  requirement: CapabilityRequirement,
  semanticPurpose: string,
): CapabilitySpec {
  return { family, controlId, requirement, semanticPurpose };
}

export function buildRigContract(
  identity: RigIdentity,
  capabilities: CapabilitySpec[],
): CharacterRigContract {
  const body = {
    schemaVersion: RIG_CONTRACT_SCHEMA,
    ...identity,
    capabilities: [...capabilities].sort((left, right) => left.controlId.localeCompare(right.controlId)),
  };
  return { ...body, contractSha256: sha256Canonical(body) };
}

export function requiredFamilies(capabilities: CapabilitySpec[]): CapabilityFamily[] {
  return capabilities.filter((item) => item.requirement === 'REQUIRED').map((item) => item.family);
}

export function missingRequiredFamilies(required: CapabilitySpec[], present: CapabilitySpec[]): CapabilityFamily[] {
  const have = new Set(present.map((item) => item.family));
  return required.filter((item) => item.requirement === 'REQUIRED' && !have.has(item.family)).map((item) => item.family);
}

export function allCapabilityFamilies(): readonly CapabilityFamily[] {
  return CAPABILITY_FAMILIES;
}

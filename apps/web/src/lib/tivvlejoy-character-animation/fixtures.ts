import { buildRigContract, type CharacterRigContract } from './rig-contract';
import { PIP_CAPABILITY_PROFILE } from './pip-profile';
import { GOAT_CAPABILITY_PROFILE } from './goat-profile';
import type { RigIdentity } from './types';

export function syntheticRigIdentity(characterId: 'PIP' | 'GOAT', version = 'SYNTHETIC_V1'): RigIdentity {
  const name = characterId === 'PIP' ? 'pip' : 'goat';
  return {
    characterId,
    rigId: `SYNTHETIC_${characterId}_RIG`,
    rigVersion: version,
    rigDependencySha256: `synthetic-${name}-rig-${version}`,
    sourceReceiptRef: `synthetic-source-${name}`,
    sourceSha256: `synthetic-source-sha-${name}-${version}`,
    rigApprovalReceiptRef: null,
    rigApprovalSha256: null,
    blenderVersionCompatibility: '4.2+',
    evidenceClass: 'SYNTHETIC_PREVIEW',
  };
}

export function syntheticPipContract(version = 'SYNTHETIC_V1'): CharacterRigContract {
  return buildRigContract(syntheticRigIdentity('PIP', version), PIP_CAPABILITY_PROFILE);
}

export function syntheticGoatContract(version = 'SYNTHETIC_V1'): CharacterRigContract {
  return buildRigContract(syntheticRigIdentity('GOAT', version), GOAT_CAPABILITY_PROFILE);
}

/** Approved-like paperwork on a synthetic fixture. Never a real production rig. */
export function approvedLikeSyntheticIdentity(characterId: 'PIP' | 'GOAT', version = 'SYNTHETIC_APPROVED_LIKE_V1'): RigIdentity {
  return {
    ...syntheticRigIdentity(characterId, version),
    rigApprovalReceiptRef: `synthetic-approval-like-${characterId}`,
    rigApprovalSha256: `synthetic-approval-like-sha-${characterId}`,
    evidenceClass: 'SYNTHETIC_PREVIEW',
  };
}

export function approvedLikeSyntheticContract(characterId: 'PIP' | 'GOAT', version = 'SYNTHETIC_APPROVED_LIKE_V1'): CharacterRigContract {
  return buildRigContract(
    approvedLikeSyntheticIdentity(characterId, version),
    characterId === 'PIP' ? PIP_CAPABILITY_PROFILE : GOAT_CAPABILITY_PROFILE,
  );
}

/** Flip-test only: a production-candidate identity that is still not a real studio file. */
export function flipTestCandidateIdentity(characterId: 'PIP' | 'GOAT', version = 'CANDIDATE_V1'): RigIdentity {
  return {
    characterId,
    rigId: `FLIP_TEST_${characterId}_CANDIDATE`,
    rigVersion: version,
    rigDependencySha256: `flip-test-${characterId.toLowerCase()}-${version}`,
    sourceReceiptRef: `flip-source-${characterId}`,
    sourceSha256: `flip-source-sha-${characterId}-${version}`,
    rigApprovalReceiptRef: `flip-approval-${characterId}`,
    rigApprovalSha256: `flip-approval-sha-${characterId}`,
    blenderVersionCompatibility: '4.2+',
    evidenceClass: 'PRODUCTION_CANDIDATE',
  };
}

export function flipTestCandidateContract(characterId: 'PIP' | 'GOAT', version = 'CANDIDATE_V1'): CharacterRigContract {
  return buildRigContract(
    flipTestCandidateIdentity(characterId, version),
    characterId === 'PIP' ? PIP_CAPABILITY_PROFILE : GOAT_CAPABILITY_PROFILE,
  );
}

export const SYNTHETIC_BANNER = 'SYNTHETIC FIXTURE — NOT A REAL PRODUCTION RIG — NOT HUMAN APPROVED' as const;

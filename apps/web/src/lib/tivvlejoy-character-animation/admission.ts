import { sha256Canonical } from './hash';
import { missingRequiredFamilies } from './rig-contract';
import type { CharacterRigContract } from './rig-contract';
import { GOAT_CAPABILITY_PROFILE } from './goat-profile';
import { PIP_CAPABILITY_PROFILE } from './pip-profile';
import { RIG_ADMISSION_SCHEMA, type AdmissionState, type CapabilitySpec } from './types';

export type AdmissionInput = {
  contract?: CharacterRigContract | null;
  expectedRigVersion?: string | null;
  expectedRigSha256?: string | null;
  inspectionPresent?: boolean;
  capabilityCheckComplete?: boolean;
  visualTestPresent?: boolean;
  humanApprovalReceiptRef?: string | null;
  humanApprovalSha256?: string | null;
  characterIdentityCompatible?: boolean;
  deformationEvidenceRef?: string | null;
  blenderCompatible?: boolean;
};

export type AdmissionReport = {
  schemaVersion: typeof RIG_ADMISSION_SCHEMA;
  characterId: 'PIP' | 'GOAT';
  state: AdmissionState;
  humanLabel: string;
  missingRequired: string[];
  syntheticCannotApprove: true;
  wouldBeEligibleAfterHumanApproval: boolean;
  approvedForAnimation: false | true;
  reportSha256: string;
  blockers: string[];
};

const PROFILE = {
  PIP: PIP_CAPABILITY_PROFILE,
  GOAT: GOAT_CAPABILITY_PROFILE,
} as const;

export function evaluateRigAdmission(input: AdmissionInput & { characterId: 'PIP' | 'GOAT' }): AdmissionReport {
  const profile: CapabilitySpec[] = PROFILE[input.characterId];
  const blockers: string[] = [];
  let state: AdmissionState = 'RIG_NOT_PRESENT';
  if (!input.contract) {
    blockers.push('RIG_NOT_PRESENT');
  } else if (input.contract.evidenceClass === 'SYNTHETIC_PREVIEW' && !input.contract.sourceSha256) {
    state = 'RIG_DISCOVERED';
    blockers.push('SYNTHETIC_SOURCE_ONLY');
  } else if (input.expectedRigSha256 && input.contract.rigDependencySha256 !== input.expectedRigSha256) {
    state = 'RIG_HASH_MISMATCH';
    blockers.push('RIG_HASH_MISMATCH');
  } else if (input.expectedRigVersion && input.contract.rigVersion !== input.expectedRigVersion) {
    state = 'RIG_VERSION_MISMATCH';
    blockers.push('RIG_VERSION_MISMATCH');
  } else if (input.blenderCompatible === false) {
    state = 'RIG_BLOCKED';
    blockers.push('BLENDER_INCOMPATIBLE');
  } else if (!input.inspectionPresent) {
    state = 'RIG_INSPECTION_REQUIRED';
    blockers.push('INSPECTION_REQUIRED');
  } else if (!input.capabilityCheckComplete) {
    state = 'RIG_CAPABILITY_CHECK_PENDING';
    blockers.push('CAPABILITY_CHECK_PENDING');
  } else {
    const missing = missingRequiredFamilies(profile, input.contract.capabilities);
    if (missing.length) {
      state = 'RIG_CAPABILITY_INCOMPLETE';
      blockers.push(...missing.map((family) => `MISSING_${family}`));
    } else if (input.characterIdentityCompatible === false) {
      state = 'RIG_BLOCKED';
      blockers.push('IDENTITY_INCOMPATIBLE');
    } else if (!input.visualTestPresent || !input.deformationEvidenceRef) {
      state = 'RIG_VISUAL_TEST_REQUIRED';
      blockers.push('VISUAL_TEST_REQUIRED');
    } else if (!input.humanApprovalReceiptRef || !input.humanApprovalSha256) {
      state = 'RIG_HUMAN_APPROVAL_REQUIRED';
      blockers.push('HUMAN_APPROVAL_REQUIRED');
    } else if (input.contract.evidenceClass === 'SYNTHETIC_PREVIEW') {
      state = 'RIG_HUMAN_APPROVAL_REQUIRED';
      blockers.push('SYNTHETIC_CANNOT_RECEIVE_HUMAN_APPROVAL');
    } else {
      state = 'RIG_APPROVED_FOR_ANIMATION';
    }
  }
  const approved = state === 'RIG_APPROVED_FOR_ANIMATION' && input.contract?.evidenceClass === 'PRODUCTION_CANDIDATE';
  if (!approved && state === 'RIG_APPROVED_FOR_ANIMATION') {
    state = 'RIG_HUMAN_APPROVAL_REQUIRED';
  }
  const wouldBeEligible =
    Boolean(input.contract) &&
    input.inspectionPresent === true &&
    input.capabilityCheckComplete === true &&
    input.visualTestPresent === true &&
    Boolean(input.deformationEvidenceRef) &&
    input.characterIdentityCompatible !== false &&
    input.blenderCompatible !== false &&
    !blockers.includes('RIG_HASH_MISMATCH') &&
    !blockers.includes('RIG_VERSION_MISMATCH') &&
    !blockers.some((item) => item.startsWith('MISSING_'));
  const body = {
    schemaVersion: RIG_ADMISSION_SCHEMA,
    characterId: input.characterId,
    state: approved ? 'RIG_APPROVED_FOR_ANIMATION' : state === 'RIG_NOT_PRESENT' && !input.contract ? 'RIG_NOT_PRESENT' : state,
    humanLabel: humanAdmission(input.characterId, approved ? 'RIG_APPROVED_FOR_ANIMATION' : state),
    missingRequired: blockers.filter((item) => item.startsWith('MISSING_')),
    syntheticCannotApprove: true as const,
    wouldBeEligibleAfterHumanApproval: wouldBeEligible && !approved,
    approvedForAnimation: approved,
    blockers,
  };
  return { ...body, reportSha256: sha256Canonical(body) };
}

export function humanAdmission(characterId: 'PIP' | 'GOAT', state: AdmissionState): string {
  const name = characterId === 'PIP' ? 'Pip' : 'Goat';
  if (state === 'RIG_NOT_PRESENT') return `Waiting for approved ${name} production rig`;
  if (state === 'RIG_HUMAN_APPROVAL_REQUIRED') return `${name} rig still needs human visual approval`;
  if (state === 'RIG_APPROVED_FOR_ANIMATION') return `${name} production rig admitted for animation`;
  if (state === 'RIG_CAPABILITY_INCOMPLETE') return `${name} rig is missing required controls`;
  if (state === 'RIG_HASH_MISMATCH') return `${name} rig hash does not match the registered source`;
  if (state === 'RIG_VERSION_MISMATCH') return `${name} rig version does not match the registered identity`;
  return `${name} rig: ${state.split('_').join(' ').toLowerCase()}`;
}

export function neverAutoApprove(report: AdmissionReport): boolean {
  return report.syntheticCannotApprove && report.state !== 'RIG_APPROVED_FOR_ANIMATION';
}

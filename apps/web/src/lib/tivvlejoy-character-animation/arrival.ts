import { RIG_ARRIVAL_STEPS, type RigArrivalStep } from './types';

export type ArrivalChecklistRow = {
  step: RigArrivalStep;
  humanLabel: string;
  complete: boolean;
  dryRunOnly: true;
  autoReplacePriorVersion: false;
};

export type RigArrivalWorkflow = {
  schema: 'TIVVLEJOY_RIG_ARRIVAL_WORKFLOW_V1';
  characterId: 'PIP' | 'GOAT';
  sourcePresent: false;
  rows: ArrivalChecklistRow[];
  neverAutoReplacePriorVersion: true;
  performedOnNonexistentFiles: false;
};

const LABELS: Record<RigArrivalStep, string> = {
  RECEIVE: 'Receive the external production rig file',
  HASH: 'Hash the immutable source bytes',
  REGISTER_IMMUTABLE_SOURCE: 'Register the source receipt without filename identity',
  INSPECT: 'Inspect armature, controls, and dependencies in a future Blender session',
  CAPABILITY_REPORT: 'Compare semantic capabilities to the required profile',
  TEST_POSE_REPORT: 'Record the deterministic test-pose matrix',
  IDENTITY_COMPATIBILITY: 'Confirm character identity compatibility',
  DEFORMATION_EVIDENCE: 'Attach deformation evidence references',
  HUMAN_VISUAL_REVIEW: 'Human visual review of test poses',
  APPROVAL_RECEIPT: 'Record a human approval receipt',
  REGISTER_PRODUCTION_RIG_VERSION: 'Register a new production rig version without replacing the prior one automatically',
};

export function dryRunRigArrival(characterId: 'PIP' | 'GOAT'): RigArrivalWorkflow {
  return {
    schema: 'TIVVLEJOY_RIG_ARRIVAL_WORKFLOW_V1',
    characterId,
    sourcePresent: false,
    neverAutoReplacePriorVersion: true,
    performedOnNonexistentFiles: false,
    rows: RIG_ARRIVAL_STEPS.map((step) => ({
      step,
      humanLabel: LABELS[step],
      complete: false,
      dryRunOnly: true as const,
      autoReplacePriorVersion: false as const,
    })),
  };
}

export function canAutoReplacePriorRigVersion(): false {
  return false;
}

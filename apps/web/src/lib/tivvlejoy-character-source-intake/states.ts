import type { GoatSourceIntakeState } from './types';
import type { GoatSourceReceipt } from './receipt';

export function deriveGoatSourceState(input: {
  receipt: GoatSourceReceipt;
  uploading?: boolean;
  resumable?: boolean;
  failed?: boolean;
  connectionReadyOnly?: boolean;
}): GoatSourceIntakeState {
  if (input.failed) return 'FAILED';
  if (input.connectionReadyOnly) return 'BLOCKED';
  if (input.uploading) return 'UPLOADING';
  if (input.resumable) return 'RESUMABLE';
  if (input.receipt.workingCopyStatus === 'WORKING_COPY_READY') return 'WORKING_COPY_READY';
  if (input.receipt.sourceLocked && input.receipt.hashVerified) return 'SOURCE_LOCKED';
  if (input.receipt.hashVerified) return 'HASH_VERIFIED';
  return 'NOT_UPLOADED';
}

export function operatorChecklist(state: GoatSourceIntakeState) {
  const uploaded = !['NOT_UPLOADED', 'FAILED', 'BLOCKED'].includes(state) || state === 'SOURCE_LOCKED';
  const hashed = ['HASH_VERIFIED', 'SOURCE_LOCKED', 'WORKING_COPY_PENDING', 'WORKING_COPY_READY', 'RIG_BUILD_READY'].includes(
    state,
  );
  const locked = ['SOURCE_LOCKED', 'WORKING_COPY_PENDING', 'WORKING_COPY_READY', 'RIG_BUILD_READY'].includes(state);
  return {
    goatSource: {
      uploaded: uploaded && state !== 'NOT_UPLOADED' && state !== 'FAILED',
      shaVerified: hashed || locked,
      sourceLocked: locked,
    },
    goatWorking: state === 'WORKING_COPY_READY' || state === 'RIG_BUILD_READY',
    goatRig: false,
    goatDeformationQa: false,
    goatAnimationQa: false,
    goatProductionMaster: 'LOCKED' as const,
  };
}

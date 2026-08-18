export const PIPELINE_STATES = [
  'uploaded',
  'size_verified',
  'inspection_pending',
  'inspecting',
  'inspection_complete',
  'inspection_blocked',
  'quarantined',
  'blender_import_ready',
  'preservation_only',
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];

export const INSPECTION_STATES = [
  'not_eligible',
  'awaiting_verification',
  'inspection_pending',
  'inspection_ready',
  'queued',
  'inspecting',
  'inspection_complete',
  'inspected',
  'inspection_blocked',
  'failed',
  'blender_import_ready',
  'preservation_only',
] as const;

export type InspectionState = (typeof INSPECTION_STATES)[number];

export function isCompletedInspectionState(state: string): boolean {
  return (
    state === 'inspection_complete' ||
    state === 'inspected' ||
    state === 'blender_import_ready' ||
    state === 'preservation_only'
  );
}

export function isVerifiedState(state: string): boolean {
  return state === 'size_verified' || state === 'independently_verified';
}

export function isUploadedState(state: string): boolean {
  return state === 'completed' || state === 'already_present';
}

export function derivePipelineState(input: {
  uploadState: string;
  verificationState: string;
  quarantineState: string;
  inspectionState: string;
  unityPreservationOnly: boolean;
}): PipelineState {
  if (input.quarantineState === 'quarantined') return 'quarantined';
  if (!isUploadedState(input.uploadState)) return 'inspection_pending';
  if (input.verificationState === 'size_verified' || input.verificationState === 'independently_verified') {
    if (input.unityPreservationOnly && isCompletedInspectionState(input.inspectionState)) {
      return 'preservation_only';
    }
    if (input.inspectionState === 'inspecting') return 'inspecting';
    if (input.inspectionState === 'inspection_blocked') return 'inspection_blocked';
    if (input.inspectionState === 'blender_import_ready') return 'blender_import_ready';
    if (input.inspectionState === 'preservation_only') return 'preservation_only';
    if (isCompletedInspectionState(input.inspectionState)) return 'inspection_complete';
    if (
      input.inspectionState === 'inspection_ready' ||
      input.inspectionState === 'queued' ||
      input.inspectionState === 'inspection_pending'
    ) {
      return 'inspection_pending';
    }
    return 'size_verified';
  }
  return 'uploaded';
}

export function cannotDowngradeCompletedManifest(input: {
  existingUploadState: string;
  incomingUploadState: string;
}): boolean {
  return (
    isUploadedState(input.existingUploadState) &&
    !isUploadedState(input.incomingUploadState)
  );
}

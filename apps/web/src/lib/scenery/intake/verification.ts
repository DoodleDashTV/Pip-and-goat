import { assessSourceSize, type SourceSizeIssue } from './size-validation';

export const PIPELINE_VERIFICATION_STATES = [
  'not_verified',
  'awaiting_verification',
  'size_verified',
  'checksum_recorded',
  'independently_verified',
  'quarantined',
  'failed',
] as const;

export type PipelineVerificationState = (typeof PIPELINE_VERIFICATION_STATES)[number];

export type VerificationFailureReason =
  | 'zero_byte'
  | 'truncated_transfer'
  | 'hash_mismatch'
  | 'size_mismatch'
  | 'object_unavailable'
  | 'unsupported'
  | 'incomplete_multipart'
  | 'inconsistent_part_count'
  | 'corrupt'
  | 'missing_checksum';

export type VerificationAssessment = {
  state: PipelineVerificationState;
  ok: boolean;
  inspectionEligible: boolean;
  reasons: VerificationFailureReason[];
  sizeIssues: SourceSizeIssue[];
};

export function evaluateStoredVerification(input: {
  declaredBytes: number;
  storedBytes: number | null;
  objectAvailable: boolean;
  sha256: string | null;
  expectedSha256?: string | null;
  filename: string;
  partCount?: number;
  completedPartCount?: number;
  uploadCompleted: boolean;
}): VerificationAssessment {
  const reasons: VerificationFailureReason[] = [];
  const size = assessSourceSize({
    filename: input.filename,
    declaredBytes: input.declaredBytes,
    storedBytes: input.storedBytes,
  });

  if (!input.objectAvailable || input.storedBytes === null) {
    reasons.push('object_unavailable');
  }
  if (!input.sha256) {
    reasons.push('missing_checksum');
  }
  if (input.expectedSha256 && input.sha256 && input.expectedSha256 !== input.sha256) {
    reasons.push('hash_mismatch');
  }
  if (size.issues.includes('zero_byte')) {
    reasons.push('zero_byte');
  }
  if (size.issues.includes('truncated_transfer')) {
    reasons.push('truncated_transfer');
  }
  if (size.issues.includes('stored_size_mismatch') || size.issues.includes('declared_mismatch')) {
    reasons.push('size_mismatch');
  }
  if (
    input.partCount !== undefined &&
    input.completedPartCount !== undefined &&
    input.partCount !== input.completedPartCount
  ) {
    reasons.push('inconsistent_part_count');
    reasons.push('incomplete_multipart');
  }
  if (input.uploadCompleted && reasons.includes('object_unavailable')) {
    reasons.push('corrupt');
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const blocked = uniqueReasons.length > 0;
  const sizeVerified = !blocked && Boolean(input.sha256);
  return {
    state: blocked ? 'failed' : sizeVerified ? 'size_verified' : 'awaiting_verification',
    ok: !blocked,
    inspectionEligible: !blocked && input.uploadCompleted && Boolean(input.sha256),
    reasons: uniqueReasons,
    sizeIssues: size.issues,
  };
}

export function verificationBlocksInspection(assessment: VerificationAssessment): boolean {
  return !assessment.inspectionEligible;
}

import { sha256Canonical } from './hash';
import { RECOVERY_SCHEMA, type ProductionJob, type RetryClass } from './types';

export type ExistingResult = {
  idempotencyKey: string;
  inputDependencySha256: string;
  authorizationReceiptRef?: string | null;
  resultReceiptRef: string;
  success: boolean;
};

export type RecoveryDecision =
  | 'REUSE_EXISTING_RESULT'
  | 'SAFE_RETRY'
  | 'REQUIRES_REVALIDATION'
  | 'REQUIRES_HUMAN_REVIEW'
  | 'REQUIRES_NEW_AUTHORIZATION'
  | 'DO_NOT_RETRY'
  | 'STALE_RESULT';

export type RecoveryReport = {
  schemaVersion: typeof RECOVERY_SCHEMA;
  decision: RecoveryDecision;
  retryClass: RetryClass;
  reason: string;
  jobId: string;
  idempotencyKey: string;
  recoverySha256: string;
};

export function jobIdempotencyKey(job: Pick<ProductionJob, 'jobType' | 'inputDependencySha256' | 'authorizationReceiptRef'>): string {
  return sha256Canonical({
    type: job.jobType,
    input: job.inputDependencySha256,
    auth: job.authorizationReceiptRef ?? null,
  });
}

export function evaluateJobRecovery(job: ProductionJob, existing: ExistingResult | null, staleReasons: string[] = []): RecoveryReport {
  const key = job.idempotencyKey || jobIdempotencyKey(job);
  let decision: RecoveryDecision = job.retryClass === 'DO_NOT_RETRY' ? 'DO_NOT_RETRY' : 'SAFE_RETRY';
  let reason = 'no prior result';
  if (staleReasons.length) {
    decision = 'STALE_RESULT';
    reason = `stale: ${staleReasons.sort().join(',')}`;
  } else if (existing?.success && existing.idempotencyKey === key && existing.inputDependencySha256 === job.inputDependencySha256) {
    if (job.jobType === 'RENDER' && existing.authorizationReceiptRef && existing.authorizationReceiptRef === (job.authorizationReceiptRef ?? null)) {
      decision = 'REUSE_EXISTING_RESULT';
      reason = 'same paid-work input and authorization already succeeded';
    } else if (job.jobType !== 'RENDER') {
      decision = 'REUSE_EXISTING_RESULT';
      reason = 'same job input already has a successful result';
    } else if (job.jobType === 'RENDER' && !job.authorizationReceiptRef) {
      decision = 'REQUIRES_NEW_AUTHORIZATION';
      reason = 'paid render cannot retry without a new authorization receipt';
    }
  } else if (job.retryClass === 'REQUIRES_NEW_AUTHORIZATION') {
    decision = 'REQUIRES_NEW_AUTHORIZATION';
    reason = 'authorization-bound work cannot silently retry';
  } else if (job.retryClass === 'REQUIRES_HUMAN_REVIEW') {
    decision = 'REQUIRES_HUMAN_REVIEW';
    reason = 'human review required before retry';
  } else if (job.retryClass === 'REQUIRES_REVALIDATION') {
    decision = 'REQUIRES_REVALIDATION';
    reason = 'revalidate hashes before retry';
  }

  const body = {
    schemaVersion: RECOVERY_SCHEMA,
    decision,
    retryClass: job.retryClass,
    reason,
    jobId: job.jobId,
    idempotencyKey: key,
  };
  return { ...body, recoverySha256: sha256Canonical(body) };
}

export function detectStaleResult(input: {
  previousAssetSha256?: string | null;
  currentAssetSha256?: string | null;
  previousVoiceSha256?: string | null;
  currentVoiceSha256?: string | null;
  previousShotSha256?: string | null;
  currentShotSha256?: string | null;
  previousApprovalSha256?: string | null;
  currentApprovalSha256?: string | null;
}): string[] {
  const stale: string[] = [];
  if (input.previousAssetSha256 && input.currentAssetSha256 && input.previousAssetSha256 !== input.currentAssetSha256) stale.push('asset changed');
  if (input.previousVoiceSha256 && input.currentVoiceSha256 && input.previousVoiceSha256 !== input.currentVoiceSha256) stale.push('voice changed');
  if (input.previousShotSha256 && input.currentShotSha256 && input.previousShotSha256 !== input.currentShotSha256) stale.push('shot changed');
  if (input.previousApprovalSha256 && input.currentApprovalSha256 && input.previousApprovalSha256 !== input.currentApprovalSha256) stale.push('approval changed');
  return stale;
}

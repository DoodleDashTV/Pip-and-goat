import { SCENERY_INTAKE_SESSION_TTL_MS } from './limits';
import type { UploadSession, UploadSessionState } from './multipart';

export const RECOVERABLE_UPLOAD_STATUSES = [
  'created',
  'signing',
  'uploading',
  'paused',
  'completing',
] as const satisfies readonly UploadSessionState[];

export const TERMINAL_UPLOAD_STATUSES = [
  'completed',
  'aborted',
  'rejected',
  'already_present',
] as const satisfies readonly UploadSessionState[];

export type RecoveredUploadState =
  | 'paused'
  | 'retryable'
  | 'failed'
  | 'cancelled'
  | 'stored'
  | 'quarantined'
  | 'duplicate'
  | 'inspection_ready'
  | 'expired'
  | 'stale'
  | 'unknown';

export type ClientRecoverySnapshot = {
  sessionId: string;
  sourceId: string;
  collectionId: string;
  filename: string;
  byteSize: number;
  sha256?: string;
  uploadedPartNumbers: number[];
  lastPartNumber: number;
  transferredBytes: number;
  storedBytes: number | null;
  updatedAt: string;
  status: UploadSessionState;
};

export function sessionExpiresAt(
  session: Pick<UploadSession, 'createdAt'>,
  ttlMs = SCENERY_INTAKE_SESSION_TTL_MS,
): string {
  return new Date(Date.parse(session.createdAt) + ttlMs).toISOString();
}

export function isRecoverableUploadStatus(status: UploadSessionState): boolean {
  return (RECOVERABLE_UPLOAD_STATUSES as readonly string[]).includes(status);
}

export function isSessionExpired(
  session: Pick<UploadSession, 'createdAt'>,
  now = Date.now(),
  ttlMs = SCENERY_INTAKE_SESSION_TTL_MS,
): boolean {
  const createdAt = Date.parse(session.createdAt);
  return !Number.isFinite(createdAt) || createdAt + ttlMs <= now;
}

export function isSessionStale(
  session: Pick<UploadSession, 'updatedAt' | 'state' | 'createdAt'>,
  now = Date.now(),
): boolean {
  if (isSessionExpired(session, now)) {
    return true;
  }
  if (!isRecoverableUploadStatus(session.state)) {
    return false;
  }
  const updatedAt = Date.parse(session.updatedAt);
  return !Number.isFinite(updatedAt) || now - updatedAt > SCENERY_INTAKE_SESSION_TTL_MS;
}

export function classifyRecoveredState(input: {
  session?: Pick<UploadSession, 'state' | 'createdAt' | 'updatedAt'> | null;
  verificationState?: string | null;
  quarantineState?: string | null;
  inspectionState?: string | null;
  duplicateStatus?: string | null;
}): RecoveredUploadState {
  const session = input.session;
  if (!session) {
    return 'unknown';
  }
  if (session.state === 'aborted') {
    return 'cancelled';
  }
  if (session.state === 'rejected') {
    return isSessionExpired(session) ? 'expired' : 'failed';
  }
  if (isSessionExpired(session)) {
    return 'expired';
  }
  if (isSessionStale(session)) {
    return 'stale';
  }
  if (session.state === 'already_present' || input.duplicateStatus === 'already_present' || input.duplicateStatus === 'exact_duplicate') {
    return 'duplicate';
  }
  if (input.inspectionState === 'inspection_ready') {
    return 'inspection_ready';
  }
  if (input.quarantineState === 'quarantined' || input.verificationState === 'failed') {
    return 'quarantined';
  }
  if (session.state === 'completed') {
    return 'stored';
  }
  if (session.state === 'created' || session.state === 'paused' || session.state === 'signing') {
    return 'paused';
  }
  if (session.state === 'uploading' || session.state === 'completing') {
    return 'retryable';
  }
  return 'unknown';
}

export function partsStillNeeded(input: {
  partCount: number;
  uploadedPartNumbers: readonly number[];
}): number[] {
  const uploaded = new Set(input.uploadedPartNumbers);
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= input.partCount; partNumber += 1) {
    if (!uploaded.has(partNumber)) {
      missing.push(partNumber);
    }
  }
  return missing;
}

export function sanitizeClientRecoverySnapshot(input: ClientRecoverySnapshot): ClientRecoverySnapshot {
  return {
    sessionId: input.sessionId,
    sourceId: input.sourceId,
    collectionId: input.collectionId,
    filename: input.filename,
    byteSize: input.byteSize,
    sha256: input.sha256,
    uploadedPartNumbers: [...input.uploadedPartNumbers].sort((a, b) => a - b),
    lastPartNumber: input.lastPartNumber,
    transferredBytes: input.transferredBytes,
    storedBytes: input.storedBytes,
    updatedAt: input.updatedAt,
    status: input.status,
  };
}

export function recoveryGuidance(state: RecoveredUploadState): string {
  switch (state) {
    case 'paused':
      return 'This upload is paused. Re-select the same file and resume. Completed parts are kept.';
    case 'retryable':
      return 'This upload can continue. Only unfinished parts will be retried.';
    case 'failed':
      return 'This upload failed. Retry the failed parts, or cancel and start that file again.';
    case 'cancelled':
      return 'This upload was cancelled. Select the file again if you still want to store it.';
    case 'stored':
      return 'The source object is stored. Upload does not mean asset approval.';
    case 'quarantined':
      return 'The stored object stayed in quarantine. It is not inspection-ready.';
    case 'duplicate':
      return 'An identical stored source was reused. A second copy was not created.';
    case 'inspection_ready':
      return 'Verification passed. A non-executing inspection job can be queued. Approval still requires Justin.';
    case 'expired':
      return 'This upload session expired. Start a new session. Previously finished parts are not reused automatically.';
    case 'stale':
      return 'This multipart session went stale. Resume to refresh part URLs, or cancel and start again.';
    default:
      return 'Re-select the purchased files to restore progress. Secrets are never stored in the browser.';
  }
}

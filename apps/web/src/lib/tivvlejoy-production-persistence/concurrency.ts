import { recordSha256 } from './hash';
import { CONCURRENCY_SCHEMA, type WriteResult } from './types';

export function evaluateOptimisticWrite(input: {
  currentRevision: number;
  expectedRevision: number;
  currentSha256: string;
  nextSha256: string;
}): WriteResult {
  if (input.nextSha256 === input.currentSha256 && input.expectedRevision === input.currentRevision) {
    return 'WRITE_IDEMPOTENT';
  }
  if (input.expectedRevision < input.currentRevision) return 'WRITE_CONFLICT';
  if (input.expectedRevision > input.currentRevision) return 'WRITE_STALE';
  if (input.expectedRevision !== input.currentRevision) return 'WRITE_REJECTED';
  return 'WRITE_ACCEPTED';
}

export function concurrencySchema(): typeof CONCURRENCY_SCHEMA {
  return CONCURRENCY_SCHEMA;
}

export function contentHash(value: unknown): string {
  return recordSha256(value);
}

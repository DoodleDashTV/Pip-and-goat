import { type QuarantineReason } from './types';

export type QuarantineRecord = {
  sourceId: string;
  state: 'QUARANTINED';
  reasons: QuarantineReason[];
  storedSourceDeleted: false;
};

export function quarantineReasonsFrom(input: {
  sourceState?: string;
  archiveState?: string;
  scriptState?: string;
  dependencyBlockers?: readonly string[];
  licenseState?: string;
  provenanceState?: string;
}): QuarantineReason[] {
  const reasons: QuarantineReason[] = [];
  if (input.sourceState === 'SOURCE_HASH_MISMATCH') reasons.push('HASH_MISMATCH');
  if (input.archiveState === 'ARCHIVE_CORRUPT') reasons.push('CORRUPT_ARCHIVE');
  if (input.archiveState === 'ARCHIVE_UNSAFE_PATH') reasons.push('PATH_TRAVERSAL');
  if (input.archiveState === 'ARCHIVE_BOMB_RISK') reasons.push('ARCHIVE_BOMB_RISK');
  if (input.scriptState === 'UNSAFE_EXECUTION_DEPENDENCY') reasons.push('UNSAFE_SCRIPT_DEPENDENCY');
  if (input.dependencyBlockers?.some((item) => item.startsWith('MISSING_REQUIRED_DEPENDENCY'))) {
    reasons.push('MISSING_REQUIRED_DEPENDENCY');
  }
  if (input.licenseState === 'LICENSE_BLOCKED') reasons.push('LICENSE_BLOCKED');
  if (input.provenanceState === 'PROVENANCE_UNKNOWN' || input.provenanceState === 'PROVENANCE_BLOCKED') {
    reasons.push('PROVENANCE_BLOCKED');
  }
  return reasons;
}

export function quarantineSource(sourceId: string, reasons: readonly QuarantineReason[]): QuarantineRecord | null {
  if (!reasons.length) return null;
  return { sourceId, state: 'QUARANTINED', reasons: [...reasons], storedSourceDeleted: false };
}

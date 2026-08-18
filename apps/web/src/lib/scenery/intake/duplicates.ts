import type { SceneryCollectionId } from './inventory';

export type StoredSourceIndexEntry = {
  sourceId: string;
  collectionId: SceneryCollectionId;
  filename: string;
  objectKey: string;
  sha256: string;
  byteSize: number;
};

export type DuplicateStatus = 'unique' | 'already_present' | 'exact_duplicate' | 'filename_conflict';

export type DuplicateDecision = {
  status: DuplicateStatus;
  existing?: StoredSourceIndexEntry;
  message: string;
};

export type ContentIdentityCase =
  | 'same_name_same_hash'
  | 'same_name_different_hash'
  | 'different_name_same_hash'
  | 'unique';

export function classifyContentIdentity(input: {
  sha256: string;
  filename: string;
  existing: Array<Pick<StoredSourceIndexEntry, 'filename' | 'sha256'>>;
}): ContentIdentityCase {
  const sameName = input.existing.find((item) => item.filename === input.filename);
  const sameHash = input.existing.find((item) => item.sha256 === input.sha256);
  if (sameName && sameName.sha256 === input.sha256) return 'same_name_same_hash';
  if (sameName && sameName.sha256 !== input.sha256) return 'same_name_different_hash';
  if (sameHash && sameHash.filename !== input.filename) return 'different_name_same_hash';
  return 'unique';
}

export function detectDuplicate(input: {
  sha256: string;
  filename: string;
  collectionId: SceneryCollectionId;
  existing: StoredSourceIndexEntry[];
}): DuplicateDecision {
  const hashMatches = input.existing.filter((item) => item.sha256 === input.sha256);
  const sameCollectionHash = hashMatches.find((item) => item.collectionId === input.collectionId);
  if (sameCollectionHash && sameCollectionHash.filename === input.filename) {
    return {
      status: 'already_present',
      existing: sameCollectionHash,
      message: 'Identical SHA-256 and filename already exist in this collection. The immutable source was reused.',
    };
  }
  if (sameCollectionHash) {
    return {
      status: 'already_present',
      existing: sameCollectionHash,
      message: 'Identical SHA-256 already exists in this collection. A second stored copy was not created.',
    };
  }
  const otherHash = hashMatches[0];
  if (otherHash) {
    return {
      status: 'exact_duplicate',
      existing: otherHash,
      message: 'Identical SHA-256 exists under a different filename. Treated as an exact duplicate.',
    };
  }
  const nameConflict = input.existing.find(
    (item) => item.collectionId === input.collectionId && item.filename === input.filename && item.sha256 !== input.sha256,
  );
  if (nameConflict) {
    return {
      status: 'filename_conflict',
      existing: nameConflict,
      message: 'Same filename with a different SHA-256. Versioning or quarantine is required. Silent overwrite is refused.',
    };
  }
  return { status: 'unique', message: 'No SHA-256 duplicate found.' };
}

export function resolveImmutableWrite(input: {
  existing?: { sha256: string; byteSize: number; objectKey: string } | null;
  incomingSha256: string;
  incomingByteSize: number;
  allowVersion?: boolean;
}): 'reuse' | 'create' | 'version' | 'reject' {
  if (!input.existing) return 'create';
  if (input.existing.sha256 === input.incomingSha256 && input.existing.byteSize === input.incomingByteSize) {
    return 'reuse';
  }
  if (input.allowVersion) return 'version';
  return 'reject';
}

import { dryRunRigArrival } from '@/lib/tivvlejoy-character-animation/arrival';
import { isValidSha256, sha256Bytes, sha256Text } from './hash';
import {
  RIG_ALLOWED_EXTENSIONS,
  RIG_ARRIVAL_SCHEMA,
  RIG_ARRIVAL_STATES,
  RIG_MAX_BYTES,
  RIG_MIN_BYTES,
  type RigArrivalState,
  type RigIntakeRecord,
} from './types';

export type RigIntakeRequest = {
  characterId: 'PIP' | 'GOAT';
  byteSize: number;
  extension: string;
  sha256?: string | null;
  bytes?: Uint8Array | null;
  evidenceClass: 'REAL_RIG_INTAKE' | 'SYNTHETIC_FIXTURE';
  existingSha256s?: readonly string[];
};

const TRANSITIONS: RigArrivalState[] = [...RIG_ARRIVAL_STATES];

function fail(characterId: 'PIP' | 'GOAT', evidenceClass: RigIntakeRecord['evidenceClass'], blocker: string): RigIntakeRecord {
  return {
    schemaVersion: RIG_ARRIVAL_SCHEMA,
    characterId,
    state: 'NOT_PRESENT',
    sourcePresent: false,
    stored: false,
    hashVerified: false,
    observedSha256: null,
    byteSize: null,
    extension: null,
    evidenceClass,
    autoApproved: false,
    priorVersionOverwritten: false,
    filenameUsedAsIdentity: false,
    blocker,
  };
}

export function admitRigMetadata(input: RigIntakeRequest): RigIntakeRecord {
  const extension = input.extension.toLowerCase().startsWith('.') ? input.extension.toLowerCase() : `.${input.extension.toLowerCase()}`;
  if (!RIG_ALLOWED_EXTENSIONS.includes(extension as (typeof RIG_ALLOWED_EXTENSIONS)[number])) {
    return fail(input.characterId, input.evidenceClass, 'RIG_EXTENSION_REJECTED');
  }
  if (input.byteSize < RIG_MIN_BYTES) return fail(input.characterId, input.evidenceClass, 'RIG_TOO_SMALL');
  if (input.byteSize > RIG_MAX_BYTES) return fail(input.characterId, input.evidenceClass, 'RIG_TOO_LARGE');
  const observed = input.bytes ? sha256Bytes(input.bytes) : input.sha256 ?? null;
  if (!isValidSha256(observed)) return fail(input.characterId, input.evidenceClass, 'RIG_HASH_REQUIRED');
  if (input.existingSha256s?.includes(observed)) {
    return {
      ...fail(input.characterId, input.evidenceClass, 'RIG_DUPLICATE_VERSION'),
      observedSha256: observed,
      byteSize: input.byteSize,
      extension,
    };
  }
  return {
    schemaVersion: RIG_ARRIVAL_SCHEMA,
    characterId: input.characterId,
    state: 'STORED',
    sourcePresent: true,
    stored: true,
    hashVerified: false,
    observedSha256: observed,
    byteSize: input.byteSize,
    extension,
    evidenceClass: input.evidenceClass,
    autoApproved: false,
    priorVersionOverwritten: false,
    filenameUsedAsIdentity: false,
    blocker: null,
  };
}

export function advanceRigArrival(record: RigIntakeRecord, next: RigArrivalState): RigIntakeRecord {
  const current = TRANSITIONS.indexOf(record.state);
  const target = TRANSITIONS.indexOf(next);
  if (target !== current + 1) {
    return { ...record, blocker: `INVALID_RIG_TRANSITION:${record.state}->${next}` };
  }
  if (next === 'HASH_VERIFIED' && !isValidSha256(record.observedSha256)) {
    return { ...record, blocker: 'RIG_HASH_REQUIRED' };
  }
  return {
    ...record,
    state: next,
    hashVerified: next === 'HASH_VERIFIED' || record.hashVerified || target > TRANSITIONS.indexOf('HASH_VERIFIED'),
    autoApproved: false,
    blocker: next === 'HUMAN_APPROVAL_REQUIRED' ? 'HUMAN_APPROVAL_REQUIRED' : null,
  };
}

export function playSyntheticRigArrival(characterId: 'PIP' | 'GOAT'): RigIntakeRecord[] {
  const bytes = new TextEncoder().encode(`synthetic-rig-metadata:${characterId}:${'x'.repeat(1024)}`);
  const stored = admitRigMetadata({
    characterId,
    byteSize: bytes.byteLength,
    extension: '.blend',
    bytes,
    evidenceClass: 'SYNTHETIC_FIXTURE',
  });
  const path: RigArrivalState[] = ['HASH_VERIFIED', 'INSPECTION_REQUIRED', 'CAPABILITY_CHECK', 'VISUAL_REVIEW', 'HUMAN_APPROVAL_REQUIRED'];
  const rows = [stored];
  let current = stored;
  for (const next of path) {
    current = advanceRigArrival(current, next);
    rows.push(current);
  }
  return rows;
}

export function syntheticRigCannotReachApproval(rows: readonly RigIntakeRecord[]): true {
  const last = rows.at(-1);
  if (!last || last.state !== 'HUMAN_APPROVAL_REQUIRED' || last.evidenceClass !== 'SYNTHETIC_FIXTURE' || last.autoApproved) {
    throw new Error('Synthetic rig playbook must stop at HUMAN_APPROVAL_REQUIRED without approval.');
  }
  return true;
}

export function currentRigReadiness(): {
  pip: ReturnType<typeof dryRunRigArrival>;
  goat: ReturnType<typeof dryRunRigArrival>;
  pipStatus: 'NOT_PRESENT';
  goatStatus: 'NOT_PRESENT';
} {
  return {
    pip: dryRunRigArrival('PIP'),
    goat: dryRunRigArrival('GOAT'),
    pipStatus: 'NOT_PRESENT',
    goatStatus: 'NOT_PRESENT',
  };
}

export function rigVersionReceipt(record: RigIntakeRecord): string {
  return sha256Text(`${record.characterId}:${record.observedSha256}:${record.byteSize}:${record.extension}`);
}

import { cleanupMaterialization, materializeSource } from '@/lib/tivvlejoy-real-scenery-inspection/materialization';
import type { AbstractSourceReceipt } from '@/lib/tivvlejoy-real-scenery-inspection/types';
import { isValidSha256, sha256Stream } from './hash';
import { mergeBudget } from './budget';
import type { HashState, HashVerification, ListedPrivateObject, ReadBudget } from './types';

export type MaterializedRealSource = {
  objectIdentity: string;
  sourceId: string;
  bytes: Uint8Array | null;
  byteSize: number;
  hash: HashVerification;
  resumedExistingReceipt: boolean;
  cleanedUp: boolean;
  timeout: boolean;
  diskBytesTracked: number;
};

function hashState(observed: string | null, expected: string | null, failed: boolean): HashState {
  if (failed) return 'READ_FAILED';
  if (!observed) return 'HASH_UNAVAILABLE';
  if (!isValidSha256(expected)) return 'HASH_MISSING_EXPECTED';
  if (observed === expected) return 'HASH_VERIFIED';
  return 'HASH_MISMATCH';
}

export async function verifySourceHash(input: {
  sourceId: string;
  objectIdentity: string | null;
  bytes: Uint8Array | null;
  expectedSha256?: string | null;
  clientSha256?: string | null;
  failed?: boolean;
}): Promise<HashVerification> {
  const observed = input.bytes ? await sha256Stream(input.bytes) : null;
  const expected = input.expectedSha256 ?? null;
  return {
    sourceId: input.sourceId,
    objectIdentity: input.objectIdentity,
    observedSha256: observed,
    expectedSha256: expected,
    clientSha256: input.clientSha256 ?? null,
    state: hashState(observed, expected, Boolean(input.failed)),
    streamed: true,
    sourceMutated: false,
  };
}

export async function materializeRealSource(input: {
  object: ListedPrivateObject;
  receipt: AbstractSourceReceipt;
  readBytes: () => Promise<Uint8Array | null>;
  budget?: ReadBudget;
  previousHash?: string | null;
  now?: () => number;
}): Promise<MaterializedRealSource> {
  const budget = mergeBudget(input.budget);
  const started = (input.now ?? Date.now)();
  if (input.previousHash && isValidSha256(input.previousHash) && input.previousHash === input.object.knownSourceSha256) {
    return {
      objectIdentity: input.object.objectIdentity,
      sourceId: input.receipt.sourceId,
      bytes: null,
      byteSize: input.object.size,
      hash: {
        sourceId: input.receipt.sourceId,
        objectIdentity: input.object.objectIdentity,
        observedSha256: input.previousHash,
        expectedSha256: input.receipt.sourceSha256,
        clientSha256: null,
        state: 'HASH_VERIFIED',
        streamed: true,
        sourceMutated: false,
      },
      resumedExistingReceipt: true,
      cleanedUp: true,
      timeout: false,
      diskBytesTracked: 0,
    };
  }

  let bytes: Uint8Array | null = null;
  let failed = false;
  try {
    const timeout = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('MATERIALIZATION_TIMEOUT')), budget.timeoutMs);
    });
    bytes = await Promise.race([input.readBytes(), timeout]);
  } catch {
    failed = true;
    bytes = null;
  }
  const timeout = (input.now ?? Date.now)() - started > budget.timeoutMs || failed;
  const hash = await verifySourceHash({
    sourceId: input.receipt.sourceId,
    objectIdentity: input.object.objectIdentity,
    bytes,
    expectedSha256: input.receipt.sourceSha256 ?? input.object.knownSourceSha256,
    failed: timeout && !bytes,
  });
  const isolated = bytes
    ? await materializeSource({
        receipt: input.receipt,
        bytes,
        limits: { maxByteBudget: budget.maxSingleObjectBytes, timeoutMs: budget.timeoutMs },
      })
    : null;
  if (isolated) cleanupMaterialization(isolated);
  return {
    objectIdentity: input.object.objectIdentity,
    sourceId: input.receipt.sourceId,
    bytes,
    byteSize: bytes?.byteLength ?? 0,
    hash,
    resumedExistingReceipt: false,
    cleanedUp: true,
    timeout,
    diskBytesTracked: 0,
  };
}

export function trackDiskBudget(usedBytes: number, limitBytes: number): { withinBudget: boolean; usedBytes: number } {
  return { withinBudget: usedBytes <= limitBytes, usedBytes };
}

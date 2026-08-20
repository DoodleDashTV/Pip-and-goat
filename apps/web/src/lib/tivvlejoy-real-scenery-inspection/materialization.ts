import { MATERIALIZATION_SCHEMA, DEFAULT_MATERIALIZATION_LIMITS, type AbstractSourceReceipt, type MaterializationLimits, type SourceState } from './types';
import { isValidSha256, sha256Bytes } from './hash';
import { createIsolatedWorkspace, destroyIsolatedWorkspace, writeReadOnlySourceCopy, type IsolatedWorkspace } from './workspace';

export type SourceByteProvider = (receipt: AbstractSourceReceipt) => Promise<Uint8Array | null> | Uint8Array | null;

export type MaterializationResult = {
  schemaVersion: typeof MATERIALIZATION_SCHEMA;
  sourceId: string;
  sourceReceiptRef: string | null;
  state: SourceState;
  expectedByteSize: number | null;
  observedByteSize: number | null;
  expectedSha256: string | null;
  observedSha256: string | null;
  workspace: IsolatedWorkspace | null;
  sourcePath: string | null;
  timeoutMs: number;
  maxByteBudget: number;
  filenameUsedForIdentity: false;
  r2Mutated: false;
  deleted: false;
  renamed: false;
  overwritten: false;
  blocker: string | null;
};

function fail(
  receipt: AbstractSourceReceipt,
  state: SourceState,
  limits: MaterializationLimits,
  extras: Partial<MaterializationResult> = {},
): MaterializationResult {
  return {
    schemaVersion: MATERIALIZATION_SCHEMA,
    sourceId: receipt.sourceId,
    sourceReceiptRef: receipt.sourceReceiptRef,
    state,
    expectedByteSize: receipt.storedByteSize,
    observedByteSize: extras.observedByteSize ?? null,
    expectedSha256: receipt.sourceSha256,
    observedSha256: extras.observedSha256 ?? null,
    workspace: extras.workspace ?? null,
    sourcePath: extras.sourcePath ?? null,
    timeoutMs: limits.timeoutMs,
    maxByteBudget: limits.maxByteBudget,
    filenameUsedForIdentity: false,
    r2Mutated: false,
    deleted: false,
    renamed: false,
    overwritten: false,
    blocker: extras.blocker ?? state,
  };
}

export async function materializeSource(input: {
  receipt: AbstractSourceReceipt;
  readBytes?: SourceByteProvider;
  bytes?: Uint8Array | null;
  limits?: Partial<MaterializationLimits>;
  now?: () => number;
}): Promise<MaterializationResult> {
  const limits = { ...DEFAULT_MATERIALIZATION_LIMITS, ...input.limits };
  const receipt = input.receipt;
  const started = (input.now ?? Date.now)();

  if (!receipt.receiptPresent || !receipt.sourceReceiptRef) {
    return fail(receipt, 'SOURCE_RECEIPT_MISSING', limits);
  }
  if (receipt.storageState !== 'STORED') {
    return fail(receipt, 'SOURCE_NOT_AVAILABLE', limits, {
      blocker: `storageState=${receipt.storageState}`,
    });
  }

  let workspace: IsolatedWorkspace | null = null;
  try {
    const bytes =
      input.bytes === undefined
        ? input.readBytes
          ? await input.readBytes(receipt)
          : null
        : input.bytes;
    if ((input.now ?? Date.now)() - started > limits.timeoutMs) {
      return fail(receipt, 'SOURCE_MATERIALIZATION_FAILED', limits, { blocker: 'TIMEOUT' });
    }
    if (!bytes) {
      return fail(receipt, 'SOURCE_NOT_AVAILABLE', limits, {
        blocker: 'SOURCE_BYTES_UNAVAILABLE',
      });
    }
    if (bytes.byteLength > limits.maxByteBudget) {
      return fail(receipt, 'SOURCE_MATERIALIZATION_FAILED', limits, {
        observedByteSize: bytes.byteLength,
        blocker: 'BYTE_BUDGET_EXCEEDED',
      });
    }
    if (receipt.storedByteSize != null && receipt.storedByteSize !== bytes.byteLength) {
      return fail(receipt, 'SOURCE_SIZE_MISMATCH', limits, {
        observedByteSize: bytes.byteLength,
      });
    }
    const observedSha256 = sha256Bytes(bytes);
    if (!receipt.sourceSha256 || !isValidSha256(receipt.sourceSha256)) {
      workspace = createIsolatedWorkspace();
      const sourcePath = writeReadOnlySourceCopy(workspace, receipt.sourceId, bytes);
      return {
        ...fail(receipt, 'SOURCE_HASH_MISSING', limits, {
          observedByteSize: bytes.byteLength,
          observedSha256,
          workspace,
          sourcePath,
        }),
      };
    }
    if (receipt.sourceSha256 !== observedSha256) {
      return fail(receipt, 'SOURCE_HASH_MISMATCH', limits, {
        observedByteSize: bytes.byteLength,
        observedSha256,
      });
    }
    workspace = createIsolatedWorkspace();
    const sourcePath = writeReadOnlySourceCopy(workspace, receipt.sourceId, bytes);
    return {
      schemaVersion: MATERIALIZATION_SCHEMA,
      sourceId: receipt.sourceId,
      sourceReceiptRef: receipt.sourceReceiptRef,
      state: 'SOURCE_READY',
      expectedByteSize: receipt.storedByteSize,
      observedByteSize: bytes.byteLength,
      expectedSha256: receipt.sourceSha256,
      observedSha256,
      workspace,
      sourcePath,
      timeoutMs: limits.timeoutMs,
      maxByteBudget: limits.maxByteBudget,
      filenameUsedForIdentity: false,
      r2Mutated: false,
      deleted: false,
      renamed: false,
      overwritten: false,
      blocker: null,
    };
  } catch (error) {
    if (workspace) destroyIsolatedWorkspace(workspace);
    return fail(receipt, 'SOURCE_MATERIALIZATION_FAILED', limits, {
      blocker: error instanceof Error ? error.message : 'unknown materialization failure',
    });
  }
}

export function cleanupMaterialization(result: MaterializationResult): MaterializationResult {
  if (result.workspace) destroyIsolatedWorkspace(result.workspace);
  return { ...result, workspace: null, sourcePath: null };
}

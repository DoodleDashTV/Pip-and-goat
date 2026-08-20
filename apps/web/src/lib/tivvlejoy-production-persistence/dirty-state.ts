export const SAVE_STATUSES = [
  'Saved',
  'Saving',
  'Unsaved changes',
  'Conflict detected',
  'Save failed',
] as const;
export type SaveStatus = (typeof SAVE_STATUSES)[number];

export type DirtyPersistenceState = {
  dirty: boolean;
  saveStatus: SaveStatus;
  lastReceiptRevision: number | null;
  lastReceiptSha256: string | null;
};

export function createDirtyPersistenceState(): DirtyPersistenceState {
  return {
    dirty: false,
    saveStatus: 'Saved',
    lastReceiptRevision: null,
    lastReceiptSha256: null,
  };
}

export function markUnsaved(state: DirtyPersistenceState): DirtyPersistenceState {
  return { ...state, dirty: true, saveStatus: 'Unsaved changes' };
}

export function markSaving(state: DirtyPersistenceState): DirtyPersistenceState {
  return { ...state, saveStatus: 'Saving' };
}

export function markSaved(
  state: DirtyPersistenceState,
  receipt: { result: string; revision: number; dependencySha256: string },
): DirtyPersistenceState {
  if (receipt.result === 'WRITE_CONFLICT') {
    return { ...state, dirty: true, saveStatus: 'Conflict detected' };
  }
  if (receipt.result === 'WRITE_REJECTED' || receipt.result === 'WRITE_STALE') {
    return { ...state, dirty: true, saveStatus: 'Save failed' };
  }
  if (receipt.result === 'WRITE_ACCEPTED' || receipt.result === 'WRITE_IDEMPOTENT') {
    return {
      dirty: false,
      saveStatus: 'Saved',
      lastReceiptRevision: receipt.revision,
      lastReceiptSha256: receipt.dependencySha256,
    };
  }
  return { ...state, dirty: true, saveStatus: 'Save failed' };
}

export function shouldWarnBeforeUnload(state: DirtyPersistenceState): boolean {
  return state.dirty && state.saveStatus !== 'Saved';
}

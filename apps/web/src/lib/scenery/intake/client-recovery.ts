import {
  sanitizeClientRecoverySnapshot,
  type ClientRecoverySnapshot,
} from './recovery';

export const CLIENT_RECOVERY_STORAGE_KEY = 'tivvlejoy.scenery.intake.recovery.v1';

export type ClientRecoveryStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryFallback(): ClientRecoveryStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export function resolveClientRecoveryStore(explicit?: ClientRecoveryStore | null): ClientRecoveryStore {
  if (explicit) return explicit;
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* private browsing or unavailable storage */
  }
  return memoryFallback();
}

export function loadClientRecoverySnapshots(store?: ClientRecoveryStore | null): ClientRecoverySnapshot[] {
  const storage = resolveClientRecoveryStore(store);
  const raw = storage.getItem(CLIENT_RECOVERY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { sessions?: ClientRecoverySnapshot[] };
    return (parsed.sessions ?? []).map(sanitizeClientRecoverySnapshot);
  } catch {
    return [];
  }
}

export function saveClientRecoverySnapshot(
  snapshot: ClientRecoverySnapshot,
  store?: ClientRecoveryStore | null,
): ClientRecoverySnapshot[] {
  const storage = resolveClientRecoveryStore(store);
  const safe = sanitizeClientRecoverySnapshot(snapshot);
  const next = [
    safe,
    ...loadClientRecoverySnapshots(storage).filter((item) => item.sessionId !== safe.sessionId),
  ].slice(0, 27);
  storage.setItem(CLIENT_RECOVERY_STORAGE_KEY, JSON.stringify({ sessions: next }));
  return next;
}

export function removeClientRecoverySnapshot(sessionId: string, store?: ClientRecoveryStore | null): void {
  const storage = resolveClientRecoveryStore(store);
  const next = loadClientRecoverySnapshots(storage).filter((item) => item.sessionId !== sessionId);
  storage.setItem(CLIENT_RECOVERY_STORAGE_KEY, JSON.stringify({ sessions: next }));
}

export function matchClientRecoverySnapshot(
  snapshots: readonly ClientRecoverySnapshot[],
  file: { name: string; size: number },
): ClientRecoverySnapshot | null {
  return snapshots.find((item) => item.filename === file.name && item.byteSize === file.size) ?? null;
}

export function clientRecoveryContainsSecrets(snapshot: ClientRecoverySnapshot): boolean {
  const serialized = JSON.stringify(snapshot).toLowerCase();
  return (
    serialized.includes('x-amz-') ||
    serialized.includes('signedurl') ||
    serialized.includes('token') ||
    serialized.includes('secret')
  );
}

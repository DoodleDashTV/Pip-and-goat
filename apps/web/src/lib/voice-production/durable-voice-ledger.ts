import {
  DURABLE_LEDGER_COPY,
  DURABLE_LEDGER_RECONCILE_PROCEDURE,
  PRIOR_PAID_USAGE_EVIDENCE,
  PRIOR_PAID_USAGE_KNOWN,
  type PublicDurableVoiceLedger,
} from './durable-voice-ledger-public';
import {
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import { currentUsageMonth, emptyLedger, type VoiceEnv } from './safety';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type VoiceUsageLedger } from './types';

export type DurableSpeaker = 'pip' | 'goat';
export type DurableEntryStatus = 'reserved' | 'succeeded' | 'failed' | 'unfinalized' | 'reconciled';

export type SafeVoiceReceipt = {
  requestId: string;
  receiptRef: string;
  character: DurableSpeaker;
  characterCount: number;
  createdAt: string;
  status: 'succeeded';
  deploymentId: string;
};

export type DurableLedgerRecord = {
  available: boolean;
  reconciled: boolean;
  paidRequests: number;
  paidCharactersUsed: number;
  failedAttempts: number;
  reservedRequests: number;
  reservedCharacters: number;
  unfinalizedCount: number;
  reconciliationStatus: 'required' | 'imported' | 'unavailable';
  reconciliationEvidence: string | null;
  month: string;
};

export type DurableLedgerEntry = {
  idempotencyKey: string;
  requestId: string;
  character: DurableSpeaker;
  characterCount: number;
  status: DurableEntryStatus;
  receiptRef: string | null;
  createdAt: string;
  updatedAt: string;
  deploymentId: string;
};

export type ReserveInput = {
  requestId: string;
  character: DurableSpeaker;
  characterCount: number;
  deploymentId?: string;
};

export type DurableVoiceLedgerStore = {
  kind: 'shared-memory' | 'postgres' | 'unavailable';
  read(): Promise<DurableLedgerRecord>;
  readSync(): DurableLedgerRecord;
  getEntry(requestId: string): Promise<DurableLedgerEntry | null>;
  reserve(input: ReserveInput): Promise<{ entry: DurableLedgerEntry; replay?: SafeVoiceReceipt }>;
  finalize(input: {
    requestId: string;
    receiptRef: string;
    createdAt: string;
  }): Promise<{ record: DurableLedgerRecord; receipt: SafeVoiceReceipt }>;
  fail(input: { requestId: string; providerContacted: boolean }): Promise<DurableLedgerRecord>;
  importPriorUsageOnce(input: {
    paidRequests: number;
    paidCharacters: number;
    evidence: string;
  }): Promise<{ imported: boolean; record: DurableLedgerRecord }>;
  seedPaidUsage?(input: { requestId: string; character: DurableSpeaker; characterCount: number }): DurableLedgerRecord;
};

const UNAVAILABLE_RECORD: DurableLedgerRecord = {
  available: false,
  reconciled: false,
  paidRequests: 0,
  paidCharactersUsed: 0,
  failedAttempts: 0,
  reservedRequests: 0,
  reservedCharacters: 0,
  unfinalizedCount: 0,
  reconciliationStatus: 'unavailable',
  reconciliationEvidence: null,
  month: currentUsageMonth(),
};

function cloneRecord(record: DurableLedgerRecord): DurableLedgerRecord {
  return { ...record };
}

export function speakerFromCharacterId(characterId: string): DurableSpeaker {
  if (characterId === PIP_CHARACTER_ID || characterId === 'pip') return 'pip';
  if (characterId === GOAT_CHARACTER_ID || characterId === 'goat') return 'goat';
  throw new VoiceProductionError('Only Pip and Goat are accepted as speakers.', 'UNKNOWN_CHARACTER');
}

export function readDeploymentId(env: VoiceEnv = process.env): string {
  const explicit = String(env.VERCEL_DEPLOYMENT_ID ?? '').trim();
  if (explicit) return explicit.slice(0, 80);
  const url = String(env.VERCEL_URL ?? '').trim().replace(/^https?:\/\//, '');
  if (url) return url.slice(0, 80);
  return 'local-preview';
}

export function isDurableLedgerConfigured(env: VoiceEnv = process.env): boolean {
  return (
    String(env.TIVVLEJOY_VOICE_LEDGER_DURABLE ?? '').trim() === 'true' &&
    Boolean(String(env.TIVVLEJOY_VOICE_LEDGER_DATABASE_URL ?? '').trim())
  );
}

export function createUnavailableDurableLedgerStore(): DurableVoiceLedgerStore {
  const blocked = async () => {
    throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
  };
  return {
    kind: 'unavailable',
    async read() {
      return cloneRecord(UNAVAILABLE_RECORD);
    },
    readSync() {
      return cloneRecord(UNAVAILABLE_RECORD);
    },
    async getEntry() {
      return null;
    },
    reserve: blocked,
    finalize: blocked,
    fail: blocked,
    importPriorUsageOnce: blocked,
  };
}

function emptyWorkingRecord(): DurableLedgerRecord {
  return {
    available: true,
    reconciled: false,
    paidRequests: 0,
    paidCharactersUsed: 0,
    failedAttempts: 0,
    reservedRequests: 0,
    reservedCharacters: 0,
    unfinalizedCount: 0,
    reconciliationStatus: PRIOR_PAID_USAGE_KNOWN ? 'required' : 'imported',
    reconciliationEvidence: PRIOR_PAID_USAGE_KNOWN ? PRIOR_PAID_USAGE_EVIDENCE : null,
    month: currentUsageMonth(),
  };
}

function assertImportTotals(paidRequests: number, paidCharacters: number, evidence: string) {
  if (!String(evidence ?? '').trim()) {
    throw new VoiceProductionError(
      'Prior paid usage requires reconciliation evidence. Totals were not invented.',
      'PRIOR_USAGE_RECONCILIATION',
    );
  }
  if (!Number.isInteger(paidRequests) || !Number.isInteger(paidCharacters) || paidRequests < 0 || paidCharacters < 0) {
    throw new VoiceProductionError('Prior paid usage totals must be exact whole numbers.', 'PRIOR_USAGE_RECONCILIATION');
  }
  if (PRIOR_PAID_USAGE_KNOWN && (paidRequests < 2 || paidCharacters < 1)) {
    throw new VoiceProductionError(
      'Prior paid usage cannot silently reset to zero. Import the exact request and character totals.',
      'PRIOR_USAGE_RECONCILIATION',
    );
  }
}

export function createSharedDurableLedgerStore(seed: DurableLedgerRecord = emptyWorkingRecord()): DurableVoiceLedgerStore {
  let record = cloneRecord({ ...seed, available: true });
  const entries = new Map<string, DurableLedgerEntry>();
  let lock: Promise<void> = Promise.resolve();

  function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function remaining(next: DurableLedgerRecord) {
    const usedRequests = next.paidRequests + next.reservedRequests;
    const usedCharacters = next.paidCharactersUsed + next.reservedCharacters;
    return {
      requests: SCRIPT_TO_VOICE_MAX_PAID_REQUESTS - usedRequests,
      characters: SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - usedCharacters,
    };
  }

  return {
    kind: 'shared-memory',
    async read() {
      return cloneRecord(record);
    },
    readSync() {
      return cloneRecord(record);
    },
    async getEntry(requestId) {
      return entries.get(requestId) ? { ...entries.get(requestId)! } : null;
    },
    reserve(input) {
      return withLock(() => {
        if (!record.available) {
          throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
        }
        if (!record.reconciled) {
          throw new VoiceProductionError(DURABLE_LEDGER_COPY.reconcile, 'PRIOR_USAGE_RECONCILIATION');
        }
        const existing = entries.get(input.requestId);
        if (existing?.status === 'succeeded' && existing.receiptRef) {
          return {
            entry: { ...existing },
            replay: {
              requestId: existing.requestId,
              receiptRef: existing.receiptRef,
              character: existing.character,
              characterCount: existing.characterCount,
              createdAt: existing.createdAt,
              status: 'succeeded' as const,
              deploymentId: existing.deploymentId,
            },
          };
        }
        if (existing) {
          throw new VoiceProductionError(
            'This confirmed line was already submitted. It was not retried and was not billed again.',
            'DUPLICATE_REQUEST',
          );
        }
        if (input.characterCount > SCRIPT_TO_VOICE_MAX_CHARS) {
          throw new VoiceProductionError(
            `Line exceeds the temporary Preview limit of ${SCRIPT_TO_VOICE_MAX_CHARS} characters.`,
            'REQUEST_LIMIT',
          );
        }
        const room = remaining(record);
        if (room.requests < 1) {
          throw new VoiceProductionError(
            `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_REQUESTS} successful paid requests is used up.`,
            'PREVIEW_REQUEST_ALLOWANCE',
          );
        }
        if (room.characters < input.characterCount) {
          throw new VoiceProductionError(
            `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS} paid characters would be exceeded.`,
            'PREVIEW_CHARACTER_ALLOWANCE',
          );
        }
        const now = new Date().toISOString();
        const entry: DurableLedgerEntry = {
          idempotencyKey: input.requestId,
          requestId: input.requestId,
          character: input.character,
          characterCount: input.characterCount,
          status: 'reserved',
          receiptRef: null,
          createdAt: now,
          updatedAt: now,
          deploymentId: input.deploymentId ?? 'local-preview',
        };
        entries.set(input.requestId, entry);
        record = {
          ...record,
          reservedRequests: record.reservedRequests + 1,
          reservedCharacters: record.reservedCharacters + input.characterCount,
        };
        return { entry: { ...entry } };
      });
    },
    finalize(input) {
      return withLock(() => {
        const existing = entries.get(input.requestId);
        if (!existing) {
          throw new VoiceProductionError('Paid generation paused — durable ledger unavailable', 'DURABLE_LEDGER_UNAVAILABLE');
        }
        if (existing.status === 'succeeded' && existing.receiptRef) {
          return {
            record: cloneRecord(record),
            receipt: {
              requestId: existing.requestId,
              receiptRef: existing.receiptRef,
              character: existing.character,
              characterCount: existing.characterCount,
              createdAt: existing.createdAt,
              status: 'succeeded' as const,
              deploymentId: existing.deploymentId,
            },
          };
        }
        if (existing.status !== 'reserved' && existing.status !== 'unfinalized') {
          throw new VoiceProductionError(
            'This confirmed line was already submitted. It was not retried and was not billed again.',
            'DUPLICATE_REQUEST',
          );
        }
        const now = input.createdAt || new Date().toISOString();
        const next: DurableLedgerEntry = {
          ...existing,
          status: 'succeeded',
          receiptRef: input.receiptRef,
          updatedAt: now,
        };
        entries.set(input.requestId, next);
        record = {
          ...record,
          paidRequests: record.paidRequests + 1,
          paidCharactersUsed: record.paidCharactersUsed + existing.characterCount,
          reservedRequests: Math.max(0, record.reservedRequests - 1),
          reservedCharacters: Math.max(0, record.reservedCharacters - existing.characterCount),
          unfinalizedCount:
            existing.status === 'unfinalized' ? Math.max(0, record.unfinalizedCount - 1) : record.unfinalizedCount,
        };
        return {
          record: cloneRecord(record),
          receipt: {
            requestId: next.requestId,
            receiptRef: next.receiptRef!,
            character: next.character,
            characterCount: next.characterCount,
            createdAt: next.createdAt,
            status: 'succeeded',
            deploymentId: next.deploymentId,
          },
        };
      });
    },
    fail(input) {
      return withLock(() => {
        const existing = entries.get(input.requestId);
        if (!existing) {
          record = { ...record, failedAttempts: record.failedAttempts + 1 };
          return cloneRecord(record);
        }
        if (existing.status === 'succeeded') {
          return cloneRecord(record);
        }
        const nextStatus: DurableEntryStatus = input.providerContacted && existing.status === 'reserved' ? 'unfinalized' : 'failed';
        entries.set(input.requestId, {
          ...existing,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        });
        record = {
          ...record,
          failedAttempts: record.failedAttempts + 1,
          reservedRequests: existing.status === 'reserved' ? Math.max(0, record.reservedRequests - 1) : record.reservedRequests,
          reservedCharacters:
            existing.status === 'reserved'
              ? Math.max(0, record.reservedCharacters - existing.characterCount)
              : record.reservedCharacters,
          unfinalizedCount: nextStatus === 'unfinalized' ? record.unfinalizedCount + 1 : record.unfinalizedCount,
        };
        return cloneRecord(record);
      });
    },
    importPriorUsageOnce(input) {
      return withLock(() => {
        assertImportTotals(input.paidRequests, input.paidCharacters, input.evidence);
        if (record.reconciled) {
          if (record.paidRequests === input.paidRequests && record.paidCharactersUsed === input.paidCharacters) {
            return { imported: false, record: cloneRecord(record) };
          }
          throw new VoiceProductionError(
            'Prior paid usage was already imported. Totals cannot be replaced.',
            'PRIOR_USAGE_RECONCILIATION',
          );
        }
        record = {
          ...record,
          reconciled: true,
          paidRequests: input.paidRequests,
          paidCharactersUsed: input.paidCharacters,
          reconciliationStatus: 'imported',
          reconciliationEvidence: String(input.evidence).trim(),
        };
        return { imported: true, record: cloneRecord(record) };
      });
    },
    seedPaidUsage(input) {
      const now = new Date().toISOString();
      entries.set(input.requestId, {
        idempotencyKey: input.requestId,
        requestId: input.requestId,
        character: input.character,
        characterCount: input.characterCount,
        status: 'succeeded',
        receiptRef: input.requestId,
        createdAt: now,
        updatedAt: now,
        deploymentId: 'test',
      });
      record = {
        ...record,
        reconciled: true,
        reconciliationStatus: 'imported',
        paidRequests: record.paidRequests + 1,
        paidCharactersUsed: record.paidCharactersUsed + input.characterCount,
      };
      return cloneRecord(record);
    },
  };
}

let installedStore: DurableVoiceLedgerStore | null = null;

export function installPreviewVoiceLedgerStore(store: DurableVoiceLedgerStore | null): void {
  installedStore = store;
}

export function resetDurableVoiceLedgerForTests(): DurableVoiceLedgerStore {
  const store = createSharedDurableLedgerStore({
    ...emptyWorkingRecord(),
    reconciled: true,
    reconciliationStatus: 'imported',
    reconciliationEvidence: 'test-isolated-ledger',
  });
  installedStore = store;
  return store;
}

export function getInstalledPreviewVoiceLedgerStore(): DurableVoiceLedgerStore | null {
  return installedStore;
}

type PostgresStoreFactory = (env: VoiceEnv) => DurableVoiceLedgerStore;
let postgresStoreFactory: PostgresStoreFactory | null = null;
const postgresStores = new Map<string, DurableVoiceLedgerStore>();

export function registerPostgresVoiceLedgerStore(factory: PostgresStoreFactory): void {
  postgresStoreFactory = factory;
}

export function resolvePreviewVoiceLedgerStore(env: VoiceEnv = process.env): DurableVoiceLedgerStore {
  if (installedStore) return installedStore;
  if (!isDurableLedgerConfigured(env)) {
    return createUnavailableDurableLedgerStore();
  }
  if (!postgresStoreFactory) {
    return createUnavailableDurableLedgerStore();
  }
  const key = String(env.TIVVLEJOY_VOICE_LEDGER_DATABASE_URL ?? '').trim();
  const existing = postgresStores.get(key);
  if (existing) return existing;
  const created = postgresStoreFactory(env);
  postgresStores.set(key, created);
  return created;
}

export function publicDurableLedgerView(
  env: VoiceEnv = process.env,
  record: DurableLedgerRecord = resolvePreviewVoiceLedgerStore(env).readSync(),
): PublicDurableVoiceLedger {
  if (!record.available || record.reconciliationStatus === 'unavailable') {
    return {
      title: DURABLE_LEDGER_COPY.title,
      status: 'unavailable',
      message: DURABLE_LEDGER_COPY.unavailable,
      available: false,
      reconciled: false,
      generateEnabled: false,
      paidRequests: null,
      paidCharactersUsed: null,
      remainingRequests: null,
      remainingCharacters: null,
      failedAttempts: null,
      authoritative: false,
      providerContacted: false,
      productionEnabled: false,
    };
  }
  if (!record.reconciled) {
    return {
      title: DURABLE_LEDGER_COPY.title,
      status: 'reconciliation_required',
      message: DURABLE_LEDGER_COPY.reconcile,
      available: true,
      reconciled: false,
      generateEnabled: false,
      paidRequests: null,
      paidCharactersUsed: null,
      remainingRequests: null,
      remainingCharacters: null,
      failedAttempts: record.failedAttempts,
      authoritative: false,
      providerContacted: false,
      productionEnabled: false,
    };
  }
  return {
    title: DURABLE_LEDGER_COPY.title,
    status: 'protected',
    message: DURABLE_LEDGER_COPY.protected,
    available: true,
    reconciled: true,
    generateEnabled: true,
    paidRequests: record.paidRequests,
    paidCharactersUsed: record.paidCharactersUsed,
    remainingRequests: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_REQUESTS - record.paidRequests),
    remainingCharacters: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - record.paidCharactersUsed),
    failedAttempts: record.failedAttempts,
    authoritative: true,
    providerContacted: false,
    productionEnabled: false,
  };
}

export function durableRecordToUsageLedger(record: DurableLedgerRecord): VoiceUsageLedger {
  return {
    ...emptyLedger(record.month),
    paidCharactersUsed: record.reconciled ? record.paidCharactersUsed : 0,
    paidRequests: record.reconciled ? record.paidRequests : 0,
    hardStopped: record.reconciled
      ? record.paidRequests >= SCRIPT_TO_VOICE_MAX_PAID_REQUESTS ||
        record.paidCharactersUsed >= SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS
      : true,
  };
}

export function assertDurableGenerateReady(record: DurableLedgerRecord): void {
  if (!record.available) {
    throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
  }
  if (!record.reconciled) {
    throw new VoiceProductionError(DURABLE_LEDGER_COPY.reconcile, 'PRIOR_USAGE_RECONCILIATION');
  }
}

export function maybeImportPriorUsageFromEnv(
  store: DurableVoiceLedgerStore,
  env: VoiceEnv = process.env,
): Promise<{ imported: boolean; record: DurableLedgerRecord } | null> {
  const requests = String(env.TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS ?? '').trim();
  const characters = String(env.TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS ?? '').trim();
  const evidence = String(env.TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE ?? '').trim();
  if (!requests || !characters || !evidence) return Promise.resolve(null);
  return store.importPriorUsageOnce({
    paidRequests: Number(requests),
    paidCharacters: Number(characters),
    evidence,
  });
}

export { DURABLE_LEDGER_RECONCILE_PROCEDURE, PRIOR_PAID_USAGE_EVIDENCE, PRIOR_PAID_USAGE_KNOWN };

import { PrismaClient } from '@doodle-dash/database';
import {
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_AUTHORIZED_REQUEST_COUNT,
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-paid-voice-constants';
import {
  assertEp012ReservationIdentity,
  countEp012Usage,
  replayFromExecution,
  type Ep012ExecutionRecord,
  type Ep012ExecutionStatus,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-paid-voice-ledger';
import {
  createUnavailableDurableLedgerStore,
  registerPostgresVoiceLedgerStore,
  type DurableLedgerEntry,
  type DurableLedgerRecord,
  type DurableSpeaker,
  type DurableVoiceLedgerStore,
  type ReserveInput,
  type SafeVoiceReceipt,
} from './durable-voice-ledger';
import { DURABLE_LEDGER_COPY, PRIOR_PAID_USAGE_EVIDENCE, PRIOR_PAID_USAGE_KNOWN } from './durable-voice-ledger-public';
import {
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import { currentUsageMonth, type VoiceEnv } from './safety';
import { VoiceProductionError } from './types';

const STATE_ID = 'preview-voice-ledger';

type LedgerClient = {
  $transaction: PrismaClient['$transaction'];
  tivvleJoyPreviewVoiceLedgerState: {
    findUnique: (args: unknown) => Promise<StateRow | null>;
    upsert: (args: unknown) => Promise<StateRow>;
    update: (args: unknown) => Promise<StateRow>;
  };
  tivvleJoyPreviewVoiceLedgerEntry: {
    findUnique: (args: unknown) => Promise<EntryRow | null>;
    findMany: (args?: unknown) => Promise<EntryRow[]>;
    create: (args: unknown) => Promise<EntryRow>;
    update: (args: unknown) => Promise<EntryRow>;
  };
  tivvleJoyEp012VoiceExecution: {
    findUnique: (args: unknown) => Promise<ExecutionRow | null>;
    findMany: (args?: unknown) => Promise<ExecutionRow[]>;
    create: (args: unknown) => Promise<ExecutionRow>;
    update: (args: unknown) => Promise<ExecutionRow>;
  };
};

type StateRow = {
  id: string;
  month: string;
  paidRequests: number;
  paidCharactersUsed: number;
  failedAttempts: number;
  reservedRequests: number;
  reservedCharacters: number;
  unfinalizedCount: number;
  reconciled: boolean;
  reconciliationStatus: string;
  reconciliationEvidence: string | null;
};

type EntryRow = {
  idempotencyKey: string;
  requestId: string;
  character: string;
  characterCount: number;
  status: string;
  receiptRef: string | null;
  deploymentId: string;
  createdAt: Date;
  updatedAt: Date;
};

type ExecutionRow = {
  requestId: string;
  segmentId: string;
  character: string;
  characterCount: number;
  status: string;
  providerAttemptedAt: Date | null;
  audioSha256: string | null;
  audioBytes: number | null;
  storageVerified: boolean;
  audioObjectKey: string | null;
  receiptObjectKey: string | null;
  receiptRef: string | null;
  alignmentPresent: boolean;
  deploymentId: string;
  createdAt: Date;
  updatedAt: Date;
};

const clients = new Map<string, PrismaClient>();

function ledgerUrl(env: VoiceEnv): string {
  return String(env.TIVVLEJOY_VOICE_LEDGER_DATABASE_URL ?? '').trim();
}

function clientFor(env: VoiceEnv): LedgerClient {
  const url = ledgerUrl(env);
  if (!url) {
    throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
  }
  let client = clients.get(url);
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url } } });
    clients.set(url, client);
  }
  return client as unknown as LedgerClient;
}

function toRecord(row: StateRow | null): DurableLedgerRecord {
  if (!row) {
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
  return {
    available: true,
    reconciled: row.reconciled,
    paidRequests: row.paidRequests,
    paidCharactersUsed: row.paidCharactersUsed,
    failedAttempts: row.failedAttempts,
    reservedRequests: row.reservedRequests,
    reservedCharacters: row.reservedCharacters,
    unfinalizedCount: row.unfinalizedCount,
    reconciliationStatus: row.reconciliationStatus as DurableLedgerRecord['reconciliationStatus'],
    reconciliationEvidence: row.reconciliationEvidence,
    month: row.month,
  };
}

function toEntry(row: EntryRow): DurableLedgerEntry {
  return {
    idempotencyKey: row.idempotencyKey,
    requestId: row.requestId,
    character: row.character as DurableSpeaker,
    characterCount: row.characterCount,
    status: row.status as DurableLedgerEntry['status'],
    receiptRef: row.receiptRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deploymentId: row.deploymentId,
  };
}

function toExecution(row: ExecutionRow): Ep012ExecutionRecord {
  return {
    requestId: row.requestId,
    segmentId: row.segmentId,
    character: row.character as DurableSpeaker,
    characterCount: row.characterCount,
    status: row.status as Ep012ExecutionStatus,
    providerAttemptedAt: row.providerAttemptedAt ? row.providerAttemptedAt.toISOString() : null,
    audioSha256: row.audioSha256,
    audioBytes: row.audioBytes,
    storageVerified: row.storageVerified,
    audioObjectKey: row.audioObjectKey,
    receiptObjectKey: row.receiptObjectKey,
    receiptRef: row.receiptRef,
    alignmentPresent: row.alignmentPresent,
    deploymentId: row.deploymentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function receiptFrom(entry: DurableLedgerEntry): SafeVoiceReceipt {
  return {
    requestId: entry.requestId,
    receiptRef: entry.receiptRef ?? entry.requestId,
    character: entry.character,
    characterCount: entry.characterCount,
    createdAt: entry.createdAt,
    status: 'succeeded',
    deploymentId: entry.deploymentId,
  };
}

async function ensureState(db: LedgerClient): Promise<StateRow> {
  const existing = await db.tivvleJoyPreviewVoiceLedgerState.findUnique({ where: { id: STATE_ID } });
  if (existing) return existing;
  return db.tivvleJoyPreviewVoiceLedgerState.upsert({
    where: { id: STATE_ID },
    create: {
      id: STATE_ID,
      month: currentUsageMonth(),
      paidRequests: 0,
      paidCharactersUsed: 0,
      failedAttempts: 0,
      reservedRequests: 0,
      reservedCharacters: 0,
      unfinalizedCount: 0,
      reconciled: false,
      reconciliationStatus: PRIOR_PAID_USAGE_KNOWN ? 'required' : 'imported',
      reconciliationEvidence: PRIOR_PAID_USAGE_KNOWN ? PRIOR_PAID_USAGE_EVIDENCE : null,
    },
    update: {},
  });
}

export function createPostgresDurableLedgerStore(env: VoiceEnv = process.env): DurableVoiceLedgerStore {
  if (String(env.TIVVLEJOY_VOICE_LEDGER_DURABLE ?? '').trim() !== 'true' || !ledgerUrl(env)) {
    return createUnavailableDurableLedgerStore();
  }

  const db = clientFor(env);
  let cached: DurableLedgerRecord | null = null;

  return {
    kind: 'postgres',
    async read() {
      try {
        const row = await ensureState(db);
        cached = toRecord(row);
        return { ...cached };
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    readSync() {
      return cached ?? toRecord(null);
    },
    async getEntry(requestId) {
      try {
        const row = await db.tivvleJoyPreviewVoiceLedgerEntry.findUnique({ where: { requestId } });
        return row ? toEntry(row) : null;
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async listEntries() {
      try {
        const rows = await db.tivvleJoyPreviewVoiceLedgerEntry.findMany();
        return rows.map(toEntry);
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async reserve(input: ReserveInput) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const state = await ensureState(typed);
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          if (existing?.status === 'succeeded' && existing.receiptRef) {
            return { entry: toEntry(existing), replay: receiptFrom(toEntry(existing)) };
          }
          if (existing) {
            throw new VoiceProductionError(
              'This confirmed line was already submitted. It was not retried and was not billed again.',
              'DUPLICATE_REQUEST',
            );
          }
          if (!state.reconciled) {
            throw new VoiceProductionError(DURABLE_LEDGER_COPY.reconcile, 'PRIOR_USAGE_RECONCILIATION');
          }
          if (input.characterCount > SCRIPT_TO_VOICE_MAX_CHARS) {
            throw new VoiceProductionError(
              `Line exceeds the temporary Preview limit of ${SCRIPT_TO_VOICE_MAX_CHARS} characters.`,
              'REQUEST_LIMIT',
            );
          }
          if (state.paidRequests + state.reservedRequests >= SCRIPT_TO_VOICE_MAX_PAID_REQUESTS) {
            throw new VoiceProductionError(
              `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_REQUESTS} successful paid requests is used up.`,
              'PREVIEW_REQUEST_ALLOWANCE',
            );
          }
          if (state.paidCharactersUsed + state.reservedCharacters + input.characterCount > SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS) {
            throw new VoiceProductionError(
              `Temporary Preview allowance of ${SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS} paid characters would be exceeded.`,
              'PREVIEW_CHARACTER_ALLOWANCE',
            );
          }
          const now = new Date();
          const created = await typed.tivvleJoyPreviewVoiceLedgerEntry.create({
            data: {
              idempotencyKey: input.requestId,
              requestId: input.requestId,
              character: input.character,
              characterCount: input.characterCount,
              status: 'reserved',
              receiptRef: null,
              deploymentId: input.deploymentId ?? 'local-preview',
              createdAt: now,
              updatedAt: now,
            },
          });
          const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              reservedRequests: { increment: 1 },
              reservedCharacters: { increment: input.characterCount },
            },
          });
          cached = toRecord(updated);
          return { entry: toEntry(created) };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async finalize(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          if (!existing) {
            throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
          }
          if (existing.status === 'succeeded' && existing.receiptRef) {
            const state = await ensureState(typed);
            return { record: toRecord(state), receipt: receiptFrom(toEntry(existing)) };
          }
          if (existing.status !== 'reserved' && existing.status !== 'unfinalized') {
            throw new VoiceProductionError(
              'This confirmed line was already submitted. It was not retried and was not billed again.',
              'DUPLICATE_REQUEST',
            );
          }
          const now = new Date(input.createdAt || Date.now());
          const updatedEntry = await typed.tivvleJoyPreviewVoiceLedgerEntry.update({
            where: { requestId: input.requestId },
            data: {
              status: 'succeeded',
              receiptRef: input.receiptRef,
              updatedAt: now,
            },
          });
          const updatedState = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              paidRequests: { increment: 1 },
              paidCharactersUsed: { increment: existing.characterCount },
              reservedRequests: existing.status === 'reserved' ? { decrement: 1 } : undefined,
              reservedCharacters: existing.status === 'reserved' ? { decrement: existing.characterCount } : undefined,
              unfinalizedCount: existing.status === 'unfinalized' ? { decrement: 1 } : undefined,
            },
          });
          cached = toRecord(updatedState);
          return { record: toRecord(updatedState), receipt: receiptFrom(toEntry(updatedEntry)) };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async fail(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          if (!existing) {
            const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
              where: { id: STATE_ID },
              data: { failedAttempts: { increment: 1 } },
            });
            cached = toRecord(updated);
            return toRecord(updated);
          }
          if (existing.status === 'succeeded') {
            return toRecord(await ensureState(typed));
          }
          const nextStatus = input.providerContacted && existing.status === 'reserved' ? 'unfinalized' : 'failed';
          await typed.tivvleJoyPreviewVoiceLedgerEntry.update({
            where: { requestId: input.requestId },
            data: { status: nextStatus, updatedAt: new Date() },
          });
          const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              failedAttempts: { increment: 1 },
              reservedRequests: existing.status === 'reserved' ? { decrement: 1 } : undefined,
              reservedCharacters: existing.status === 'reserved' ? { decrement: existing.characterCount } : undefined,
              unfinalizedCount: nextStatus === 'unfinalized' ? { increment: 1 } : undefined,
            },
          });
          cached = toRecord(updated);
          return toRecord(updated);
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async importPriorUsageOnce(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const state = await ensureState(typed);
          if (!String(input.evidence ?? '').trim()) {
            throw new VoiceProductionError(DURABLE_LEDGER_COPY.reconcile, 'PRIOR_USAGE_RECONCILIATION');
          }
          if (PRIOR_PAID_USAGE_KNOWN && (input.paidRequests < 2 || input.paidCharacters < 1)) {
            throw new VoiceProductionError(
              'Prior paid usage cannot silently reset to zero. Import the exact request and character totals.',
              'PRIOR_USAGE_RECONCILIATION',
            );
          }
          if (state.reconciled) {
            if (state.paidRequests === input.paidRequests && state.paidCharactersUsed === input.paidCharacters) {
              return { imported: false, record: toRecord(state) };
            }
            throw new VoiceProductionError(
              'Prior paid usage was already imported. Totals cannot be replaced.',
              'PRIOR_USAGE_RECONCILIATION',
            );
          }
          const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              reconciled: true,
              paidRequests: input.paidRequests,
              paidCharactersUsed: input.paidCharacters,
              reconciliationStatus: 'imported',
              reconciliationEvidence: String(input.evidence).trim(),
            },
          });
          cached = toRecord(updated);
          return { imported: true, record: toRecord(updated) };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async reserveEp012(input) {
      try {
        assertEp012ReservationIdentity(input);
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const state = await ensureState(typed);
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          const existingExecution = await typed.tivvleJoyEp012VoiceExecution.findUnique({
            where: { requestId: input.requestId },
          });
          if (existingExecution && existing?.status === 'succeeded') {
            const execution = toExecution(existingExecution);
            const replay = replayFromExecution(execution);
            if (replay) {
              return { entry: toEntry(existing), execution, replay };
            }
          }
          if (existing || existingExecution) {
            throw new VoiceProductionError(
              'This authorized EP012 segment was already submitted. It was not retried and was not billed again.',
              'DUPLICATE_REQUEST',
            );
          }
          if (!state.reconciled) {
            throw new VoiceProductionError(DURABLE_LEDGER_COPY.reconcile, 'PRIOR_USAGE_RECONCILIATION');
          }
          if (state.reservedRequests > 0 || state.unfinalizedCount > 0) {
            throw new VoiceProductionError(
              'An unresolved EP012 reservation or recovery-required entry already exists.',
              'EP012_RECOVERY_REQUIRED',
            );
          }
          const attempted = await typed.tivvleJoyEp012VoiceExecution.findMany({
            where: { status: 'provider_attempted' },
          });
          if (attempted.length > 0) {
            throw new VoiceProductionError(
              'An unresolved EP012 provider attempt requires recovery.',
              'EP012_RECOVERY_REQUIRED',
            );
          }
          const usage = countEp012Usage((await typed.tivvleJoyPreviewVoiceLedgerEntry.findMany()).map(toEntry));
          if (usage.succeededRequests + 1 > EP012_AUTHORIZED_REQUEST_COUNT) {
            throw new VoiceProductionError('EP012 authorized request count would be exceeded.', 'EP012_EPISODE_REQUEST_CEILING');
          }
          if (usage.succeededCharacters + input.characterCount > EP012_AUTHORIZED_CHARACTER_COUNT) {
            throw new VoiceProductionError(
              'EP012 authorized character budget would be exceeded.',
              'EP012_EPISODE_CHARACTER_CEILING',
            );
          }
          if (state.paidRequests + state.reservedRequests + 1 > EP012_FINAL_GLOBAL_REQUEST_CEILING) {
            throw new VoiceProductionError(
              'Final Preview paid-request ceiling would be exceeded.',
              'EP012_GLOBAL_REQUEST_CEILING',
            );
          }
          if (state.paidCharactersUsed + state.reservedCharacters + input.characterCount > EP012_FINAL_GLOBAL_CHARACTER_CEILING) {
            throw new VoiceProductionError(
              'Final Preview paid-character ceiling would be exceeded.',
              'EP012_GLOBAL_CHARACTER_CEILING',
            );
          }
          const now = new Date();
          const created = await typed.tivvleJoyPreviewVoiceLedgerEntry.create({
            data: {
              idempotencyKey: input.requestId,
              requestId: input.requestId,
              character: input.character,
              characterCount: input.characterCount,
              status: 'reserved',
              receiptRef: null,
              deploymentId: input.deploymentId ?? 'local-preview',
              createdAt: now,
              updatedAt: now,
            },
          });
          const execution = await typed.tivvleJoyEp012VoiceExecution.create({
            data: {
              requestId: input.requestId,
              segmentId: input.segmentId,
              character: input.character,
              characterCount: input.characterCount,
              status: 'reserved',
              providerAttemptedAt: null,
              audioSha256: null,
              audioBytes: null,
              storageVerified: false,
              audioObjectKey: null,
              receiptObjectKey: null,
              receiptRef: null,
              alignmentPresent: false,
              deploymentId: input.deploymentId ?? 'local-preview',
              createdAt: now,
              updatedAt: now,
            },
          });
          const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              reservedRequests: { increment: 1 },
              reservedCharacters: { increment: input.characterCount },
            },
          });
          cached = toRecord(updated);
          return { entry: toEntry(created), execution: toExecution(execution) };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        if (error instanceof Error && error.message.startsWith('EP012_')) {
          throw new VoiceProductionError('Segment is not authorized.', error.message);
        }
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async markEp012ProviderAttempt(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          const execution = await typed.tivvleJoyEp012VoiceExecution.findUnique({
            where: { requestId: input.requestId },
          });
          if (!existing || !execution || existing.status !== 'reserved' || execution.status !== 'reserved') {
            throw new VoiceProductionError(
              'EP012 provider attempt can only be marked on a reserved authorized segment.',
              'EP012_REQUEST_ALREADY_RESERVED',
            );
          }
          const now = new Date();
          await typed.tivvleJoyPreviewVoiceLedgerEntry.update({
            where: { requestId: input.requestId },
            data: { updatedAt: now },
          });
          const updated = await typed.tivvleJoyEp012VoiceExecution.update({
            where: { requestId: input.requestId },
            data: { status: 'provider_attempted', providerAttemptedAt: now, updatedAt: now },
          });
          return toExecution(updated);
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async finalizeEp012(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          const executionRow = await typed.tivvleJoyEp012VoiceExecution.findUnique({
            where: { requestId: input.requestId },
          });
          if (!existing || !executionRow) {
            throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
          }
          const execution = toExecution(executionRow);
          const replay = replayFromExecution(execution);
          if (replay && existing.status === 'succeeded') {
            const state = await ensureState(typed);
            return {
              record: toRecord(state),
              entry: toEntry(existing),
              execution,
              receipt: receiptFrom(toEntry(existing)),
            };
          }
          if (existing.status !== 'reserved' && existing.status !== 'unfinalized') {
            throw new VoiceProductionError(
              'This authorized EP012 segment was already submitted. It was not retried and was not billed again.',
              'DUPLICATE_REQUEST',
            );
          }
          if (execution.status !== 'provider_attempted' && execution.status !== 'unfinalized') {
            throw new VoiceProductionError(
              'EP012 success cannot be finalized before a durable provider attempt and storage verification.',
              'EP012_STORAGE_VERIFICATION_FAILED',
            );
          }
          const now = new Date(input.createdAt || Date.now());
          const updatedEntry = await typed.tivvleJoyPreviewVoiceLedgerEntry.update({
            where: { requestId: input.requestId },
            data: { status: 'succeeded', receiptRef: input.receiptRef, updatedAt: now },
          });
          const updatedExecution = await typed.tivvleJoyEp012VoiceExecution.update({
            where: { requestId: input.requestId },
            data: {
              status: 'succeeded',
              receiptRef: input.receiptRef,
              audioSha256: input.audioSha256,
              audioBytes: input.audioBytes,
              storageVerified: true,
              audioObjectKey: input.audioObjectKey,
              receiptObjectKey: input.receiptObjectKey,
              alignmentPresent: input.alignmentPresent,
              updatedAt: now,
            },
          });
          const updatedState = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              paidRequests: { increment: 1 },
              paidCharactersUsed: { increment: existing.characterCount },
              reservedRequests: existing.status === 'reserved' ? { decrement: 1 } : undefined,
              reservedCharacters: existing.status === 'reserved' ? { decrement: existing.characterCount } : undefined,
              unfinalizedCount: existing.status === 'unfinalized' ? { decrement: 1 } : undefined,
            },
          });
          cached = toRecord(updatedState);
          return {
            record: toRecord(updatedState),
            entry: toEntry(updatedEntry),
            execution: toExecution(updatedExecution),
            receipt: receiptFrom(toEntry(updatedEntry)),
          };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async failEp012(input) {
      try {
        return await db.$transaction(async (tx) => {
          const typed = tx as unknown as LedgerClient;
          const existing = await typed.tivvleJoyPreviewVoiceLedgerEntry.findUnique({
            where: { requestId: input.requestId },
          });
          const executionRow = await typed.tivvleJoyEp012VoiceExecution.findUnique({
            where: { requestId: input.requestId },
          });
          if (!existing) {
            const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
              where: { id: STATE_ID },
              data: { failedAttempts: { increment: 1 } },
            });
            cached = toRecord(updated);
            return { record: toRecord(updated), execution: executionRow ? toExecution(executionRow) : null };
          }
          if (existing.status === 'succeeded') {
            return { record: toRecord(await ensureState(typed)), execution: executionRow ? toExecution(executionRow) : null };
          }
          const providerMightHaveBeenContacted =
            input.providerContacted || executionRow?.status === 'provider_attempted' || Boolean(executionRow?.providerAttemptedAt);
          const nextStatus = providerMightHaveBeenContacted ? 'unfinalized' : 'failed';
          const now = new Date();
          await typed.tivvleJoyPreviewVoiceLedgerEntry.update({
            where: { requestId: input.requestId },
            data: { status: nextStatus, updatedAt: now },
          });
          let execution = executionRow ? toExecution(executionRow) : null;
          if (executionRow) {
            execution = toExecution(
              await typed.tivvleJoyEp012VoiceExecution.update({
                where: { requestId: input.requestId },
                data: { status: nextStatus, updatedAt: now },
              }),
            );
          }
          const updated = await typed.tivvleJoyPreviewVoiceLedgerState.update({
            where: { id: STATE_ID },
            data: {
              failedAttempts: { increment: 1 },
              reservedRequests: existing.status === 'reserved' ? { decrement: 1 } : undefined,
              reservedCharacters: existing.status === 'reserved' ? { decrement: existing.characterCount } : undefined,
              unfinalizedCount: nextStatus === 'unfinalized' ? { increment: 1 } : undefined,
            },
          });
          cached = toRecord(updated);
          return { record: toRecord(updated), execution };
        });
      } catch (error) {
        if (error instanceof VoiceProductionError) throw error;
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async getEp012Execution(requestId) {
      try {
        const row = await db.tivvleJoyEp012VoiceExecution.findUnique({ where: { requestId } });
        return row ? toExecution(row) : null;
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async getEp012ExecutionBySegment(segmentId) {
      try {
        const row = await db.tivvleJoyEp012VoiceExecution.findUnique({ where: { segmentId } });
        return row ? toExecution(row) : null;
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
    async listEp012Executions() {
      try {
        const rows = await db.tivvleJoyEp012VoiceExecution.findMany();
        return rows.map(toExecution);
      } catch {
        throw new VoiceProductionError(DURABLE_LEDGER_COPY.unavailable, 'DURABLE_LEDGER_UNAVAILABLE');
      }
    },
  };
}

registerPostgresVoiceLedgerStore(createPostgresDurableLedgerStore);

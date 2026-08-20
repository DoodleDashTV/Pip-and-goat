import { isProductionVoiceRuntime, tokensMatch } from './candidate-gates';
import {
  isDurableLedgerConfigured,
  resolvePreviewVoiceLedgerStore,
  type DurableLedgerEntry,
  type DurableLedgerRecord,
  type DurableVoiceLedgerStore,
} from './durable-voice-ledger';
import type { VoiceEnv } from './safety';
import { EP012_VOICE_AUTHORIZATION } from '../tivvlejoy-real-production-unblock/ep012-voice-authorization';

export const EP012_LEDGER_RECONCILE_SCHEMA = 'TIVVLEJOY_EP012_DURABLE_LEDGER_RECONCILIATION_V1' as const;
export const EP012_LEDGER_RECONCILE_ADMIN_HEADER = 'x-tivvlejoy-voice-ledger-admin-token' as const;
export const EP012_LEDGER_RECONCILE_ADMIN_ENV = 'TIVVLEJOY_VOICE_LEDGER_RECONCILE_ADMIN_TOKEN' as const;
export const EP012_LEDGER_RECONCILE_REQUESTS_ENV = 'TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS' as const;
export const EP012_LEDGER_RECONCILE_CHARACTERS_ENV = 'TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS' as const;
export const EP012_LEDGER_RECONCILE_EVIDENCE_ENV = 'TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE' as const;

export const EP012_LEDGER_RECONCILE_CODES = {
  OK: 'EP012_LEDGER_RECONCILED',
  IDEMPOTENT: 'EP012_LEDGER_RECONCILE_ALREADY_APPLIED',
  PREVIEW_ONLY: 'EP012_LEDGER_RECONCILE_PREVIEW_ONLY',
  PRODUCTION_REFUSED: 'EP012_LEDGER_RECONCILE_PRODUCTION_REFUSED',
  ADMIN_NOT_CONFIGURED: 'EP012_LEDGER_RECONCILE_ADMIN_NOT_CONFIGURED',
  ADMIN_INVALID: 'EP012_LEDGER_RECONCILE_ADMIN_INVALID',
  CONFIRMATION_REQUIRED: 'EP012_LEDGER_RECONCILE_CONFIRMATION_REQUIRED',
  REQUESTS_INVALID: 'EP012_LEDGER_RECONCILE_REQUESTS_INVALID',
  CHARACTERS_INVALID: 'EP012_LEDGER_RECONCILE_CHARACTERS_INVALID',
  EVIDENCE_INVALID: 'EP012_LEDGER_RECONCILE_EVIDENCE_INVALID',
  LEDGER_NOT_CONFIGURED: 'EP012_LEDGER_RECONCILE_LEDGER_NOT_CONFIGURED',
  LEDGER_NOT_POSTGRES: 'EP012_LEDGER_RECONCILE_LEDGER_NOT_POSTGRES',
  LEDGER_UNAVAILABLE: 'EP012_LEDGER_RECONCILE_LEDGER_UNAVAILABLE',
  RESERVED_STATE: 'EP012_LEDGER_RECONCILE_RESERVED_STATE',
  UNFINALIZED_STATE: 'EP012_LEDGER_RECONCILE_UNFINALIZED_STATE',
  DIRTY_STATE: 'EP012_LEDGER_RECONCILE_DIRTY_STATE',
  EP012_ENTRY_PRESENT: 'EP012_LEDGER_RECONCILE_EP012_ENTRY_PRESENT',
  CONFLICT: 'EP012_LEDGER_RECONCILE_CONFLICT',
  AUTHORITATIVE_READ_MISMATCH: 'EP012_LEDGER_RECONCILE_AUTHORITATIVE_READ_MISMATCH',
  INTERNAL_ERROR: 'EP012_LEDGER_RECONCILE_INTERNAL_ERROR',
} as const;

export type Ep012LedgerReconcileCode =
  (typeof EP012_LEDGER_RECONCILE_CODES)[keyof typeof EP012_LEDGER_RECONCILE_CODES];

export type Ep012LedgerReconcileRequest = {
  action: 'reconcile-prior-usage';
  confirmed: true;
};

export type Ep012LedgerReconcilePublicLedger = {
  storeKind: 'postgres' | 'unavailable' | 'shared-memory';
  available: boolean;
  reconciled: boolean;
  authoritative: boolean;
  reconciliationStatus: DurableLedgerRecord['reconciliationStatus'];
  reconciliationEvidencePresent: boolean;
  month: string;
  paidRequests: number;
  paidCharactersUsed: number;
  failedAttempts: number;
  reservedRequests: number;
  reservedCharacters: number;
  unfinalizedCount: number;
};

export type Ep012LedgerReconcileResult = {
  schemaVersion: typeof EP012_LEDGER_RECONCILE_SCHEMA;
  ok: boolean;
  status: 'RECONCILED' | 'ALREADY_RECONCILED' | 'BLOCKED' | 'ERROR';
  code: Ep012LedgerReconcileCode;
  message: string;
  httpStatus: number;
  episodeId: 'EP012';
  imported: boolean;
  idempotentReplay: boolean;
  historicalTotals: {
    paidRequests: number | null;
    paidCharacters: number | null;
    evidencePresent: boolean;
  };
  ledger: Ep012LedgerReconcilePublicLedger | null;
  ep012AuthorizedRequestCount: 11;
  ep012AuthorizedCharacterCount: 460;
  ep012EntriesObserved: number;
  providerContacted: false;
  providerRequestsMade: 0;
  sceneryAccessed: false;
  sceneryRequestsMade: 0;
  commercialBytesDownloaded: 0;
  dialogueLockMutated: false;
  productionEnabled: false;
};

export type Ep012LedgerReconcileInput = {
  env?: VoiceEnv;
  providedAdminToken?: string | null;
  confirmed?: boolean;
  store?: DurableVoiceLedgerStore;
};

function envValue(env: VoiceEnv, name: string): string {
  return String(env[name] ?? '').trim();
}

function parseStrictUnsignedInteger(raw: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

function parseHistoricalTotals(env: VoiceEnv): {
  paidRequests: number | null;
  paidCharacters: number | null;
  evidence: string;
  blocker: Ep012LedgerReconcileCode | null;
} {
  const requestsRaw = envValue(env, EP012_LEDGER_RECONCILE_REQUESTS_ENV);
  const charactersRaw = envValue(env, EP012_LEDGER_RECONCILE_CHARACTERS_ENV);
  const evidence = envValue(env, EP012_LEDGER_RECONCILE_EVIDENCE_ENV);
  const paidRequests = parseStrictUnsignedInteger(requestsRaw);
  const paidCharacters = parseStrictUnsignedInteger(charactersRaw);

  // The repository records two prior successful Preview generations. The exact
  // total must still come from ElevenLabs; this only prevents an unsafe reset.
  if (paidRequests === null || paidRequests < 2) {
    return { paidRequests, paidCharacters, evidence, blocker: EP012_LEDGER_RECONCILE_CODES.REQUESTS_INVALID };
  }
  if (paidCharacters === null || paidCharacters < 1) {
    return { paidRequests, paidCharacters, evidence, blocker: EP012_LEDGER_RECONCILE_CODES.CHARACTERS_INVALID };
  }
  if (evidence.length < 12 || evidence.length > 500 || !/elevenlabs/i.test(evidence)) {
    return { paidRequests, paidCharacters, evidence, blocker: EP012_LEDGER_RECONCILE_CODES.EVIDENCE_INVALID };
  }
  return { paidRequests, paidCharacters, evidence, blocker: null };
}

function publicLedger(store: DurableVoiceLedgerStore, record: DurableLedgerRecord): Ep012LedgerReconcilePublicLedger {
  const authoritative =
    store.kind === 'postgres' &&
    record.available &&
    record.reconciled &&
    record.reconciliationStatus === 'imported' &&
    record.reservedRequests === 0 &&
    record.reservedCharacters === 0 &&
    record.unfinalizedCount === 0;
  return {
    storeKind: store.kind,
    available: record.available,
    reconciled: record.reconciled,
    authoritative,
    reconciliationStatus: record.reconciliationStatus,
    reconciliationEvidencePresent: Boolean(String(record.reconciliationEvidence ?? '').trim()),
    month: record.month,
    paidRequests: record.paidRequests,
    paidCharactersUsed: record.paidCharactersUsed,
    failedAttempts: record.failedAttempts,
    reservedRequests: record.reservedRequests,
    reservedCharacters: record.reservedCharacters,
    unfinalizedCount: record.unfinalizedCount,
  };
}

function result(
  input: Partial<Ep012LedgerReconcileResult> &
    Pick<Ep012LedgerReconcileResult, 'ok' | 'status' | 'code' | 'message' | 'httpStatus'>,
): Ep012LedgerReconcileResult {
  return {
    schemaVersion: EP012_LEDGER_RECONCILE_SCHEMA,
    episodeId: 'EP012',
    imported: false,
    idempotentReplay: false,
    historicalTotals: { paidRequests: null, paidCharacters: null, evidencePresent: false },
    ledger: null,
    ep012AuthorizedRequestCount: 11,
    ep012AuthorizedCharacterCount: 460,
    ep012EntriesObserved: 0,
    providerContacted: false,
    providerRequestsMade: 0,
    sceneryAccessed: false,
    sceneryRequestsMade: 0,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
    ...input,
  };
}

async function readEp012Entries(store: DurableVoiceLedgerStore): Promise<DurableLedgerEntry[]> {
  const entries = await Promise.all(
    EP012_VOICE_AUTHORIZATION.authorizedRequests.map((request) => store.getEntry(request.requestId)),
  );
  return entries.filter((entry): entry is DurableLedgerEntry => Boolean(entry));
}

function exactReconciliationMatch(
  record: DurableLedgerRecord,
  paidRequests: number,
  paidCharacters: number,
  evidence: string,
): boolean {
  return (
    record.paidRequests === paidRequests &&
    record.paidCharactersUsed === paidCharacters &&
    String(record.reconciliationEvidence ?? '').trim() === evidence
  );
}

export async function reconcileEp012DurableVoiceLedger(
  input: Ep012LedgerReconcileInput = {},
): Promise<Ep012LedgerReconcileResult> {
  const env = input.env ?? process.env;
  const providedAdminToken = String(input.providedAdminToken ?? '').trim();
  const expectedAdminToken = envValue(env, EP012_LEDGER_RECONCILE_ADMIN_ENV);

  if (isProductionVoiceRuntime(env)) {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.PRODUCTION_REFUSED,
      message: 'Durable voice-ledger reconciliation is never permitted in Production.',
      httpStatus: 403,
    });
  }
  if (envValue(env, 'VERCEL_ENV') !== 'preview') {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.PREVIEW_ONLY,
      message: 'Durable voice-ledger reconciliation is restricted to Vercel Preview.',
      httpStatus: 403,
    });
  }
  if (!expectedAdminToken || expectedAdminToken.length < 32) {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.ADMIN_NOT_CONFIGURED,
      message: 'Preview ledger reconciliation admin authorization is not configured.',
      httpStatus: 503,
    });
  }
  if (!tokensMatch(providedAdminToken, expectedAdminToken)) {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.ADMIN_INVALID,
      message: 'Preview ledger reconciliation admin authorization was not accepted.',
      httpStatus: 401,
    });
  }
  if (input.confirmed !== true) {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.CONFIRMATION_REQUIRED,
      message: 'One-time historical usage reconciliation requires explicit confirmation.',
      httpStatus: 400,
    });
  }

  const totals = parseHistoricalTotals(env);
  const totalsPublic = {
    paidRequests: totals.paidRequests,
    paidCharacters: totals.paidCharacters,
    evidencePresent: Boolean(totals.evidence),
  };
  if (totals.blocker) {
    const message =
      totals.blocker === EP012_LEDGER_RECONCILE_CODES.REQUESTS_INVALID
        ? 'Historical successful request total must be the exact whole-number ElevenLabs total and cannot reset known prior use.'
        : totals.blocker === EP012_LEDGER_RECONCILE_CODES.CHARACTERS_INVALID
          ? 'Historical billed character total must be the exact positive whole-number ElevenLabs total.'
          : 'Reconciliation evidence must be a short non-secret note that explicitly identifies ElevenLabs as the source.';
    return result({
      ok: false,
      status: 'BLOCKED',
      code: totals.blocker,
      message,
      httpStatus: 400,
      historicalTotals: totalsPublic,
    });
  }

  if (!isDurableLedgerConfigured(env)) {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.LEDGER_NOT_CONFIGURED,
      message: 'The dedicated Preview durable voice ledger is not configured.',
      httpStatus: 503,
      historicalTotals: totalsPublic,
    });
  }

  const store = input.store ?? resolvePreviewVoiceLedgerStore(env);
  if (store.kind !== 'postgres') {
    return result({
      ok: false,
      status: 'BLOCKED',
      code: EP012_LEDGER_RECONCILE_CODES.LEDGER_NOT_POSTGRES,
      message: 'Reconciliation requires the dedicated PostgreSQL durable ledger store.',
      httpStatus: 503,
      historicalTotals: totalsPublic,
    });
  }

  try {
    const before = await store.read();
    if (!before.available) {
      return result({
        ok: false,
        status: 'BLOCKED',
        code: EP012_LEDGER_RECONCILE_CODES.LEDGER_UNAVAILABLE,
        message: 'The dedicated PostgreSQL durable voice ledger is unavailable.',
        httpStatus: 503,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
      });
    }
    if (before.reservedRequests !== 0 || before.reservedCharacters !== 0) {
      return result({
        ok: false,
        status: 'BLOCKED',
        code: EP012_LEDGER_RECONCILE_CODES.RESERVED_STATE,
        message: 'Reconciliation is blocked while durable voice requests are reserved.',
        httpStatus: 409,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
      });
    }
    if (before.unfinalizedCount !== 0) {
      return result({
        ok: false,
        status: 'BLOCKED',
        code: EP012_LEDGER_RECONCILE_CODES.UNFINALIZED_STATE,
        message: 'Reconciliation is blocked while a durable voice request is unfinalized.',
        httpStatus: 409,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
      });
    }

    const beforeEntries = await readEp012Entries(store);
    if (beforeEntries.length > 0) {
      return result({
        ok: false,
        status: 'BLOCKED',
        code: EP012_LEDGER_RECONCILE_CODES.EP012_ENTRY_PRESENT,
        message: 'Historical reconciliation must occur before any EP012 durable request entry exists.',
        httpStatus: 409,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
        ep012EntriesObserved: beforeEntries.length,
      });
    }

    const paidRequests = totals.paidRequests!;
    const paidCharacters = totals.paidCharacters!;
    const evidence = totals.evidence;

    if (before.reconciled) {
      if (!exactReconciliationMatch(before, paidRequests, paidCharacters, evidence)) {
        return result({
          ok: false,
          status: 'BLOCKED',
          code: EP012_LEDGER_RECONCILE_CODES.CONFLICT,
          message: 'Historical usage was already reconciled; conflicting totals or evidence cannot replace it.',
          httpStatus: 409,
          historicalTotals: totalsPublic,
          ledger: publicLedger(store, before),
        });
      }
      return result({
        ok: true,
        status: 'ALREADY_RECONCILED',
        code: EP012_LEDGER_RECONCILE_CODES.IDEMPOTENT,
        message: 'The exact historical ElevenLabs totals and evidence were already reconciled. No state changed.',
        httpStatus: 200,
        imported: false,
        idempotentReplay: true,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
      });
    }

    if (
      before.paidRequests !== 0 ||
      before.paidCharactersUsed !== 0 ||
      before.failedAttempts !== 0 ||
      before.reconciliationStatus === 'imported'
    ) {
      return result({
        ok: false,
        status: 'BLOCKED',
        code: EP012_LEDGER_RECONCILE_CODES.DIRTY_STATE,
        message: 'The unreconciled durable ledger is not a clean initial state. Manual review is required.',
        httpStatus: 409,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, before),
      });
    }

    const imported = await store.importPriorUsageOnce({ paidRequests, paidCharacters, evidence });
    if (!imported.imported) {
      return result({
        ok: false,
        status: 'ERROR',
        code: EP012_LEDGER_RECONCILE_CODES.AUTHORITATIVE_READ_MISMATCH,
        message: 'The reconciliation transaction did not report a first-time import.',
        httpStatus: 500,
        historicalTotals: totalsPublic,
        ledger: publicLedger(store, imported.record),
      });
    }

    const after = await store.read();
    const afterEntries = await readEp012Entries(store);
    const authoritative = publicLedger(store, after);
    const exactAfter =
      authoritative.authoritative &&
      exactReconciliationMatch(after, paidRequests, paidCharacters, evidence) &&
      afterEntries.length === 0;
    if (!exactAfter) {
      return result({
        ok: false,
        status: 'ERROR',
        code: EP012_LEDGER_RECONCILE_CODES.AUTHORITATIVE_READ_MISMATCH,
        message: 'The post-transaction authoritative PostgreSQL read did not exactly match the imported historical totals.',
        httpStatus: 500,
        historicalTotals: totalsPublic,
        ledger: authoritative,
        ep012EntriesObserved: afterEntries.length,
      });
    }

    return result({
      ok: true,
      status: 'RECONCILED',
      code: EP012_LEDGER_RECONCILE_CODES.OK,
      message: 'Historical ElevenLabs Preview usage was imported once into the dedicated durable PostgreSQL ledger.',
      httpStatus: 200,
      imported: true,
      idempotentReplay: false,
      historicalTotals: totalsPublic,
      ledger: authoritative,
      ep012EntriesObserved: 0,
    });
  } catch {
    return result({
      ok: false,
      status: 'ERROR',
      code: EP012_LEDGER_RECONCILE_CODES.INTERNAL_ERROR,
      message: 'Durable voice-ledger reconciliation could not be completed safely.',
      httpStatus: 503,
      historicalTotals: totalsPublic,
    });
  }
}

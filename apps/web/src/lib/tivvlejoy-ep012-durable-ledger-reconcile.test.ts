import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createSharedDurableLedgerStore,
  type DurableLedgerRecord,
  type DurableVoiceLedgerStore,
} from './voice-production/durable-voice-ledger';
import {
  EP012_LEDGER_RECONCILE_CODES,
  reconcileEp012DurableVoiceLedger,
} from './voice-production/ep012-durable-ledger-reconcile';
import { EP012_VOICE_AUTHORIZATION } from './tivvlejoy-real-production-unblock/ep012-voice-authorization';

const ADMIN_TOKEN = 'ep012-ledger-admin-token-0123456789abcdef';

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: 'preview',
    TIVVLEJOY_VOICE_LEDGER_DURABLE: 'true',
    TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: 'postgresql://preview-ledger.invalid/tivvlejoy',
    TIVVLEJOY_VOICE_LEDGER_RECONCILE_ADMIN_TOKEN: ADMIN_TOKEN,
    TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS: '2',
    TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS: '123',
    TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE: 'ElevenLabs usage dashboard for approved Preview tests on 2026-08-17',
    ...overrides,
  };
}

function cleanRecord(overrides: Partial<DurableLedgerRecord> = {}): DurableLedgerRecord {
  return {
    available: true,
    reconciled: false,
    paidRequests: 0,
    paidCharactersUsed: 0,
    failedAttempts: 0,
    reservedRequests: 0,
    reservedCharacters: 0,
    unfinalizedCount: 0,
    reconciliationStatus: 'required',
    reconciliationEvidence: 'known prior usage requires exact import',
    month: '2026-08',
    ...overrides,
  };
}

function postgresStore(seed: DurableLedgerRecord = cleanRecord()) {
  const inner = createSharedDurableLedgerStore(seed);
  return {
    ...inner,
    kind: 'postgres' as const,
  } satisfies DurableVoiceLedgerStore;
}

async function reconcile(
  options: {
    envOverrides?: Record<string, string | undefined>;
    token?: string;
    confirmed?: boolean;
    store?: DurableVoiceLedgerStore;
  } = {},
) {
  return reconcileEp012DurableVoiceLedger({
    env: env(options.envOverrides),
    providedAdminToken: options.token ?? ADMIN_TOKEN,
    confirmed: options.confirmed ?? true,
    store: options.store ?? postgresStore(),
  });
}

function expectNoSideEffects(result: Awaited<ReturnType<typeof reconcileEp012DurableVoiceLedger>>) {
  expect(result.providerContacted).toBe(false);
  expect(result.providerRequestsMade).toBe(0);
  expect(result.sceneryAccessed).toBe(false);
  expect(result.sceneryRequestsMade).toBe(0);
  expect(result.commercialBytesDownloaded).toBe(0);
  expect(result.dialogueLockMutated).toBe(false);
  expect(result.productionEnabled).toBe(false);
}

describe('TIVVLEJOY_EP012_DURABLE_LEDGER_RECONCILIATION_V1', () => {
  it('imports the exact historical totals once into a PostgreSQL-backed ledger', async () => {
    const store = postgresStore();
    const fetchSpy = vi.fn(() => {
      throw new Error('NETWORK_MUST_NOT_BE_USED');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await reconcile({ store });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('RECONCILED');
    expect(result.code).toBe(EP012_LEDGER_RECONCILE_CODES.OK);
    expect(result.imported).toBe(true);
    expect(result.idempotentReplay).toBe(false);
    expect(result.historicalTotals).toEqual({
      paidRequests: 2,
      paidCharacters: 123,
      evidencePresent: true,
    });
    expect(result.ledger?.storeKind).toBe('postgres');
    expect(result.ledger?.available).toBe(true);
    expect(result.ledger?.reconciled).toBe(true);
    expect(result.ledger?.authoritative).toBe(true);
    expect(result.ledger?.reconciliationStatus).toBe('imported');
    expect(result.ledger?.paidRequests).toBe(2);
    expect(result.ledger?.paidCharactersUsed).toBe(123);
    expect(result.ledger?.reservedRequests).toBe(0);
    expect(result.ledger?.reservedCharacters).toBe(0);
    expect(result.ledger?.unfinalizedCount).toBe(0);
    expect(result.ep012EntriesObserved).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expectNoSideEffects(result);

    vi.unstubAllGlobals();
  });

  it('is idempotent only when totals and evidence exactly match the existing reconciliation', async () => {
    const store = postgresStore();
    const first = await reconcile({ store });
    const second = await reconcile({ store });

    expect(first.status).toBe('RECONCILED');
    expect(second.ok).toBe(true);
    expect(second.status).toBe('ALREADY_RECONCILED');
    expect(second.code).toBe(EP012_LEDGER_RECONCILE_CODES.IDEMPOTENT);
    expect(second.imported).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.ledger?.paidRequests).toBe(2);
    expect(second.ledger?.paidCharactersUsed).toBe(123);
    expectNoSideEffects(second);
  });

  it.each([
    ['different request total', { TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS: '3' }],
    ['different character total', { TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS: '124' }],
    ['different evidence', { TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE: 'ElevenLabs usage dashboard second source' }],
  ])('rejects a conflicting re-import: %s', async (_label, envOverrides) => {
    const store = postgresStore();
    await reconcile({ store });
    const conflict = await reconcile({ store, envOverrides });

    expect(conflict.ok).toBe(false);
    expect(conflict.status).toBe('BLOCKED');
    expect(conflict.code).toBe(EP012_LEDGER_RECONCILE_CODES.CONFLICT);
    expect(conflict.httpStatus).toBe(409);
    expectNoSideEffects(conflict);
  });

  it('requires an explicit Preview runtime and refuses Production', async () => {
    const production = await reconcile({ envOverrides: { VERCEL_ENV: 'production' } });
    expect(production.code).toBe(EP012_LEDGER_RECONCILE_CODES.PRODUCTION_REFUSED);
    expect(production.httpStatus).toBe(403);
    expectNoSideEffects(production);

    const development = await reconcile({ envOverrides: { VERCEL_ENV: 'development' } });
    expect(development.code).toBe(EP012_LEDGER_RECONCILE_CODES.PREVIEW_ONLY);
    expect(development.httpStatus).toBe(403);
    expectNoSideEffects(development);
  });

  it('requires a distinct long-lived admin secret and timing-safe token match', async () => {
    const missing = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_RECONCILE_ADMIN_TOKEN: undefined },
    });
    expect(missing.code).toBe(EP012_LEDGER_RECONCILE_CODES.ADMIN_NOT_CONFIGURED);
    expect(missing.httpStatus).toBe(503);
    expectNoSideEffects(missing);

    const short = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_RECONCILE_ADMIN_TOKEN: 'too-short' },
    });
    expect(short.code).toBe(EP012_LEDGER_RECONCILE_CODES.ADMIN_NOT_CONFIGURED);
    expectNoSideEffects(short);

    const invalid = await reconcile({ token: 'wrong-admin-token' });
    expect(invalid.code).toBe(EP012_LEDGER_RECONCILE_CODES.ADMIN_INVALID);
    expect(invalid.httpStatus).toBe(401);
    expectNoSideEffects(invalid);
  });

  it('requires explicit one-time confirmation', async () => {
    const response = await reconcile({ confirmed: false });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.CONFIRMATION_REQUIRED);
    expect(response.httpStatus).toBe(400);
    expectNoSideEffects(response);
  });

  it.each(['', '1', '2.0', '02', '-2', 'abc'])('rejects non-exact historical request total %j', async (value) => {
    const response = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS: value },
    });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.REQUESTS_INVALID);
    expectNoSideEffects(response);
  });

  it.each(['', '0', '1.0', '01', '-1', 'abc'])('rejects non-exact historical character total %j', async (value) => {
    const response = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS: value },
    });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.CHARACTERS_INVALID);
    expectNoSideEffects(response);
  });

  it.each([
    '',
    'too short',
    'Manual accounting source without provider name',
  ])('rejects insufficient reconciliation evidence %j', async (value) => {
    const response = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE: value },
    });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.EVIDENCE_INVALID);
    expectNoSideEffects(response);
  });

  it('requires the dedicated durable ledger configuration', async () => {
    const response = await reconcile({
      envOverrides: { TIVVLEJOY_VOICE_LEDGER_DURABLE: 'false' },
    });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.LEDGER_NOT_CONFIGURED);
    expectNoSideEffects(response);
  });

  it('refuses a shared-memory store even if it otherwise looks healthy', async () => {
    const store = createSharedDurableLedgerStore(cleanRecord());
    const response = await reconcile({ store });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.LEDGER_NOT_POSTGRES);
    expectNoSideEffects(response);
  });

  it('refuses reserved and unfinalized durable state before reconciliation', async () => {
    const reserved = await reconcile({
      store: postgresStore(cleanRecord({ reservedRequests: 1, reservedCharacters: 40 })),
    });
    expect(reserved.code).toBe(EP012_LEDGER_RECONCILE_CODES.RESERVED_STATE);
    expectNoSideEffects(reserved);

    const unfinalized = await reconcile({
      store: postgresStore(cleanRecord({ unfinalizedCount: 1 })),
    });
    expect(unfinalized.code).toBe(EP012_LEDGER_RECONCILE_CODES.UNFINALIZED_STATE);
    expectNoSideEffects(unfinalized);
  });

  it('refuses a dirty unreconciled ledger instead of overwriting it', async () => {
    const response = await reconcile({
      store: postgresStore(cleanRecord({ paidRequests: 1, paidCharactersUsed: 20 })),
    });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.DIRTY_STATE);
    expect(response.httpStatus).toBe(409);
    expectNoSideEffects(response);
  });

  it('refuses reconciliation if any EP012 request entry already exists', async () => {
    const store = postgresStore();
    const first = EP012_VOICE_AUTHORIZATION.authorizedRequests[0];
    store.seedEntry?.({
      requestId: first.requestId,
      character: first.speaker === 'PIP' ? 'pip' : 'goat',
      characterCount: first.characterCount,
      status: 'failed',
    });

    const response = await reconcile({ store });
    expect(response.code).toBe(EP012_LEDGER_RECONCILE_CODES.EP012_ENTRY_PRESENT);
    expect(response.ep012EntriesObserved).toBe(1);
    expect(response.httpStatus).toBe(409);
    expectNoSideEffects(response);
  });

  it('never imports provider transport, generate(), scenery, R2, or dialogue-write code', () => {
    const serviceSource = readFileSync(
      path.resolve(__dirname, 'voice-production/ep012-durable-ledger-reconcile.ts'),
      'utf8',
    );
    const routeSource = readFileSync(
      path.resolve(__dirname, '../app/api/voice-production/ep012/ledger/reconcile/route.ts'),
      'utf8',
    );
    const combined = `${serviceSource}\n${routeSource}`;

    expect(combined).not.toMatch(/candidate-provider/);
    expect(combined).not.toMatch(/convertCandidateSpeech/);
    expect(combined).not.toMatch(/createScriptToVoiceService/);
    expect(combined).not.toMatch(/\.generate\s*\(/);
    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/R2_|cloudflarestorage/i);
    expect(combined).not.toMatch(/scenery.*(get|download|materialize)/i);
    expect(combined).not.toMatch(/dialogue(?!LockMutated).*(write|update|mutate)/i);
  });
});

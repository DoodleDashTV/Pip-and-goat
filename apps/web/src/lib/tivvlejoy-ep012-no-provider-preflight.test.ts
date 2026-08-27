import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getEp012Preflight } from '@/app/api/voice-production/ep012/preflight/route';
import { POST as postEp012Generate } from '@/app/api/voice-production/ep012/generate/route';
import {
  EP012_ALLOWED_CLIENT_FIELDS,
  EP012_FORBIDDEN_CLIENT_FIELDS,
  EP012_GENERATION_ROUTE_GUARD_SCHEMA,
  runEp012GenerateGuard,
} from './tivvlejoy-real-production-unblock/ep012-generate-guard';
import {
  EP012_AUTHORIZED_SEGMENT_IDS,
  EP012_BLOCKER_CODES,
  EP012_NO_PROVIDER_PREFLIGHT_SCHEMA,
  EP012_REQUIRED_DIALOGUE_SHA256,
  EP012_VOICE_TEST_TOKEN_HEADER,
  createEp012SideEffectTracker,
  createThrowingEp012ProviderTransport,
  deriveEp012AuthorizedRequest,
  deriveEp012RequestId,
  ep012CharacterIdForSpeaker,
  runEp012NoProviderPreflight,
  type Ep012AuthorizedSegmentId,
  type Ep012IntegrityOverrides,
  type Ep012SideEffectTracker,
} from './tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import {
  EP012_CANONICAL_DIALOGUE_LOCK,
  EP012_CANONICAL_DIALOGUE_SHA256,
  EP012_VOICE_AUTHORIZATION,
  getEp012AuthorizedVoiceRequest,
  verifyEp012CanonicalDialogueLock,
  verifyEp012VoiceAuthorization,
} from './tivvlejoy-real-production-unblock';
import {
  CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE,
  isCanonicalPaidVoiceAuthorization,
  isPaidVoiceAuthorizationConventionMismatch,
  paidAuthorizationConventionSnapshot,
} from './voice-production/paid-authorization-convention';
import {
  createSharedDurableLedgerStore,
  createUnavailableDurableLedgerStore,
  installPreviewVoiceLedgerStore,
  type DurableEntryStatus,
  type DurableVoiceLedgerStore,
} from './voice-production/durable-voice-ledger';
import { SCRIPT_TO_VOICE_MAX_PAID_REQUESTS } from './voice-production/script-line';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './voice-production/types';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

const readyEnv = {
  VERCEL_ENV: 'preview',
  ALLOW_PAID_VOICE_GENERATION: 'true',
  TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
  ELEVENLABS_API_KEY: 'test-key-not-real',
  TIVVLEJOY_VOICE_TEST_TOKEN: 'preview-token',
  TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '600',
  TIVVLEJOY_VOICE_LEDGER_DURABLE: 'true',
  TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: 'postgresql://preview-ledger-test/unused',
  VERCEL_URL: 'pip-and-goat-preview.vercel.app',
};

function readyStore(): DurableVoiceLedgerStore {
  const store = createSharedDurableLedgerStore({
    available: true,
    reconciled: true,
    paidRequests: 0,
    paidCharactersUsed: 0,
    failedAttempts: 0,
    reservedRequests: 0,
    reservedCharacters: 0,
    unfinalizedCount: 0,
    reconciliationStatus: 'imported',
    reconciliationEvidence: 'synthetic-ep012-preflight',
    month: '2026-08',
  });
  installPreviewVoiceLedgerStore(store);
  return store;
}

function seedEntry(
  store: DurableVoiceLedgerStore,
  requestId: string,
  status: DurableEntryStatus,
  character: 'pip' | 'goat' = 'pip',
  characterCount = 10,
) {
  store.seedEntry!({ requestId, character, characterCount, status });
}

function expectZeroSideEffects(tracker: Ep012SideEffectTracker) {
  expect(tracker.providerCalls).toBe(0);
  expect(tracker.sceneryReads).toBe(0);
  expect(tracker.r2Gets).toBe(0);
  expect(tracker.dialogueWrites).toBe(0);
}

function expectDialogueLockUnchanged() {
  expect(verifyEp012CanonicalDialogueLock()).toBe(true);
  expect(EP012_CANONICAL_DIALOGUE_LOCK.dialogueSha256).toBe(EP012_REQUIRED_DIALOGUE_SHA256);
  expect(EP012_CANONICAL_DIALOGUE_SHA256).toBe(EP012_REQUIRED_DIALOGUE_SHA256);
}

async function generate(input: {
  segmentId: string;
  confirmed?: unknown;
  extra?: Record<string, unknown>;
  env?: typeof readyEnv | Record<string, string>;
  store?: DurableVoiceLedgerStore;
  overrides?: Ep012IntegrityOverrides;
  origin?: string | null;
  host?: string | null;
  testToken?: string | null;
}) {
  const tracker = createEp012SideEffectTracker();
  const store = input.store ?? readyStore();
  const result = await runEp012GenerateGuard({
    body: { segmentId: input.segmentId, confirmed: input.confirmed ?? true, ...input.extra },
    origin: input.origin === undefined ? 'https://pip-and-goat-preview.vercel.app' : input.origin,
    host: input.host === undefined ? 'pip-and-goat-preview.vercel.app' : input.host,
    testToken: input.testToken === undefined ? 'preview-token' : input.testToken,
    env: input.env ?? readyEnv,
    store,
    overrides: input.overrides,
    tracker,
    providerTransport: createThrowingEp012ProviderTransport(tracker),
  });
  expectZeroSideEffects(tracker);
  expectDialogueLockUnchanged();
  expect(result.providerContacted).toBe(false);
  expect(result.providerRequestsMade).toBe(0);
  expect(result.sceneryAccessed).toBe(false);
  expect(result.sceneryRequestsMade).toBe(0);
  expect(result.commercialBytesDownloaded).toBe(0);
  expect(result.dialogueLockMutated).toBe(false);
  expect(result.productionEnabled).toBe(false);
  return result;
}

describe('TIVVLEJOY_EP012_NO_PROVIDER_PREFLIGHT_V1', () => {
  beforeEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  afterEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  it('exposes the synthetic no-provider READY fixture without contacting a provider', async () => {
    const tracker = createEp012SideEffectTracker();
    const result = await runEp012NoProviderPreflight({
      env: readyEnv,
      store: readyStore(),
      tracker,
    });
    expect(result.schemaVersion).toBe(EP012_NO_PROVIDER_PREFLIGHT_SCHEMA);
    expect(result.status).toBe('READY');
    expect(result.ok).toBe(true);
    expect(result.episodeId).toBe('EP012');
    expect(result.title).toBe('The Bakery Map');
    expect(result.dialogueSha256).toBe(EP012_REQUIRED_DIALOGUE_SHA256);
    expect(result.authorizationSha256).toBe(EP012_VOICE_AUTHORIZATION.authorizationSha256);
    expect(result.totalRequestChecks).toBe(11);
    expect(result.passedRequestChecks).toBe(11);
    expect(result.blockedRequestChecks).toBe(0);
    expect(result.readyForProviderContact).toBe(true);
    expect(result.providerContacted).toBe(false);
    expect(result.providerRequestsMade).toBe(0);
    expect(result.sceneryAccessed).toBe(false);
    expect(result.sceneryRequestsMade).toBe(0);
    expect(result.commercialBytesDownloaded).toBe(0);
    expect(result.dialogueLockMutated).toBe(false);
    expect(result.productionEnabled).toBe(false);
    expect(result.authorization.authorizedSegmentCount).toBe(11);
    expect(result.authorization.pipCharacterCount).toBe(289);
    expect(result.authorization.goatCharacterCount).toBe(171);
    expect(result.authorization.totalCharacterCount).toBe(460);
    expect(result.authorization.automaticRetryAllowed).toBe(false);
    expect(result.authorization.legacyThreeRequestAllowanceAppliedToEp012).toBe(false);
    expect(result.ledger.authorizedRequests).toBe(11);
    expect(result.ledger.authorizedCharacters).toBe(460);
    expect(result.ledger.remainingRequests).toBe(11);
    expect(result.ledger.remainingCharacters).toBe(460);
    expect(result.requestChecks.map((item) => item.segmentId)).toEqual([...EP012_AUTHORIZED_SEGMENT_IDS]);
    expect(result.requestChecks.every((item) => item.eligibility === 'ELIGIBLE')).toBe(true);
    expectZeroSideEffects(tracker);
    expectDialogueLockUnchanged();
  });

  it('derives all 11 request identities server-side from the locked authorization', () => {
    for (const segmentId of EP012_AUTHORIZED_SEGMENT_IDS) {
      const derived = deriveEp012AuthorizedRequest(segmentId);
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      expect(derived.requestId).toBe(authorized.requestId);
      expect(derived.requestId).toBe(deriveEp012RequestId(authorized.segmentSha256));
      expect(derived.episodeId).toBe('EP012');
      expect(derived.dialogueRef).toBe(authorized.dialogueRef);
      expect(derived.speaker).toBe(authorized.speaker);
      expect(derived.characterId).toBe(ep012CharacterIdForSpeaker(authorized.speaker));
      expect(derived.canonicalText).toBe(authorized.canonicalText);
      expect(derived.characterCount).toBe(authorized.characterCount);
      expect(derived.textSha256).toBe(authorized.textSha256);
      expect(derived.segmentSha256).toBe(authorized.segmentSha256);
      expect(derived.dialogueSha256).toBe(EP012_REQUIRED_DIALOGUE_SHA256);
    }
    expect(verifyEp012VoiceAuthorization()).toBe(true);
  });

  it('marks all 11 exact request identities ELIGIBLE in the synthetic ready fixture', async () => {
    const store = readyStore();
    for (const segmentId of EP012_AUTHORIZED_SEGMENT_IDS) {
      const result = await generate({ segmentId, store });
      expect(result.status).toBe('ELIGIBLE');
      expect(result.derivedRequest?.segmentId).toBe(segmentId);
      expect(result.derivedRequest?.requestId).toBe(getEp012AuthorizedVoiceRequest(segmentId).requestId);
      expect(result.readyForProviderContact).toBe(true);
      expect(result.providerContacted).toBe(false);
    }
  });

  it('keeps the canonical Preview paid-authorization convention fail-closed', () => {
    expect(CANONICAL_PREVIEW_VOICE_AUTHORIZE_PAID_VALUE).toBe('true');
    expect(isCanonicalPaidVoiceAuthorization({ TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true' })).toBe(true);
    expect(isPaidVoiceAuthorizationConventionMismatch({ TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true' })).toBe(false);
    expect(isCanonicalPaidVoiceAuthorization({ TIVVLEJOY_VOICE_AUTHORIZE_PAID: '1' })).toBe(false);
    expect(isPaidVoiceAuthorizationConventionMismatch({ TIVVLEJOY_VOICE_AUTHORIZE_PAID: '1' })).toBe(true);
    expect(paidAuthorizationConventionSnapshot({ TIVVLEJOY_VOICE_AUTHORIZE_PAID: '1' }).matchesLegacyDraftAudio).toBe(
      true,
    );
    expect(isCanonicalPaidVoiceAuthorization({})).toBe(false);
  });

  it('passes configuration preflight only for the canonical paid-auth value', async () => {
    const canonical = await runEp012NoProviderPreflight({ env: readyEnv, store: readyStore() });
    expect(canonical.serverGates.paidAuthorizationConvention).toBe(true);
    expect(canonical.status).toBe('READY');
    const mismatch = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      env: { ...readyEnv, TIVVLEJOY_VOICE_AUTHORIZE_PAID: '1' },
    });
    expect(mismatch.status).toBe('BLOCKED');
    expect(mismatch.blockers).toContain(EP012_BLOCKER_CODES.EP012_PAID_AUTH_CONVENTION_MISMATCH);
    expect(mismatch.providerContacted).toBe(false);
  });

  it('does not let the legacy global 3-request allowance govern EP012', async () => {
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
    const store = readyStore();
    seedEntry(store, 'unrelated_legacy_1', 'succeeded', 'pip', 80);
    seedEntry(store, 'unrelated_legacy_2', 'succeeded', 'goat', 90);
    seedEntry(store, 'unrelated_legacy_3', 'succeeded', 'pip', 70);
    const preflight = await runEp012NoProviderPreflight({ env: readyEnv, store });
    expect(preflight.ledger.globalPaidRequests).toBe(3);
    expect(preflight.ledger.ep012RemainingRequests).toBe(11);
    expect(preflight.ledger.authorizedRequests).toBe(11);
    expect(preflight.authorization.legacyThreeRequestAllowanceAppliedToEp012).toBe(false);
    expect(preflight.status).toBe('READY');
    const result = await generate({ segmentId: 'DL_HOOK_01__PIP', store });
    expect(result.status).toBe('ELIGIBLE');
    expect(result.readyForProviderContact).toBe(true);
    expect(result.blockers).not.toContain(EP012_BLOCKER_CODES.EP012_LEGACY_ALLOWANCE_STILL_ACTIVE);
    const interfered = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      overrides: { applyLegacyThreeRequestAllowance: true },
    });
    expect(interfered.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEGACY_ALLOWANCE_STILL_ACTIVE);
    expect(interfered.providerContacted).toBe(false);
  });
});

describe('EP012 generate route guard negative matrix', () => {
  beforeEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  afterEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  describe.each(EP012_AUTHORIZED_SEGMENT_IDS)('%s', (segmentId: Ep012AuthorizedSegmentId) => {
    it('A. rejects a forged or unknown segment ID', async () => {
      const result = await generate({ segmentId: `${segmentId}__FORGED` });
      expect(result.status).toBe('BLOCKED');
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED);
      expect(result.derivedRequest).toBeNull();
    });

    it('B. rejects client-supplied canonical text', async () => {
      const result = await generate({ segmentId, extra: { canonicalText: 'forged bakery line' } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
      expect(result.derivedRequest).toBeNull();
    });

    it('C. rejects client-supplied text hash', async () => {
      const result = await generate({ segmentId, extra: { textSha256: 'a'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('D. rejects client-supplied segment hash', async () => {
      const result = await generate({ segmentId, extra: { segmentSha256: 'b'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('E. rejects client-supplied dialogue hash', async () => {
      const result = await generate({ segmentId, extra: { dialogueSha256: 'c'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('F. rejects a client-supplied request ID', async () => {
      const result = await generate({ segmentId, extra: { requestId: 'ep012_voice_deadbeefdeadbeefdeadbeef' } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('G. rejects a client-supplied speaker', async () => {
      const result = await generate({ segmentId, extra: { speaker: 'GOAT' } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('H. rejects a client-supplied character ID', async () => {
      const result = await generate({ segmentId, extra: { characterId: GOAT_CHARACTER_ID } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    });

    it('I. rejects client voice, model, or settings overrides', async () => {
      const field =
        EP012_FORBIDDEN_CLIENT_FIELDS[
          EP012_AUTHORIZED_SEGMENT_IDS.indexOf(segmentId) % EP012_FORBIDDEN_CLIENT_FIELDS.length
        ];
      const result = await generate({ segmentId, extra: { [field]: 'override' } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
      expect(EP012_ALLOWED_CLIENT_FIELDS).toEqual(['segmentId', 'confirmed']);
    });

    it('J. rejects an internal canonical text mismatch', async () => {
      const result = await generate({ segmentId, overrides: { canonicalText: 'changed bakery text' } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_TEXT_MISMATCH);
    });

    it('K. rejects an internal text hash mismatch', async () => {
      const result = await generate({ segmentId, overrides: { textSha256: 'd'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_TEXT_HASH_MISMATCH);
    });

    it('L. rejects an internal segment hash mismatch', async () => {
      const result = await generate({ segmentId, overrides: { segmentSha256: 'e'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_SEGMENT_HASH_MISMATCH);
    });

    it('M. rejects a deterministic request ID mismatch', async () => {
      const result = await generate({
        segmentId,
        overrides: { requestId: 'ep012_voice_000000000000000000000000' },
      });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_REQUEST_ID_MISMATCH);
    });

    it('N. rejects a speaker mismatch', async () => {
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      const result = await generate({
        segmentId,
        overrides: { speaker: authorized.speaker === 'PIP' ? 'GOAT' : 'PIP' },
      });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_SPEAKER_MISMATCH);
    });

    it('O. rejects a Pip/Goat character binding mismatch', async () => {
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      const result = await generate({
        segmentId,
        overrides: {
          characterId: authorized.speaker === 'PIP' ? GOAT_CHARACTER_ID : PIP_CHARACTER_ID,
        },
      });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CHARACTER_BINDING_MISMATCH);
    });

    it('P. rejects a character count mismatch', async () => {
      const result = await generate({
        segmentId,
        overrides: { characterCount: getEp012AuthorizedVoiceRequest(segmentId).characterCount + 7 },
      });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CHARACTER_COUNT_MISMATCH);
    });

    it('Q. rejects an aggregate dialogue hash mismatch', async () => {
      const result = await generate({ segmentId, overrides: { dialogueSha256: 'f'.repeat(64) } });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_DIALOGUE_HASH_MISMATCH);
    });

    it('R. rejects legacy 3-request allowance interference', async () => {
      const result = await generate({
        segmentId,
        overrides: { applyLegacyThreeRequestAllowance: true },
      });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEGACY_ALLOWANCE_STILL_ACTIVE);
    });

    it('S. rejects a RESERVED ledger state and does not retry', async () => {
      const store = readyStore();
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      seedEntry(store, authorized.requestId, 'reserved', authorized.speaker === 'PIP' ? 'pip' : 'goat', authorized.characterCount);
      const result = await generate({ segmentId, store });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_REQUEST_ALREADY_RESERVED);
      expect(result.providerContacted).toBe(false);
    });

    it('T. rejects a FAILED ledger state and does not retry', async () => {
      const store = readyStore();
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      seedEntry(store, authorized.requestId, 'failed', authorized.speaker === 'PIP' ? 'pip' : 'goat', authorized.characterCount);
      const result = await generate({ segmentId, store });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_REQUEST_FAILED_REQUIRES_REVIEW);
    });

    it('U. rejects an UNFINALIZED ledger state and does not retry', async () => {
      const store = readyStore();
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      seedEntry(store, authorized.requestId, 'unfinalized', authorized.speaker === 'PIP' ? 'pip' : 'goat', authorized.characterCount);
      const result = await generate({ segmentId, store });
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_REQUEST_UNFINALIZED_REQUIRES_REVIEW);
    });

    it('V. returns ALREADY_SUCCEEDED on replay with zero provider contact', async () => {
      const store = readyStore();
      const authorized = getEp012AuthorizedVoiceRequest(segmentId);
      seedEntry(store, authorized.requestId, 'succeeded', authorized.speaker === 'PIP' ? 'pip' : 'goat', authorized.characterCount);
      const result = await generate({ segmentId, store });
      expect(result.status).toBe('ALREADY_SUCCEEDED');
      expect(result.ok).toBe(true);
      expect(result.readyForProviderContact).toBe(false);
      expect(result.providerContacted).toBe(false);
      expect(result.providerRequestsMade).toBe(0);
      expect(result.requestCheck?.eligibility).toBe('ALREADY_SUCCEEDED');
    });
  });
});

describe('EP012 generate and preflight global blockers', () => {
  beforeEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  afterEach(() => {
    installPreviewVoiceLedgerStore(null);
  });

  it('refuses Production runtime', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      env: { ...readyEnv, VERCEL_ENV: 'production' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED);
    const preflight = await runEp012NoProviderPreflight({
      env: { ...readyEnv, VERCEL_ENV: 'production' },
      store: readyStore(),
    });
    expect(preflight.status).toBe('BLOCKED');
    expect(preflight.serverGates.productionRuntime).toBe(true);
    expect(preflight.readyForProviderContact).toBe(false);
  });

  it('requires confirmed === true', async () => {
    const result = await generate({ segmentId: 'DL_HOOK_01__PIP', confirmed: false });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CONFIRMATION_REQUIRED);
  });

  it('refuses a bad origin', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      origin: 'https://evil.example',
      host: 'pip-and-goat-preview.vercel.app',
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_ORIGIN_REFUSED);
  });

  it('blocks when paid generation is disabled', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      env: { ...readyEnv, ALLOW_PAID_VOICE_GENERATION: 'false' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_PAID_VOICE_DISABLED);
  });

  it('blocks when the API key is missing', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__GOAT',
      env: { ...readyEnv, ELEVENLABS_API_KEY: '' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_API_KEY_NOT_CONFIGURED);
  });

  it('blocks when the test token is missing', async () => {
    const result = await generate({
      segmentId: 'DL_DISCOVERY_01__PIP',
      env: { ...readyEnv, TIVVLEJOY_VOICE_TEST_TOKEN: '' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_NOT_CONFIGURED);
  });

  it('blocks an invalid test token', async () => {
    const result = await generate({
      segmentId: 'DL_DECISION_01__GOAT',
      testToken: 'wrong-token',
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_INVALID);
  });

  it('blocks when the character gate is closed', async () => {
    const result = await generate({
      segmentId: 'DL_ACTION_01__PIP',
      env: { ...readyEnv, TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '1200' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CHARACTER_GATE_CLOSED);
  });

  it('blocks when the durable ledger is not configured', async () => {
    const result = await generate({
      segmentId: 'DL_ACTION_01__GOAT',
      env: { ...readyEnv, TIVVLEJOY_VOICE_LEDGER_DURABLE: '', TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: '' },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_NOT_CONFIGURED);
  });

  it('blocks when the durable ledger is unavailable', async () => {
    const result = await generate({
      segmentId: 'DL_COMPLICATION_01__GOAT',
      store: createUnavailableDurableLedgerStore(),
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_UNAVAILABLE);
  });

  it('blocks when the durable ledger is unreconciled', async () => {
    const store = createSharedDurableLedgerStore();
    installPreviewVoiceLedgerStore(store);
    const result = await generate({ segmentId: 'DL_COMPLICATION_01__PIP', store });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_RECONCILIATION_REQUIRED);
  });

  it('blocks a non-authoritative ledger', async () => {
    const result = await generate({
      segmentId: 'DL_PAYOFF_01__PIP',
      overrides: { forceLedgerAuthoritative: false },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_NOT_AUTHORITATIVE);
  });

  it('blocks an unrelated RESERVED ledger state', async () => {
    const store = readyStore();
    seedEntry(store, 'unrelated_reserved', 'reserved');
    const result = await generate({ segmentId: 'DL_BUTTON_01__GOAT', store });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_RESERVED_REQUEST_PRESENT);
    expect(result.requestCheck?.ledgerEntryStatus).toBe('ABSENT');
  });

  it('blocks an unrelated UNFINALIZED ledger state', async () => {
    const store = readyStore();
    seedEntry(store, 'unrelated_unfinalized', 'unfinalized');
    const result = await generate({ segmentId: 'DL_BUTTON_01__PIP', store });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT);
    expect(result.requestCheck?.ledgerEntryStatus).toBe('ABSENT');
  });

  it('blocks authorization count != 11', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__PIP',
      overrides: { authorizedSegmentCount: 10 },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_AUTHORIZED_COUNT_MISMATCH);
  });

  it('blocks authorization characters != 460', async () => {
    const result = await generate({
      segmentId: 'DL_HOOK_01__GOAT',
      overrides: { totalCharacterCount: 459 },
    });
    expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_AUTHORIZED_CHARACTER_BUDGET_MISMATCH);
  });

  it('blocks an invalid dialogue lock or authorization hash', async () => {
    const lock = await generate({
      segmentId: 'DL_DISCOVERY_01__PIP',
      overrides: { dialogueLockInvalid: true },
    });
    expect(lock.blockers).toContain(EP012_BLOCKER_CODES.EP012_DIALOGUE_LOCK_INVALID);
    const auth = await generate({
      segmentId: 'DL_DISCOVERY_01__PIP',
      overrides: { authorizationInvalid: true, authorizationSha256: '0'.repeat(64) },
    });
    expect(auth.blockers).toContain(EP012_BLOCKER_CODES.EP012_AUTHORIZATION_INVALID);
    expect(auth.blockers).toContain(EP012_BLOCKER_CODES.EP012_AUTHORIZATION_HASH_MISMATCH);
  });
});

describe('EP012 route and source boundaries', () => {
  it('does not import provider transport, scenery, or R2 in the preflight and guard modules', () => {
    const preflight = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight.ts');
    const guard = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-generate-guard.ts');
    const preflightRoute = readRepo('apps/web/src/app/api/voice-production/ep012/preflight/route.ts');
    const generateRoute = readRepo('apps/web/src/app/api/voice-production/ep012/generate/route.ts');
    for (const source of [preflight, guard, preflightRoute, generateRoute]) {
      expect(source).not.toMatch(/candidate-provider/);
      expect(source).not.toMatch(/defaultCandidateTransport/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/convertCandidateSpeech/);
      expect(source).not.toMatch(/R2_|r2\.cloudflarestorage/);
      expect(source).not.toMatch(/tivvlejoy-scenery|scenery\/intake/);
    }
    expect(generateRoute).not.toMatch(/SCRIPT_TO_VOICE_MAX_PAID_REQUESTS/);
    expect(preflight).not.toMatch(/SCRIPT_TO_VOICE_MAX_PAID_REQUESTS/);
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
  });

  it('keeps the generation route at the no-provider boundary', async () => {
    const response = await postEp012Generate(
      new Request('http://localhost/api/voice-production/ep012/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          host: 'localhost',
          [EP012_VOICE_TEST_TOKEN_HEADER]: 'preview-token',
        },
        body: JSON.stringify({
          segmentId: 'DL_HOOK_01__PIP',
          confirmed: true,
          canonicalText: 'browser override',
        }),
      }),
    );
    const json = (await response.json()) as {
      schemaVersion: string;
      status: string;
      blockers: string[];
      providerContacted: boolean;
    };
    expect(json.providerContacted).toBe(false);
    expect(json.status).toBe('BLOCKED');
    expect(json.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    expect(response.status).toBe(400);
    expect(json.schemaVersion).toBe('TIVVLEJOY_EP012_PAID_VOICE_EXECUTION_V1');
    expect(EP012_GENERATION_ROUTE_GUARD_SCHEMA).toBe('TIVVLEJOY_EP012_GENERATION_ROUTE_GUARD_V1');
  });

  it('serves GET preflight as a side-effect-free status document', async () => {
    const response = await getEp012Preflight();
    const json = (await response.json()) as {
      schemaVersion: string;
      providerContacted: boolean;
      providerRequestsMade: number;
      dialogueLockMutated: boolean;
      sceneryAccessed: boolean;
    };
    expect(json.schemaVersion).toBe(EP012_NO_PROVIDER_PREFLIGHT_SCHEMA);
    expect(json.providerContacted).toBe(false);
    expect(json.providerRequestsMade).toBe(0);
    expect(json.dialogueLockMutated).toBe(false);
    expect(json.sceneryAccessed).toBe(false);
    expect(response.status).toBe(200);
  });
});

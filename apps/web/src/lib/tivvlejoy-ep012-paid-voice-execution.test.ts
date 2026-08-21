import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getEp012Audio } from '@/app/api/voice-production/ep012/audio/route';
import { GET as getEp012Preflight } from '@/app/api/voice-production/ep012/preflight/route';
import { GET as getEp012StorageProbe, POST as postEp012StorageProbe } from '@/app/api/voice-production/ep012/storage-probe/route';
import { POST as postEp012Generate } from '@/app/api/voice-production/ep012/generate/route';
import {
  EP012_BLOCKER_CODES,
  EP012_VOICE_TEST_TOKEN_HEADER,
  createEp012SideEffectTracker,
  runEp012NoProviderPreflight,
} from './tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import {
  EP012_AUTHORIZED_CHARACTER_COUNT,
  EP012_AUTHORIZED_REQUEST_COUNT,
  EP012_FINAL_GLOBAL_CHARACTER_CEILING,
  EP012_FINAL_GLOBAL_REQUEST_CEILING,
  EP012_HISTORICAL_PAID_CHARACTERS,
  EP012_HISTORICAL_PAID_REQUESTS,
  EP012_PAID_VOICE_EXECUTION_SCHEMA,
  EP012_STORAGE_PROBE_MARKER_KEY,
} from './tivvlejoy-real-production-unblock/ep012-paid-voice-constants';
import {
  acceptEp012ProviderPayload,
  createFakeEp012ProviderTransport,
  deriveEp012ProviderRequest,
  ep012ProviderUrl,
  fakeEp012Mp3Bytes,
  fakeEp012ProviderPayload,
} from './tivvlejoy-real-production-unblock/ep012-elevenlabs-transport';
import {
  createMemoryEp012AudioStorage,
  deriveEp012ObjectKeys,
  sha256Bytes,
} from './tivvlejoy-real-production-unblock/ep012-audio-storage';
import {
  installEp012ExecutionAdapters,
  runEp012PaidVoiceExecution,
} from './tivvlejoy-real-production-unblock/ep012-paid-voice-execution';
import { retrieveEp012AuthorizedAudio } from './tivvlejoy-real-production-unblock/ep012-audio-retrieval';
import { runEp012StorageProbe } from './tivvlejoy-real-production-unblock/ep012-storage-probe';
import { deriveEp012AuthorizedRequest } from './tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import { EP012_VOICE_AUTHORIZATION, getEp012AuthorizedVoiceRequest } from './tivvlejoy-real-production-unblock';
import {
  createSharedDurableLedgerStore,
  installPreviewVoiceLedgerStore,
  type DurableVoiceLedgerStore,
} from './voice-production/durable-voice-ledger';
import { SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS, SCRIPT_TO_VOICE_MAX_PAID_REQUESTS } from './voice-production/script-line';
import { APPROVED_ELEVENLABS_MODEL, APPROVED_OUTPUT_FORMAT } from './voice-production/approved-voice-settings';

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

function historicalStore(): DurableVoiceLedgerStore {
  const store = createSharedDurableLedgerStore({
    available: true,
    reconciled: true,
    paidRequests: EP012_HISTORICAL_PAID_REQUESTS,
    paidCharactersUsed: EP012_HISTORICAL_PAID_CHARACTERS,
    failedAttempts: 0,
    reservedRequests: 0,
    reservedCharacters: 0,
    unfinalizedCount: 0,
    reconciliationStatus: 'imported',
    reconciliationEvidence: 'authoritative-preview-import',
    month: '2026-08',
  });
  installPreviewVoiceLedgerStore(store);
  return store;
}

function origin() {
  return {
    origin: 'https://pip-and-goat-preview.vercel.app',
    host: 'pip-and-goat-preview.vercel.app',
    testToken: 'preview-token',
  };
}

async function execute(input: {
  segmentId: string;
  confirmed?: unknown;
  extra?: Record<string, unknown>;
  env?: Record<string, string>;
  store?: DurableVoiceLedgerStore;
  transport?: ReturnType<typeof createFakeEp012ProviderTransport>;
  storage?: ReturnType<typeof createMemoryEp012AudioStorage>;
  failTransport?: boolean;
  calls?: { count: number };
}) {
  const store = input.store ?? historicalStore();
  const storage = input.storage ?? createMemoryEp012AudioStorage();
  const calls = input.calls ?? { count: 0 };
  const authorizedText = (() => {
    try {
      return getEp012AuthorizedVoiceRequest(input.segmentId).canonicalText;
    } catch {
      return 'unauthorized';
    }
  })();
  const transport =
    input.transport ??
    createFakeEp012ProviderTransport(() => fakeEp012ProviderPayload(authorizedText, input.segmentId), {
      fail: input.failTransport,
      calls,
    });
  const tracker = createEp012SideEffectTracker();
  const result = await runEp012PaidVoiceExecution({
    body: { segmentId: input.segmentId, confirmed: input.confirmed ?? true, ...input.extra },
    ...origin(),
    env: input.env ?? readyEnv,
    store,
    tracker,
    providerTransport: transport,
    storage,
  });
  expect(result.sceneryAccessed).toBe(false);
  expect(result.sceneryRequestsMade).toBe(0);
  expect(result.commercialBytesDownloaded).toBe(0);
  expect(result.dialogueLockMutated).toBe(false);
  expect(result.productionEnabled).toBe(false);
  return { result, store, storage, calls, tracker };
}

describe('TIVVLEJOY_EP012_PAID_VOICE_EXECUTION_V1', () => {
  beforeEach(() => {
    installPreviewVoiceLedgerStore(null);
    installEp012ExecutionAdapters(null);
  });

  afterEach(() => {
    installPreviewVoiceLedgerStore(null);
    installEp012ExecutionAdapters(null);
  });

  it('preserves historical 4/235 and the dedicated 11/460 and 15/695 ceilings', async () => {
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
    expect(SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS).toBe(750);
    expect(EP012_HISTORICAL_PAID_REQUESTS).toBe(4);
    expect(EP012_HISTORICAL_PAID_CHARACTERS).toBe(235);
    expect(EP012_AUTHORIZED_REQUEST_COUNT).toBe(11);
    expect(EP012_AUTHORIZED_CHARACTER_COUNT).toBe(460);
    expect(EP012_FINAL_GLOBAL_REQUEST_CEILING).toBe(15);
    expect(EP012_FINAL_GLOBAL_CHARACTER_CEILING).toBe(695);
    const preflight = await runEp012NoProviderPreflight({ env: readyEnv, store: historicalStore() });
    expect(preflight.status).toBe('READY');
    expect(preflight.ledger.globalPaidRequests).toBe(4);
    expect(preflight.ledger.globalPaidCharactersUsed).toBe(235);
    expect(preflight.ledger.completedRequests).toBe(0);
    expect(preflight.ledger.remainingRequests).toBe(11);
    expect(preflight.ledger.remainingCharacters).toBe(460);
    expect(preflight.ledger.reservations).toBe(0);
    expect(preflight.ledger.unfinalized).toBe(0);
    expect(preflight.ledger.providerRequestsMade).toBe(0);
    expect(preflight.nextProviderContactPermitted).toBe(true);
    expect(preflight.productionEnabled).toBe(false);
  });

  it('derives text, settings, model, and storage keys server-side', async () => {
    const derived = deriveEp012AuthorizedRequest('DL_HOOK_01__PIP');
    const provider = deriveEp012ProviderRequest(derived);
    expect(provider.text).toBe(derived.canonicalText);
    expect(provider.modelId).toBe(APPROVED_ELEVENLABS_MODEL);
    expect(provider.outputFormat).toBe(APPROVED_OUTPUT_FORMAT);
    expect(provider.voiceSettings.stability).toBe(0.5);
    expect(ep012ProviderUrl('server-voice')).toContain('/v1/text-to-speech/server-voice/with-timestamps');
    expect(ep012ProviderUrl('server-voice')).toContain(`output_format=${APPROVED_OUTPUT_FORMAT}`);
    expect(deriveEp012ObjectKeys(derived.segmentId)).toEqual({
      audioKey: 'audio/EP012/DL_HOOK_01__PIP.mp3',
      receiptKey: 'audio/EP012/DL_HOOK_01__PIP.receipt.json',
    });
  });

  it('executes one authorized segment through reserve, one provider call, storage verify, then finalize', async () => {
    const { result, store, storage, calls } = await execute({ segmentId: 'DL_HOOK_01__PIP' });
    expect(result.schemaVersion).toBe(EP012_PAID_VOICE_EXECUTION_SCHEMA);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.ok).toBe(true);
    expect(result.providerContacted).toBe(true);
    expect(result.providerRequestsMade).toBe(1);
    expect(result.storageVerified).toBe(true);
    expect(result.characterCount).toBe(51);
    expect(calls.count).toBe(1);
    const record = await store.read();
    expect(record.paidRequests).toBe(5);
    expect(record.paidCharactersUsed).toBe(286);
    expect(record.reservedRequests).toBe(0);
    expect(record.unfinalizedCount).toBe(0);
    const execution = await store.getEp012Execution(result.requestId!);
    expect(execution?.status).toBe('succeeded');
    expect(execution?.storageVerified).toBe(true);
    const audio = await storage.getObject('audio/EP012/DL_HOOK_01__PIP.mp3');
    expect(sha256Bytes(audio)).toBe(result.audioSha256);
    expect(audio.byteLength).toBe(result.audioBytes);
  });

  it('refuses Production, local, and development runtimes', async () => {
    for (const runtime of ['production', 'development', '']) {
      const { result } = await execute({
        segmentId: 'DL_HOOK_01__PIP',
        env: { ...readyEnv, VERCEL_ENV: runtime },
      });
      expect(result.status).toBe('BLOCKED');
      expect(result.providerRequestsMade).toBe(0);
      if (runtime === 'production') {
        expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_PRODUCTION_RUNTIME_REFUSED);
      }
      expect(result.blockers).toContain(EP012_BLOCKER_CODES.EP012_PREVIEW_RUNTIME_REQUIRED);
    }
  });

  it('refuses same-origin and token failures before provider contact', async () => {
    const store = historicalStore();
    const storage = createMemoryEp012AudioStorage();
    const calls = { count: 0 };
    const derived = getEp012AuthorizedVoiceRequest('DL_HOOK_01__GOAT');
    const originResult = await runEp012PaidVoiceExecution({
      body: { segmentId: 'DL_HOOK_01__GOAT', confirmed: true },
      origin: 'https://evil.example',
      host: 'pip-and-goat-preview.vercel.app',
      testToken: 'preview-token',
      env: readyEnv,
      store,
      storage,
      providerTransport: createFakeEp012ProviderTransport(fakeEp012ProviderPayload(derived.canonicalText), { calls }),
    });
    expect(originResult.blockers).toContain(EP012_BLOCKER_CODES.EP012_ORIGIN_REFUSED);
    expect(originResult.providerRequestsMade).toBe(0);
    const tokenResult = await runEp012PaidVoiceExecution({
      body: { segmentId: 'DL_HOOK_01__GOAT', confirmed: true },
      ...origin(),
      testToken: 'wrong',
      env: readyEnv,
      store,
      storage,
      providerTransport: createFakeEp012ProviderTransport(fakeEp012ProviderPayload(derived.canonicalText), { calls }),
    });
    expect(tokenResult.blockers).toContain(EP012_BLOCKER_CODES.EP012_TEST_TOKEN_INVALID);
    expect(calls.count).toBe(0);
  });

  it('refuses extra request fields and unknown segments', async () => {
    const extra = await execute({
      segmentId: 'DL_HOOK_01__PIP',
      extra: { canonicalText: 'forged', voiceId: 'abc', storageKey: 'audio/EP012/x.mp3' },
    });
    expect(extra.result.blockers).toContain(EP012_BLOCKER_CODES.EP012_CLIENT_FIELD_FORBIDDEN);
    expect(extra.result.providerRequestsMade).toBe(0);
    const unknown = await execute({ segmentId: 'DL_HOOK_01__PIP__FORGED' });
    expect(unknown.result.blockers).toContain(EP012_BLOCKER_CODES.EP012_SEGMENT_NOT_AUTHORIZED);
    expect(unknown.result.providerRequestsMade).toBe(0);
  });

  it('prevents duplicate and concurrent reservations', async () => {
    const store = historicalStore();
    const first = await execute({ segmentId: 'DL_DISCOVERY_01__PIP', store });
    expect(first.result.status).toBe('SUCCEEDED');
    const duplicate = await execute({ segmentId: 'DL_DISCOVERY_01__PIP', store, storage: first.storage });
    expect(duplicate.result.status).toBe('ALREADY_SUCCEEDED');
    expect(duplicate.result.idempotentReplay).toBe(true);
    expect(duplicate.result.providerRequestsMade).toBe(0);
    expect(duplicate.calls.count).toBe(0);

    const reserved = historicalStore();
    const derivedA = getEp012AuthorizedVoiceRequest('DL_ACTION_01__PIP');
    const derivedB = getEp012AuthorizedVoiceRequest('DL_ACTION_01__GOAT');
    const [one, two] = await Promise.all([
      reserved.reserveEp012({
        requestId: derivedA.requestId,
        segmentId: derivedA.segmentId,
        character: 'pip',
        characterCount: derivedA.characterCount,
      }),
      reserved.reserveEp012({
        requestId: derivedB.requestId,
        segmentId: derivedB.segmentId,
        character: 'goat',
        characterCount: derivedB.characterCount,
      }).catch((error: Error) => error),
    ]);
    expect(one.entry.status).toBe('reserved');
    expect(two).toBeInstanceOf(Error);
  });

  it('never retries a provider request and blocks unfinalized recovery', async () => {
    const store = historicalStore();
    const calls = { count: 0 };
    const failed = await execute({ segmentId: 'DL_DECISION_01__GOAT', store, failTransport: true, calls });
    expect(failed.result.status).toBe('RECOVERY_REQUIRED');
    expect(failed.result.blockers).toContain(EP012_BLOCKER_CODES.EP012_RECOVERY_REQUIRED);
    expect(calls.count).toBe(1);
    const record = await store.read();
    expect(record.unfinalizedCount).toBe(1);
    expect(record.paidRequests).toBe(4);
    const retry = await execute({ segmentId: 'DL_DECISION_01__GOAT', store });
    expect(retry.result.status).toBe('BLOCKED');
    expect(retry.result.providerRequestsMade).toBe(0);
    const other = await execute({ segmentId: 'DL_ACTION_01__PIP', store });
    expect(other.result.blockers).toContain(EP012_BLOCKER_CODES.EP012_LEDGER_UNFINALIZED_REQUEST_PRESENT);
    expect(other.result.providerRequestsMade).toBe(0);
  });

  it('rejects malformed provider responses without finalizing', async () => {
    const store = historicalStore();
    const storage = createMemoryEp012AudioStorage();
    const result = await runEp012PaidVoiceExecution({
      body: { segmentId: 'DL_BUTTON_01__GOAT', confirmed: true },
      ...origin(),
      env: readyEnv,
      store,
      storage,
      providerTransport: createFakeEp012ProviderTransport({ error: 'nope' }),
    });
    expect(result.status).toBe('RECOVERY_REQUIRED');
    expect((await store.read()).paidRequests).toBe(4);
    expect((await store.read()).unfinalizedCount).toBe(1);
    expect(() => acceptEp012ProviderPayload('<html>nope</html>')).toThrow(/unsupported response/i);
  });

  it('does not finalize the ledger when R2 write or read-back fails', async () => {
    const store = historicalStore();
    const writeFail = createMemoryEp012AudioStorage();
    writeFail.putObject = async () => {
      throw new Error('write failed');
    };
    const writeResult = await runEp012PaidVoiceExecution({
      body: { segmentId: 'DL_BUTTON_01__PIP', confirmed: true },
      ...origin(),
      env: readyEnv,
      store,
      storage: writeFail,
      providerTransport: createFakeEp012ProviderTransport(
        fakeEp012ProviderPayload(getEp012AuthorizedVoiceRequest('DL_BUTTON_01__PIP').canonicalText),
      ),
    });
    expect(writeResult.status).toBe('RECOVERY_REQUIRED');
    expect((await store.read()).paidRequests).toBe(4);
    expect((await store.getEp012Execution(getEp012AuthorizedVoiceRequest('DL_BUTTON_01__PIP').requestId))?.status).toBe(
      'unfinalized',
    );

    const mismatchStore = historicalStore();
    const mismatch = createMemoryEp012AudioStorage();
    const originalGet = mismatch.getObject.bind(mismatch);
    mismatch.getObject = async (key: string) => {
      const bytes = await originalGet(key);
      const tampered = new Uint8Array(bytes);
      tampered[0] = 0x00;
      return tampered;
    };
    const mismatchResult = await runEp012PaidVoiceExecution({
      body: { segmentId: 'DL_PAYOFF_01__PIP', confirmed: true },
      ...origin(),
      env: readyEnv,
      store: mismatchStore,
      storage: mismatch,
      providerTransport: createFakeEp012ProviderTransport(
        fakeEp012ProviderPayload(getEp012AuthorizedVoiceRequest('DL_PAYOFF_01__PIP').canonicalText),
      ),
    });
    expect(mismatchResult.status).toBe('RECOVERY_REQUIRED');
    expect((await mismatchStore.read()).paidRequests).toBe(4);
  });

  it('replays a fully finalized success without contacting the provider', async () => {
    const first = await execute({ segmentId: 'DL_COMPLICATION_01__PIP' });
    const replay = await execute({
      segmentId: 'DL_COMPLICATION_01__PIP',
      store: first.store,
      storage: first.storage,
    });
    expect(replay.result.status).toBe('ALREADY_SUCCEEDED');
    expect(replay.result.idempotentReplay).toBe(true);
    expect(replay.result.providerContacted).toBe(false);
    expect(replay.result.providerRequestsMade).toBe(0);
    expect(replay.calls.count).toBe(0);
    expect((await first.store.read()).paidRequests).toBe(5);
  });

  it('can report COMPLETE after exactly 11/460 and 15/695 with storage-verified artifacts', async () => {
    const store = historicalStore();
    const storage = createMemoryEp012AudioStorage();
    for (const authorized of EP012_VOICE_AUTHORIZATION.authorizedRequests) {
      const result = await runEp012PaidVoiceExecution({
        body: { segmentId: authorized.segmentId, confirmed: true },
        ...origin(),
        env: readyEnv,
        store,
        storage,
        providerTransport: createFakeEp012ProviderTransport(fakeEp012ProviderPayload(authorized.canonicalText, authorized.segmentId)),
      });
      expect(result.status).toBe('SUCCEEDED');
    }
    const record = await store.read();
    expect(record.paidRequests).toBe(15);
    expect(record.paidCharactersUsed).toBe(695);
    const preflight = await runEp012NoProviderPreflight({ env: readyEnv, store });
    expect(preflight.status).toBe('COMPLETE');
    expect(preflight.ledger.completedRequests).toBe(11);
    expect(preflight.ledger.completedCharacters).toBe(460);
    expect(preflight.ledger.globalPaidRequests).toBe(15);
    expect(preflight.ledger.globalPaidCharactersUsed).toBe(695);
    expect(preflight.ledger.reservations).toBe(0);
    expect(preflight.ledger.unfinalized).toBe(0);
    expect(preflight.ledger.allArtifactsStorageVerified).toBe(true);
    expect(preflight.ledger.providerRequestsMade).toBe(11);
    expect(preflight.nextProviderContactPermitted).toBe(false);
    expect(preflight.productionEnabled).toBe(false);
  });

  it('retrieves finalized MP3 and receipt and refuses path traversal', async () => {
    const { store, storage, result } = await execute({ segmentId: 'DL_HOOK_01__GOAT' });
    expect(result.status).toBe('SUCCEEDED');
    const mp3 = await retrieveEp012AuthorizedAudio({
      segmentId: 'DL_HOOK_01__GOAT',
      kind: 'mp3',
      ...origin(),
      env: readyEnv,
      store,
      storage,
    });
    expect(mp3.ok).toBe(true);
    if (mp3.ok && mp3.kind === 'mp3') {
      expect(mp3.contentType).toBe('audio/mpeg');
      expect(mp3.bytes.byteLength).toBeGreaterThan(0);
    }
    const receipt = await retrieveEp012AuthorizedAudio({
      segmentId: 'DL_HOOK_01__GOAT',
      kind: 'receipt',
      ...origin(),
      env: readyEnv,
      store,
      storage,
    });
    expect(receipt.ok).toBe(true);
    const traversal = await retrieveEp012AuthorizedAudio({
      segmentId: '../scenery/secret',
      kind: 'mp3',
      extraQueryKeys: ['key'],
      objectKey: 'environments/forest.blend',
      ...origin(),
      env: readyEnv,
      store,
      storage,
    });
    expect(traversal.ok).toBe(false);
    if (!traversal.ok) {
      expect(traversal.blockers).toContain(EP012_BLOCKER_CODES.EP012_PATH_TRAVERSAL_REFUSED);
      expect(traversal.providerRequestsMade).toBe(0);
    }
  });

  it('keeps the storage probe isolated from generation and the provider', async () => {
    const storage = createMemoryEp012AudioStorage();
    const calls = { count: 0 };
    const probe = await runEp012StorageProbe({
      body: { confirmed: true },
      ...origin(),
      env: readyEnv,
      storage,
    });
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe('VERIFIED');
    expect(probe.markerKey).toBe(EP012_STORAGE_PROBE_MARKER_KEY);
    expect(probe.providerContacted).toBe(false);
    expect(probe.providerRequestsMade).toBe(0);
    expect(probe.sceneryAccessed).toBe(false);
    const again = await runEp012StorageProbe({
      body: { confirmed: true },
      ...origin(),
      env: readyEnv,
      storage,
    });
    expect(again.ok).toBe(true);
    expect(again.sha256).toBe(probe.sha256);
    expect(calls.count).toBe(0);
    expect(storage.objects.has(EP012_STORAGE_PROBE_MARKER_KEY)).toBe(true);
    expect([...storage.objects.keys()].every((key) => key.startsWith('audio/EP012/'))).toBe(true);
  });

  it('makes zero provider calls from preflight, retrieval, and the storage probe', async () => {
    const store = historicalStore();
    const storage = createMemoryEp012AudioStorage();
    const tracker = createEp012SideEffectTracker();
    const preflight = await runEp012NoProviderPreflight({ env: readyEnv, store, tracker });
    expect(preflight.providerContacted).toBe(false);
    expect(tracker.providerCalls).toBe(0);
    const retrieval = await retrieveEp012AuthorizedAudio({
      segmentId: 'DL_HOOK_01__PIP',
      ...origin(),
      env: readyEnv,
      store,
      storage,
    });
    expect(retrieval.ok).toBe(false);
    if (!retrieval.ok) expect(retrieval.providerRequestsMade).toBe(0);
    const probe = await runEp012StorageProbe({
      body: { confirmed: true },
      ...origin(),
      env: readyEnv,
      storage,
    });
    expect(probe.providerRequestsMade).toBe(0);
    expect(probe.providerContacted).toBe(false);
  });

  it('does not let the legacy three-request preview cap govern EP012 reservation', async () => {
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
    const store = historicalStore();
    expect((await store.read()).paidRequests).toBe(4);
    const derived = getEp012AuthorizedVoiceRequest('DL_HOOK_01__PIP');
    const reserved = await store.reserveEp012({
      requestId: derived.requestId,
      segmentId: derived.segmentId,
      character: 'pip',
      characterCount: derived.characterCount,
    });
    expect(reserved.entry.status).toBe('reserved');
    await expect(
      store.reserve({
        requestId: 'legacy_preview_line',
        character: 'pip',
        characterCount: 10,
      }),
    ).rejects.toThrow(/Temporary Preview allowance of 3/);
  });

  it('keeps Production disabled and never exposes secrets or Voice IDs', async () => {
    const { result } = await execute({ segmentId: 'DL_HOOK_01__PIP' });
    const serialized = JSON.stringify(result);
    expect(result.productionEnabled).toBe(false);
    expect(serialized).not.toMatch(/ELEVENLABS_API_KEY|xi-api-key|TIVVLEJOY_VOICE_TEST_TOKEN|DATABASE_URL|R2_SECRET|93w5H37WdqeS6HoyL5cV|SbxjwBKw2PefbSupcoXV/);
    expect(fakeEp012Mp3Bytes().byteLength).toBeGreaterThan(4);
  });
});

describe('EP012 paid execution source and route boundaries', () => {
  it('keeps preflight and probe isolated from scenery and candidate-provider', () => {
    const preflight = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight.ts');
    const guard = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-generate-guard.ts');
    const probe = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-storage-probe.ts');
    const retrieve = readRepo('apps/web/src/lib/tivvlejoy-real-production-unblock/ep012-audio-retrieval.ts');
    const generateRoute = readRepo('apps/web/src/app/api/voice-production/ep012/generate/route.ts');
    const probeRoute = readRepo('apps/web/src/app/api/voice-production/ep012/storage-probe/route.ts');
    for (const source of [preflight, guard, probe, retrieve, generateRoute, probeRoute]) {
      expect(source).not.toMatch(/candidate-provider/);
      expect(source).not.toMatch(/convertCandidateSpeech/);
      expect(source).not.toMatch(/tivvlejoy-scenery|scenery\/intake/);
      expect(source).not.toMatch(/SCRIPT_TO_VOICE_MAX_PAID_REQUESTS/);
    }
    expect(preflight).not.toMatch(/\bfetch\s*\(/);
    expect(guard).not.toMatch(/\bfetch\s*\(/);
    expect(probe).not.toMatch(/\bfetch\s*\(/);
    expect(retrieve).not.toMatch(/\bfetch\s*\(/);
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
  });

  it('refuses GET on the storage probe and does not execute it from the route helper', async () => {
    const response = await getEp012StorageProbe();
    expect(response.status).toBe(405);
    const json = (await response.json()) as { providerContacted: boolean; providerRequestsMade: number };
    expect(json.providerContacted).toBe(false);
    expect(json.providerRequestsMade).toBe(0);
    expect(postEp012StorageProbe).toBeTypeOf('function');
    expect(postEp012Generate).toBeTypeOf('function');
    expect(getEp012Audio).toBeTypeOf('function');
    expect(getEp012Preflight).toBeTypeOf('function');
  });
});

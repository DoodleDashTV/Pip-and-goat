import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCandidateVoiceService } from './voice-production/candidate-service';
import { FIXED_APPROVED_LINES } from './voice-production/candidates';
import {
  createSharedDurableLedgerStore,
  createUnavailableDurableLedgerStore,
  installPreviewVoiceLedgerStore,
  publicDurableLedgerView,
  resetDurableVoiceLedgerForTests,
  resolvePreviewVoiceLedgerStore,
  type DurableVoiceLedgerStore,
} from './voice-production/durable-voice-ledger';
import {
  DURABLE_LEDGER_COPY,
  DURABLE_LEDGER_RECONCILE_PROCEDURE,
  PRIOR_PAID_USAGE_EVIDENCE,
} from './voice-production/durable-voice-ledger-public';
import { createEpisodeLineVoiceService } from './voice-production/episode-line-voice';
import { isPaidVoiceGenerationAuthorized } from './voice-production/safety';
import { createScriptToVoiceService, resetScriptToVoiceState } from './voice-production/script-to-voice';
import { createVoiceProductionService } from './voice-production/service';
import { createMemoryVoiceStore } from './voice-production/store';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './voice-production/types';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

const openEnv = {
  ALLOW_PAID_VOICE_GENERATION: 'true',
  TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
  ELEVENLABS_API_KEY: 'test-key-not-real',
  TIVVLEJOY_VOICE_TEST_TOKEN: 'preview-token',
  TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '600',
  VERCEL_ENV: 'preview',
};

const safeLine = 'The meadow path still looks bright from here.';

function mockTransport(calls: Array<{ url: string; body: string }>, result?: { ok: boolean; status: number }) {
  return async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    if (result && !result.ok) {
      return { ok: false, status: result.status, contentType: 'application/json', body: 'no' };
    }
    return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
  };
}

function wrapFinalizeFailure(store: DurableVoiceLedgerStore): DurableVoiceLedgerStore {
  let shouldFail = true;
  return {
    ...store,
    async finalize(input) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('receipt write failed');
      }
      return store.finalize(input);
    },
  };
}

describe('durable Preview voice ledger', () => {
  beforeEach(() => {
    resetScriptToVoiceState();
  });

  it('does not treat a new deployment as zero usage and fails closed without reconciliation', async () => {
    const fresh = createSharedDurableLedgerStore();
    installPreviewVoiceLedgerStore(fresh);
    const view = publicDurableLedgerView(openEnv, fresh.readSync());
    expect(view.status).toBe('reconciliation_required');
    expect(view.message).toBe(DURABLE_LEDGER_COPY.reconcile);
    expect(view.authoritative).toBe(false);
    expect(view.paidRequests).toBeNull();
    expect(view.generateEnabled).toBe(false);
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    await expect(
      service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_unreconciled',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/prior usage requires reconciliation/i);
    expect(calls).toHaveLength(0);
    expect(PRIOR_PAID_USAGE_EVIDENCE).toContain('process memory');
  });

  it('imports prior usage once and rejects a silent zero reset', async () => {
    const store = createSharedDurableLedgerStore();
    await expect(
      store.importPriorUsageOnce({ paidRequests: 0, paidCharacters: 0, evidence: 'made-up zeros' }),
    ).rejects.toThrow(/cannot silently reset to zero/i);
    const first = await store.importPriorUsageOnce({
      paidRequests: 2,
      paidCharacters: 180,
      evidence: 'ElevenLabs usage export for the two approved Preview tests',
    });
    expect(first.imported).toBe(true);
    expect(first.record.paidRequests).toBe(2);
    expect(first.record.paidCharactersUsed).toBe(180);
    const second = await store.importPriorUsageOnce({
      paidRequests: 2,
      paidCharacters: 180,
      evidence: 'ElevenLabs usage export for the two approved Preview tests',
    });
    expect(second.imported).toBe(false);
    await expect(
      store.importPriorUsageOnce({
        paidRequests: 3,
        paidCharacters: 200,
        evidence: 'different totals',
      }),
    ).rejects.toThrow(/already imported/i);
    expect((await store.read()).paidRequests).toBe(2);
  });

  it('survives a simulated deployment restart and is shared by separate server instances', async () => {
    const shared = createSharedDurableLedgerStore();
    await shared.importPriorUsageOnce({
      paidRequests: 2,
      paidCharacters: 100,
      evidence: 'ElevenLabs usage export for the two approved Preview tests',
    });
    installPreviewVoiceLedgerStore(shared);
    const firstCalls: Array<{ url: string; body: string }> = [];
    const first = createScriptToVoiceService(openEnv, mockTransport(firstCalls));
    await first.generate({
      characterId: PIP_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_shared_one',
      testToken: 'preview-token',
      confirmed: true,
    });
    installPreviewVoiceLedgerStore(shared);
    const restarted = createScriptToVoiceService(openEnv, mockTransport([]));
    const snapshot = restarted.snapshot();
    expect(snapshot.durableLedger.authoritative).toBe(true);
    expect(snapshot.durableLedger.paidRequests).toBe(3);
    expect(snapshot.ledger.paidRequests).toBe(3);
    const otherInstance = createScriptToVoiceService(openEnv, mockTransport([]));
    expect(otherInstance.snapshot().ledger.paidRequests).toBe(3);
    expect(firstCalls).toHaveLength(1);
  });

  it('lets two simultaneous requests share the cap without exceeding it', async () => {
    const shared = createSharedDurableLedgerStore();
    await shared.importPriorUsageOnce({
      paidRequests: 2,
      paidCharacters: 100,
      evidence: 'ElevenLabs usage export for the two approved Preview tests',
    });
    const results = await Promise.allSettled([
      shared.reserve({ requestId: 'req_race_a', character: 'pip', characterCount: 40 }),
      shared.reserve({ requestId: 'req_race_b', character: 'goat', characterCount: 40 }),
    ]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const state = await shared.read();
    expect(state.paidRequests).toBe(2);
    expect(state.reservedRequests).toBe(1);
  });

  it('does not double-bill duplicate idempotency keys and does not bill failed provider calls', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const first = await service.generate({
      characterId: PIP_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_dup_ledger',
      testToken: 'preview-token',
      confirmed: true,
    });
    const replay = await service.generate({
      characterId: PIP_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_dup_ledger',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect(replay.requestId).toBe(first.requestId);
    expect(calls).toHaveLength(1);
    expect(first.ledger.paidRequests).toBe(1);

    const failingCalls: Array<{ url: string; body: string }> = [];
    const failing = createScriptToVoiceService(openEnv, mockTransport(failingCalls, { ok: false, status: 500 }));
    await expect(
      failing.generate({
        characterId: GOAT_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_fail_ledger',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(resolvePreviewVoiceLedgerStore().readSync().paidRequests).toBe(1);
    expect(failingCalls).toHaveLength(1);
  });

  it('fails safely when the provider succeeds but the receipt write fails', async () => {
    const base = resetDurableVoiceLedgerForTests();
    const wrapped = wrapFinalizeFailure(base);
    installPreviewVoiceLedgerStore(wrapped);
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    await expect(
      service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_unfinalized',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
    expect((await wrapped.read()).paidRequests).toBe(0);
    expect((await wrapped.getEntry('req_unfinalized'))?.status).toBe('unfinalized');
    await expect(
      service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_unfinalized',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/already submitted|not retried/i);
    expect(calls).toHaveLength(1);
  });

  it('blocks provider contact when the durable store is unavailable and never falls back to in-memory paid accounting', async () => {
    installPreviewVoiceLedgerStore(null);
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    expect(service.snapshot().durableLedger.message).toBe(DURABLE_LEDGER_COPY.unavailable);
    expect(service.snapshot().durableLedger.generateEnabled).toBe(false);
    await expect(
      service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_unavailable',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/durable ledger unavailable/i);
    expect(calls).toHaveLength(0);
    expect(createUnavailableDurableLedgerStore().kind).toBe('unavailable');
    expect(readRepo('apps/web/src/lib/voice-production/script-to-voice.ts')).toContain('assertDurableGenerateReady');
    expect(readRepo('apps/web/src/lib/voice-production/script-to-voice.ts')).not.toContain(
      'recordSuccessfulPaidUsage({',
    );
  });

  it('keeps review free while Production and the older draft-audio path stay refused', async () => {
    installPreviewVoiceLedgerStore(createUnavailableDurableLedgerStore());
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const preview = service.validate({ characterId: PIP_CHARACTER_ID, text: safeLine });
    expect(preview.providerContacted).toBe(false);
    const production = createScriptToVoiceService({ ...openEnv, VERCEL_ENV: 'production' }, mockTransport(calls));
    await expect(
      production.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_prod_ledger',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/Production/);
    expect(isPaidVoiceGenerationAuthorized({ ALLOW_PAID_VOICE_GENERATION: 'true', TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true' })).toBe(
      false,
    );
    const draft = createVoiceProductionService(createMemoryVoiceStore(), {
      ALLOW_PAID_VOICE_GENERATION: 'true',
      TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
      ELEVENLABS_API_KEY: 'test-key-not-real',
    });
    const fixture = draft.generateDraftAudio({
      episodeId: 'ep-1',
      sceneId: 'scene-1',
      characterId: PIP_CHARACTER_ID,
      dialogueText: safeLine,
    });
    expect(fixture.line.usagePaid).toBe(false);
    expect(fixture.line.providerContacted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('uses the same durable ledger for approved samples and episode lines', async () => {
    const shared = resetDurableVoiceLedgerForTests();
    const calls: Array<{ url: string; body: string }> = [];
    const samples = createCandidateVoiceService(openEnv, mockTransport(calls));
    await samples.generate({
      characterId: PIP_CHARACTER_ID,
      text: FIXED_APPROVED_LINES[PIP_CHARACTER_ID],
      requestId: 'req_sample_ledger',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect((await shared.read()).paidRequests).toBe(1);
    const episode = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    expect(episode.snapshot().durableLedger.title).toBe(DURABLE_LEDGER_COPY.title);
  });

  it('keeps Voice IDs, secrets, and Generate all out of client files and documents the reconcile procedure', () => {
    const ui = readRepo('apps/web/src/components/preview/ConfirmedScriptToVoice.tsx');
    const episodeUi = readRepo('apps/web/src/components/preview/EpisodeVoiceLines.tsx');
    const studio = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const barrel = readRepo('apps/web/src/lib/voice-production/index.ts');
    const publicLedger = readRepo('apps/web/src/lib/voice-production/durable-voice-ledger-public.ts');
    expect(ui).toContain('DURABLE_LEDGER_COPY.title');
    expect(episodeUi).toContain('DURABLE_LEDGER_COPY.title');
    expect(studio).toContain('DURABLE_LEDGER_COPY.title');
    expect(studio).toContain('Paid voice generation: Disabled');
    expect(barrel).toContain('./durable-voice-ledger-public');
    expect(barrel).not.toContain('./durable-voice-ledger-postgres');
    expect(barrel).not.toContain('./durable-voice-ledger\'');
    expect(publicLedger).toContain(DURABLE_LEDGER_COPY.unavailable);
    expect(publicLedger).toContain(DURABLE_LEDGER_COPY.reconcile);
    expect(publicLedger).toContain(DURABLE_LEDGER_COPY.protected);
    expect(DURABLE_LEDGER_RECONCILE_PROCEDURE).toContain('TIVVLEJOY_VOICE_LEDGER_DATABASE_URL');
    expect(DURABLE_LEDGER_RECONCILE_PROCEDURE).toContain('Do not set zeros');
    for (const blob of [ui, episodeUi, studio, barrel, publicLedger]) {
      expect(blob).not.toContain('93w5H37WdqeS6HoyL5cV');
      expect(blob).not.toContain('SbxjwBKw2PefbSupcoXV');
      expect(blob).not.toContain('ELEVENLABS_API_KEY');
      expect(blob).not.toContain('preview-token');
      expect(blob).not.toContain('Generate all');
    }
    expect(readRepo('apps/web/src/lib/durable-voice-ledger.test.ts')).toContain('function mockTransport');
  });
});

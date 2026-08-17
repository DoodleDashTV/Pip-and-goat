import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { containsProhibitedLegacyBrand } from './brand-canon';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  publicVoiceIdentitySnapshot,
} from './voice-production/approved-voice-settings';
import { ELEVENLABS_TTS_ENDPOINT } from './voice-production/candidate-provider';
import { GOAT_VOICE_GUIDE, PIP_VOICE_GUIDE } from './voice-production/guides';
import {
  getPreviewPaidLedger,
  publicPreviewVoiceAllowance,
  publicSafeAttempts,
  recordSuccessfulPaidUsage,
} from './voice-production/preview-paid-ledger';
import { isPaidVoiceGenerationAuthorized, isPaidVoiceGenerationEnabled } from './voice-production/safety';
import {
  SCRIPT_TO_VOICE_COPY,
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
  isSingleDialogueLine,
} from './voice-production/script-line';
import {
  createScriptToVoiceService,
  publicScriptToVoiceSnapshot,
  resetScriptToVoiceState,
  validateConfirmedScriptLine,
} from './voice-production/script-to-voice';
import { createVoiceProductionService } from './voice-production/service';
import { createMemoryVoiceStore } from './voice-production/store';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './voice-production/types';
import { lockedVoiceIdsAreDistinct } from './voice-production/voice-identity';

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

describe('preview-only confirmed script-to-voice', () => {
  beforeEach(() => {
    resetScriptToVoiceState();
  });

  it('does not generate on snapshot, validation, or unconfirmed review', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const snapshot = service.snapshot();
    expect(snapshot.providerContacted).toBe(false);
    expect(snapshot.productionEnabled).toBe(false);
    expect(snapshot.voiceIdentity.checkpoint).toBe('TIVVLEJOY_VOICE_IDENTITY_LOCK_V1');
    const preview = service.validate({ characterId: PIP_CHARACTER_ID, text: safeLine });
    expect(preview.providerContacted).toBe(false);
    expect(preview.characterCount).toBe(Array.from(safeLine).length);
    await expect(
      service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_unconfirmed_line',
        testToken: 'preview-token',
        confirmed: false,
      }),
    ).rejects.toThrow(/confirmation/i);
    expect(calls).toHaveLength(0);
    expect(getPreviewPaidLedger().paidRequests).toBe(0);
  });

  it('refuses generation without Preview gates or the private test token', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const closed = createScriptToVoiceService({}, mockTransport(calls));
    await expect(
      closed.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_closed_gate',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/locked|disabled|not enabled/i);

    const open = createScriptToVoiceService(openEnv, mockTransport(calls));
    await expect(
      open.generate({
        characterId: GOAT_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_bad_token',
        testToken: 'wrong-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/token/i);
    expect(calls).toHaveLength(0);
    expect(isPaidVoiceGenerationEnabled({})).toBe(false);
  });

  it('always refuses Production and does not authorize the older draft-audio path', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const production = createScriptToVoiceService({ ...openEnv, VERCEL_ENV: 'production' }, mockTransport(calls));
    expect(publicScriptToVoiceSnapshot({ ...openEnv, VERCEL_ENV: 'production' }).locked).toBe(true);
    expect(publicScriptToVoiceSnapshot({ ...openEnv, VERCEL_ENV: 'production' }).productionEnabled).toBe(false);
    await expect(
      production.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_production_refused',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/Production/);

    expect(isPaidVoiceGenerationAuthorized({ ALLOW_PAID_VOICE_GENERATION: 'true' })).toBe(false);
    expect(
      isPaidVoiceGenerationAuthorized({
        ALLOW_PAID_VOICE_GENERATION: 'true',
        TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
      }),
    ).toBe(false);
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

  it('rejects browser Voice IDs and keeps Pip and Goat distinct', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    expect(lockedVoiceIdsAreDistinct()).toBe(true);
    expect(() =>
      validateConfirmedScriptLine({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        voiceId: '93w5H37WdqeS6HoyL5cV',
      }),
    ).toThrowError(/rejected/i);
    await expect(
      service.generate({
        characterId: GOAT_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_client_voice',
        testToken: 'preview-token',
        confirmed: true,
        providerVoiceId: 'SbxjwBKw2PefbSupcoXV',
      }),
    ).rejects.toThrow(/rejected/i);
    expect(calls).toHaveLength(0);
  });

  it('uses the locked model and settings for one confirmed line', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const receipt = await service.generate({
      characterId: PIP_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_locked_settings',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect(receipt.model).toBe(APPROVED_ELEVENLABS_MODEL);
    expect(receipt.outputFormat).toBe(APPROVED_OUTPUT_FORMAT);
    expect(receipt.settings).toEqual({
      stability: 0.5,
      similarity: 0.75,
      style: 0,
      speed: 1,
      speakerBoost: true,
    });
    expect(receipt.checkpoint).toBe('TIVVLEJOY_VOICE_IDENTITY_LOCK_V1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith(`${ELEVENLABS_TTS_ENDPOINT}/93w5H37WdqeS6HoyL5cV`)).toBe(true);
    expect(calls[0].url).toContain('output_format=mp3_44100_128');
    const body = JSON.parse(calls[0].body) as {
      model_id: string;
      voice_settings: Record<string, unknown>;
      text: string;
    };
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.voice_settings).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      use_speaker_boost: true,
    });
    expect(body.text).toBe(safeLine);
    expect(JSON.stringify(receipt)).not.toContain('93w5H37WdqeS6HoyL5cV');
  });

  it('rejects forbidden and disguised legacy-brand wording without contacting the provider', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const banned = [
      'Let’s Doodle-Dash!',
      'Welcome to Doodle Dash.',
      'DoodleDash begins.',
      'Doodle Dash TV is starting.',
      'This is DDP.',
      'd00dle dash time',
      'doo-dle dash',
      'Doodle_Dash',
    ];
    for (const text of banned) {
      expect(containsProhibitedLegacyBrand(text)).toBe(true);
      expect(() => validateConfirmedScriptLine({ characterId: PIP_CHARACTER_ID, text })).toThrowError(
        /TivvleJoy-compatible language/,
      );
      await expect(
        service.generate({
          characterId: PIP_CHARACTER_ID,
          text,
          requestId: `req_brand_${Array.from(text).length}`,
          testToken: 'preview-token',
          confirmed: true,
        }),
      ).rejects.toThrow(/TivvleJoy-compatible language/);
    }
    expect(calls).toHaveLength(0);
  });

  it('accepts only one line and refuses whole scripts', async () => {
    expect(isSingleDialogueLine(safeLine)).toBe(true);
    expect(isSingleDialogueLine('Pip: hello\nGoat: hi')).toBe(false);
    expect(isSingleDialogueLine('Pip: hello Goat: map check')).toBe(false);
    expect(() =>
      validateConfirmedScriptLine({
        characterId: PIP_CHARACTER_ID,
        text: 'First line.\nSecond line.',
      }),
    ).toThrowError(/one confirmed dialogue line/i);
    expect(() =>
      validateConfirmedScriptLine({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        lines: [safeLine, safeLine],
      }),
    ).toThrowError(/one confirmed dialogue line/i);
    expect(SCRIPT_TO_VOICE_MAX_CHARS).toBe(250);
    expect(SCRIPT_TO_VOICE_MAX_PAID_REQUESTS).toBe(3);
    expect(SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS).toBe(750);
    expect(() =>
      validateConfirmedScriptLine({
        characterId: PIP_CHARACTER_ID,
        text: 'A'.repeat(251),
      }),
    ).toThrowError(/250/);
  });

  it('rejects model, settings, and output-format overrides without contacting the provider', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const overrides: Array<Record<string, unknown>> = [
      { model: 'eleven_flash_v2_5' },
      { model_id: 'eleven_turbo_v2_5' },
      { outputFormat: 'pcm_44100' },
      { output_format: 'mp3_22050_32' },
      { voice_settings: { stability: 1 } },
      { stability: 1 },
      { similarity: 1 },
      { similarity_boost: 1 },
      { style: 1 },
      { speed: 1.2 },
      { speakerBoost: false },
      { use_speaker_boost: false },
    ];
    for (const extra of overrides) {
      expect(() =>
        validateConfirmedScriptLine({
          characterId: PIP_CHARACTER_ID,
          text: safeLine,
          ...extra,
        }),
      ).toThrowError(/cannot be overridden/i);
      await expect(
        service.generate({
          characterId: PIP_CHARACTER_ID,
          text: safeLine,
          requestId: `req_override_${Object.keys(extra)[0]}`,
          testToken: 'preview-token',
          confirmed: true,
          ...extra,
        }),
      ).rejects.toThrow(/cannot be overridden/i);
    }
    expect(calls).toHaveLength(0);
    expect(getPreviewPaidLedger().paidRequests).toBe(0);
  });

  it('refuses generation after three successful paid requests or 750 paid characters', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    for (let index = 0; index < 3; index += 1) {
      await service.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: `req_limit_${index}`,
        testToken: 'preview-token',
        confirmed: true,
      });
    }
    expect(getPreviewPaidLedger().paidRequests).toBe(3);
    await expect(
      service.generate({
        characterId: GOAT_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_limit_fourth',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/3 successful paid requests/i);
    expect(calls).toHaveLength(3);

    resetScriptToVoiceState();
    recordSuccessfulPaidUsage({
      requestId: 'seed_char_limit',
      characterId: PIP_CHARACTER_ID,
      characterCount: 740,
    });
    const afterSeed = createScriptToVoiceService(openEnv, mockTransport(calls));
    await expect(
      afterSeed.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_char_limit',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/750 paid characters/i);
    expect(calls).toHaveLength(3);
    expect(getPreviewPaidLedger().paidRequests).toBe(1);
  });

  it('allows only one active generation and records failed provider attempts without billing them', async () => {
    const slowCalls: Array<{ url: string; body: string }> = [];
    let release = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = createScriptToVoiceService(openEnv, async (url, init) => {
      slowCalls.push({ url, body: init.body });
      await hold;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
    });
    const first = slow.generate({
      characterId: PIP_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_in_flight',
      testToken: 'preview-token',
      confirmed: true,
    });
    for (let attempt = 0; attempt < 50 && slowCalls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(slowCalls).toHaveLength(1);
    await expect(
      slow.generate({
        characterId: GOAT_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_second_active',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/one Preview voice generation/i);
    release();
    const receipt = await first;
    expect(receipt.paidCharactersCharged).toBe(Array.from(safeLine).length);
    expect(slowCalls).toHaveLength(1);

    const failingCalls: Array<{ url: string; body: string }> = [];
    const failing = createScriptToVoiceService(openEnv, mockTransport(failingCalls, { ok: false, status: 500 }));
    await expect(
      failing.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_failed_attempt',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(getPreviewPaidLedger().paidRequests).toBe(1);
    const attempts = publicSafeAttempts();
    expect(attempts.some((item) => item.outcome === 'failed' && item.code === 'PROVIDER_UNSUPPORTED')).toBe(true);
    expect(JSON.stringify(attempts)).not.toContain(safeLine);
    expect(JSON.stringify(attempts)).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(JSON.stringify(attempts)).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(JSON.stringify(attempts)).not.toContain('test-key-not-real');
  });

  it('counts successful usage once and does not bill failed or duplicate confirmations', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createScriptToVoiceService(openEnv, mockTransport(calls));
    const first = await service.generate({
      characterId: GOAT_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_success_once',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect(first.usagePaid).toBe(true);
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.paidCharactersCharged).toBe(Array.from(safeLine).length);
    expect(first.ledger.paidRequests).toBe(1);
    expect(first.ledger.paidCharactersUsed).toBe(Array.from(safeLine).length);
    expect(first.ledger.monthlyCharLimit).toBe(SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS);
    expect(first.ledger.remainingRequests).toBe(2);
    expect(first.ledger.remainingCharacters).toBe(
      SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - Array.from(safeLine).length,
    );

    const duplicate = await service.generate({
      characterId: GOAT_CHARACTER_ID,
      text: safeLine,
      requestId: 'req_success_once',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect(duplicate.requestId).toBe(first.requestId);
    expect(calls).toHaveLength(1);
    expect(getPreviewPaidLedger().paidRequests).toBe(1);

    const failingCalls: Array<{ url: string; body: string }> = [];
    const failing = createScriptToVoiceService(openEnv, mockTransport(failingCalls, { ok: false, status: 500 }));
    await expect(
      failing.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_provider_fail',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(getPreviewPaidLedger().paidRequests).toBe(1);
    await expect(
      failing.generate({
        characterId: PIP_CHARACTER_ID,
        text: safeLine,
        requestId: 'req_provider_fail',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/already submitted|not retried/i);
    expect(failingCalls).toHaveLength(1);
    expect(getPreviewPaidLedger().paidCharactersUsed).toBe(Array.from(safeLine).length);
  });

  it('keeps secrets and Voice IDs out of client output and approved personality copy', () => {
    const snapshot = publicScriptToVoiceSnapshot(openEnv);
    const identity = publicVoiceIdentitySnapshot();
    const ui = readRepo('apps/web/src/components/preview/ConfirmedScriptToVoice.tsx');
    const route = readRepo('apps/web/src/app/api/voice-production/script-to-voice/route.ts');
    const barrel = readRepo('apps/web/src/lib/voice-production/index.ts');
    expect(snapshot.characters[0]?.personality).toEqual(PIP_VOICE_GUIDE.personality);
    expect(snapshot.characters[1]?.personality).toEqual(GOAT_VOICE_GUIDE.personality);
    expect(SCRIPT_TO_VOICE_COPY.pageTitle).toBe('Preview voice generation');
    expect(SCRIPT_TO_VOICE_COPY.voicesTitle).toBe('Final approved Pip and Goat voices');
    expect(SCRIPT_TO_VOICE_COPY.cadence).toBe('One confirmed line at a time');
    expect(SCRIPT_TO_VOICE_COPY.paidWarning).toBe('Paid ElevenLabs generation — confirmation required');
    expect(identity.checkpoint).toBe('TIVVLEJOY_VOICE_IDENTITY_LOCK_V1');
    expect(publicPreviewVoiceAllowance()).toEqual({
      paidCharactersUsed: 0,
      paidRequests: 0,
      failedAttempts: 0,
      remainingRequests: 3,
      remainingCharacters: 750,
      maxRequests: 3,
      maxCharacters: 750,
      maxCharsPerLine: 250,
    });
    expect(ui).toContain(SCRIPT_TO_VOICE_COPY.pageTitle);
    expect(ui).not.toContain("from '@/lib/voice-production/voice-identity'");
    expect(ui).not.toContain("from '@/lib/voice-production/script-to-voice'");
    expect(barrel).not.toContain('./script-to-voice');
    expect(barrel).not.toContain('./voice-identity');
    for (const blob of [JSON.stringify(snapshot), JSON.stringify(identity), ui, route]) {
      expect(blob).not.toContain('93w5H37WdqeS6HoyL5cV');
      expect(blob).not.toContain('SbxjwBKw2PefbSupcoXV');
      expect(blob).not.toContain('ELEVENLABS_API_KEY');
      expect(blob).not.toContain('preview-token');
    }
    expect(ui).toContain("action: 'validate-line'");
    expect(ui).toContain("action: 'generate-confirmed-line'");
    expect(ui).toContain("void fetch('/api/voice-production/script-to-voice')");
    expect(ui).toMatch(/onChange=\{\(event\) => \{\s+setText\(event\.target\.value\);/);
    expect(ui).not.toMatch(/onChange=\{\(event\) => \{\s+void fetch/);
    expect(readRepo('apps/web/src/lib/script-to-voice.test.ts')).not.toContain('defaultCandidateTransport');
  });
});

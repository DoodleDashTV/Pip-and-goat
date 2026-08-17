import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { containsProhibitedLegacyBrand } from './brand-canon';
import { APPROVED_ELEVENLABS_MODEL, APPROVED_OUTPUT_FORMAT } from './voice-production/approved-voice-settings';
import { ELEVENLABS_TTS_ENDPOINT } from './voice-production/candidate-provider';
import { PIP_VOICE_GUIDE, GOAT_VOICE_GUIDE } from './voice-production/guides';
import {
  applyEpisodeLineEdit,
  confirmationKey,
  EPISODE_LINE_BRAND_MESSAGE,
  EPISODE_VOICE_COPY,
  parseEpisodeScript,
  publicEpisodeCharacters,
} from './voice-production/episode-voice-lines';
import { createEpisodeLineVoiceService } from './voice-production/episode-line-voice';
import { getPreviewPaidLedger } from './voice-production/preview-paid-ledger';
import { isPaidVoiceGenerationAuthorized } from './voice-production/safety';
import { SAMPLE_GOAT_DIALOGUE, SAMPLE_PIP_DIALOGUE } from './voice-production/sample-episode';
import { resetScriptToVoiceState } from './voice-production/script-to-voice';
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

const sampleScript = `Pip: ${SAMPLE_PIP_DIALOGUE}\nGoat: ${SAMPLE_GOAT_DIALOGUE}`;

function mockTransport(calls: Array<{ url: string; body: string }>, result?: { ok: boolean; status: number }) {
  return async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    if (result && !result.ok) {
      return { ok: false, status: result.status, contentType: 'application/json', body: 'no' };
    }
    return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
  };
}

function lineInput(overrides: Record<string, unknown> = {}) {
  const parsed = parseEpisodeScript(sampleScript)[0];
  return {
    episodeId: parsed.episodeId,
    sceneId: parsed.sceneId,
    lineId: parsed.lineId,
    lineNumber: parsed.lineNumber,
    character: parsed.character,
    dialogue: parsed.dialogue,
    confirmationKey: confirmationKey(parsed),
    requestId: 'req_episode_line_1',
    testToken: 'preview-token',
    confirmed: true,
    ...overrides,
  };
}

describe('preview episode line voice workflow', () => {
  beforeEach(() => {
    resetScriptToVoiceState();
  });

  it('splits an episode script into individual Pip and Goat lines without contacting the provider', () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    const parsed = service.parse(sampleScript);
    expect(parsed.providerContacted).toBe(false);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]?.character).toBe('pip');
    expect(parsed.lines[0]?.dialogue).toBe(SAMPLE_PIP_DIALOGUE);
    expect(parsed.lines[0]?.lineNumber).toBe(1);
    expect(parsed.lines[1]?.character).toBe('goat');
    expect(parsed.lines[1]?.visibleStatus).toBe('Ready for review');
    expect(() => parseEpisodeScript('Narrator: hello')).toThrowError(/Pip: or Goat/);
    expect(calls).toHaveLength(0);
  });

  it('does not generate on snapshot, parse, review, or unconfirmed generate', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    expect(service.snapshot().providerContacted).toBe(false);
    expect(service.snapshot().productionEnabled).toBe(false);
    expect(service.parse(sampleScript).providerContacted).toBe(false);
    const reviewed = service.validate(lineInput({ confirmed: false, requestId: undefined, testToken: undefined }));
    expect(reviewed.providerContacted).toBe(false);
    expect(reviewed.model).toBe(APPROVED_ELEVENLABS_MODEL);
    expect(reviewed.outputFormat).toBe(APPROVED_OUTPUT_FORMAT);
    await expect(service.generate(lineInput({ confirmed: false }))).rejects.toThrow(/confirmation/i);
    expect(calls).toHaveLength(0);
    expect(getPreviewPaidLedger().paidRequests).toBe(0);
  });

  it('refuses generation without Preview gates, token, or Production runtime', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const closed = createEpisodeLineVoiceService({}, mockTransport(calls));
    await expect(closed.generate(lineInput())).rejects.toThrow(/locked|disabled|not enabled/i);
    const open = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    await expect(open.generate(lineInput({ testToken: 'wrong-token' }))).rejects.toThrow(/token/i);
    const production = createEpisodeLineVoiceService({ ...openEnv, VERCEL_ENV: 'production' }, mockTransport(calls));
    await expect(production.generate(lineInput({ requestId: 'req_prod' }))).rejects.toThrow(/Production/);
    expect(production.snapshot().locked).toBe(true);
    expect(production.snapshot().productionEnabled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('generates only one confirmed line with locked settings and no Voice IDs in the receipt', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    const receipt = await service.generate(lineInput());
    expect(receipt.dialogue).toBe(SAMPLE_PIP_DIALOGUE);
    expect(receipt.character).toBe('pip');
    expect(receipt.lineNumber).toBe(1);
    expect(receipt.model).toBe('eleven_multilingual_v2');
    expect(receipt.outputFormat).toBe('mp3_44100_128');
    expect(receipt.settings).toEqual({
      stability: 0.5,
      similarity: 0.75,
      style: 0,
      speed: 1,
      speakerBoost: true,
    });
    expect(receipt.checkpoint).toBe('TIVVLEJOY_VOICE_IDENTITY_LOCK_V1');
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body) as { text: string; model_id: string };
    expect(body.text).toBe(SAMPLE_PIP_DIALOGUE);
    expect(body.model_id).toBe(APPROVED_ELEVENLABS_MODEL);
    expect(JSON.stringify(receipt)).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(JSON.stringify(receipt)).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(JSON.stringify(receipt)).not.toContain('test-key-not-real');
  });

  it('rejects batch, generate-all, browser Voice IDs, and setting overrides', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    await expect(service.generate(lineInput({ generateAll: true }))).rejects.toThrow(/one confirmed dialogue line/i);
    await expect(service.generate(lineInput({ action: 'generate-all' }))).rejects.toThrow(/one confirmed dialogue line/i);
    await expect(service.generate(lineInput({ lines: [SAMPLE_PIP_DIALOGUE, SAMPLE_GOAT_DIALOGUE] }))).rejects.toThrow(
      /one confirmed dialogue line/i,
    );
    await expect(service.generate(lineInput({ voiceId: '93w5H37WdqeS6HoyL5cV' }))).rejects.toThrow(/rejected/i);
    await expect(service.generate(lineInput({ model: 'eleven_flash_v2_5' }))).rejects.toThrow(/cannot be overridden/i);
    expect(lockedVoiceIdsAreDistinct()).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('invalidates confirmation when episode line data changes', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    const original = parseEpisodeScript(sampleScript)[0];
    const edited = applyEpisodeLineEdit(original, { dialogue: 'The meadow still looks bright from here.' });
    expect(edited.confirmationStatus).toBe('invalidated');
    expect(confirmationKey(edited)).not.toBe(confirmationKey(original));
    await expect(
      service.generate(
        lineInput({
          dialogue: edited.dialogue,
          confirmationKey: confirmationKey(original),
          requestId: 'req_stale_confirm',
        }),
      ),
    ).rejects.toThrow(/changed after confirmation/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects forbidden and disguised legacy-brand wording with the episode rewrite message', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    const banned = ['Let’s Doodle-Dash!', 'Welcome to Doodle Dash.', 'This is DDP.', 'd00dle dash time'];
    for (const dialogue of banned) {
      expect(containsProhibitedLegacyBrand(dialogue)).toBe(true);
      expect(() => service.validate(lineInput({ dialogue, confirmationKey: 'x' }))).toThrowError(EPISODE_LINE_BRAND_MESSAGE);
      await expect(
        service.generate(lineInput({ dialogue, requestId: `req_brand_${dialogue.length}` })),
      ).rejects.toThrow(EPISODE_LINE_BRAND_MESSAGE);
    }
    expect(calls).toHaveLength(0);
  });

  it('counts a successful provider response once and does not bill failures or duplicates', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const service = createEpisodeLineVoiceService(openEnv, mockTransport(calls));
    const first = await service.generate(lineInput());
    expect(first.usagePaid).toBe(true);
    expect(first.ledger.paidRequests).toBe(1);
    const duplicate = await service.generate(lineInput());
    expect(duplicate.requestId).toBe(first.requestId);
    expect(calls).toHaveLength(1);
    expect(getPreviewPaidLedger().paidRequests).toBe(1);

    const failingCalls: Array<{ url: string; body: string }> = [];
    const failing = createEpisodeLineVoiceService(openEnv, mockTransport(failingCalls, { ok: false, status: 500 }));
    await expect(failing.generate(lineInput({ requestId: 'req_fail_line' }))).rejects.toThrow();
    expect(getPreviewPaidLedger().paidRequests).toBe(1);
    await expect(failing.generate(lineInput({ requestId: 'req_fail_line' }))).rejects.toThrow(/already submitted|not retried/i);
    expect(failingCalls).toHaveLength(1);
  });

  it('does not authorize the older draft-audio path and keeps secrets out of client files', () => {
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
      dialogueText: SAMPLE_PIP_DIALOGUE,
    });
    expect(fixture.line.usagePaid).toBe(false);
    expect(fixture.line.providerContacted).toBe(false);

    const ui = readRepo('apps/web/src/components/preview/EpisodeVoiceLines.tsx');
    const studio = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const route = readRepo('apps/web/src/app/api/voice-production/episode-lines/route.ts');
    const barrel = readRepo('apps/web/src/lib/voice-production/index.ts');
    expect(EPISODE_VOICE_COPY.sectionTitle).toBe('Episode voice lines');
    expect(EPISODE_VOICE_COPY.voicesTitle).toBe('Final approved Pip and Goat voices');
    expect(EPISODE_VOICE_COPY.cadence).toBe('Review and confirm one line at a time');
    expect(EPISODE_VOICE_COPY.paidWarning).toBe('Paid ElevenLabs generation — individual confirmation required');
    expect(EPISODE_VOICE_COPY.generateOnce).toBe('Generate this line once');
    expect(ui).toContain('EPISODE_VOICE_COPY.sectionTitle');
    expect(ui).toContain('EPISODE_VOICE_COPY.generateOnce');
    expect(ui).toContain('publicEpisodeCharacters');
    expect(publicEpisodeCharacters()[0]?.personality).toEqual(PIP_VOICE_GUIDE.personality);
    expect(readRepo('apps/web/src/lib/voice-production/episode-voice-lines.ts')).toContain(EPISODE_VOICE_COPY.sectionTitle);
    expect(readRepo('apps/web/src/lib/voice-production/episode-voice-lines.ts')).toContain(EPISODE_VOICE_COPY.generateOnce);
    expect(ui).toContain('EPISODE_VOICE_COPY.nextLine');
    expect(ui).not.toContain('Generate all');
    expect(studio).not.toContain('Generate all');
    expect(route).not.toContain('generate-all');
    expect(route).toContain("action: z.literal('validate-episode-line')");
    expect(route).toContain("action: z.literal('generate-confirmed-episode-line')");
    expect(ui).not.toContain("from '@/lib/voice-production/voice-identity'");
    expect(ui).not.toContain("from '@/lib/voice-production/script-to-voice'");
    expect(ui).not.toContain("from '@/lib/voice-production/episode-line-voice'");
    expect(barrel).not.toContain('./episode-line-voice');
    expect(ui).toMatch(/onChange=\{\(event\) => \{\s+setScript\(event\.target\.value\);/);
    expect(ui).not.toMatch(/onChange=\{\(event\) => \{\s+void fetch/);
    for (const blob of [ui, studio, route, barrel]) {
      expect(blob).not.toContain('93w5H37WdqeS6HoyL5cV');
      expect(blob).not.toContain('SbxjwBKw2PefbSupcoXV');
      expect(blob).not.toContain('ELEVENLABS_API_KEY');
      expect(blob).not.toContain('preview-token');
    }
    expect(readRepo('apps/web/src/lib/episode-line-voice.test.ts')).toContain('function mockTransport');
    expect(GOAT_CHARACTER_ID).toBe('CHAR_GOAT_001');
    expect(GOAT_VOICE_GUIDE.personality).toContain('loyal');
  });
});

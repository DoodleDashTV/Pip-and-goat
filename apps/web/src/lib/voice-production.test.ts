import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentStage, evaluateTheatricalGate } from '@doodle-dash/direction';
import { evaluatePaidResourcePolicy } from '@doodle-dash/preproduction';
import { generateOriginalDialogue } from './voice-production/dialogue';
import { PIP_VOICE_GUIDE, GOAT_VOICE_GUIDE } from './voice-production/guides';
import { resolveElevenLabsModel } from './voice-production/models';
import { generateElevenLabsAudio } from './voice-production/provider';
import {
  assertNoClientVoiceId,
  foundingCodesMatchRegistry,
  resolveVoiceAssignment,
} from './voice-production/registry';
import {
  assertWithinLimits,
  emptyLedger,
  hasElevenLabsApiKey,
  isPaidVoiceGenerationAuthorized,
  isPaidVoiceGenerationEnabled,
  readVoiceSafetySnapshot,
} from './voice-production/safety';
import { canEnterFinalRendering, canPrepareForLipSync, createVoiceProductionService } from './voice-production/service';
import { createMemoryVoiceStore } from './voice-production/store';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './voice-production/types';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('Pip and Goat voice registry', () => {
  it('maps Pip and Goat only to their locked Voice IDs', () => {
    expect(foundingCodesMatchRegistry()).toBe(true);
    expect(resolveVoiceAssignment(PIP_CHARACTER_ID)).toMatchObject({
      characterId: PIP_CHARACTER_ID,
      profile: 'pip_default_v1',
      providerVoiceId: '93w5H37WdqeS6HoyL5cV',
    });
    expect(resolveVoiceAssignment(GOAT_CHARACTER_ID)).toMatchObject({
      characterId: GOAT_CHARACTER_ID,
      profile: 'goat_default_v1',
      providerVoiceId: 'SbxjwBKw2PefbSupcoXV',
    });
    expect(resolveVoiceAssignment(PIP_CHARACTER_ID).providerVoiceId).not.toBe(
      resolveVoiceAssignment(GOAT_CHARACTER_ID).providerVoiceId,
    );
  });

  it('fails closed for unknown characters and browser-supplied Voice IDs', () => {
    expect(() => resolveVoiceAssignment('CHAR_UNKNOWN_001')).toThrowError(/Unknown character/);
    expect(() => assertNoClientVoiceId({ voiceId: '93w5H37WdqeS6HoyL5cV' })).toThrowError(/rejected/i);
    expect(() => assertNoClientVoiceId({ providerVoiceId: 'SbxjwBKw2PefbSupcoXV' })).toThrowError(/rejected/i);
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    expect(() =>
      service.generateDraftAudio({
        episodeId: 'ep-1',
        sceneId: 'scene-1',
        characterId: PIP_CHARACTER_ID,
        dialogueText: 'Hello meadow.',
        voiceId: '93w5H37WdqeS6HoyL5cV',
      }),
    ).toThrowError(/rejected/i);
  });
});

describe('voice-guide dialogue', () => {
  it('writes original Pip and Goat lines instead of repeating guide catchphrases alone', () => {
    const pip = generateOriginalDialogue({
      characterId: PIP_CHARACTER_ID,
      episodeId: 'ep-map-1',
      sceneId: 'scene-1',
      premise: 'Find the meadow map crumb.',
    });
    const goat = generateOriginalDialogue({
      characterId: GOAT_CHARACTER_ID,
      episodeId: 'ep-map-1',
      sceneId: 'scene-2',
      premise: 'Find the meadow map crumb.',
    });
    expect(pip.text.length).toBeGreaterThan(20);
    expect(goat.text.length).toBeGreaterThan(20);
    expect(PIP_VOICE_GUIDE.catchphrases.includes(pip.text)).toBe(false);
    expect(GOAT_VOICE_GUIDE.catchphrases.includes(goat.text)).toBe(false);
    expect(pip.characterId).toBe(PIP_CHARACTER_ID);
    expect(goat.characterId).toBe(GOAT_CHARACTER_ID);
  });
});

describe('paid generation fail-closed', () => {
  it('defaults paid generation off and does not contact a provider', () => {
    expect(isPaidVoiceGenerationEnabled({})).toBe(false);
    expect(isPaidVoiceGenerationAuthorized({})).toBe(false);
    expect(hasElevenLabsApiKey({})).toBe(false);
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const result = service.generateDraftAudio({
      episodeId: 'ep-1',
      sceneId: 'scene-1',
      characterId: PIP_CHARACTER_ID,
      dialogueText: 'The sunny stones are hiding a tiny map crumb.',
    });
    expect(result.line.providerContacted).toBe(false);
    expect(result.line.usagePaid).toBe(false);
    expect(result.line.generationStatus).toBe('FIXTURE_GENERATED');
    expect(result.line.voiceProfileVersion).toBe('pip_default_v1');
    expect(JSON.stringify(result)).not.toContain('sk-');
    expect(JSON.stringify(result)).not.toContain('ELEVENLABS_API_KEY');
  });

  it('fails safely when the API key is missing and paid flags are set', async () => {
    await expect(
      generateElevenLabsAudio(
        { characterId: PIP_CHARACTER_ID, text: 'Hello' },
        { ALLOW_PAID_VOICE_GENERATION: 'true', TIVVLEJOY_VOICE_AUTHORIZE_PAID: '1' },
      ),
    ).rejects.toThrow(/ELEVENLABS_API_KEY is missing/);
  });

  it('does not increment paid usage or contact a provider on duplicate fixture requests', () => {
    const store = createMemoryVoiceStore();
    const service = createVoiceProductionService(store, {});
    const input = {
      episodeId: 'ep-1',
      sceneId: 'scene-1',
      characterId: GOAT_CHARACTER_ID,
      dialogueText: 'I will hold the map while you check the bright grass.',
    };
    const first = service.generateDraftAudio(input);
    const second = service.generateDraftAudio(input);
    expect(second.replayed).toBe(true);
    expect(second.line.id).toBe(first.line.id);
    expect(store.ledger.fixtureRequests).toBe(1);
    expect(store.ledger.paidRequests).toBe(0);
    expect(first.line.providerContacted).toBe(false);
  });

  it('blocks over-limit lines and keeps rejected lines out of final rendering', () => {
    const ledger = emptyLedger();
    expect(() =>
      assertWithinLimits({
        text: 'x'.repeat(400),
        episodeCharacterCount: 0,
        ledger,
        paid: false,
      }),
    ).toThrowError(/per-request limit/);
    expect(() =>
      assertWithinLimits({
        text: 'short line',
        episodeCharacterCount: 1995,
        ledger,
        paid: false,
      }),
    ).toThrowError(/per-episode limit/);
    expect(() =>
      assertWithinLimits({
        text: 'short line',
        episodeCharacterCount: 0,
        ledger: { ...ledger, paidCharactersUsed: 19_999 },
        paid: true,
      }),
    ).toThrowError(/Hard stop/);

    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const generated = service.generateDraftAudio({
      episodeId: 'ep-1',
      sceneId: 'scene-1',
      characterId: PIP_CHARACTER_ID,
      dialogueText: 'A tiny clue is sparkling beside the stones.',
    });
    service.decide(generated.line.id, 'REJECT');
    expect(
      canPrepareForLipSync({
        approvalStatus: 'REJECTED',
        generationStatus: 'REJECTED',
      } as never),
    ).toBe(false);
    expect(canEnterFinalRendering()).toBe(false);
    const pack = service.packageApproved('ep-1');
    expect(pack.readyForLipSync).toEqual([]);
    expect(pack.canEnterFinalRendering).toBe(false);
    expect(pack.rejectedExcluded).toContain(generated.line.id);
  });

  it('verifies the ElevenLabs model allowlist before use', () => {
    expect(resolveElevenLabsModel('eleven_multilingual_v2')).toBe('eleven_multilingual_v2');
    expect(() => resolveElevenLabsModel('not-a-real-model')).toThrowError(/supported allowlist/);
  });
});

describe('preview fixtures and production lock', () => {
  it('keeps production locked and paid GPU unauthorized', () => {
    expect(currentStage().id).toBe('DDP_STEPS_1_8');
    expect(evaluateTheatricalGate().allowed).toBe(false);
    expect(evaluatePaidResourcePolicy({ allowPaidGpu: true, estimateUsd: 1 }).allowed).toBe(false);
    expect(readVoiceSafetySnapshot({}).paidGenerationEnabled).toBe(false);
  });

  it('does not leak Voice IDs, API keys, or generated audio into the browser UI or env example', () => {
    const ui = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const envExample = readRepo('.env.example');
    const api = readRepo('apps/web/src/app/api/voice-production/route.ts');
    expect(ui).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(ui).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(ui).not.toContain('ELEVENLABS_API_KEY');
    expect(ui).toContain('Generate Draft Audio');
    expect(ui).toContain('Download approved episode audio package');
    expect(envExample).toContain('ALLOW_PAID_VOICE_GENERATION=false');
    expect(envExample).not.toMatch(/ELEVENLABS_API_KEY=\S+/);
    expect(api).not.toContain('NEXT_PUBLIC_ELEVENLABS');
    expect(readRepo('apps/web/src/lib/voice-production/index.ts')).not.toContain('93w5H37WdqeS6HoyL5cV');
  });
});

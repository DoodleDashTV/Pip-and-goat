import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
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
import {
  applyLocalDecision,
  applyLocalEdit,
  buildLocalPackage,
} from './voice-production/client-session';
import {
  FIXTURE_PLAYBACK_LABEL,
  PIP_CHIME_HZ,
  GOAT_CHIME_HZ,
  buildFixtureWavBase64,
  decodeWavPcm,
  fixtureIsAudible,
  fixtureIsHigherPitched,
  goertzelPower,
  maxAbsSample,
} from './voice-production/fixtures';
import {
  actionTarget,
  applyFormPatch,
  canApplyRemoteForm,
  createFormSnapshot,
  isCanonicalCardOrder,
  mergeRemoteLine,
  newestFormValue,
  replaceLineKeepingOrder,
  sortVoiceLines,
  visibleFieldsForAction,
} from './voice-production/form-state';
import { evaluateVoiceProgress, FINAL_RENDER_LOCKED_REASON } from './voice-production/progress';
import {
  SAMPLE_GOAT_DIALOGUE,
  SAMPLE_PIP_DIALOGUE,
  SAMPLE_VOICE_EPISODE_TITLE,
  SAMPLE_VOICE_HREF,
  SAMPLE_VOICE_SCENE_ID,
  createSampleVoiceEpisode,
  sampleDialogueIsOriginal,
  sampleSceneLines,
} from './voice-production/sample-episode';
import { APPROVED_SAMPLE_AUDIO_LABEL, FIXED_APPROVED_LINES } from './voice-production/candidates';
import { isProductionVoiceRuntime, publicLiveTestSnapshot, serverGatesOpen } from './voice-production/candidate-gates';
import { convertCandidateSpeech, ELEVENLABS_TTS_ENDPOINT } from './voice-production/candidate-provider';
import { createCandidateVoiceService, resetCandidateRequestState } from './voice-production/candidate-service';
import { canEnterFinalRendering, canPrepareForLipSync, createVoiceProductionService } from './voice-production/service';
import { createMemoryVoiceStore } from './voice-production/store';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './voice-production/types';
import {
  PIP_TEMPORARY_NEUTRAL_PHRASE,
  assertAudienceFacingContent,
  containsProhibitedLegacyBrand,
} from './brand-canon';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  publicVoiceIdentitySnapshot,
} from './voice-production/approved-voice-settings';
import { assertApprovedModel, assertExclusiveVoiceAssignment, lockedVoiceIdsAreDistinct } from './voice-production/voice-identity';
import {
  DEFAULT_MAX_CHARS_PER_EPISODE,
  DEFAULT_MAX_CHARS_PER_REQUEST,
  DEFAULT_MONTHLY_CHAR_LIMIT,
} from './voice-production/types';
import { memoryBackend } from './preview-workspace/store';

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
    expect(ui).toContain('Generate fixture draft');
    expect(ui).toContain('Create Sample Voice Episode');
    expect(ui).toContain('Playback test only — not Pip/Goat’s voice.');
    expect(ui).toContain('Download approved episode audio package');
    expect(envExample).toContain('ALLOW_PAID_VOICE_GENERATION=false');
    expect(envExample).not.toMatch(/ELEVENLABS_API_KEY=\S+/);
    expect(api).not.toContain('NEXT_PUBLIC_ELEVENLABS');
    expect(readRepo('apps/web/src/lib/voice-production/index.ts')).not.toContain('93w5H37WdqeS6HoyL5cV');
  });
});

describe('sample voice episode and preview workflow', () => {
  it('creates the sample episode once and keeps Pip/Goat assignments', () => {
    const backend = memoryBackend();
    const first = createSampleVoiceEpisode(backend);
    const second = createSampleVoiceEpisode(backend);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.episode.id).toBe(first.episode.id);
    expect(first.episode.title).toBe(SAMPLE_VOICE_EPISODE_TITLE);
    expect(first.episode.episodeNumber).toBe(1);
    expect(sampleDialogueIsOriginal()).toBe(true);
    const samples = sampleSceneLines();
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      characterId: PIP_CHARACTER_ID,
      voiceProfileVersion: 'pip_default_v1',
      sceneId: SAMPLE_VOICE_SCENE_ID,
      dialogueText: SAMPLE_PIP_DIALOGUE,
    });
    expect(samples[1]).toMatchObject({
      characterId: GOAT_CHARACTER_ID,
      voiceProfileVersion: 'goat_default_v1',
      sceneId: SAMPLE_VOICE_SCENE_ID,
      dialogueText: SAMPLE_GOAT_DIALOGUE,
    });
    expect(SAMPLE_PIP_DIALOGUE).not.toBe('Let’s Doodle-Dash!');
    expect(containsProhibitedLegacyBrand(SAMPLE_PIP_DIALOGUE)).toBe(false);
    expect(containsProhibitedLegacyBrand(SAMPLE_GOAT_DIALOGUE)).toBe(false);
    expect(SAMPLE_GOAT_DIALOGUE).not.toBe('Goat-tastic!');
  });

  it('creates the sample scene idempotently with fixture-only generation', () => {
    const store = createMemoryVoiceStore();
    const service = createVoiceProductionService(store, {});
    const first = service.createSampleScene('ep-sample');
    const second = service.createSampleScene('ep-sample');
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.lines.map((line) => line.id)).toEqual(first.lines.map((line) => line.id));
    expect(first.lines[0].characterId).toBe(PIP_CHARACTER_ID);
    expect(first.lines[0].voiceProfileVersion).toBe('pip_default_v1');
    expect(first.lines[1].characterId).toBe(GOAT_CHARACTER_ID);
    expect(first.lines[1].voiceProfileVersion).toBe('goat_default_v1');
    expect(first.providerContacted).toBe(false);
    expect(second.providerContacted).toBe(false);
    expect(first.lines.every((line) => line.providerContacted === false)).toBe(true);
    expect(first.lines.every((line) => line.generationStatus === 'FIXTURE_GENERATED')).toBe(true);
    expect(store.ledger.paidRequests).toBe(0);
    expect(store.ledger.paidCharactersUsed).toBe(0);
    expect(() => service.createSampleScene('ep-sample', { voiceId: '93w5H37WdqeS6HoyL5cV' })).toThrowError(
      /rejected/i,
    );
  });

  it('enforces edits, approve/reject/regenerate, and package download rules', () => {
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const scene = service.createSampleScene('ep-sample');
    const pip = scene.lines[0];
    const goat = scene.lines[1];

    expect(() => service.updateLine(pip.id, { dialogueText: 'x'.repeat(281) })).toThrowError(/per-request limit/);
    const edited = service.updateLine(pip.id, {
      dialogueText: 'The crumb still sparkles, so I will hop one step closer.',
      emotion: 'careful',
      pronunciationNotes: 'Pip: short i.',
    });
    expect(edited.approvalStatus).toBe('PENDING');
    expect(edited.generationStatus).toBe('DRAFT_TEXT');
    expect(edited.emotion).toBe('careful');

    const regenerated = service.generateDraftAudio({
      episodeId: edited.episodeId,
      sceneId: edited.sceneId,
      characterId: edited.characterId,
      dialogueText: edited.dialogueText,
      emotion: edited.emotion,
    });
    expect(regenerated.line.generationStatus).toBe('FIXTURE_GENERATED');
    expect(regenerated.line.providerContacted).toBe(false);

    const approved = service.decide(regenerated.line.id, 'APPROVE');
    const rejected = service.decide(goat.id, 'REJECT');
    expect(approved.approvalStatus).toBe('APPROVED');
    expect(rejected.approvalStatus).toBe('REJECTED');
    expect(canPrepareForLipSync(approved as never)).toBe(true);
    expect(canPrepareForLipSync(rejected as never)).toBe(false);
    expect(canEnterFinalRendering()).toBe(false);

    const pack = service.packageApproved('ep-sample');
    expect(pack.kind).toBe('TIVVLEJOY_VOICE_PACKAGE');
    expect(pack.readyForLipSync.map((line) => line.id)).toEqual([regenerated.line.id]);
    expect(pack.rejectedExcluded).toContain(goat.id);
    expect(pack.canEnterFinalRendering).toBe(false);
    expect(pack.providerContacted).toBe(false);
    expect(JSON.stringify(pack)).not.toContain('ELEVENLABS_API_KEY');

    const replay = service.regenerate(regenerated.line.id);
    expect(replay.line.providerContacted).toBe(false);
    expect(replay.line.generationStatus).toBe('FIXTURE_GENERATED');
    expect(replay.line.id).toBe(regenerated.line.id);
    expect(replay.line.fixtureRevision).not.toBe(regenerated.line.fixtureRevision);
  });

  it('keeps local approve/package usable when the serverless store is empty', () => {
    const pip = {
      id: 'line-pip',
      episodeId: 'ep-sample',
      sceneId: SAMPLE_VOICE_SCENE_ID,
      characterId: PIP_CHARACTER_ID,
      voiceProfileVersion: 'pip_default_v1',
      dialogueText: SAMPLE_PIP_DIALOGUE,
      performanceDirection: 'bright',
      pronunciationNotes: 'Pip: short i.',
      emotion: 'curious wonder',
      generationStatus: 'FIXTURE_GENERATED',
      approvalStatus: 'PENDING',
      audioObjectKey: 'fixture:voice/pip.wav',
      characterCount: SAMPLE_PIP_DIALOGUE.length,
      providerContacted: false,
    };
    const goat = {
      ...pip,
      id: 'line-goat',
      characterId: GOAT_CHARACTER_ID,
      voiceProfileVersion: 'goat_default_v1',
      dialogueText: SAMPLE_GOAT_DIALOGUE,
    };
    expect(() => applyLocalEdit(pip, { dialogueText: 'x'.repeat(281) }, 280)).toThrowError(/per-request limit/);
    const approved = applyLocalDecision(pip, 'APPROVE');
    const rejected = applyLocalDecision(goat, 'REJECT');
    const pack = buildLocalPackage('ep-sample', [approved, rejected]);
    expect(pack.readyForLipSync.map((line) => line.id)).toEqual(['line-pip']);
    expect(pack.rejectedExcluded).toEqual(['line-goat']);
    expect(pack.canEnterFinalRendering).toBe(false);
    expect(pack.providerContacted).toBe(false);
  });

  it('navigates Justin directly into Voice Production and keeps paid generation locked', () => {
    expect(SAMPLE_VOICE_HREF).toBe('/voice-production');
    const ui = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const voices = readRepo('apps/web/src/components/preview/PreviewVoices.tsx');
    const page = readRepo('apps/web/src/app/voice-production/page.tsx');
    expect(ui).toContain('Create Sample Voice Episode');
    expect(ui).toContain('SAMPLE_VOICE_HREF');
    expect(ui).toContain('Paid voice generation: Disabled');
    expect(ui).toContain('Draft → Review → Approved → Package Ready');
    expect(ui).toContain('FINAL_RENDER_LOCKED_REASON');
    expect(ui).not.toContain('ELEVENLABS_API_KEY');
    expect(voices).toContain('href="/voice-production"');
    expect(page).toContain('VoiceProductionStudio');
    expect(evaluateVoiceProgress([]).current).toBe('Draft');
    expect(
      evaluateVoiceProgress([{ generationStatus: 'FIXTURE_GENERATED', approvalStatus: 'PENDING' }]).current,
    ).toBe('Review');
    expect(
      evaluateVoiceProgress([
        { generationStatus: 'APPROVED_FOR_LIPSYNC', approvalStatus: 'APPROVED' },
        { generationStatus: 'FIXTURE_GENERATED', approvalStatus: 'PENDING' },
      ]).current,
    ).toBe('Approved');
    expect(
      evaluateVoiceProgress([{ generationStatus: 'APPROVED_FOR_LIPSYNC', approvalStatus: 'APPROVED' }]).current,
    ).toBe('Package Ready');
    expect(FINAL_RENDER_LOCKED_REASON).toMatch(/Final rendering stays locked/);
    expect(isPaidVoiceGenerationAuthorized({})).toBe(false);
    expect(canEnterFinalRendering()).toBe(false);
  });
});

describe('voice preview stabilization', () => {
  it('keeps the newest pronunciation note when regenerate runs immediately after an edit', () => {
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const scene = service.createSampleScene('ep-stable');
    const pip = scene.lines[0];
    let form = createFormSnapshot({
      lineId: pip.id,
      characterId: pip.characterId,
      dialogueText: pip.dialogueText,
      performanceDirection: pip.performanceDirection,
      pronunciationNotes: pip.pronunciationNotes,
      emotion: pip.emotion,
    });
    form = applyFormPatch(form, { pronunciationNotes: 'Pip: hop, short i, keep it bright.' });
    const payload = visibleFieldsForAction(form);
    const regenerated = service.regenerate(pip.id, payload);
    expect(regenerated.line.pronunciationNotes).toBe('Pip: hop, short i, keep it bright.');
    expect(regenerated.line.id).toBe(pip.id);
    expect(regenerated.line.characterId).toBe(PIP_CHARACTER_ID);
    expect(regenerated.line.fixtureRevision).not.toBe(pip.fixtureRevision);
    expect(regenerated.line.providerContacted).toBe(false);
  });

  it('resolves rapid consecutive edits to the newest state and ignores stale responses', () => {
    let form = createFormSnapshot({
      lineId: 'line-pip',
      characterId: PIP_CHARACTER_ID,
      dialogueText: SAMPLE_PIP_DIALOGUE,
      performanceDirection: 'bright',
      pronunciationNotes: 'old note',
      emotion: 'curious wonder',
    });
    form = applyFormPatch(form, { pronunciationNotes: 'first' });
    form = applyFormPatch(form, { pronunciationNotes: 'second' });
    form = applyFormPatch(form, { emotion: 'careful' });
    form = applyFormPatch(form, { emotion: 'cheerful' });
    expect(newestFormValue([
      { revision: 1, value: 'first' },
      { revision: 2, value: 'second' },
      { revision: 4, value: 'cheerful' },
    ])).toBe('cheerful');
    expect(form.pronunciationNotes).toBe('second');
    expect(form.emotion).toBe('cheerful');
    expect(canApplyRemoteForm(form.revision, form.revision - 1)).toBe(false);
    const stale = mergeRemoteLine(form, {
      dialogueText: SAMPLE_PIP_DIALOGUE,
      performanceDirection: 'bright',
      pronunciationNotes: 'old note',
      emotion: 'curious wonder',
      revision: 1,
    });
    expect(stale.pronunciationNotes).toBe('second');
    expect(stale.emotion).toBe('cheerful');
  });

  it('keeps Pip first and Goat second through approve, reject, and regenerate', () => {
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const scene = service.createSampleScene('ep-order');
    expect(scene.lines.map((line) => line.characterId)).toEqual([PIP_CHARACTER_ID, GOAT_CHARACTER_ID]);
    const approved = service.decide(scene.lines[0].id, 'APPROVE');
    const afterApprove = replaceLineKeepingOrder(scene.lines, actionTarget(scene.lines[0]), approved);
    expect(afterApprove.map((line) => line.characterId)).toEqual([PIP_CHARACTER_ID, GOAT_CHARACTER_ID]);
    expect(isCanonicalCardOrder(afterApprove)).toBe(true);
    const rejected = service.decide(scene.lines[1].id, 'REJECT');
    const afterReject = replaceLineKeepingOrder(afterApprove, actionTarget(scene.lines[1]), rejected);
    expect(afterReject.map((line) => line.characterId)).toEqual([PIP_CHARACTER_ID, GOAT_CHARACTER_ID]);
    expect(afterReject[0].id).toBe(scene.lines[0].id);
    expect(afterReject[1].id).toBe(scene.lines[1].id);
    const pack = service.packageApproved('ep-order');
    expect(pack.readyForLipSync.map((line) => line.characterId)).toEqual([PIP_CHARACTER_ID]);
    expect(pack.rejectedExcluded).toContain(scene.lines[1].id);
    expect(pack.providerContacted).toBe(false);
    const unchanged = service.updateLine(scene.lines[0].id, {
      dialogueText: scene.lines[0].dialogueText,
      pronunciationNotes: 'Pip: short i, still approved.',
    });
    expect(unchanged.approvalStatus).toBe('APPROVED');
    const stillPack = service.packageApproved('ep-order');
    expect(stillPack.readyForLipSync.map((line) => line.characterId)).toEqual([PIP_CHARACTER_ID]);
    expect(stillPack.rejectedExcluded).toContain(scene.lines[1].id);
    const replay = service.regenerate(scene.lines[0].id, { pronunciationNotes: 'Pip: short i.' });
    const afterRegen = replaceLineKeepingOrder(afterReject, { characterId: PIP_CHARACTER_ID }, replay.line);
    expect(sortVoiceLines(afterRegen).map((line) => line.characterId)).toEqual([
      PIP_CHARACTER_ID,
      GOAT_CHARACTER_ID,
    ]);
    expect(actionTarget(afterRegen[0])).toEqual({ lineId: scene.lines[0].id, characterId: PIP_CHARACTER_ID });
    expect(actionTarget(afterRegen[1])).toEqual({ lineId: scene.lines[1].id, characterId: GOAT_CHARACTER_ID });
  });

  it('uses distinct audible playback-test chimes and never claims they are final voices', () => {
    const pip = buildFixtureWavBase64(PIP_CHARACTER_ID, 'rev-a');
    const goat = buildFixtureWavBase64(GOAT_CHARACTER_ID, 'rev-b');
    const pipAgain = buildFixtureWavBase64(PIP_CHARACTER_ID, 'rev-c');
    expect(fixtureIsAudible(pip)).toBe(true);
    expect(fixtureIsAudible(goat)).toBe(true);
    expect(maxAbsSample(decodeWavPcm(pip).samples)).toBeGreaterThan(2000);
    expect(maxAbsSample(decodeWavPcm(goat).samples)).toBeGreaterThan(2000);
    expect(fixtureIsHigherPitched(pip, goat)).toBe(true);
    const pipDecoded = decodeWavPcm(pip);
    const goatDecoded = decodeWavPcm(goat);
    expect(goertzelPower(pipDecoded.samples, pipDecoded.sampleRate, PIP_CHIME_HZ[0])).toBeGreaterThan(
      goertzelPower(pipDecoded.samples, pipDecoded.sampleRate, GOAT_CHIME_HZ[0]),
    );
    expect(goertzelPower(goatDecoded.samples, goatDecoded.sampleRate, GOAT_CHIME_HZ[0])).toBeGreaterThan(
      goertzelPower(goatDecoded.samples, goatDecoded.sampleRate, PIP_CHIME_HZ[0]),
    );
    expect(pip).not.toBe(pipAgain);
    const service = createVoiceProductionService(createMemoryVoiceStore(), {});
    const scene = service.createSampleScene('ep-chime');
    expect(fixtureIsAudible(scene.playback[scene.lines[0].id].replace('data:audio/wav;base64,', ''))).toBe(true);
    expect(fixtureIsAudible(scene.playback[scene.lines[1].id].replace('data:audio/wav;base64,', ''))).toBe(true);
    const ui = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const fixtures = readRepo('apps/web/src/lib/voice-production/fixtures.ts');
    const guides = readRepo('apps/web/src/lib/voice-production/guides.ts');
    expect(ui).toContain(FIXTURE_PLAYBACK_LABEL);
    expect(ui).toContain('Saving…');
    expect(ui).toContain('Saved');
    expect(ui).toContain('buildLocalPackage');
    expect(ui).not.toContain('Preview fixture — not the final Pip/Goat voice.');
    expect(fixtures).toContain('Playback test only');
    expect(`${ui}\n${fixtures}\n${guides}\n${readRepo('apps/web/src/lib/voice-production/sample-episode.ts')}`).not.toMatch(
      /gooaating/i,
    );
    expect(GOAT_VOICE_GUIDE.pronunciationNotes).toContain('warm, rounded long-o sound');
    expect(isPaidVoiceGenerationAuthorized({})).toBe(false);
    expect(scene.providerContacted).toBe(false);
    expect(readVoiceSafetySnapshot({}).ledger.paidCharactersUsed).toBe(0);
  });
});

describe('controlled ElevenLabs approved-voice preview', () => {
  const openEnv = {
    ALLOW_PAID_VOICE_GENERATION: 'true',
    TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
    ELEVENLABS_API_KEY: 'test-key-not-real',
    TIVVLEJOY_VOICE_TEST_TOKEN: 'preview-token',
    TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '600',
    VERCEL_ENV: 'preview',
    ELEVENLABS_MODEL_ID: 'eleven_multilingual_v2',
  };

  const pipInput = {
    characterId: PIP_CHARACTER_ID,
    text: FIXED_APPROVED_LINES[PIP_CHARACTER_ID],
    requestId: 'req_pip_one',
    testToken: 'preview-token',
    confirmed: true as const,
  };

  beforeEach(() => {
    resetCandidateRequestState();
  });

  it('never contacts the provider when any gate is closed', async () => {
    let contacted = false;
    const transport = async () => {
      contacted = true;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
    };
    const locked = createCandidateVoiceService({}, transport);
    await expect(locked.generate(pipInput)).rejects.toThrow(/Live voice test locked/);
    expect(contacted).toBe(false);
    expect(serverGatesOpen({})).toBe(false);
    expect(publicLiveTestSnapshot({}).status).toBe('locked');
    expect(isPaidVoiceGenerationAuthorized(openEnv)).toBe(false);

    const missingMax = createCandidateVoiceService({ ...openEnv, TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: undefined }, transport);
    await expect(missingMax.generate({ ...pipInput, requestId: 'req_missing_max' })).rejects.toThrow(/Live voice test locked/);
    const wrongMax = createCandidateVoiceService({ ...openEnv, TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '1200' }, transport);
    await expect(wrongMax.generate({ ...pipInput, requestId: 'req_wrong_max' })).rejects.toThrow(/Live voice test locked/);
    expect(contacted).toBe(false);
  });

  it('never contacts the provider with an invalid test token', async () => {
    let contacted = false;
    const transport = async () => {
      contacted = true;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
    };
    const service = createCandidateVoiceService(openEnv, transport);
    await expect(service.generate({ ...pipInput, testToken: 'wrong-token' })).rejects.toThrow(/not accepted/);
    expect(contacted).toBe(false);
  });

  it('rejects arbitrary dialogue, unknown IDs, and over-limit text without contacting the provider', async () => {
    let contacted = false;
    const transport = async () => {
      contacted = true;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
    };
    const service = createCandidateVoiceService(openEnv, transport);
    await expect(service.generate({ ...pipInput, text: 'Say anything paid.' })).rejects.toThrow(/Arbitrary paid dialogue/);
    await expect(service.generate({ ...pipInput, requestId: 'req_unknown', characterId: 'CHAR_UNKNOWN_001' })).rejects.toThrow(
      /Unknown character/,
    );
    await expect(
      service.generate({ ...pipInput, requestId: 'req_voice', voiceId: '93w5H37WdqeS6HoyL5cV' }),
    ).rejects.toThrow(/rejected/i);
    await expect(service.generate({ ...pipInput, requestId: 'req_long', text: 'x'.repeat(601) })).rejects.toThrow(
      /character limit/,
    );
    expect(contacted).toBe(false);
  });

  it('accepts the fixed Pip and Goat lines once, blocks duplicates, and does not retry', async () => {
    let calls = 0;
    const transport = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls += 1;
      expect(url.startsWith(`${ELEVENLABS_TTS_ENDPOINT}/93w5H37WdqeS6HoyL5cV`)).toBe(true);
      expect(init.headers['xi-api-key']).toBe('test-key-not-real');
      const body = JSON.parse(init.body);
      expect(body.text).toBe(FIXED_APPROVED_LINES[PIP_CHARACTER_ID]);
      expect(body.model_id).toBe('eleven_multilingual_v2');
      expect(body.voice_settings).toEqual({
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1,
        use_speaker_boost: true,
      });
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([9, 8, 7]).buffer };
    };
    const service = createCandidateVoiceService(openEnv, transport);
    const first = await service.generate(pipInput);
    expect(first.kind).toBe('ELEVENLABS_APPROVED_SAMPLE');
    expect(first.label).toBe(APPROVED_SAMPLE_AUDIO_LABEL);
    expect(first.label).not.toBe(FIXTURE_PLAYBACK_LABEL);
    expect(first.providerContacted).toBe(true);
    expect(JSON.stringify(first)).not.toContain('test-key-not-real');
    expect(JSON.stringify(first)).not.toContain('preview-token');
    expect(JSON.stringify(first)).not.toContain('ELEVENLABS_API_KEY');
    expect(JSON.stringify(first)).not.toContain('xi-api-key');
    expect(JSON.stringify(first)).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(JSON.stringify(first)).not.toContain('SbxjwBKw2PefbSupcoXV');
    await expect(service.generate(pipInput)).rejects.toThrow(/already submitted/);
    expect(calls).toBe(1);

    resetCandidateRequestState();
    let failedCalls = 0;
    const failing = createCandidateVoiceService(openEnv, async () => {
      failedCalls += 1;
      throw new Error('timeout');
    });
    await expect(failing.generate({ ...pipInput, requestId: 'req_timeout' })).rejects.toThrow(/timed out|not retried/);
    await expect(failing.generate({ ...pipInput, requestId: 'req_timeout' })).rejects.toThrow(/already submitted/);
    expect(failedCalls).toBe(1);

    resetCandidateRequestState();
    let goatUrl = '';
    const goatTransport = async (url: string) => {
      goatUrl = url;
      return {
        ok: true,
        status: 200,
        contentType: 'audio/mpeg',
        body: new Uint8Array([4, 5, 6]).buffer,
      };
    };
    const goatService = createCandidateVoiceService(openEnv, goatTransport);
    const goat = await goatService.generate({
      characterId: GOAT_CHARACTER_ID,
      text: FIXED_APPROVED_LINES[GOAT_CHARACTER_ID],
      requestId: 'req_goat_one',
      testToken: 'preview-token',
      confirmed: true,
    });
    expect(goat.characterId).toBe(GOAT_CHARACTER_ID);
    expect(goatUrl.startsWith(`${ELEVENLABS_TTS_ENDPOINT}/SbxjwBKw2PefbSupcoXV`)).toBe(true);
    expect(JSON.stringify(goat)).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(Array.from(FIXED_APPROVED_LINES[PIP_CHARACTER_ID]).length).toBeLessThanOrEqual(600);
    expect(Array.from(FIXED_APPROVED_LINES[GOAT_CHARACTER_ID]).length).toBeLessThanOrEqual(600);
  });

  it('keeps registered Voice IDs unchanged and refuses Production generation', async () => {
    expect(foundingCodesMatchRegistry()).toBe(true);
    expect(resolveVoiceAssignment(PIP_CHARACTER_ID).providerVoiceId).toBe('93w5H37WdqeS6HoyL5cV');
    expect(resolveVoiceAssignment(GOAT_CHARACTER_ID).providerVoiceId).toBe('SbxjwBKw2PefbSupcoXV');
    expect(isProductionVoiceRuntime({ VERCEL_ENV: 'production' })).toBe(true);
    let contacted = false;
    const production = createCandidateVoiceService({ ...openEnv, VERCEL_ENV: 'production' }, async () => {
      contacted = true;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1]).buffer };
    });
    await expect(production.generate(pipInput)).rejects.toThrow(/Production/);
    expect(contacted).toBe(false);
    expect(publicLiveTestSnapshot({ ...openEnv, VERCEL_ENV: 'production' }).status).toBe('locked');
    expect(publicLiveTestSnapshot({ ...openEnv, VERCEL_ENV: 'production' }).productionEnabled).toBe(false);
    expect(JSON.stringify(publicLiveTestSnapshot(openEnv))).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(JSON.stringify(publicLiveTestSnapshot(openEnv))).not.toContain('SbxjwBKw2PefbSupcoXV');

    const ui = readRepo('apps/web/src/components/preview/CandidateVoiceTest.tsx');
    const studio = readRepo('apps/web/src/components/preview/VoiceProductionStudio.tsx');
    const envExample = readRepo('.env.example');
    expect(ui).toContain('Live voice test locked');
    expect(ui).toContain('Final voice identity approved');
    expect(ui).toContain('Generate approved Pip sample');
    expect(ui).toContain('Generate approved Goat sample');
    expect(ui).toContain(APPROVED_SAMPLE_AUDIO_LABEL);
    expect(ui).not.toContain('Pip candidate A');
    expect(ui).not.toContain('Candidate voices not configured');
    expect(studio).toContain('CandidateVoiceTest');
    expect(ui).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(ui).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(ui).not.toContain('ELEVENLABS_API_KEY');
    expect(ui).not.toContain('NEXT_PUBLIC_ELEVENLABS');
    expect(ui).not.toContain('localStorage');
    expect(envExample).toContain('TIVVLEJOY_VOICE_TEST_TOKEN=');
    expect(envExample).toContain('TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS=600');
    expect(envExample).not.toMatch(/ELEVENLABS_API_KEY=\S+/);
    expect(envExample).not.toContain('TIVVLEJOY_VOICE_CANDIDATE_PIP');
    expect(envExample).not.toContain('TIVVLEJOY_VOICE_CANDIDATE_GOAT');
    expect(envExample).toContain('ALLOW_PAID_VOICE_GENERATION=false');
  });
});

describe('legacy brand canon stays out of ElevenLabs', () => {
  const bannedLines = [
    'Let’s Doodle-Dash!',
    'Lets Doodle-Dash!',
    'Welcome to Doodle Dash.',
    'Hi, I am ready for Doodle-Dash.',
    'Narrator: Doodle Dash begins.',
  ];

  const audienceSources = [
    'apps/web/src/lib/voice-production/guides.ts',
    'apps/web/src/lib/voice-production/dialogue.ts',
    'apps/web/src/lib/voice-production/sample-episode.ts',
    'apps/web/src/lib/voice-production/candidates.ts',
    'apps/web/src/components/preview/CandidateVoiceTest.tsx',
    'apps/web/src/components/preview/ConfirmedScriptToVoice.tsx',
    'apps/web/src/components/preview/VoiceProductionStudio.tsx',
    'apps/web/src/components/preview/PreviewNewEpisode.tsx',
  ];

  it('removes Pip’s banned catchphrase and does not invent a new signature', () => {
    expect(PIP_VOICE_GUIDE.catchphrases).toEqual(['Feathers and freckles!']);
    expect(PIP_VOICE_GUIDE.catchphrases.join(' ')).not.toMatch(/doodle[\s\-_–—]+dash/i);
    expect(PIP_VOICE_GUIDE.pronunciationNotes).not.toMatch(/doodle[\s\-_–—]+dash/i);
    expect(PIP_TEMPORARY_NEUTRAL_PHRASE).toBe('Let’s explore!');
    expect(PIP_VOICE_GUIDE.catchphrases).not.toContain(PIP_TEMPORARY_NEUTRAL_PHRASE);
  });

  it('keeps generated scripts, titles, templates, and sample lines free of prohibited terms', () => {
    for (const source of audienceSources) {
      expect(readRepo(source)).not.toMatch(/doodle[\s\-_–—]+dash/i);
    }
    expect(readRepo('packages/production/src/launch-prep.ts')).not.toContain('Hi, I am ready for Doodle Dash.');
    expect(readRepo('packages/production/src/launch-prep.ts')).not.toContain('Welcome to Doodle Dash TV.');
    expect(containsProhibitedLegacyBrand(SAMPLE_VOICE_EPISODE_TITLE)).toBe(false);
    expect(containsProhibitedLegacyBrand(FIXED_APPROVED_LINES[PIP_CHARACTER_ID])).toBe(false);
    expect(containsProhibitedLegacyBrand(FIXED_APPROVED_LINES[GOAT_CHARACTER_ID])).toBe(false);
    for (let index = 0; index < 24; index += 1) {
      const pip = generateOriginalDialogue({
        characterId: PIP_CHARACTER_ID,
        episodeId: `ep-brand-${index}`,
        sceneId: `scene-${index}`,
        premise: 'Find the meadow map crumb.',
      });
      const goat = generateOriginalDialogue({
        characterId: GOAT_CHARACTER_ID,
        episodeId: `ep-brand-${index}`,
        sceneId: `scene-${index}`,
        premise: 'Find the meadow map crumb.',
      });
      expect(containsProhibitedLegacyBrand(pip.text)).toBe(false);
      expect(containsProhibitedLegacyBrand(goat.text)).toBe(false);
    }
    expect(() =>
      generateOriginalDialogue({
        characterId: PIP_CHARACTER_ID,
        episodeId: 'ep-banned',
        sceneId: 'scene-1',
        premise: 'Let’s Doodle-Dash into the meadow.',
      }),
    ).toThrowError(/Legacy brand wording/);
  });

  it('never contacts ElevenLabs with prohibited legacy-brand wording', async () => {
    let contacted = false;
    const transport = async () => {
      contacted = true;
      return { ok: true, status: 200, contentType: 'audio/mpeg', body: new Uint8Array([1, 2, 3]).buffer };
    };
    const openEnv = {
      ALLOW_PAID_VOICE_GENERATION: 'true',
      TIVVLEJOY_VOICE_AUTHORIZE_PAID: 'true',
      ELEVENLABS_API_KEY: 'test-key-not-real',
      TIVVLEJOY_VOICE_TEST_TOKEN: 'preview-token',
      TIVVLEJOY_VOICE_TEST_MAX_CHARACTERS: '600',
      VERCEL_ENV: 'preview',
    };

    for (const text of bannedLines) {
      await expect(generateElevenLabsAudio({ characterId: PIP_CHARACTER_ID, text }, openEnv, transport)).rejects.toThrow(
        /Legacy brand wording/,
      );
      await expect(
        convertCandidateSpeech({ characterId: PIP_CHARACTER_ID, text }, openEnv, transport),
      ).rejects.toThrow(/Legacy brand wording/);
    }

    const service = createVoiceProductionService(createMemoryVoiceStore(), openEnv);
    expect(() =>
      service.generateDraftAudio({
        episodeId: 'ep-brand',
        sceneId: 'scene-1',
        characterId: PIP_CHARACTER_ID,
        dialogueText: 'Let’s Doodle-Dash!',
      }),
    ).toThrowError(/Legacy brand wording/);

    resetCandidateRequestState();
    const candidateService = createCandidateVoiceService(openEnv, transport);
    await expect(
      candidateService.generate({
        characterId: PIP_CHARACTER_ID,
        text: 'Let’s Doodle-Dash!',
        requestId: 'req_brand_block',
        testToken: 'preview-token',
        confirmed: true,
      }),
    ).rejects.toThrow(/Legacy brand wording/);

    expect(() =>
      applyLocalEdit(
        {
          id: 'line-1',
          episodeId: 'ep-1',
          sceneId: 'scene-1',
          characterId: PIP_CHARACTER_ID,
          voiceProfileVersion: 'pip_default_v1',
          dialogueText: 'The meadow path is bright.',
          performanceDirection: '',
          pronunciationNotes: '',
          emotion: '',
          generationStatus: 'DRAFT_TEXT',
          approvalStatus: 'PENDING',
          audioObjectKey: null,
          characterCount: 26,
          providerContacted: false,
        },
        { dialogueText: 'Caption: Welcome to Doodle Dash.' },
        280,
      ),
    ).toThrowError(/Legacy brand wording/);

    expect(contacted).toBe(false);
  });
});

describe('final voice identity lock', () => {
  it('locks Pip and Goat to distinct approved Voice IDs and refuses swaps', () => {
    expect(lockedVoiceIdsAreDistinct()).toBe(true);
    const pip = resolveVoiceAssignment(PIP_CHARACTER_ID);
    const goat = resolveVoiceAssignment(GOAT_CHARACTER_ID);
    expect(pip.providerVoiceId).toBe('93w5H37WdqeS6HoyL5cV');
    expect(goat.providerVoiceId).toBe('SbxjwBKw2PefbSupcoXV');
    expect(() => assertExclusiveVoiceAssignment(PIP_CHARACTER_ID, goat.providerVoiceId)).toThrowError(
      /cannot share or swap/,
    );
    expect(() => assertExclusiveVoiceAssignment(GOAT_CHARACTER_ID, pip.providerVoiceId)).toThrowError(
      /cannot share or swap/,
    );
    expect(() => assertExclusiveVoiceAssignment(PIP_CHARACTER_ID, 'unknown-voice')).toThrowError(
      /Voice assignment is locked/,
    );
  });

  it('records the approved model and effective sample settings without exposing Voice IDs publicly', () => {
    const identity = publicVoiceIdentitySnapshot();
    expect(identity.status).toBe('final-approved');
    expect(identity.model).toBe(APPROVED_ELEVENLABS_MODEL);
    expect(identity.outputFormat).toBe(APPROVED_OUTPUT_FORMAT);
    expect(identity.settings).toEqual({
      stability: 0.5,
      similarity: 0.75,
      style: 0,
      speed: 1,
      speakerBoost: true,
    });
    expect(identity.productionEnabled).toBe(false);
    expect(JSON.stringify(identity)).not.toContain('93w5H37WdqeS6HoyL5cV');
    expect(JSON.stringify(identity)).not.toContain('SbxjwBKw2PefbSupcoXV');
    expect(assertApprovedModel(APPROVED_ELEVENLABS_MODEL)).toBeUndefined();
    expect(() => assertApprovedModel('eleven_turbo_v2_5')).toThrowError(/approved ElevenLabs model/);
    expect(readRepo('apps/web/src/lib/voice-production/approved-voice-settings.ts')).not.toContain(
      '93w5H37WdqeS6HoyL5cV',
    );
    expect(readRepo('apps/web/src/components/preview/CandidateVoiceTest.tsx')).not.toContain('voice-identity');
    expect(PIP_VOICE_GUIDE.personality).toEqual(['curious', 'cheerful', 'kind', 'enthusiastic']);
    expect(GOAT_VOICE_GUIDE.personality).toEqual(['warm', 'playful', 'adventurous', 'loyal']);
  });

  it('keeps spending limits and Production gates default-closed', () => {
    expect(DEFAULT_MAX_CHARS_PER_REQUEST).toBe(280);
    expect(DEFAULT_MAX_CHARS_PER_EPISODE).toBe(2000);
    expect(DEFAULT_MONTHLY_CHAR_LIMIT).toBe(20_000);
    expect(isPaidVoiceGenerationEnabled({})).toBe(false);
    expect(isPaidVoiceGenerationAuthorized({})).toBe(false);
    expect(isProductionVoiceRuntime({})).toBe(false);
    expect(isProductionVoiceRuntime({ VERCEL_ENV: 'production' })).toBe(true);
    expect(publicLiveTestSnapshot({ VERCEL_ENV: 'production' }).productionEnabled).toBe(false);
    expect(publicLiveTestSnapshot({ VERCEL_ENV: 'production' }).voiceIdentity.productionEnabled).toBe(false);
    expect(canEnterFinalRendering()).toBe(false);
    expect(() =>
      assertWithinLimits({
        text: 'x'.repeat(281),
        episodeCharacterCount: 0,
        ledger: emptyLedger(),
        paid: false,
      }),
    ).toThrowError(/per-request limit/);
    expect(() =>
      assertAudienceFacingContent({
        narration: 'Doodle-Dash begins.',
        caption: 'Safe caption',
        title: 'Safe title',
        description: 'Safe description',
      }),
    ).toThrowError(/Legacy brand wording/);
  });
});

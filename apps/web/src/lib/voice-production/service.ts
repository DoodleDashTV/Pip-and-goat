import { generateOriginalDialogue } from './dialogue';
import { fixtureObjectKey, fixturePlaybackDataUrl } from './fixtures';
import { sampleSceneLines } from './sample-episode';
import { resolveElevenLabsModel } from './models';
import { generateElevenLabsAudio } from './provider';
import { assertNoClientVoiceId, publicVoiceDirectory, resolveVoiceAssignment } from './registry';
import {
  assertWithinLimits,
  isPaidVoiceGenerationAuthorized,
  readVoiceSafetySnapshot,
  type VoiceEnv,
} from './safety';
import {
  createMemoryVoiceStore,
  episodeCharacterCount,
  linesForEpisode,
  makeIdempotencyKey,
  makeLineId,
  type VoiceProductionStore,
} from './store';
import {
  VoiceProductionError,
  type RegisteredCharacterId,
  type VoiceLineRecord,
} from './types';

export type GenerateDraftAudioInput = {
  episodeId: string;
  sceneId: string;
  characterId: string;
  dialogueText: string;
  performanceDirection?: string;
  pronunciationNotes?: string;
  emotion?: string;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
  model?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function publicLine(line: VoiceLineRecord) {
  return {
    id: line.id,
    episodeId: line.episodeId,
    sceneId: line.sceneId,
    characterId: line.characterId,
    voiceProfileVersion: line.voiceProfileVersion,
    dialogueText: line.dialogueText,
    performanceDirection: line.performanceDirection,
    pronunciationNotes: line.pronunciationNotes,
    emotion: line.emotion,
    provider: line.provider,
    model: line.model,
    generationStatus: line.generationStatus,
    approvalStatus: line.approvalStatus,
    audioObjectKey: line.audioObjectKey,
    characterCount: line.characterCount,
    usagePaid: line.usagePaid,
    providerContacted: line.providerContacted,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

export function createVoiceProductionService(
  store: VoiceProductionStore = createMemoryVoiceStore(),
  env: VoiceEnv = process.env,
) {
  return {
    snapshot() {
      return {
        characters: publicVoiceDirectory(),
        safety: readVoiceSafetySnapshot(env, store.ledger),
        paidGenerationStatus: isPaidVoiceGenerationAuthorized(env)
          ? 'authorized-not-used'
          : 'disabled',
      };
    },

    draftDialogue(input: {
      characterId: string;
      episodeId: string;
      sceneId: string;
      premise?: string;
      voiceId?: unknown;
      providerVoiceId?: unknown;
    }) {
      assertNoClientVoiceId(input);
      const assignment = resolveVoiceAssignment(input.characterId);
      return generateOriginalDialogue({
        characterId: assignment.characterId,
        episodeId: input.episodeId,
        sceneId: input.sceneId,
        premise: input.premise,
      });
    },

    estimate(text: string) {
      const safety = readVoiceSafetySnapshot(env, store.ledger);
      return {
        characterCount: Array.from(text).length,
        maxCharsPerRequest: safety.maxCharsPerRequest,
        monthlyUsed: safety.ledger.paidCharactersUsed,
        monthlyLimit: safety.monthlyCharLimit,
        paidGenerationStatus: safety.paidGenerationAuthorized ? 'authorized-not-used' : 'disabled',
      };
    },

    generateDraftAudio(input: GenerateDraftAudioInput) {
      assertNoClientVoiceId(input);
      const assignment = resolveVoiceAssignment(input.characterId);
      const model = resolveElevenLabsModel(input.model ?? env.ELEVENLABS_MODEL_ID);
      const idempotencyKey = makeIdempotencyKey([
        input.episodeId,
        input.sceneId,
        assignment.characterId,
        assignment.profile,
        input.dialogueText,
        model,
      ]);
      const existingId = store.byIdempotency.get(idempotencyKey);
      if (existingId) {
        const existing = store.lines.get(existingId);
        if (existing) return { line: publicLine(existing), replayed: true, playbackDataUrl: null };
      }

      const paid = isPaidVoiceGenerationAuthorized(env);
      const { characterCount } = assertWithinLimits({
        text: input.dialogueText,
        episodeCharacterCount: episodeCharacterCount(store, input.episodeId),
        ledger: store.ledger,
        paid,
        env,
      });

      if (paid) {
        void generateElevenLabsAudio(
          { characterId: assignment.characterId, text: input.dialogueText, model },
          env,
        );
      }

      const createdAt = nowIso();
      const id = makeLineId();
      const line: VoiceLineRecord = {
        id,
        episodeId: input.episodeId,
        sceneId: input.sceneId,
        characterId: assignment.characterId,
        voiceProfileVersion: assignment.profile,
        dialogueText: input.dialogueText,
        performanceDirection: input.performanceDirection ?? '',
        pronunciationNotes: input.pronunciationNotes ?? '',
        emotion: input.emotion ?? '',
        provider: 'fixture',
        model,
        generationStatus: 'FIXTURE_GENERATED',
        approvalStatus: 'PENDING',
        audioObjectKey: fixtureObjectKey(assignment.characterId, id),
        characterCount,
        usagePaid: false,
        providerContacted: false,
        idempotencyKey,
        createdAt,
        updatedAt: createdAt,
      };
      store.lines.set(id, line);
      store.byIdempotency.set(idempotencyKey, id);
      store.ledger.fixtureCharactersUsed += characterCount;
      store.ledger.fixtureRequests += 1;
      return { line: publicLine(line), replayed: false, playbackDataUrl: fixturePlaybackDataUrl() };
    },

    decide(lineId: string, decision: 'APPROVE' | 'REJECT') {
      const line = store.lines.get(lineId);
      if (!line) throw new VoiceProductionError('Voice line not found.', 'LINE_NOT_FOUND');
      if (decision === 'REJECT') {
        line.approvalStatus = 'REJECTED';
        line.generationStatus = 'REJECTED';
      } else {
        line.approvalStatus = 'APPROVED';
        line.generationStatus = 'APPROVED_FOR_LIPSYNC';
      }
      line.updatedAt = nowIso();
      return publicLine(line);
    },

    regenerate(lineId: string) {
      const line = store.lines.get(lineId);
      if (!line) throw new VoiceProductionError('Voice line not found.', 'LINE_NOT_FOUND');
      store.byIdempotency.delete(line.idempotencyKey);
      return this.generateDraftAudio({
        episodeId: line.episodeId,
        sceneId: line.sceneId,
        characterId: line.characterId,
        dialogueText: line.dialogueText,
        performanceDirection: line.performanceDirection,
        pronunciationNotes: line.pronunciationNotes,
        emotion: line.emotion,
      });
    },

    list(episodeId: string) {
      return linesForEpisode(store, episodeId).map(publicLine);
    },

    createSampleScene(
      episodeId: string,
      extra: { voiceId?: unknown; providerVoiceId?: unknown; elevenLabsVoiceId?: unknown } = {},
    ) {
      assertNoClientVoiceId(extra);
      const samples = sampleSceneLines();
      const existing = this.list(episodeId);
      const matched = samples
        .map((sample) =>
          existing.find(
            (line) =>
              line.characterId === sample.characterId &&
              line.dialogueText === sample.dialogueText &&
              line.sceneId === sample.sceneId,
          ),
        )
        .filter((line): line is NonNullable<typeof line> => Boolean(line));
      if (matched.length === samples.length) {
        return {
          lines: matched,
          playback: Object.fromEntries(matched.map((line) => [line.id, fixturePlaybackDataUrl()])),
          providerContacted: matched.some((line) => line.providerContacted),
          replayed: true,
        };
      }
      const created = samples.map((sample) =>
        this.generateDraftAudio({
          episodeId,
          sceneId: sample.sceneId,
          characterId: sample.characterId,
          dialogueText: sample.dialogueText,
          performanceDirection: sample.performanceDirection,
          pronunciationNotes: sample.pronunciationNotes,
          emotion: sample.emotion,
        }),
      );
      return {
        lines: created.map((item) => item.line),
        playback: Object.fromEntries(
          created.map((item) => [item.line.id, item.playbackDataUrl ?? fixturePlaybackDataUrl()]),
        ),
        providerContacted: created.some((item) => item.line.providerContacted),
        replayed: created.every((item) => item.replayed),
      };
    },

    updateLine(
      lineId: string,
      patch: {
        dialogueText?: string;
        performanceDirection?: string;
        pronunciationNotes?: string;
        emotion?: string;
      },
    ) {
      const line = store.lines.get(lineId);
      if (!line) throw new VoiceProductionError('Voice line not found.', 'LINE_NOT_FOUND');
      if (patch.dialogueText !== undefined) {
        assertWithinLimits({
          text: patch.dialogueText,
          episodeCharacterCount: episodeCharacterCount(store, line.episodeId) - line.characterCount,
          ledger: store.ledger,
          paid: false,
          env,
        });
        line.dialogueText = patch.dialogueText;
        line.characterCount = Array.from(patch.dialogueText).length;
        line.approvalStatus = 'PENDING';
        line.generationStatus = 'DRAFT_TEXT';
        store.byIdempotency.delete(line.idempotencyKey);
      }
      if (patch.performanceDirection !== undefined) line.performanceDirection = patch.performanceDirection;
      if (patch.pronunciationNotes !== undefined) line.pronunciationNotes = patch.pronunciationNotes;
      if (patch.emotion !== undefined) line.emotion = patch.emotion;
      line.updatedAt = nowIso();
      return publicLine(line);
    },

    packageApproved(episodeId: string) {
      const approved = linesForEpisode(store, episodeId).filter(
        (line) => line.approvalStatus === 'APPROVED' && line.generationStatus === 'APPROVED_FOR_LIPSYNC',
      );
      const rejected = linesForEpisode(store, episodeId).filter((line) => line.approvalStatus === 'REJECTED');
      return {
        kind: 'TIVVLEJOY_VOICE_PACKAGE',
        episodeId,
        readyForLipSync: approved.map(publicLine),
        rejectedExcluded: rejected.map((line) => line.id),
        canEnterFinalRendering: false,
        providerContacted: approved.some((line) => line.providerContacted),
        downloadedAt: nowIso(),
      };
    },
  };
}

export function canEnterFinalRendering(_line?: VoiceLineRecord): false {
  return false;
}

export function canPrepareForLipSync(line: VoiceLineRecord): boolean {
  return line.approvalStatus === 'APPROVED' && line.generationStatus === 'APPROVED_FOR_LIPSYNC';
}

export type VoiceProductionService = ReturnType<typeof createVoiceProductionService>;

import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  publicApprovedVoiceSettings,
  VOICE_IDENTITY_CHECKPOINT,
} from './approved-voice-settings';
import { publicDurableLedgerView } from './durable-voice-ledger';
import { publicPreviewVoiceAllowance } from './preview-paid-ledger';
import { assertNoClientVoiceId } from './registry';
import { type VoiceEnv } from './safety';
import {
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import {
  createScriptToVoiceService,
  publicScriptToVoiceSnapshot,
  type ScriptToVoiceContext,
  type ScriptToVoiceService,
} from './script-to-voice';
import { type CandidateTransport } from './candidate-provider';
import {
  assertEpisodeLineBrandFields,
  characterIdToSpeaker,
  confirmationKey,
  displayNameForSpeaker,
  EPISODE_LINE_BRAND_MESSAGE,
  parseEpisodeScript,
  speakerToCharacterId,
  type EpisodeSpeaker,
} from './episode-voice-lines';
import { VoiceProductionError } from './types';

export type EpisodeLineVoiceInput = {
  action?: string;
  episodeId: string;
  sceneId: string;
  lineId: string;
  lineNumber: number;
  character: EpisodeSpeaker | string;
  dialogue: string;
  requestId?: string;
  testToken?: string;
  confirmed?: boolean;
  confirmationKey?: string;
  title?: string;
  description?: string;
  caption?: string;
  narration?: string;
  metadata?: string;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
  lines?: unknown;
  script?: unknown;
  queue?: unknown;
  generateAll?: unknown;
  generate_all?: unknown;
  model?: unknown;
  model_id?: unknown;
  outputFormat?: unknown;
  output_format?: unknown;
  voice_settings?: unknown;
  stability?: unknown;
  similarity?: unknown;
  similarity_boost?: unknown;
  style?: unknown;
  speed?: unknown;
  speakerBoost?: unknown;
  use_speaker_boost?: unknown;
};

function assertNoBatchGeneration(input: EpisodeLineVoiceInput) {
  if (input.action === 'generate-all' || input.action === 'generate-script' || input.generateAll || input.generate_all) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
  if (Array.isArray(input.lines) || Array.isArray(input.script) || Array.isArray(input.queue)) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
}

function requireSpeaker(value: string): EpisodeSpeaker {
  try {
    return characterIdToSpeaker(value);
  } catch {
    throw new VoiceProductionError('Only Pip and Goat are accepted as speakers.', 'UNKNOWN_CHARACTER');
  }
}

function assertLineShape(input: EpisodeLineVoiceInput) {
  const episodeId = String(input.episodeId ?? '').trim();
  const sceneId = String(input.sceneId ?? '').trim();
  const lineId = String(input.lineId ?? '').trim();
  const lineNumber = Number(input.lineNumber);
  if (!episodeId || !sceneId || !lineId || !Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new VoiceProductionError('Episode, scene, and line number are required.', 'EPISODE_LINE_REQUIRED');
  }
  const character = requireSpeaker(String(input.character ?? ''));
  const dialogue = String(input.dialogue ?? '').trim();
  if (!dialogue) {
    throw new VoiceProductionError('Dialogue text is empty.', 'EMPTY_DIALOGUE');
  }
  assertEpisodeLineBrandFields({
    dialogue,
    episodeId,
    sceneId,
    title: input.title,
    description: input.description,
    caption: input.caption,
    narration: input.narration,
    metadata: input.metadata,
  });
  return { episodeId, sceneId, lineId, lineNumber, character, dialogue };
}

export function publicEpisodeLineSnapshot(env: VoiceEnv = process.env) {
  const live = publicScriptToVoiceSnapshot(env);
  const allowance = publicPreviewVoiceAllowance();
  return {
    ...live,
    section: 'Episode voice lines',
    maxCharacters: SCRIPT_TO_VOICE_MAX_CHARS,
    maxPaidRequests: SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
    maxPaidCharacters: SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
    ledger: {
      paidCharactersUsed: allowance.paidCharactersUsed,
      paidRequests: allowance.paidRequests,
      remainingRequests: allowance.remainingRequests,
      remainingCharacters: allowance.remainingCharacters,
      monthlyCharLimit: allowance.maxCharacters,
      failedAttempts: allowance.failedAttempts,
    },
    productionEnabled: false,
    providerContacted: false,
    durableLedger: publicDurableLedgerView(env),
  };
}

export function createEpisodeLineVoiceService(
  env: VoiceEnv = process.env,
  transport?: CandidateTransport,
  inner: ScriptToVoiceService = createScriptToVoiceService(env, transport),
) {
  return {
    snapshot() {
      return publicEpisodeLineSnapshot(env);
    },

    parse(script: string, context?: { episodeId: string; sceneId: string }) {
      return {
        lines: parseEpisodeScript(script, context),
        providerContacted: false as const,
        productionEnabled: false as const,
      };
    },

    validate(input: EpisodeLineVoiceInput) {
      assertNoClientVoiceId(input);
      assertNoBatchGeneration(input);
      const line = assertLineShape(input);
      const preview = inner.validate({
        characterId: speakerToCharacterId(line.character),
        text: line.dialogue,
        title: input.title,
        description: input.description,
        caption: input.caption,
        narration: input.narration,
        metadata: input.metadata,
        model: input.model,
        model_id: input.model_id,
        outputFormat: input.outputFormat,
        output_format: input.output_format,
        voice_settings: input.voice_settings,
        stability: input.stability,
        similarity: input.similarity,
        similarity_boost: input.similarity_boost,
        style: input.style,
        speed: input.speed,
        speakerBoost: input.speakerBoost,
        use_speaker_boost: input.use_speaker_boost,
      });
      const allowance = publicPreviewVoiceAllowance();
      return {
        episodeId: line.episodeId,
        sceneId: line.sceneId,
        lineId: line.lineId,
        lineNumber: line.lineNumber,
        character: line.character,
        displayName: displayNameForSpeaker(line.character),
        dialogue: preview.text,
        characterCount: preview.characterCount,
        model: APPROVED_ELEVENLABS_MODEL,
        outputFormat: APPROVED_OUTPUT_FORMAT,
        settings: publicApprovedVoiceSettings(),
        checkpoint: VOICE_IDENTITY_CHECKPOINT,
        confirmationKey: confirmationKey(line),
        remainingRequests: allowance.remainingRequests,
        remainingCharacters: allowance.remainingCharacters,
        paidRequests: allowance.paidRequests,
        paidCharactersUsed: allowance.paidCharactersUsed,
        providerContacted: false as const,
        productionEnabled: false as const,
      };
    },

    async generate(input: EpisodeLineVoiceInput, context: ScriptToVoiceContext = {}) {
      assertNoClientVoiceId(input);
      assertNoBatchGeneration(input);
      const line = assertLineShape(input);
      const expectedKey = confirmationKey(line);
      if (String(input.confirmationKey ?? '') !== expectedKey) {
        throw new VoiceProductionError(
          'This line changed after confirmation. Review it again before generating.',
          'CONFIRMATION_INVALIDATED',
        );
      }
      if (input.confirmed !== true) {
        throw new VoiceProductionError(
          'Preview voice generation requires a deliberate confirmation.',
          'CONFIRMATION_REQUIRED',
        );
      }
      const receipt = await inner.generate(
        {
          characterId: speakerToCharacterId(line.character),
          text: line.dialogue,
          requestId: input.requestId,
          testToken: input.testToken,
          confirmed: true,
          title: input.title,
          description: input.description,
          caption: input.caption,
          narration: input.narration,
          metadata: input.metadata,
          model: input.model,
          model_id: input.model_id,
          outputFormat: input.outputFormat,
          output_format: input.output_format,
          voice_settings: input.voice_settings,
          stability: input.stability,
          similarity: input.similarity,
          similarity_boost: input.similarity_boost,
          style: input.style,
          speed: input.speed,
          speakerBoost: input.speakerBoost,
          use_speaker_boost: input.use_speaker_boost,
        },
        context,
      );
      const allowance = publicPreviewVoiceAllowance();
      return {
        kind: 'ELEVENLABS_EPISODE_LINE' as const,
        episodeId: line.episodeId,
        sceneId: line.sceneId,
        lineId: line.lineId,
        lineNumber: line.lineNumber,
        character: line.character,
        displayName: displayNameForSpeaker(line.character),
        dialogue: receipt.text,
        characterCount: receipt.characterCount,
        model: receipt.model,
        outputFormat: receipt.outputFormat,
        settings: receipt.settings,
        requestId: receipt.requestId,
        receiptRef: receipt.requestId,
        audioContentType: receipt.audioContentType,
        audioDataUrl: receipt.audioDataUrl,
        checkpoint: receipt.checkpoint,
        createdAt: receipt.createdAt,
        paidCharactersCharged: receipt.paidCharactersCharged,
        remainingRequests: allowance.remainingRequests,
        remainingCharacters: allowance.remainingCharacters,
        ledger: receipt.ledger,
        providerContacted: true as const,
        usagePaid: true as const,
        productionEnabled: false as const,
        persistedAsCanon: false as const,
      };
    },
  };
}

export type EpisodeLineVoiceService = ReturnType<typeof createEpisodeLineVoiceService>;

export { EPISODE_LINE_BRAND_MESSAGE };

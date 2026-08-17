import { assertAudienceFacingContent } from '../brand-canon';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  publicApprovedVoiceSettings,
  VOICE_IDENTITY_CHECKPOINT,
} from './approved-voice-settings';
import {
  assertCandidateOriginAllowed,
  assertLiveApprovedSampleGates,
  publicLiveTestSnapshot,
  sanitizeVoiceErrorMessage,
} from './candidate-gates';
import { convertCandidateSpeech, type CandidateTransport } from './candidate-provider';
import {
  getPreviewPaidLedger,
  previewMonthlyCharLimit,
  recordSuccessfulPaidUsage,
  resetPreviewPaidLedger,
} from './preview-paid-ledger';
import { assertNoClientVoiceId, resolveVoiceAssignment } from './registry';
import { assertWithinLimits, type VoiceEnv } from './safety';
import {
  assertSingleDialogueLine,
  publicScriptCharacters,
  SCRIPT_TO_VOICE_AUDIO_LABEL,
  SCRIPT_TO_VOICE_LOCKED_MESSAGE,
  SCRIPT_TO_VOICE_MAX_CHARS,
} from './script-line';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

export type ScriptToVoiceInput = {
  characterId: string;
  text: string;
  requestId?: string;
  testToken?: string;
  confirmed?: boolean;
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
};

export type ScriptToVoiceContext = {
  origin?: string | null;
  host?: string | null;
};

export type ScriptLinePreview = {
  characterId: RegisteredCharacterId;
  displayName: string;
  text: string;
  characterCount: number;
  maxCharacters: number;
  model: typeof APPROVED_ELEVENLABS_MODEL;
  outputFormat: typeof APPROVED_OUTPUT_FORMAT;
  settings: ReturnType<typeof publicApprovedVoiceSettings>;
  checkpoint: typeof VOICE_IDENTITY_CHECKPOINT;
  providerContacted: false;
  productionEnabled: false;
};

export type ScriptToVoiceReceipt = {
  kind: 'ELEVENLABS_CONFIRMED_LINE';
  characterId: RegisteredCharacterId;
  displayName: string;
  text: string;
  characterCount: number;
  model: typeof APPROVED_ELEVENLABS_MODEL;
  outputFormat: typeof APPROVED_OUTPUT_FORMAT;
  settings: ReturnType<typeof publicApprovedVoiceSettings>;
  requestId: string;
  audioContentType: string;
  audioDataUrl: string;
  label: typeof SCRIPT_TO_VOICE_AUDIO_LABEL;
  checkpoint: typeof VOICE_IDENTITY_CHECKPOINT;
  providerContacted: true;
  usagePaid: true;
  persistedAsCanon: false;
  productionEnabled: false;
  ledger: {
    paidCharactersUsed: number;
    paidRequests: number;
    monthlyCharLimit: number;
  };
};

const successCache = new Map<string, ScriptToVoiceReceipt>();
const failedIds = new Set<string>();
const inFlightIds = new Set<string>();

export function resetScriptToVoiceState() {
  successCache.clear();
  failedIds.clear();
  inFlightIds.clear();
  resetPreviewPaidLedger();
}

function assertRegisteredCharacter(characterId: string): RegisteredCharacterId {
  if (characterId !== PIP_CHARACTER_ID && characterId !== GOAT_CHARACTER_ID) {
    throw new VoiceProductionError('Unknown character. Voice generation refused.', 'UNKNOWN_CHARACTER');
  }
  return characterId;
}

function assertNoBatchPayload(input: ScriptToVoiceInput) {
  if (Array.isArray(input.lines) || Array.isArray(input.script) || Array.isArray(input.queue)) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
}

export function validateConfirmedScriptLine(input: ScriptToVoiceInput): ScriptLinePreview {
  assertNoClientVoiceId(input);
  assertNoBatchPayload(input);
  const characterId = assertRegisteredCharacter(input.characterId);
  const text = assertSingleDialogueLine(input.text);
  assertAudienceFacingContent({
    dialogue: text,
    text,
    title: input.title,
    description: input.description,
    caption: input.caption,
    narration: input.narration,
    metadata: input.metadata,
  });
  const assignment = resolveVoiceAssignment(characterId);
  const { characterCount } = assertWithinLimits({
    text,
    episodeCharacterCount: 0,
    ledger: getPreviewPaidLedger(),
    paid: true,
  });
  return {
    characterId,
    displayName: assignment.displayName,
    text,
    characterCount,
    maxCharacters: SCRIPT_TO_VOICE_MAX_CHARS,
    model: APPROVED_ELEVENLABS_MODEL,
    outputFormat: APPROVED_OUTPUT_FORMAT,
    settings: publicApprovedVoiceSettings(),
    checkpoint: VOICE_IDENTITY_CHECKPOINT,
    providerContacted: false,
    productionEnabled: false,
  };
}

export function publicScriptToVoiceSnapshot(env: VoiceEnv = process.env) {
  const liveTest = publicLiveTestSnapshot(env);
  const ledger = getPreviewPaidLedger();
  return {
    status: liveTest.status,
    locked: liveTest.locked,
    message: liveTest.locked ? SCRIPT_TO_VOICE_LOCKED_MESSAGE : liveTest.message,
    characters: publicScriptCharacters(),
    voiceIdentity: liveTest.voiceIdentity,
    maxCharacters: SCRIPT_TO_VOICE_MAX_CHARS,
    monthlyCharLimit: previewMonthlyCharLimit(),
    ledger: {
      paidCharactersUsed: ledger.paidCharactersUsed,
      paidRequests: ledger.paidRequests,
      monthlyCharLimit: previewMonthlyCharLimit(),
    },
    productionEnabled: false,
    providerContacted: false,
  };
}

export function createScriptToVoiceService(env: VoiceEnv = process.env, transport?: CandidateTransport) {
  return {
    snapshot() {
      return publicScriptToVoiceSnapshot(env);
    },

    validate(input: ScriptToVoiceInput) {
      return validateConfirmedScriptLine(input);
    },

    async generate(input: ScriptToVoiceInput, context: ScriptToVoiceContext = {}): Promise<ScriptToVoiceReceipt> {
      assertNoClientVoiceId(input);
      assertCandidateOriginAllowed(context, env);
      const preview = validateConfirmedScriptLine(input);
      if (input.confirmed !== true) {
        throw new VoiceProductionError(
          'Preview voice generation requires a deliberate confirmation.',
          'CONFIRMATION_REQUIRED',
        );
      }
      const requestId = String(input.requestId ?? '').trim();
      if (!requestId) {
        throw new VoiceProductionError('A unique request id is required. The provider was not contacted.', 'DUPLICATE_REQUEST');
      }
      const cached = successCache.get(requestId);
      if (cached) {
        return cached;
      }
      if (failedIds.has(requestId) || inFlightIds.has(requestId)) {
        throw new VoiceProductionError(
          'This confirmed line was already submitted. It was not retried and was not billed again.',
          'DUPLICATE_REQUEST',
        );
      }

      assertLiveApprovedSampleGates(env, String(input.testToken ?? ''));
      resolveVoiceAssignment(preview.characterId);

      if (!transport) {
        throw new VoiceProductionError(
          'Paid ElevenLabs transport is not attached. Provider was not contacted.',
          'PROVIDER_TRANSPORT_UNAVAILABLE',
        );
      }

      inFlightIds.add(requestId);
      try {
        const converted = await convertCandidateSpeech(
          { characterId: preview.characterId, text: preview.text },
          env,
          transport,
        );
        const ledger = recordSuccessfulPaidUsage(preview.characterCount);
        const receipt: ScriptToVoiceReceipt = {
          kind: 'ELEVENLABS_CONFIRMED_LINE',
          characterId: preview.characterId,
          displayName: preview.displayName,
          text: preview.text,
          characterCount: preview.characterCount,
          model: APPROVED_ELEVENLABS_MODEL,
          outputFormat: APPROVED_OUTPUT_FORMAT,
          settings: publicApprovedVoiceSettings(),
          requestId,
          audioContentType: converted.contentType,
          audioDataUrl: `data:${converted.contentType};base64,${converted.audioBase64}`,
          label: SCRIPT_TO_VOICE_AUDIO_LABEL,
          checkpoint: VOICE_IDENTITY_CHECKPOINT,
          providerContacted: true,
          usagePaid: true,
          persistedAsCanon: false,
          productionEnabled: false,
          ledger: {
            paidCharactersUsed: ledger.paidCharactersUsed,
            paidRequests: ledger.paidRequests,
            monthlyCharLimit: previewMonthlyCharLimit(),
          },
        };
        successCache.set(requestId, receipt);
        return receipt;
      } catch (error) {
        failedIds.add(requestId);
        if (error instanceof VoiceProductionError) {
          throw new VoiceProductionError(sanitizeVoiceErrorMessage(error.message), error.code);
        }
        throw new VoiceProductionError(
          sanitizeVoiceErrorMessage('Preview voice generation refused. Provider details were not shown.'),
          'PROVIDER_UNSUPPORTED',
        );
      } finally {
        inFlightIds.delete(requestId);
      }
    },
  };
}

export type ScriptToVoiceService = ReturnType<typeof createScriptToVoiceService>;
